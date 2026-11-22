const mongoose = require("mongoose");
const StockTransfer = require("../models/stockTransfer.model");
const StockMovement = require("../models/stockMovement.model");
const {
  extractIdempotencyKey,
  withIdempotentTransaction,
  executeStockTransfer,
} = require("../services/inventory.service");

const createTransfer = async (req, res) => {
  try {
    const { direction, items, notes } = req.body || {};
    const idempotencyKey = extractIdempotencyKey(req);

    if (!["warehouse_to_store", "store_to_warehouse"].includes(direction)) {
      return res.status(400).json({
        success: false,
        message:
          "Direction must be 'warehouse_to_store' or 'store_to_warehouse'",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Transfer must contain at least one item",
      });
    }

    if (!idempotencyKey || idempotencyKey.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Idempotency key (at least 8 characters) is required",
      });
    }

    const seenKeys = new Set();
    for (const item of items) {
      if (!item || typeof item !== "object") {
        return res.status(400).json({
          success: false,
          message: "Invalid transfer item",
        });
      }

      const hasProduct =
        item.product !== undefined && mongoose.isValidObjectId(item.product);
      const hasImei =
        typeof item.imei === "string" && /^\d{15}$/.test(item.imei.trim());

      if (!hasProduct && !hasImei) {
        return res.status(400).json({
          success: false,
          message:
            "Each transfer item must include a valid product ID or 15-digit IMEI",
        });
      }

      if (
        item.quantity !== undefined &&
        (!Number.isSafeInteger(item.quantity) || item.quantity < 1)
      ) {
        return res.status(400).json({
          success: false,
          message: "Transfer quantity must be a positive integer",
        });
      }

      const dedupeKey = hasImei
        ? `imei:${item.imei.trim()}`
        : `id:${String(item.product)}`;
      if (seenKeys.has(dedupeKey)) {
        return res.status(400).json({
          success: false,
          message: "Duplicate product or IMEI in transfer items",
        });
      }
      seenKeys.add(dedupeKey);
    }

    const outcome = await withIdempotentTransaction({
      operation: "transfer",
      idempotencyKey,
      requestPayload: {
        direction,
        items,
        notes: typeof notes === "string" ? notes.trim() : "",
      },
      userId: req.user._id,
      handler: async (session) => {
        const { transfer, products } = await executeStockTransfer({
          direction,
          items,
          notes,
          idempotencyKey,
          user: req.user,
          session,
        });

        return {
          status: 201,
          body: {
            success: true,
            message: "Stock transfer completed successfully",
            transfer,
            products,
          },
        };
      },
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    console.error("Create Stock Transfer Error:", error);

    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    const errorMap = {
      INVALID_TRANSFER_DIRECTION: [400, "Invalid transfer direction"],
      PRODUCT_NOT_FOUND: [404, "Product not found or inactive"],
      PHONE_TRANSFER_QUANTITY_INVALID: [
        400,
        "Each phone must be transferred individually with quantity 1",
      ],
      INVALID_TRANSFER_QUANTITY: [
        400,
        "Transfer quantity must be a positive integer",
      ],
      INSUFFICIENT_SOURCE_STOCK: [
        400,
        "Insufficient stock in source location for transfer",
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

const getTransfers = async (req, res) => {
  try {
    let page = Number.parseInt(req.query.page, 10);
    let limit = Number.parseInt(req.query.limit, 10);
    if (!Number.isInteger(page) || page < 1) page = 1;
    if (!Number.isInteger(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;

    const filter = {};
    if (
      req.query.direction &&
      ["warehouse_to_store", "store_to_warehouse"].includes(req.query.direction)
    ) {
      filter.direction = req.query.direction;
    }

    const skip = (page - 1) * limit;
    const [transfers, total] = await Promise.all([
      StockTransfer.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      StockTransfer.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: transfers.length,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      transfers,
    });
  } catch (error) {
    console.error("Get Transfers Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getTransferById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid transfer ID",
      });
    }

    const transfer = await StockTransfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: "Transfer not found",
      });
    }

    const movements = await StockMovement.find({
      movementGroupId: transfer.movementGroupId,
    }).sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      transfer,
      movements,
    });
  } catch (error) {
    console.error("Get Transfer By ID Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getStockMovements = async (req, res) => {
  try {
    let page = Number.parseInt(req.query.page, 10);
    let limit = Number.parseInt(req.query.limit, 10);
    if (!Number.isInteger(page) || page < 1) page = 1;
    if (!Number.isInteger(limit) || limit < 1) limit = 50;
    if (limit > 100) limit = 100;

    const filter = {};
    if (req.query.product && mongoose.isValidObjectId(req.query.product)) {
      filter.product = req.query.product;
    }
    if (
      req.query.location &&
      ["store", "warehouse", "damaged", "unallocated"].includes(
        req.query.location,
      )
    ) {
      filter.location = req.query.location;
    }
    if (req.query.movementType && typeof req.query.movementType === "string") {
      filter.movementType = req.query.movementType;
    }
    if (
      req.query.movementGroupId &&
      typeof req.query.movementGroupId === "string"
    ) {
      filter.movementGroupId = req.query.movementGroupId.trim();
    }

    const skip = (page - 1) * limit;
    const [movements, total] = await Promise.all([
      StockMovement.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      StockMovement.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: movements.length,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      movements,
    });
  } catch (error) {
    console.error("Get Stock Movements Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  createTransfer,
  getTransfers,
  getTransferById,
  getStockMovements,
};
