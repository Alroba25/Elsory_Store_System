const Product = require("../models/products.model");
const mongoose = require("mongoose");
const {
  createMovementGroupId,
  extractIdempotencyKey,
  withIdempotentTransaction,
  receiveGroupedProductStock,
  receivePhoneStock,
  adjustProductStockManually,
  allocateUnallocatedStock,
} = require("../services/inventory.service");

const regexSpecialCharacters = new Set(Array.from(".*+?^$()|[]{}\\"));
const escapeRegex = (value) =>
  Array.from(value)
    .map((character) =>
      regexSpecialCharacters.has(character) ? "\\" + character : character,
    )
    .join("");
const createProduct = async (req, res) => {
  try {
    const {
      name,
      type,
      brand,
      model,
      specifications = {},
      sellingPrice,
      costPrice,
      quantity,
      location = "store",
      imei,
      condition,
      batteryHealth,
      notes,
    } = req.body;

    // 1. Validate required fields
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof brand !== "string" ||
      !brand.trim() ||
      !type ||
      sellingPrice === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, type, brand, and selling price are required",
      });
    }

    if (
      (model !== undefined && typeof model !== "string") ||
      (notes !== undefined && typeof notes !== "string")
    ) {
      return res.status(400).json({
        success: false,
        message: "Model and notes must be text",
      });
    }

    if (!["phone", "accessory", "maintenance"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be phone, accessory, or maintenance",
      });
    }

    if (
      typeof sellingPrice !== "number" ||
      !Number.isFinite(sellingPrice) ||
      sellingPrice <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Selling price must be a positive number",
      });
    }

    // 2. Validate phone data
    if (type === "phone") {
      if (
        typeof imei !== "string" ||
        !/^\d{15}$/.test(imei.trim()) ||
        !condition
      ) {
        return res.status(400).json({
          success: false,
          message: "IMEI and condition are required for phones",
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
        (!Number.isInteger(batteryHealth) ||
          batteryHealth < 0 ||
          batteryHealth > 100)
      ) {
        return res.status(400).json({
          success: false,
          message: "Battery health must be an integer between 0 and 100",
        });
      }
    }

    // 3. Validate quantity-based product data (accessory or maintenance)
    if (type === "accessory" || type === "maintenance") {
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: "Product quantity must be a positive integer",
        });
      }

      if (
        !specifications ||
        typeof specifications !== "object" ||
        Array.isArray(specifications)
      ) {
        return res.status(400).json({
          success: false,
          message: "Specifications must be an object",
        });
      }
    }

    if (!["store", "warehouse"].includes(location)) {
      return res.status(400).json({
        success: false,
        message: "Location must be store or warehouse",
      });
    }

    if (
      costPrice !== undefined &&
      (typeof costPrice !== "number" ||
        !Number.isFinite(costPrice) ||
        costPrice < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Cost price must be a non-negative number",
      });
    }

    const idempotencyKey = extractIdempotencyKey(req);
    const movementGroupId = createMovementGroupId();

    const outcome = await withIdempotentTransaction({
      operation: "purchase_receive",
      idempotencyKey,
      requestPayload: {
        name: name.trim(),
        type,
        brand: brand.trim(),
        model: model?.trim() || "",
        specifications,
        sellingPrice,
        costPrice,
        quantity,
        location,
        imei: imei?.trim(),
        condition,
        batteryHealth,
        notes,
      },
      userId: req.user._id,
      handler: async (session) => {
        if (type === "phone") {
          const phone = await receivePhoneStock({
            name,
            brand,
            model,
            specifications,
            imei,
            condition,
            batteryHealth,
            sellingPrice,
            notes,
            targetLocation: location,
            purchasePrice: costPrice,
            movementGroupId,
            user: req.user,
            referenceType: "ManualAdjustment",
            session,
          });

          return {
            status: 201,
            body: {
              success: true,
              message: "Phone created successfully",
              product: phone,
            },
          };
        }

        const { product, isNew } = await receiveGroupedProductStock({
          type,
          name,
          brand,
          model,
          specifications,
          sellingPrice,
          notes,
          allocations: [{ location, quantity }],
          purchasePrice: costPrice,
          movementGroupId,
          user: req.user,
          referenceType: "ManualAdjustment",
          session,
        });

        return {
          status: isNew ? 201 : 200,
          body: {
            success: true,
            message: isNew
              ? "Accessory created successfully"
              : "Accessory updated successfully",
            product,
          },
        };
      },
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({
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

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Create Product Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const getProducts = async (req, res) => {
  try {
    // 1. Extract query parameters
    const { name, type, brand, minPrice, maxPrice, maxQuantity, sort } =
      req.query;
    // 2. Pagination
    let page = Number.parseInt(req.query.page, 10);
    let limit = Number.parseInt(req.query.limit, 10);

    if (!Number.isInteger(page) || page < 1) {
      page = 1;
    }
    if (!Number.isInteger(limit) || limit < 1) {
      limit = 10;
    }
    if (limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Limit cannot exceed 100",
      });
    }
    if (
      [name, brand].some(
        (value) =>
          value !== undefined &&
          (typeof value !== "string" || value.trim().length > 100),
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Name and brand filters must be text up to 100 characters",
      });
    }
    // 3. Validate product type
    if (type && !["phone", "accessory", "maintenance"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be phone, accessory, or maintenance",
      });
    }
    // 4. Convert price and quantity filters to numbers
    const minPriceNumber =
      minPrice !== undefined ? Number(minPrice) : undefined;

    const maxPriceNumber =
      maxPrice !== undefined ? Number(maxPrice) : undefined;

    const maxQuantityNumber =
      maxQuantity !== undefined ? Number(maxQuantity) : undefined;

    // 5. Validate price filters
    if (
      (minPrice !== undefined &&
        (!Number.isFinite(minPriceNumber) || minPriceNumber < 0)) ||
      (maxPrice !== undefined &&
        (!Number.isFinite(maxPriceNumber) || maxPriceNumber < 0))
    ) {
      return res.status(400).json({
        success: false,
        message: "Prices must be valid non-negative numbers",
      });
    }

    if (
      minPriceNumber !== undefined &&
      maxPriceNumber !== undefined &&
      minPriceNumber > maxPriceNumber
    ) {
      return res.status(400).json({
        success: false,
        message: "minPrice cannot be greater than maxPrice",
      });
    }

    // 6. Validate quantity filter
    if (
      maxQuantity !== undefined &&
      (!Number.isSafeInteger(maxQuantityNumber) || maxQuantityNumber < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "maxQuantity must be a non-negative integer",
      });
    }

    // 7. Build MongoDB filter (active products with store or warehouse stock)
    const filter = {
      isActive: true,
      $or: [{ storeQuantity: { $gt: 0 } }, { warehouseQuantity: { $gt: 0 } }],
    };

    if (name?.trim()) {
      filter.name = { $regex: escapeRegex(name.trim()), $options: "i" };
    }

    if (type) {
      filter.type = type;
    }

    if (brand?.trim()) {
      filter.brand = { $regex: escapeRegex(brand.trim()), $options: "i" };
    }

    if (minPriceNumber !== undefined || maxPriceNumber !== undefined) {
      filter.sellingPrice = {};

      if (minPriceNumber !== undefined) {
        filter.sellingPrice.$gte = minPriceNumber;
      }

      if (maxPriceNumber !== undefined) {
        filter.sellingPrice.$lte = maxPriceNumber;
      }
    }

    if (maxQuantityNumber !== undefined) {
      delete filter.$or;
      filter.storeQuantity = { $gt: 0, $lte: maxQuantityNumber };
    }

    // 8. Sorting
    const sortOptions = {
      price_asc: { sellingPrice: 1 },
      price_desc: { sellingPrice: -1 },
      newest: { createdAt: -1 },
    };

    if (sort && !sortOptions[sort]) {
      return res.status(400).json({
        success: false,
        message: "Invalid sort option",
      });
    }

    const sortBy = sortOptions[sort] || { createdAt: -1 };

    // 9. Pagination calculation
    const skip = (page - 1) * limit;

    // 10. Fetch products and count
    const [products, totalProducts] = await Promise.all([
      Product.find(filter).sort(sortBy).skip(skip).limit(limit),

      Product.countDocuments(filter),
    ]);

    // 11. Success response
    return res.status(200).json({
      success: true,
      count: products.length,
      totalProducts,
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit),
      products,
    });
  } catch (error) {
    console.error("Get Products Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Validate product ID
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    // 2. Find active product only
    const product = await Product.findOne({
      _id: id,
      isActive: true,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Get Product By ID Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      "name",
      "brand",
      "model",
      "sellingPrice",
      "specifications",
      "notes",
    ];

    const updateData = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }
    if (
      ["name", "brand", "model", "notes"].some(
        (field) =>
          updateData[field] !== undefined &&
          typeof updateData[field] !== "string",
      ) ||
      (updateData.sellingPrice !== undefined &&
        (typeof updateData.sellingPrice !== "number" ||
          !Number.isFinite(updateData.sellingPrice) ||
          updateData.sellingPrice < 0)) ||
      (updateData.specifications !== undefined &&
        (!updateData.specifications ||
          typeof updateData.specifications !== "object" ||
          Array.isArray(updateData.specifications)))
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more product fields have an invalid value",
      });
    }

    // 1. Validate product ID
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }
    const product = await Product.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    console.error("Update Product Error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (!product.isActive) {
      return res.status(400).json({
        success: false,
        message: "Product is already inactive",
      });
    }

    // Product must have zero stock across all buckets before deactivation
    const totalRemaining =
      (product.storeQuantity || 0) +
      (product.warehouseQuantity || 0) +
      (product.damagedQuantity || 0) +
      (product.unallocatedQuantity || 0);

    if (totalRemaining > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot deactivate a product with available stock",
      });
    }

    product.isActive = false;
    await product.save();

    return res.status(200).json({
      success: true,
      message: "Product deactivated successfully",
      product,
    });
  } catch (error) {
    console.error("Delete Product Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const restoreProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    if (product.isActive) {
      return res.status(400).json({
        success: false,
        message: "Product is already active",
      });
    }

    product.isActive = true;
    await product.save();
    return res.status(200).json({
      success: true,
      message: "Product restored successfully",
      product,
    });
  } catch (error) {
    console.error("Restore Product Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const deleteAllProducts = async (req, res) => {
  try {
    const result = await Product.updateMany(
      { isActive: true },
      { $set: { isActive: false } },
    );
    return res.status(200).json({
      success: true,
      message:
        (result.modifiedCount || 0) +
        " products removed from active inventory; sales and return history are preserved",
      affectedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error("Delete All Products Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const updateProductStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { operation, quantity, location, reason } = req.body || {};
    const idempotencyKey = extractIdempotencyKey(req);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    if (!["increase", "decrease"].includes(operation)) {
      return res.status(400).json({
        success: false,
        message: "Operation must be either 'increase' or 'decrease'",
      });
    }

    if (!["store", "warehouse"].includes(location)) {
      return res.status(400).json({
        success: false,
        message: "Location must be 'store' or 'warehouse'",
      });
    }

    if (
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a positive integer",
      });
    }

    if (typeof reason !== "string" || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Adjustment reason is required",
      });
    }

    if (!idempotencyKey || idempotencyKey.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Idempotency key (at least 8 characters) is required",
      });
    }

    const movementGroupId = createMovementGroupId();

    const outcome = await withIdempotentTransaction({
      operation: "manual_adjustment",
      idempotencyKey,
      requestPayload: {
        productId: id,
        location,
        operation,
        quantity,
        reason: reason.trim(),
      },
      userId: req.user._id,
      handler: async (session) => {
        const { product, movement } = await adjustProductStockManually({
          productId: id,
          location,
          operation,
          quantity,
          reason,
          movementGroupId,
          user: req.user,
          session,
        });

        return {
          status: 200,
          body: {
            success: true,
            message: `Stock ${operation}d successfully`,
            product,
            movement,
          },
        };
      },
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    console.error("Update Product Stock Error:", error);

    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    const errorMap = {
      PRODUCT_NOT_FOUND: [404, "Product not found"],
      PRODUCT_INACTIVE: [400, "Cannot update stock of an inactive product"],
      STOCK_ADJUSTMENT_UNSUPPORTED_TYPE: [
        400,
        "Stock management is only available for accessories and maintenance products",
      ],
      INSUFFICIENT_STOCK: [400, "Insufficient stock"],
      INVALID_STOCK_LOCATION: [400, "Location must be 'store' or 'warehouse'"],
    };

    if (errorMap[error.message]) {
      const [status, message] = errorMap[error.message];
      return res.status(status).json({ success: false, message });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const getInactiveProducts = async (req, res) => {
  try {
    let page = Number.parseInt(req.query.page, 10) || 1;
    let limit = Number.parseInt(req.query.limit, 10) || 10;

    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination values",
      });
    }

    const filter = {
      isActive: false,
    };

    const [products, totalProducts] = await Promise.all([
      Product.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),

      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: products.length,
      totalProducts,
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit),
      products,
    });
  } catch (error) {
    console.error("Get Inactive Products Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const getProductByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;

    // 1. Validate barcode
    if (!barcode || typeof barcode !== "string") {
      return res.status(400).json({
        success: false,
        message: "Barcode is required",
      });
    }

    // 2. Find active product
    const product = await Product.findOne({
      barcode: barcode.trim(),
      isActive: true,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // 3. Check available store stock ONLY (warehouse/damaged/unallocated are never sellable)
    if (
      product.storeQuantity <= 0 ||
      (product.type === "phone" && product.location !== "store")
    ) {
      return res.status(409).json({
        success: false,
        message: "Product is out of stock in store",
      });
    }

    // 4. Return product
    return res.status(200).json({
      success: true,
      message: "Product found successfully",
      product,
    });
  } catch (error) {
    console.error("Get Product By Barcode Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const getCatalogProductsByType = async (productType, req, res) => {
  try {
    // 1. Pagination
    let page = Number.parseInt(req.query.page, 10);
    let limit = Number.parseInt(req.query.limit, 10);

    if (!Number.isInteger(page) || page < 1) page = 1;
    if (!Number.isInteger(limit) || limit < 1) limit = 10;

    if (limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Limit cannot exceed 100",
      });
    }

    // 2. Extract filters
    const { name, brand, minPrice, maxPrice, sort } = req.query;
    if (
      [name, brand].some(
        (value) =>
          value !== undefined &&
          (typeof value !== "string" || value.trim().length > 100),
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Name and brand filters must be text up to 100 characters",
      });
    }

    const minPriceNumber =
      minPrice !== undefined ? Number(minPrice) : undefined;

    const maxPriceNumber =
      maxPrice !== undefined ? Number(maxPrice) : undefined;

    // 3. Validate price filters
    if (
      (minPrice !== undefined &&
        (!Number.isFinite(minPriceNumber) || minPriceNumber < 0)) ||
      (maxPrice !== undefined &&
        (!Number.isFinite(maxPriceNumber) || maxPriceNumber < 0))
    ) {
      return res.status(400).json({
        success: false,
        message: "Prices must be valid non-negative numbers",
      });
    }

    if (
      minPriceNumber !== undefined &&
      maxPriceNumber !== undefined &&
      minPriceNumber > maxPriceNumber
    ) {
      return res.status(400).json({
        success: false,
        message: "minPrice cannot be greater than maxPrice",
      });
    }

    // 4. Build filter (type is fixed to the requested department, store stock only)
    const filter = {
      type: productType,
      isActive: true,
      storeQuantity: { $gt: 0 },
    };

    if (name?.trim()) {
      filter.name = {
        $regex: escapeRegex(name.trim()),
        $options: "i",
      };
    }

    if (brand?.trim()) {
      filter.brand = {
        $regex: escapeRegex(brand.trim()),
        $options: "i",
      };
    }

    if (minPriceNumber !== undefined || maxPriceNumber !== undefined) {
      filter.sellingPrice = {};

      if (minPriceNumber !== undefined) {
        filter.sellingPrice.$gte = minPriceNumber;
      }

      if (maxPriceNumber !== undefined) {
        filter.sellingPrice.$lte = maxPriceNumber;
      }
    }

    // 5. Sorting
    const sortOptions = {
      price_asc: { sellingPrice: 1 },
      price_desc: { sellingPrice: -1 },
      newest: { createdAt: -1 },
    };

    if (sort && !sortOptions[sort]) {
      return res.status(400).json({
        success: false,
        message: "Invalid sort option",
      });
    }

    const sortBy = sortOptions[sort] || { createdAt: -1 };

    // 6. Fetch products
    const skip = (page - 1) * limit;

    const [products, totalProducts] = await Promise.all([
      Product.find(filter).sort(sortBy).skip(skip).limit(limit),

      Product.countDocuments(filter),
    ]);

    // 7. Response
    return res.status(200).json({
      success: true,
      count: products.length,
      totalProducts,
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit),
      products,
    });
  } catch (error) {
    console.error(`Get ${productType} Products Error:`, error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getAccessoriesProducts = (req, res) =>
  getCatalogProductsByType("accessory", req, res);

const getMaintenanceProducts = (req, res) =>
  getCatalogProductsByType("maintenance", req, res);

const getPhonesProducts = async (req, res) => {
  try {
    // 1. Pagination
    let page = Number.parseInt(req.query.page, 10);
    let limit = Number.parseInt(req.query.limit, 10);

    if (!Number.isInteger(page) || page < 1) page = 1;
    if (!Number.isInteger(limit) || limit < 1) limit = 10;

    if (limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Limit cannot exceed 100",
      });
    }

    // 2. Extract filters
    const { name, brand, minPrice, maxPrice, sort } = req.query;
    if (
      [name, brand].some(
        (value) =>
          value !== undefined &&
          (typeof value !== "string" || value.trim().length > 100),
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Name and brand filters must be text up to 100 characters",
      });
    }

    const minPriceNumber =
      minPrice !== undefined ? Number(minPrice) : undefined;

    const maxPriceNumber =
      maxPrice !== undefined ? Number(maxPrice) : undefined;

    // 3. Validate price filters
    if (
      (minPrice !== undefined &&
        (!Number.isFinite(minPriceNumber) || minPriceNumber < 0)) ||
      (maxPrice !== undefined &&
        (!Number.isFinite(maxPriceNumber) || maxPriceNumber < 0))
    ) {
      return res.status(400).json({
        success: false,
        message: "Prices must be valid non-negative numbers",
      });
    }

    if (
      minPriceNumber !== undefined &&
      maxPriceNumber !== undefined &&
      minPriceNumber > maxPriceNumber
    ) {
      return res.status(400).json({
        success: false,
        message: "minPrice cannot be greater than maxPrice",
      });
    }

    // 4. Build filter (type is fixed to phone, store stock only)
    const filter = {
      type: "phone",
      isActive: true,
      location: "store",
      storeQuantity: { $gt: 0 },
    };

        if (name?.trim()) {
      filter.name = {
        $regex: escapeRegex(name.trim()),
        $options: "i",
      };
    }

    if (brand?.trim()) {
      filter.brand = {
        $regex: escapeRegex(brand.trim()),
        $options: "i",
      };
    }

    // 5. Price filters
    if (minPriceNumber !== undefined || maxPriceNumber !== undefined) {
      filter.sellingPrice = {};

      if (minPriceNumber !== undefined) {
        filter.sellingPrice.$gte = minPriceNumber;
      }

      if (maxPriceNumber !== undefined) {
        filter.sellingPrice.$lte = maxPriceNumber;
      }
    }

    // 6. Sorting
    const sortOptions = {
      price_asc: { sellingPrice: 1 },
      price_desc: { sellingPrice: -1 },
      newest: { createdAt: -1 },
    };

    if (sort && !sortOptions[sort]) {
      return res.status(400).json({
        success: false,
        message: "Invalid sort option",
      });
    }

    const sortBy = sortOptions[sort] || { createdAt: -1 };

    // 7. Fetch products
    const skip = (page - 1) * limit;

    const [products, totalProducts] = await Promise.all([
      Product.find(filter).sort(sortBy).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);

    // 8. Response
    return res.status(200).json({
      success: true,
      count: products.length,
      totalProducts,
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit),
      products,
    });
  } catch (error) {
    console.error("Get Phones Products Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getUnallocatedProducts = async (req, res) => {
  try {
    let page = Number.parseInt(req.query.page, 10);
    let limit = Number.parseInt(req.query.limit, 10);
    if (!Number.isInteger(page) || page < 1) page = 1;
    if (!Number.isInteger(limit) || limit < 1) limit = 50;
    if (limit > 100) limit = 100;

    const filter = {
      isActive: true,
      $or: [
        { unallocatedQuantity: { $gt: 0 } },
        { type: "phone", location: "unallocated" },
      ],
    };

    const skip = (page - 1) * limit;
    const [products, totalProducts] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: products.length,
      totalProducts,
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit),
      products,
    });
  } catch (error) {
    console.error("Get Unallocated Products Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const allocateProductUnallocatedStock = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      allocations: rawAllocations,
      targetLocation,
      quantity,
      reason,
    } = req.body || {};
    const idempotencyKey = extractIdempotencyKey(req);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    if (typeof reason !== "string" || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Allocation reason is required",
      });
    }

    if (!idempotencyKey || idempotencyKey.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Idempotency key (at least 8 characters) is required",
      });
    }

    let normalizedAllocations = null;
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
      normalizedAllocations = rawAllocations.map((a) => ({
        location: a.location,
        quantity: a.quantity,
      }));
    } else if (["store", "warehouse"].includes(targetLocation)) {
      if (
        quantity !== undefined &&
        (!Number.isSafeInteger(quantity) || quantity < 1)
      ) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be a positive integer",
        });
      }
      normalizedAllocations = [
        { location: targetLocation, quantity: quantity ?? 1 },
      ];
    } else {
      return res.status(400).json({
        success: false,
        message:
          "Provide either allocations array or targetLocation ('store' or 'warehouse')",
      });
    }

    const movementGroupId = createMovementGroupId();

    const outcome = await withIdempotentTransaction({
      operation: "legacy_allocation",
      idempotencyKey,
      requestPayload: {
        productId: id,
        allocations: normalizedAllocations,
        targetLocation,
        reason: reason.trim(),
      },
      userId: req.user._id,
      handler: async (session) => {
        const product = await allocateUnallocatedStock({
          productId: id,
          allocations: normalizedAllocations,
          targetLocation,
          reason,
          movementGroupId,
          user: req.user,
          session,
        });

        return {
          status: 200,
          body: {
            success: true,
            message: "Unallocated stock allocated successfully",
            product,
          },
        };
      },
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    console.error("Allocate Unallocated Stock Error:", error);

    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    const errorMap = {
      PRODUCT_NOT_FOUND: [404, "Product not found"],
      PRODUCT_INACTIVE: [400, "Cannot allocate stock of an inactive product"],
      INVALID_STOCK_LOCATION: [400, "Location must be 'store' or 'warehouse'"],
      INSUFFICIENT_UNALLOCATED_STOCK: [
        400,
        "Insufficient unallocated stock for this allocation",
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

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  restoreProduct,
  deleteAllProducts,
  updateProductStock,
  getInactiveProducts,
  getProductByBarcode,
  getAccessoriesProducts,
  getMaintenanceProducts,
  getPhonesProducts,
  getUnallocatedProducts,
  allocateProductUnallocatedStock,
};
