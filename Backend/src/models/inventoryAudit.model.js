const mongoose = require("mongoose");

const auditCategorySummarySchema = new mongoose.Schema(
  {
    itemsCount: { type: Number, default: 0, min: 0 },
    systemQty: { type: Number, default: 0, min: 0 },
    actualQty: { type: Number, default: 0, min: 0 },
    difference: { type: Number, default: 0 },
    knownCostValue: { type: Number, default: 0, min: 0 },
    unknownCostItemsCount: { type: Number, default: 0, min: 0 },
    retailValue: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const auditItemSchema = new mongoose.Schema(
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
    imei: {
      type: String,
      trim: true,
    },
    systemQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "systemQuantity must be an integer",
      },
    },
    actualQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "actualQuantity must be an integer",
      },
    },
    difference: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isSafeInteger,
        message: "difference must be an integer",
      },
    },
    unitCost: {
      type: Number,
      min: 0,
    },
    costKnown: {
      type: Boolean,
      default: false,
    },
    totalCostValue: {
      type: Number,
      min: 0,
    },
    unitSellingPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    totalSellingValue: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true },
);

const inventoryAuditSchema = new mongoose.Schema(
  {
    auditNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    location: {
      type: String,
      enum: ["store", "warehouse"],
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
      trim: true,
    },

    adjustmentsApplied: {
      type: Boolean,
      default: false,
    },

    items: {
      type: [auditItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "Inventory audit must contain at least one item",
      },
    },

    summaryByCategory: {
      phone: { type: auditCategorySummarySchema, default: () => ({}) },
      accessory: { type: auditCategorySummarySchema, default: () => ({}) },
      maintenance: { type: auditCategorySummarySchema, default: () => ({}) },
    },

    auditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    auditedByName: {
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

inventoryAuditSchema.index({ location: 1, createdAt: -1 });

module.exports = mongoose.model("InventoryAudit", inventoryAuditSchema);
