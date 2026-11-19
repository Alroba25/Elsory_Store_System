const mongoose = require("mongoose");

const roundMoney = (amount) => Number(amount.toFixed(2));

const purchaseAllocationSchema = new mongoose.Schema(
  {
    location: {
      type: String,
      enum: ["store", "warehouse"],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Allocation quantity must be at least 1"],
      validate: {
        validator: Number.isSafeInteger,
        message: "Allocation quantity must be an integer",
      },
    },
    purchasePrice: {
      type: Number,
      required: true,
      min: [0, "Purchase price cannot be negative"],
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    registeredAt: {
      type: Date,
      default: Date.now,
    },
    idempotencyKey: {
      type: String,
      trim: true,
    },
  },
  { _id: true },
);

const purchaseItemSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: [true, "Product name is required"],
    trim: true,
  },

  brand: {
    type: String,
    required: [true, "Brand is required"],
    trim: true,
  },
  model: {
    type: String,
    trim: true,
  },

  specifications: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  productType: {
    type: String,
    enum: ["phone", "accessory", "maintenance"],
    required: [true, "Product type is required"],
  },
  quantity: {
    type: Number,
    required: [true, "Quantity is required"],
    min: [1, "Quantity must be at least 1"],
    validate: {
      validator: Number.isSafeInteger,
      message: "Quantity must be an integer",
    },
  },

  purchasePrice: {
    type: Number,
    required: [true, "Purchase price is required"],
    min: [0, "Purchase price cannot be negative"],
  },

  totalPrice: {
    type: Number,
    default: 0,
    min: [0, "Total price cannot be negative"],
  },

  registeredQuantity: {
    type: Number,
    default: 0,
    min: [0, "Registered quantity cannot be negative"],
    validate: [
      {
        validator: Number.isInteger,
        message: "Registered quantity must be an integer",
      },
      {
        validator: function (value) {
          return value <= this.quantity;
        },
        message: "Registered quantity cannot exceed purchased quantity",
      },
    ],
  },

  allocations: {
    type: [purchaseAllocationSchema],
    default: [],
    validate: {
      validator: function (allocations) {
        const total = allocations.reduce((sum, a) => sum + a.quantity, 0);
        return total <= this.quantity;
      },
      message: "Total allocated quantity cannot exceed purchased quantity",
    },
  },
});

// Purchase Invoice Schema
const purchaseSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: [true, "Supplier is required"],
    },

    items: {
      type: [purchaseItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return items.length > 0;
        },
        message: "Purchase invoice must contain at least one item",
      },
    },

    totalAmount: {
      type: Number,
      default: 0,
      min: [0, "Total amount cannot be negative"],
    },

    paidAmount: {
      type: Number,
      default: 0,
      min: [0, "Paid amount cannot be negative"],
    },

    remainingAmount: {
      type: Number,
      default: 0,
      min: [0, "Remaining amount cannot be negative"],
    },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "partially_paid", "paid"],
      default: "unpaid",
    },

    status: {
      type: String,
      enum: ["draft", "completed", "cancelled"],
      default: "draft",
    },

    notes: {
      type: String,
      trim: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },
  },
  {
    timestamps: true,
  },
);

// Calculate prices and validate invoice before saving
purchaseSchema.pre("validate", function () {
  let total = 0;

  this.items.forEach((item) => {
    item.totalPrice = roundMoney(item.quantity * item.purchasePrice);
    total = roundMoney(total + item.totalPrice);
  });

  this.totalAmount = total;

  if (this.paidAmount > this.totalAmount) {
    this.invalidate("paidAmount", "Paid amount cannot exceed total amount");
  }

  this.remainingAmount = roundMoney(this.totalAmount - this.paidAmount);

  if (this.paidAmount === 0) {
    this.paymentStatus = "unpaid";
  } else if (this.paidAmount < this.totalAmount) {
    this.paymentStatus = "partially_paid";
  } else {
    this.paymentStatus = "paid";
  }

  // Completed means all purchased items have entered inventory
  if (
    this.status === "completed" &&
    this.items.some((item) => item.registeredQuantity !== item.quantity)
  ) {
    this.invalidate(
      "status",
      "All purchased items must be registered before completing the invoice",
    );
  }
});

// Indexes
purchaseSchema.index({ supplier: 1 });
purchaseSchema.index({ status: 1 });
purchaseSchema.index({ createdAt: -1 });

const Purchase = mongoose.model("Purchase", purchaseSchema);

module.exports = Purchase;
