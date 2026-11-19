const mongoose = require("mongoose");

const transferItemSchema = new mongoose.Schema(
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
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Transfer quantity must be an integer",
      },
    },
    imei: {
      type: String,
      trim: true,
    },
    barcode: {
      type: String,
      trim: true,
    },
  },
  { _id: true },
);

const stockTransferSchema = new mongoose.Schema(
  {
    transferNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    direction: {
      type: String,
      enum: ["warehouse_to_store", "store_to_warehouse"],
      required: true,
      index: true,
    },

    idempotencyKey: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },

    movementGroupId: {
      type: String,
      required: true,
      trim: true,
    },

    items: {
      type: [transferItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "Transfer must contain at least one item",
      },
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    createdByName: {
      type: String,
      required: true,
      trim: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

stockTransferSchema.index({ createdAt: -1 });
stockTransferSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model("StockTransfer", stockTransferSchema);
