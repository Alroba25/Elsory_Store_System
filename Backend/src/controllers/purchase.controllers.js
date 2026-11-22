const Purchase = require("../models/purchase.model");
const Supplier = require("../models/supplier.model");
const mongoose = require("mongoose");
const { isDeepStrictEqual } = require("node:util");
const {
  createMovementGroupId,
  extractIdempotencyKey,
  withIdempotentTransaction,
  receivePhoneStock,
  receiveGroupedProductStock,
} = require("../services/inventory.service");
const createPurchase = async (req, res) => {
  try {
    const { supplier, items, paidAmount = 0, notes } = req.body;

    // 1. Validate required fields
    if (!supplier) {
      return res.status(400).json({
        success: false,
        message: "Supplier is required",
      });
    }

    if (!mongoose.isValidObjectId(supplier)) {
      return res.status(400).json({
        success: false,
        message: "Invalid supplier ID",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Purchase must contain at least one item",
      });
    }

    // 2. Check supplier
    const existingSupplier = await Supplier.findOne({
      _id: supplier,
      isActive: true,
    });

    if (!existingSupplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found or inactive",
      });
    }

    // 3. Validate paidAmount
    if (
      typeof paidAmount !== "number" ||
      !Number.isFinite(paidAmount) ||
      paidAmount < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Paid amount must be a valid non-negative number",
      });
    }

    // 4. Validate purchase items
    for (const item of items) {
      if (
        !item ||
        typeof item.productName !== "string" ||
        !item.productName.trim() ||
        typeof item.brand !== "string" ||
        !item.brand.trim() ||
        !["phone", "accessory", "maintenance"].includes(item.productType) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        typeof item.purchasePrice !== "number" ||
        !Number.isFinite(item.purchasePrice) ||
        item.purchasePrice < 0 ||
        (item.specifications !== undefined &&
          (!item.specifications ||
            typeof item.specifications !== "object" ||
            Array.isArray(item.specifications)))
      ) {
        return res.status(400).json({
          success: false,
          message: "One or more purchase items have invalid data",
        });
      }
    }

    // 5. Create purchase invoice
    const purchase = await Purchase.create({
      supplier,
      items: items.map((item) => ({
        productName: item.productName.trim(),
        brand: item.brand.trim(),
        model: item.model,
        specifications: item.specifications || {},
        productType: item.productType,
        quantity: item.quantity,
        purchasePrice: item.purchasePrice,
      })),
      paidAmount,
      notes,
      createdBy: req.user._id,
    });

    // 6. Send response
    return res.status(201).json({
      success: true,
      message: "Purchase invoice created successfully",
      data: purchase,
    });
  } catch (error) {
    console.error("Create Purchase Error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid supplier ID",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const getPurchases = async (req, res) => {
  try {
    // 1. Get pagination values
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    // 2. Validate pagination
    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid page or limit value",
      });
    }

    // 3. Calculate skip
    const skip = (page - 1) * limit;

    // 4. Get purchases and total count
    const [purchases, totalPurchases] = await Promise.all([
      Purchase.find()
        .populate("supplier", "name email phone")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),

      Purchase.countDocuments(),
    ]);

    // 5. Calculate pagination info
    const totalPages = Math.ceil(totalPurchases / limit);

    // 6. Send response
    return res.status(200).json({
      success: true,
      results: purchases.length,
      pagination: {
        currentPage: page,
        limit,
        totalPurchases,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      data: purchases,
    });
  } catch (error) {
    console.error("Get Purchases Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const getPurchaseById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid purchase ID",
      });
    }

    const purchase = await Purchase.findById(id)
      .populate("supplier", "name email phone")
      .populate("createdBy", "name email");
    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }
    return res.status(200).json({
      success: true,
      data: purchase,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const registerPurchasedPhone = async (req, res) => {
  try {
    const { purchaseId, itemId } = req.params;
    const {
      imei,
      sellingPrice,
      condition,
      batteryHealth,
      notes,
      targetLocation = "store",
    } = req.body;
    const idempotencyKey = extractIdempotencyKey(req);

    // 1. Validate IDs
    if (
      !mongoose.isValidObjectId(purchaseId) ||
      !mongoose.isValidObjectId(itemId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid purchase or item ID",
      });
    }

    if (!["store", "warehouse"].includes(targetLocation)) {
      return res.status(400).json({
        success: false,
        message: "targetLocation must be 'store' or 'warehouse'",
      });
    }

    // 2. Validate phone data
    if (typeof imei !== "string" || !/^\d{15}$/.test(imei)) {
      return res.status(400).json({
        success: false,
        message: "IMEI must contain exactly 15 digits",
      });
    }

    if (
      typeof sellingPrice !== "number" ||
      !Number.isFinite(sellingPrice) ||
      sellingPrice < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid selling price",
      });
    }

    if (!["new", "used"].includes(condition)) {
      return res.status(400).json({
        success: false,
        message: "Condition must be new or used",
      });
    }

    if (
      batteryHealth !== undefined &&
      (typeof batteryHealth !== "number" ||
        !Number.isFinite(batteryHealth) ||
        batteryHealth < 0 ||
        batteryHealth > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Battery health must be between 0 and 100",
      });
    }

    const movementGroupId = createMovementGroupId();

    const outcome = await withIdempotentTransaction({
      operation: "purchase_receive",
      idempotencyKey,
      requestPayload: {
        purchaseId,
        itemId,
        imei: imei.trim(),
        sellingPrice,
        condition,
        batteryHealth,
        notes,
        targetLocation,
      },
      userId: req.user._id,
      handler: async (session) => {
        const purchase = await Purchase.findById(purchaseId).session(session);
        if (!purchase) throw new Error("PURCHASE_NOT_FOUND");
        if (purchase.status === "cancelled") throw new Error("PURCHASE_CANCELLED");

        const item = purchase.items.id(itemId);
        if (!item) throw new Error("ITEM_NOT_FOUND");
        if (item.productType !== "phone") throw new Error("NOT_A_PHONE");
        if (item.registeredQuantity >= item.quantity) {
          throw new Error("QUANTITY_COMPLETED");
        }

        const createdProduct = await receivePhoneStock({
          name: item.productName,
          brand: item.brand,
          model: item.model,
          specifications:
            item.specifications?.toObject?.() ?? item.specifications ?? {},
          imei,
          condition,
          batteryHealth,
          sellingPrice,
          notes,
          targetLocation,
          purchaseId: purchase._id,
          purchasePrice: item.purchasePrice,
          movementGroupId,
          user: req.user,
          referenceType: "Purchase",
          referenceId: purchase._id,
          session,
        });

        item.registeredQuantity += 1;
        item.allocations.push({
          location: targetLocation,
          quantity: 1,
          purchasePrice: item.purchasePrice,
          productId: createdProduct._id,
          registeredBy: req.user._id,
          registeredAt: new Date(),
          ...(idempotencyKey && { idempotencyKey }),
        });

        if (purchase.items.every((pi) => pi.registeredQuantity === pi.quantity)) {
          purchase.status = "completed";
        }
        await purchase.save({ session });

        return {
          status: 201,
          body: {
            success: true,
            message: "Phone registered successfully",
            data: {
              product: createdProduct,
              purchase,
            },
          },
        };
      },
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    console.error("Register Purchased Phone Error:", error);

    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    const messages = {
      PURCHASE_NOT_FOUND: [404, "Purchase not found"],
      PURCHASE_CANCELLED: [
        400,
        "Cannot register items from a cancelled purchase",
      ],
      ITEM_NOT_FOUND: [404, "Purchase item not found"],
      NOT_A_PHONE: [400, "This item is not a phone"],
      QUANTITY_COMPLETED: [
        400,
        "All purchased phones have already been registered",
      ],
    };

    if (messages[error.message]) {
      return res.status(messages[error.message][0]).json({
        success: false,
        message: messages[error.message][1],
      });
    }

    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "IMEI or barcode already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const registerPurchasedAccessory = async (req, res) => {
  try {
    const { purchaseId, itemId } = req.params;
    const {
      sellingPrice,
      notes,
      targetLocation = "store",
      allocations: rawAllocations,
    } = req.body;
    const idempotencyKey = extractIdempotencyKey(req);

    // 1. Validate IDs
    if (
      !mongoose.isValidObjectId(purchaseId) ||
      !mongoose.isValidObjectId(itemId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid purchase or item ID",
      });
    }

    // 2. Validate selling price
    if (
      typeof sellingPrice !== "number" ||
      !Number.isFinite(sellingPrice) ||
      sellingPrice < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid selling price",
      });
    }

    if (rawAllocations !== undefined) {
      if (!Array.isArray(rawAllocations) || rawAllocations.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Allocations must be a non-empty array",
        });
      }
      for (const alloc of rawAllocations) {
        if (
          !alloc ||
          !["store", "warehouse"].includes(alloc.location) ||
          !Number.isSafeInteger(alloc.quantity) ||
          alloc.quantity < 1
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Each allocation must specify location ('store' or 'warehouse') and positive integer quantity",
          });
        }
      }
    } else if (!["store", "warehouse"].includes(targetLocation)) {
      return res.status(400).json({
        success: false,
        message: "targetLocation must be 'store' or 'warehouse'",
      });
    }

    const movementGroupId = createMovementGroupId();

    const outcome = await withIdempotentTransaction({
      operation: "purchase_receive",
      idempotencyKey,
      requestPayload: {
        purchaseId,
        itemId,
        sellingPrice,
        notes,
        targetLocation,
        allocations: rawAllocations,
        specifications: req.body.specifications,
      },
      userId: req.user._id,
      handler: async (session) => {
        const purchase = await Purchase.findById(purchaseId).session(session);
        if (!purchase) throw new Error("PURCHASE_NOT_FOUND");
        if (purchase.status === "cancelled") throw new Error("PURCHASE_CANCELLED");

        const item = purchase.items.id(itemId);
        if (!item) throw new Error("ITEM_NOT_FOUND");
        if (!["accessory", "maintenance"].includes(item.productType)) {
          throw new Error("NOT_AN_ACCESSORY");
        }

        const invoiceSpecifications =
          item.specifications?.toObject?.() ?? item.specifications ?? {};
        if (
          req.body.specifications !== undefined &&
          !isDeepStrictEqual(req.body.specifications, invoiceSpecifications)
        ) {
          throw new Error("SPECIFICATIONS_MISMATCH");
        }

        const remainingQuantity = item.quantity - item.registeredQuantity;
        if (remainingQuantity <= 0) {
          throw new Error("QUANTITY_COMPLETED");
        }

        const effectiveAllocations = rawAllocations
          ? rawAllocations.map((a) => ({
              location: a.location,
              quantity: a.quantity,
            }))
          : [{ location: targetLocation, quantity: remainingQuantity }];

        const requestedTotal = effectiveAllocations.reduce(
          (sum, a) => sum + a.quantity,
          0,
        );

        if (requestedTotal > remainingQuantity) {
          throw new Error("ALLOCATION_EXCEEDS_REMAINING");
        }

        const { product: registeredProduct } = await receiveGroupedProductStock({
          type: item.productType,
          name: item.productName,
          brand: item.brand,
          model: item.model,
          specifications: invoiceSpecifications,
          sellingPrice,
          notes,
          allocations: effectiveAllocations,
          purchaseId: purchase._id,
          purchasePrice: item.purchasePrice,
          movementGroupId,
          user: req.user,
          referenceType: "Purchase",
          referenceId: purchase._id,
          session,
        });

        item.registeredQuantity += requestedTotal;
        for (const alloc of effectiveAllocations) {
          item.allocations.push({
            location: alloc.location,
            quantity: alloc.quantity,
            purchasePrice: item.purchasePrice,
            productId: registeredProduct._id,
            registeredBy: req.user._id,
            registeredAt: new Date(),
            ...(idempotencyKey && { idempotencyKey }),
          });
        }

        if (
          purchase.items.every((pi) => pi.registeredQuantity === pi.quantity)
        ) {
          purchase.status = "completed";
        }
        await purchase.save({ session });

        return {
          status: 200,
          body: {
            success: true,
            message: "Accessory registered successfully",
            data: {
              product: registeredProduct,
              purchase,
            },
          },
        };
      },
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    console.error("Register Purchased Accessory Error:", error);

    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    const errors = {
      PURCHASE_NOT_FOUND: [404, "Purchase not found"],
      PURCHASE_CANCELLED: [400, "Purchase is cancelled"],
      ITEM_NOT_FOUND: [404, "Purchase item not found"],
      NOT_AN_ACCESSORY: [400, "This item is not an accessory"],
      SPECIFICATIONS_MISMATCH: [
        400,
        "Specifications must match the purchase invoice",
      ],
      QUANTITY_COMPLETED: [400, "All accessories have already been registered"],
      ALLOCATION_EXCEEDS_REMAINING: [
        400,
        "Allocated quantity exceeds remaining unregistered purchase quantity",
      ],
    };

    if (errors[error.message]) {
      return res.status(errors[error.message][0]).json({
        success: false,
        message: errors[error.message][1],
      });
    }

    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Barcode already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const cancelPurchase = async (req, res) => {
  try {
    const { purchaseId } = req.params;

    if (!mongoose.isValidObjectId(purchaseId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid purchase ID",
      });
    }

    const purchase = await Purchase.findOneAndUpdate(
      {
        _id: purchaseId,
        status: "draft",
        paidAmount: 0,
        $expr: {
          $allElementsTrue: {
            $map: {
              input: { $ifNull: ["$items", []] },
              as: "item",
              in: {
                $eq: [
                  { $ifNull: ["$$item.registeredQuantity", 0] },
                  0,
                ],
              },
            },
          },
        },
      },
      { $set: { status: "cancelled" } },
      { new: true, runValidators: true },
    );

    if (!purchase) {
      const existingPurchase = await Purchase.findById(purchaseId);
      if (!existingPurchase) {
        return res.status(404).json({
          success: false,
          message: "Purchase not found",
        });
      }
      if (existingPurchase.status === "cancelled") {
        return res.status(400).json({
          success: false,
          message: "Purchase is already cancelled",
        });
      }
      if (existingPurchase.status === "completed") {
        return res.status(400).json({
          success: false,
          message: "Cannot cancel a completed purchase",
        });
      }
      if (existingPurchase.paidAmount > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot cancel a purchase with existing payments",
        });
      }
      if (existingPurchase.items.some((item) => item.registeredQuantity > 0)) {
        return res.status(400).json({
          success: false,
          message: "Cannot cancel a purchase after registering items",
        });
      }
      return res.status(409).json({
        success: false,
        message: "Purchase changed while cancellation was being processed",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Purchase cancelled successfully",
      data: purchase,
    });
  } catch (error) {
    console.error("Cancel Purchase Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  createPurchase,
  getPurchases,
  getPurchaseById,
  registerPurchasedPhone,
  registerPurchasedAccessory,
  cancelPurchase,
};
