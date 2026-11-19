const mongoose = require("mongoose");

const roundMoney = (amount) => Number(amount.toFixed(2));

// Payment Schema
const paymentSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ["cash", "wallet", "instapay", "visa"],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: [0.01, "Payment amount must be greater than zero"],
    },
  },
  { _id: true },
);

// Sale Item Schema
const saleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
    },

    productType: {
      type: String,
      enum: ["phone", "accessory", "maintenance"],
      required: true,
    },

    brand: {
      type: String,
      required: true,
      trim: true,
    },

    model: {
      type: String,
      trim: true,
    },

    imei: {
      type: String,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Quantity must be an integer",
      },
    },

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    isGift: {
      type: Boolean,
      default: false,
    },

    lineTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: true },
);

// Main Sale Schema
const saleSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    customerName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    customerPhone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
    },

    cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    cashierName: {
      type: String,
      required: true,
      trim: true,
    },

    // Link sale to the cashier's shift
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
    },

    items: {
      type: [saleItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: "Sale must contain at least one item",
      },
    },

    payments: {
      type: [paymentSchema],
      default: [],
    },

    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    finalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalReturnedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    refundedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    refundDue: {
      type: Number,
      default: 0,
      min: 0,
    },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "partially_paid", "paid"],
      default: "unpaid",
    },

    isGift: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["completed", "cancelled"],
      default: "completed",
    },

    saleDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Calculate invoice amounts automatically
saleSchema.pre("validate", function () {
  let totalAmount = 0;
  let discountAmount = 0;

  // 1. Calculate invoice items
  for (const item of this.items) {
    if (item.productType === "phone" && item.quantity !== 1) {
      this.invalidate(
        "items",
        "Each phone must be sold as an individual device",
      );
    }

    const itemTotal = item.unitPrice * item.quantity;

    // Gift items receive a full discount
    if (item.isGift) {
      item.discountAmount = itemTotal;
    }

    if (item.discountAmount > itemTotal) {
      this.invalidate("items", "Item discount cannot exceed its total price");
    }

    item.lineTotal = roundMoney(itemTotal - item.discountAmount);

    totalAmount = roundMoney(totalAmount + itemTotal);
    discountAmount = roundMoney(discountAmount + item.discountAmount);
  }

  // 2. Calculate original invoice amounts
  this.totalAmount = totalAmount;
  this.discountAmount = discountAmount;
  this.finalAmount = roundMoney(totalAmount - discountAmount);

  // 3. Calculate received payments
  this.paidAmount = roundMoney(
    this.payments.reduce((total, payment) => total + payment.amount, 0),
  );

  if (this.paidAmount > this.finalAmount) {
    this.invalidate(
      "payments",
      "Paid amount cannot exceed the invoice final amount",
    );
  }

  // 4. Calculate remaining amount before returns
  const originalRemaining = Math.max(0, this.finalAmount - this.paidAmount);

  // 5. Calculate remaining debt after returns
  this.remainingAmount = roundMoney(
    Math.max(0, originalRemaining - this.totalReturnedAmount),
  );

  // 6. Calculate refund due to customer
  this.refundDue = roundMoney(
    Math.max(
      0,
      this.totalReturnedAmount - originalRemaining - this.refundedAmount,
    ),
  );

  // 7. Calculate payment status
  if (this.remainingAmount === 0) {
    this.paymentStatus = "paid";
  } else if (this.paidAmount > 0) {
    this.paymentStatus = "partially_paid";
  } else {
    this.paymentStatus = "unpaid";
  }

  // 8. Check if entire invoice is a gift
  this.isGift =
    this.items.length > 0 && this.items.every((item) => item.isGift);
});

// Indexes
saleSchema.index({ cashier: 1, saleDate: -1 });
saleSchema.index({ shift: 1, saleDate: -1 });
saleSchema.index({ customerPhone: 1 });
saleSchema.index({ saleDate: -1 });

module.exports = mongoose.model("Sale", saleSchema);
