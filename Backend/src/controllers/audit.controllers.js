const mongoose = require("mongoose");
const Product = require("../models/products.model");
const InventoryAudit = require("../models/inventoryAudit.model");
const StockMovement = require("../models/stockMovement.model");
const {
  bucketFieldForLocation,
  extractIdempotencyKey,
  withIdempotentTransaction,
  executeInventoryAudit,
} = require("../services/inventory.service");

const getAuditSnapshot = async (req, res) => {
  try {
    const { location } = req.query;
    if (!["store", "warehouse"].includes(location)) {
      return res.status(400).json({
        success: false,
        message: "Query parameter 'location' must be 'store' or 'warehouse'",
      });
    }

    const targetField = bucketFieldForLocation(location);
    const products = await Product.find({
      isActive: true,
      [targetField]: { $gt: 0 },
    }).sort({ type: 1, name: 1 });

    const categories = {
      phone: [],
      accessory: [],
      maintenance: [],
    };

    for (const p of products) {
      const qty = p[targetField] || 0;
      const costKnown = typeof p.costPrice === "number";
      const row = {
        product: p._id,
        productName: p.name,
        brand: p.brand,
        model: p.model || "",
        productType: p.type,
        ...(p.type === "phone" && { imei: p.imei }),
        barcode: p.barcode || null,
        snapshotQuantity: qty,
        unitCost: costKnown ? p.costPrice : null,
        costKnown,
        totalCostValue: costKnown
          ? Number((p.costPrice * qty).toFixed(2))
          : null,
        unitSellingPrice: p.sellingPrice,
        totalSellingValue: Number((p.sellingPrice * qty).toFixed(2)),
        snapshotUpdatedAt: p.updatedAt,
      };
      if (categories[p.type]) {
        categories[p.type].push(row);
      }
    }

    return res.status(200).json({
      success: true,
      location,
      snapshotTakenAt: new Date().toISOString(),
      totalItems: products.length,
      categories,
    });
  } catch (error) {
    console.error("Get Audit Snapshot Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const createInventoryAudit = async (req, res) => {
  try {
    const {
      location,
      items,
      applyAdjustments = true,
      notes,
    } = req.body || {};
    const idempotencyKey = extractIdempotencyKey(req);

    if (!["store", "warehouse"].includes(location)) {
      return res.status(400).json({
        success: false,
        message: "Location must be 'store' or 'warehouse'",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Audit must contain at least one item",
      });
    }

    if (!idempotencyKey || idempotencyKey.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Idempotency key (at least 8 characters) is required",
      });
    }

    const seen = new Set();
    for (const item of items) {
      if (
        !item ||
        !mongoose.isValidObjectId(item.product) ||
        !Number.isSafeInteger(item.snapshotQuantity) ||
        item.snapshotQuantity < 0 ||
        !Number.isSafeInteger(item.actualQuantity) ||
        item.actualQuantity < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Each audit item must include valid product ID, non-negative integer snapshotQuantity, and actualQuantity",
        });
      }
      if (seen.has(String(item.product))) {
        return res.status(400).json({
          success: false,
          message: "Duplicate product in audit items",
        });
      }
      seen.add(String(item.product));
    }

    const outcome = await withIdempotentTransaction({
      operation: "audit",
      idempotencyKey,
      requestPayload: {
        location,
        items,
        applyAdjustments: Boolean(applyAdjustments),
        notes: typeof notes === "string" ? notes.trim() : "",
      },
      userId: req.user._id,
      handler: async (session) => {
        const audit = await executeInventoryAudit({
          location,
          items,
          applyAdjustments: Boolean(applyAdjustments),
          notes,
          idempotencyKey,
          user: req.user,
          session,
        });

        return {
          status: 201,
          body: {
            success: true,
            message: "Inventory audit completed successfully",
            audit,
          },
        };
      },
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    console.error("Create Inventory Audit Error:", error);

    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message:
          error.message === "AUDIT_CONCURRENCY_CONFLICT"
            ? "Stock changed since audit snapshot was taken. Please refresh snapshot and review."
            : error.message,
        ...(error.changedProducts && {
          changedProducts: error.changedProducts,
        }),
      });
    }

    const errorMap = {
      INVALID_STOCK_LOCATION: [400, "Location must be 'store' or 'warehouse'"],
      PRODUCT_NOT_FOUND: [404, "Product not found or inactive"],
      INVALID_PHONE_AUDIT_QUANTITY: [
        400,
        "Phone audit actualQuantity must be 0 or 1",
      ],
      PHONE_AUDIT_OVERAGE_NOT_ALLOWED: [
        400,
        "Cannot create phone overage via audit; register phone via purchase/transfer",
      ],
    };

    if (errorMap[error.message]) {
      const [status, message] = errorMap[error.message];
      return res.status(status).json({ success: false, message });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getInventoryAudits = async (req, res) => {
  try {
    let page = Number.parseInt(req.query.page, 10);
    let limit = Number.parseInt(req.query.limit, 10);
    if (!Number.isInteger(page) || page < 1) page = 1;
    if (!Number.isInteger(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;

    const filter = {};
    if (
      req.query.location &&
      ["store", "warehouse"].includes(req.query.location)
    ) {
      filter.location = req.query.location;
    }

    const skip = (page - 1) * limit;
    const [audits, total] = await Promise.all([
      InventoryAudit.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      InventoryAudit.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: audits.length,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      audits,
    });
  } catch (error) {
    console.error("Get Inventory Audits Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getInventoryAuditById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid audit ID",
      });
    }

    const audit = await InventoryAudit.findById(id);
    if (!audit) {
      return res.status(404).json({
        success: false,
        message: "Inventory audit not found",
      });
    }

    if (req.query.format === "csv") {
      const escapeCsv = (val) =>
        `"${String(val ?? "").replace(/"/g, '""')}"`;
      const header = [
        "ProductName",
        "Category",
        "IMEI",
        "SystemQty",
        "ActualQty",
        "Difference",
        "UnitCost",
        "CostKnown",
        "TotalCostValue",
        "UnitSellingPrice",
        "TotalSellingValue",
      ].join(",");
      const rows = audit.items.map((item) =>
        [
          escapeCsv(item.productName),
          escapeCsv(item.productType),
          escapeCsv(item.imei || ""),
          item.systemQuantity,
          item.actualQuantity,
          item.difference,
          item.costKnown ? item.unitCost : "",
          item.costKnown,
          item.costKnown ? item.totalCostValue : "",
          item.unitSellingPrice,
          item.totalSellingValue,
        ].join(","),
      );

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${audit.auditNumber}.csv"`,
      );
      return res.status(200).send([header, ...rows].join("\n"));
    }

    const movements = audit.movementGroupId
      ? await StockMovement.find({
          movementGroupId: audit.movementGroupId,
        }).sort({ createdAt: 1 })
      : [];

    return res.status(200).json({
      success: true,
      audit,
      movements,
    });
  } catch (error) {
    console.error("Get Inventory Audit By ID Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  getAuditSnapshot,
  createInventoryAudit,
  getInventoryAudits,
  getInventoryAuditById,
};
