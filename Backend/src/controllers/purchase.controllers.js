const Purchase = require("../models/purchase.model");
const Supplier = require("../models/supplier.model");
const mongoose = require("mongoose");
const crypto = require("crypto");
const Product = require("../models/products.model");
const { isDeepStrictEqual } = require("node:util");
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
  const session = await mongoose.startSession();

  try {
    const { purchaseId, itemId } = req.params;
    const { imei, sellingPrice, condition, batteryHealth, notes } = req.body;

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

    // 3. Start transaction
    let createdProduct;
    let updatedPurchase;

    await session.withTransaction(async () => {
      // Find purchase
      const purchase = await Purchase.findById(purchaseId).session(session);

      if (!purchase) {
        throw new Error("PURCHASE_NOT_FOUND");
      }

      if (purchase.status === "cancelled") {
        throw new Error("PURCHASE_CANCELLED");
      }

      // Find purchase item
      const item = purchase.items.id(itemId);

      if (!item) {
        throw new Error("ITEM_NOT_FOUND");
      }

      // Check product type
      if (item.productType !== "phone") {
        throw new Error("NOT_A_PHONE");
      }

      // Check remaining quantity
      if (item.registeredQuantity >= item.quantity) {
        throw new Error("QUANTITY_COMPLETED");
      }

      // Generate barcode
      const barcode = `2${crypto.randomInt(100000000000, 1000000000000)}`;

      // Create product
      const products = await Product.create(
        [
          {
            name: item.productName,
            type: "phone",
            brand: item.brand,
            model: item.model,
            barcode,
            imei,
            sellingPrice,
            quantity: 1,
            condition,
            batteryHealth,
            notes,
          },
        ],
        { session },
      );

      createdProduct = products[0];

      // Increase registered quantity
      item.registeredQuantity += 1;

      // Check if all items are registered
      const allItemsRegistered = purchase.items.every(
        (item) => item.registeredQuantity === item.quantity,
      );

      if (allItemsRegistered) {
        purchase.status = "completed";
      }
      // Save updated purchase
      await purchase.save({ session });

      updatedPurchase = purchase;
    });

    return res.status(201).json({
      success: true,
      message: "Phone registered successfully",
      data: {
        product: createdProduct,
        purchase: updatedPurchase,
      },
    });
  } catch (error) {
    console.error("Register Purchased Phone Error:", error);

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
  } finally {
    await session.endSession();
  }
};
const registerPurchasedAccessory = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { purchaseId, itemId } = req.params;
    const { sellingPrice, notes } = req.body;

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

    let specifications;
    let registeredProduct;
    let updatedPurchase;

    // 4. Start transaction
    await session.withTransaction(async () => {
      // Find purchase
      const purchase = await Purchase.findById(purchaseId).session(session);

      if (!purchase) {
        throw new Error("PURCHASE_NOT_FOUND");
      }

      if (purchase.status === "cancelled") {
        throw new Error("PURCHASE_CANCELLED");
      }

      // Find item inside purchase
      const item = purchase.items.id(itemId);

      if (!item) {
        throw new Error("ITEM_NOT_FOUND");
      }

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
      specifications = invoiceSpecifications;

      // Check remaining quantity
      const remainingQuantity = item.quantity - item.registeredQuantity;

      if (remainingQuantity <= 0) {
        throw new Error("QUANTITY_COMPLETED");
      }

      // 5. Find products with matching basic information
      const existingProducts = await Product.find({
        type: item.productType,
        name: item.productName,
        brand: item.brand,
        isActive: true,
      }).session(session);

      // 6. Match model and specifications
      const existingProduct = existingProducts.find((product) => {
        const sameModel = (product.model || "") === (item.model || "");

        const sameSpecifications = isDeepStrictEqual(
          product.specifications?.toObject?.() ?? product.specifications ?? {},
          specifications,
        );

        return sameModel && sameSpecifications;
      });

      if (existingProduct) {
        // 7. Update existing accessory
        existingProduct.quantity += remainingQuantity;

        // Update selling price for all existing stock
        existingProduct.sellingPrice = sellingPrice;

        if (notes) {
          existingProduct.notes = notes;
        }

        await existingProduct.save({ session });

        registeredProduct = existingProduct;
      } else {
        // 8. Create new accessory
        const barcode = `2${crypto.randomInt(100000000000, 1000000000000)}`;

        const products = await Product.create(
          [
            {
              name: item.productName,
              type: item.productType,
              brand: item.brand,
              model: item.model,
              specifications,
              sellingPrice,
              quantity: remainingQuantity,
              barcode,
              notes,
            },
          ],
          { session },
        );

        registeredProduct = products[0];
      }

      // 9. Update registered quantity
      item.registeredQuantity = item.quantity;

      // Check if all invoice items are registered
      const allItemsRegistered = purchase.items.every(
        (purchaseItem) =>
          purchaseItem.registeredQuantity === purchaseItem.quantity,
      );

      if (allItemsRegistered) {
        purchase.status = "completed";
      }

      // 10. Save purchase
      await purchase.save({ session });

      updatedPurchase = purchase;
    });

    // 11. Send response
    return res.status(200).json({
      success: true,
      message: "Accessory registered successfully",
      data: {
        product: registeredProduct,
        purchase: updatedPurchase,
      },
    });
  } catch (error) {
    console.error("Register Purchased Accessory Error:", error);

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
  } finally {
    await session.endSession();
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
