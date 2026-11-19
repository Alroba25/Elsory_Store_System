const mongoose = require("mongoose");

const costBatchSchema = new mongoose.Schema(
  {
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Purchase",
    },
    purchasePrice: {
      type: Number,
      required: true,
      min: [0, "Purchase price cannot be negative"],
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Batch quantity must be at least 1"],
      validate: {
        validator: Number.isInteger,
        message: "Batch quantity must be an integer",
      },
    },
    location: {
      type: String,
      enum: ["store", "warehouse"],
      required: true,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },

    type: {
      type: String,
      enum: ["phone", "accessory", "maintenance"],
      required: [true, "Product type is required"],
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

    barcode: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },

    sellingPrice: {
      type: Number,
      required: [true, "Selling price is required"],
      min: [0, "Selling price cannot be negative"],
    },

    // Weighted average cost for accessories/maintenance; unit purchase cost for phones
    costPrice: {
      type: Number,
      min: [0, "Cost price cannot be negative"],
    },

    costBasisQuantity: {
      type: Number,
      default: 0,
      min: [0, "Cost basis quantity cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Cost basis quantity must be an integer",
      },
    },

    costBatches: {
      type: [costBatchSchema],
      default: [],
    },

    // Legacy quantity field kept temporarily for Batch 2A compatibility; Phase 2B+ mutates location buckets only
    quantity: {
      type: Number,
      default: 0,
      min: [0, "Quantity cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be an integer",
      },
    },

    storeQuantity: {
      type: Number,
      default: 0,
      min: [0, "Store quantity cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Store quantity must be an integer",
      },
    },

    warehouseQuantity: {
      type: Number,
      default: 0,
      min: [0, "Warehouse quantity cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Warehouse quantity must be an integer",
      },
    },

    damagedQuantity: {
      type: Number,
      default: 0,
      min: [0, "Damaged quantity cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Damaged quantity must be an integer",
      },
    },

    unallocatedQuantity: {
      type: Number,
      default: 0,
      min: [0, "Unallocated quantity cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Unallocated quantity must be an integer",
      },
    },

    location: {
      type: String,
      enum: ["warehouse", "store", "sold", "damaged", "unallocated"],
    },

    imei: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },

    condition: {
      type: String,
      enum: ["new", "used"],
    },

    batteryHealth: {
      type: Number,
      min: 0,
      max: 100,
    },

    notes: {
      type: String,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Enforce phone location-to-bucket invariant whenever location is set
productSchema.pre("validate", function () {
  if (this.type !== "phone" && this.location !== undefined) {
    this.invalidate(
      "location",
      "Location field is only applicable to phone products",
    );
    return;
  }

  if (this.type === "phone" && this.location !== undefined) {
    const expected = {
      storeQuantity: this.location === "store" ? 1 : 0,
      warehouseQuantity: this.location === "warehouse" ? 1 : 0,
      damagedQuantity: this.location === "damaged" ? 1 : 0,
      unallocatedQuantity: this.location === "unallocated" ? 1 : 0,
    };

    const explicitlySet = [
      "storeQuantity",
      "warehouseQuantity",
      "damagedQuantity",
      "unallocatedQuantity",
    ].some((field) => this.isModified(field));

    if (explicitlySet) {
      for (const [field, expVal] of Object.entries(expected)) {
        if ((this[field] ?? 0) !== expVal) {
          this.invalidate(
            field,
            `Phone location '${this.location}' requires ${field} to equal ${expVal}`,
          );
        }
      }
    } else {
      Object.assign(this, expected);
    }
  }
});

productSchema.index({ type: 1, isActive: 1, storeQuantity: 1 });
productSchema.index({ type: 1, isActive: 1, warehouseQuantity: 1 });
productSchema.index({ type: 1, location: 1 });

module.exports = mongoose.model("Product", productSchema);
