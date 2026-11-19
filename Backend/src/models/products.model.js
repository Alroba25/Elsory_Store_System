const mongoose = require("mongoose");

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

    quantity: {
      type: Number,
      default: 0,
      min: [0, "Quantity cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be an integer",
      },
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

module.exports = mongoose.model("Product", productSchema);
