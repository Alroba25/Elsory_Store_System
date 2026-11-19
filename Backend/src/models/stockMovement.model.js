const mongoose = require("mongoose");

const MOVEMENT_TYPES = [
  "purchase_receive",
  "transfer_out",
  "transfer_in",
  "sale",
  "return_salable",
  "return_damaged",
  "audit_adjustment",
  "manual_adjustment",
  "legacy_allocation",
];

const LOCATION_TYPES = ["store", "warehouse", "damaged", "unallocated"];

const stockMovementSchema = new mongoose.Schema(
  {
    movementGroupId: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
      index: true,
    },

    movementType: {
      type: String,
      enum: MOVEMENT_TYPES,
      required: true,
      immutable: true,
      index: true,
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      immutable: true,
      index: true,
    },

    productType: {
      type: String,
      enum: ["phone", "accessory", "maintenance"],
      required: true,
      immutable: true,
    },

    imei: {
      type: String,
      trim: true,
      immutable: true,
    },

    location: {
      type: String,
      enum: LOCATION_TYPES,
      required: true,
      immutable: true,
      index: true,
    },

    locationBefore: {
      type: String,
      enum: ["warehouse", "store", "sold", "damaged", "unallocated"],
      immutable: true,
    },

    locationAfter: {
      type: String,
      enum: ["warehouse", "store", "sold", "damaged", "unallocated"],
      immutable: true,
    },

    quantityDelta: {
      type: Number,
      required: true,
      immutable: true,
      validate: [
        {
          validator: Number.isSafeInteger,
          message: "quantityDelta must be an integer",
        },
        {
          validator: (v) => v !== 0,
          message: "quantityDelta cannot be zero",
        },
      ],
    },

    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
      validate: {
        validator: Number.isSafeInteger,
        message: "balanceBefore must be an integer",
      },
    },

    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
      validate: [
        {
          validator: Number.isSafeInteger,
          message: "balanceAfter must be an integer",
        },
        {
          validator: function (value) {
            return value === this.balanceBefore + this.quantityDelta;
          },
          message: "balanceAfter must equal balanceBefore + quantityDelta",
        },
      ],
    },

    unitCost: {
      type: Number,
      min: 0,
      immutable: true,
    },

    referenceType: {
      type: String,
      enum: [
        "Purchase",
        "StockTransfer",
        "Sale",
        "Return",
        "InventoryAudit",
        "ManualAdjustment",
        "LegacyMigration",
      ],
      required: true,
      immutable: true,
    },

    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      immutable: true,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    performedByName: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
      immutable: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

stockMovementSchema.index({ product: 1, createdAt: -1 });
stockMovementSchema.index({ referenceType: 1, referenceId: 1 });
stockMovementSchema.index({ createdAt: -1 });

// Enforce Append-Only at Mongoose layer
const blockMutation = function () {
  throw new Error("STOCK_MOVEMENT_APPEND_ONLY");
};

const blockedHooks = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
  "findByIdAndUpdate",
  "findByIdAndDelete",
];

for (const hook of blockedHooks) {
  stockMovementSchema.pre(hook, blockMutation);
}

stockMovementSchema.statics.bulkWrite = function () {
  throw new Error("STOCK_MOVEMENT_APPEND_ONLY");
};

module.exports = mongoose.model("StockMovement", stockMovementSchema);
