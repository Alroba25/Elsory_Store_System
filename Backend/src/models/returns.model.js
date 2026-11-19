const mongoose = require("mongoose");

// Refund Payment Schema
const refundPaymentSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ["cash", "wallet", "instapay", "visa"],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: [0.01, "Refund amount must be greater than zero"],
    },

    // Shift from which the refund was actually paid
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
    },

    refundedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

// Returned Item Schema
const returnedItemSchema = new mongoose.Schema(
  {
    saleItem: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

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

    refundAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    reason: {
      type: String,
      trim: true,
      default: "",
    },

    condition: {
      type: String,
      enum: ["salable", "damaged"],
    },

    returnTo: {
      type: String,
      enum: ["store", "warehouse"],
    },
  },
  { _id: true },
);

// Return Schema
const returnSchema = new mongoose.Schema(
  {
    returnNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Sale",
      required: true,
    },

    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },

    returnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    cashierName: {
      type: String,
      required: true,
      trim: true,
    },

    // Shift in which the return was created
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
    },

    items: {
      type: [returnedItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: "Return must contain at least one item",
      },
    },

    // Total value of returned products
    totalRefundAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Amount deducted from customer's remaining debt
    amountAppliedToDebt: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Amount that must actually be refunded to customer
    refundDue: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Actual refund payments
    refundPayments: {
      type: [refundPaymentSchema],
      default: [],
    },

    refundedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    refundRemainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    refundStatus: {
      type: String,
      enum: ["not_required", "pending", "partially_refunded", "refunded"],
      default: "not_required",
    },

    status: {
      type: String,
      enum: ["completed", "cancelled"],
      default: "completed",
    },

    idempotencyKey: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },

    movementGroupId: {
      type: String,
      trim: true,
    },

    returnDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Calculate return and refund amounts
returnSchema.pre("validate", function () {
  for (const item of this.items) {
    if (item.condition === "damaged" && item.returnTo !== undefined) {
      this.invalidate(
        "items",
        "Damaged returned items cannot be routed to store or warehouse",
      );
    }
  }

  // Calculate total returned products value
  this.totalRefundAmount = Number(
    this.items.reduce((total, item) => total + item.refundAmount, 0).toFixed(2),
  );

  // Calculate actual refunded amount
  this.refundedAmount = Number(
    this.refundPayments
      .reduce((total, payment) => total + payment.amount, 0)
      .toFixed(2),
  );

  // Prevent refunding more than the amount due
  if (this.refundedAmount > this.refundDue) {
    this.invalidate(
      "refundPayments",
      "Refunded amount cannot exceed refund due",
    );
  }

  // Calculate remaining refund amount
  this.refundRemainingAmount = Number(
    Math.max(0, this.refundDue - this.refundedAmount).toFixed(2),
  );

  // Calculate refund status
  if (this.refundDue === 0) {
    this.refundStatus = "not_required";
  } else if (this.refundedAmount === 0) {
    this.refundStatus = "pending";
  } else if (this.refundRemainingAmount > 0) {
    this.refundStatus = "partially_refunded";
  } else {
    this.refundStatus = "refunded";
  }
});

// Indexes
returnSchema.index({ sale: 1, returnDate: -1 });
returnSchema.index({ invoiceNumber: 1 });
returnSchema.index({ returnedBy: 1, returnDate: -1 });
returnSchema.index({ shift: 1, returnDate: -1 });
returnSchema.index({ "refundPayments.shift": 1 });

module.exports = mongoose.model("Return", returnSchema);
