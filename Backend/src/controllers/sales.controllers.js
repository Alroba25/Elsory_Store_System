const mongoose = require("mongoose");
const crypto = require("node:crypto");
const Sale = require("../models/sales.model");
const Product = require("../models/products.model");
const Shift = require("../models/shift.model");
const {
  createMovementGroupId,
  extractIdempotencyKey,
  withIdempotentTransaction,
  deductStoreStockForSale,
} = require("../services/inventory.service");
//create sale controller

const createSale = async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      items,
      payments = [],
    } = req.body || {};
    const idempotencyKey = extractIdempotencyKey(req);

    if (
      (customerName !== undefined &&
        (typeof customerName !== "string" || customerName.length > 100)) ||
      (customerPhone !== undefined &&
        (typeof customerPhone !== "string" || customerPhone.length > 30))
    ) {
      return res.status(400).json({
        success: false,
        message: "Customer name or phone has an invalid format",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Sale must contain at least one product",
      });
    }

    if (!Array.isArray(payments)) {
      return res.status(400).json({
        success: false,
        message: "Payments must be an array",
      });
    }

    const productIds = items.map((item) =>
      item && typeof item === "object" ? item.product : undefined,
    );

    if (
      productIds.some((id) => !mongoose.isValidObjectId(id)) ||
      new Set(productIds.map(String)).size !== productIds.length
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or duplicated product IDs",
      });
    }

    for (const payment of payments) {
      if (
        !payment ||
        !["cash", "wallet", "instapay", "visa"].includes(payment.method) ||
        typeof payment.amount !== "number" ||
        !Number.isFinite(payment.amount) ||
        payment.amount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment data",
        });
      }
    }

    if (!req.user || !req.user._id || !req.user.name) {
      return res.status(401).json({
        success: false,
        message: "Authenticated cashier information is missing",
      });
    }

    const movementGroupId = createMovementGroupId();

    const outcome = await withIdempotentTransaction({
      operation: "sale",
      idempotencyKey,
      requestPayload: {
        customerName: customerName?.trim() || "",
        customerPhone: customerPhone?.trim() || "",
        items,
        payments,
      },
      userId: req.user._id,
      handler: async (session) => {
        // 1. Find cashier's open shift
        const shift = await Shift.findOne({
          cashier: req.user._id,
          status: "open",
        }).session(session);

        if (!shift) {
          throw new Error("SHIFT_NOT_OPEN");
        }

        // 2. Calculate payments per method
        const sumByMethod = (method) =>
          payments
            .filter((payment) => payment.method === method)
            .reduce((total, payment) => total + payment.amount, 0);

        const cashPaymentsTotal = sumByMethod("cash");
        const visaPaymentsTotal = sumByMethod("visa");
        const instapayPaymentsTotal = sumByMethod("instapay");
        const walletPaymentsTotal = sumByMethod("wallet");

        const saleId = new mongoose.Types.ObjectId();
        const saleItems = [];

        // 3. Validate products and deduct strictly from storeQuantity
        for (const item of items) {
          const {
            product,
            quantity,
            discountAmount = 0,
            isGift = false,
          } = item;

          if (
            !Number.isSafeInteger(quantity) ||
            quantity <= 0 ||
            typeof discountAmount !== "number" ||
            !Number.isFinite(discountAmount) ||
            discountAmount < 0 ||
            typeof isGift !== "boolean"
          ) {
            throw new Error("INVALID_ITEM_DATA");
          }

          const existingProduct =
            await Product.findById(product).session(session);

          if (!existingProduct || !existingProduct.isActive) {
            throw new Error("PRODUCT_NOT_AVAILABLE");
          }

          if (existingProduct.type === "phone" && quantity !== 1) {
            throw new Error("PHONE_QUANTITY_INVALID");
          }

          const itemTotal = existingProduct.sellingPrice * quantity;
          const finalDiscount = isGift ? itemTotal : discountAmount;

          if (finalDiscount > itemTotal) {
            throw new Error("INVALID_DISCOUNT");
          }

          // 4. Deduct store stock atomically via unified inventory service
          await deductStoreStockForSale({
            product: existingProduct,
            quantity,
            saleId,
            movementGroupId,
            user: req.user,
            session,
          });

          // 5. Save product snapshot
          saleItems.push({
            product: existingProduct._id,
            productName: existingProduct.name,
            productType: existingProduct.type,
            brand: existingProduct.brand,
            model: existingProduct.model,
            imei:
              existingProduct.type === "phone"
                ? existingProduct.imei
                : undefined,
            quantity,
            unitPrice: existingProduct.sellingPrice,
            discountAmount: finalDiscount,
            isGift,
          });
        }

        // 6. Generate invoice number
        const invoiceNumber = `INV-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

        // 7. Create sale linked to the current shift
        const [sale] = await Sale.create(
          [
            {
              _id: saleId,
              invoiceNumber,
              customerName: customerName?.trim() || "",
              customerPhone: customerPhone?.trim() || "",
              cashier: req.user._id,
              cashierName: req.user.name,
              shift: shift._id,
              items: saleItems,
              payments,
            },
          ],
          { session },
        );

        // 8. Update shift totals across all payment methods
        const updatedShift = await Shift.findOneAndUpdate(
          {
            _id: shift._id,
            status: "open",
          },
          {
            $inc: {
              totalCashSales: cashPaymentsTotal,
              totalVisaSales: visaPaymentsTotal,
              totalInstapaySales: instapayPaymentsTotal,
              totalWalletSales: walletPaymentsTotal,
            },
          },
          {
            returnDocument: "after",
            session,
            runValidators: true,
          },
        );

        if (!updatedShift) {
          throw new Error("SHIFT_NOT_OPEN");
        }

        return {
          status: 201,
          body: {
            success: true,
            message: "Sale created successfully",
            sale,
          },
        };
      },
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    console.error("Create Sale Error:", error);

    if (error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    const errors = {
      SHIFT_NOT_OPEN: {
        status: 409,
        message: "You must have an open shift to create a sale",
      },
      INVALID_ITEM_DATA: {
        status: 400,
        message: "Invalid sale item data",
      },
      PRODUCT_NOT_AVAILABLE: {
        status: 400,
        message: "Product is unavailable or inactive",
      },
      PHONE_QUANTITY_INVALID: {
        status: 400,
        message: "Each phone must be sold individually",
      },
      INVALID_DISCOUNT: {
        status: 400,
        message: "Discount cannot exceed product total",
      },
      INSUFFICIENT_STOCK: {
        status: 400,
        message: "Insufficient stock",
      },
    };

    if (errors[error.message]) {
      return res.status(errors[error.message].status).json({
        success: false,
        message: errors[error.message].message,
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Invoice number already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getSales = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 10;
    const { search } = req.query;

    if (
      search !== undefined &&
      (typeof search !== "string" || search.trim().length > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Search must be text up to 100 characters",
      });
    }

    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination values",
      });
    }

    const filter = {};

    if (search && search.trim()) {
      const searchRegex = new RegExp(
        search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );

      filter.$or = [
        { invoiceNumber: searchRegex },
        { customerName: searchRegex },
        { customerPhone: searchRegex },
      ];
    }

    const skip = (page - 1) * limit;

    const [sales, totalSales] = await Promise.all([
      Sale.find(filter)
        .populate("cashier", "name email")
        .sort({ saleDate: -1 })
        .skip(skip)
        .limit(limit),

      Sale.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: sales.length,
      totalSales,
      currentPage: page,
      totalPages: Math.ceil(totalSales / limit),
      data: sales,
    });
  } catch (error) {
    console.error("Get Sales Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
const getSaleById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sale ID",
      });
    }

    const sale = await Sale.findById(id).populate("cashier", "name email");

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "Sale not found",
      });
    }

    return res.status(200).json({
      success: true,
      sale,
    });
  } catch (error) {
    console.error("Get Sale Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
module.exports = {
  createSale,
  getSaleById,
  getSales,
};
