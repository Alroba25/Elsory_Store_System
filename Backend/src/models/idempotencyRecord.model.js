const crypto = require("node:crypto");
const mongoose = require("mongoose");

const idempotencyRecordSchema = new mongoose.Schema(
  {
    operation: {
      type: String,
      enum: [
        "purchase_receive",
        "transfer",
        "return",
        "audit",
        "manual_adjustment",
        "sale",
        "legacy_allocation",
      ],
      required: true,
    },

    key: {
      type: String,
      required: true,
      trim: true,
      minlength: [8, "Idempotency key must be at least 8 characters"],
      maxlength: [128, "Idempotency key cannot exceed 128 characters"],
    },

    requestHash: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["in_progress", "completed"],
      default: "in_progress",
    },

    responseStatus: {
      type: Number,
    },

    responseBody: {
      type: mongoose.Schema.Types.Mixed,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

// Permanent unique index (NO TTL expiration on inventory operations)
idempotencyRecordSchema.index({ operation: 1, key: 1 }, { unique: true });

idempotencyRecordSchema.statics.hashPayload = function (payload) {
  const sortKeys = (value) => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === "object" && !(value instanceof Date)) {
      return Object.keys(value)
        .sort()
        .reduce((acc, k) => {
          acc[k] = sortKeys(value[k]);
          return acc;
        }, {});
    }
    return value;
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(sortKeys(payload ?? {})))
    .digest("hex");
};

/**
 * Atomically acquire an idempotency lock or replay/reject an existing key.
 * Must be called inside a MongoDB Transaction when protecting stock mutations.
 */
idempotencyRecordSchema.statics.acquireOrReplay = async function ({
  operation,
  key,
  requestHash,
  createdBy,
  session,
}) {
  const existing = await this.findOne({ operation, key }).session(session);
  if (existing) {
    if (existing.requestHash !== requestHash) {
      const conflict = new Error("IDEMPOTENCY_KEY_CONFLICT");
      conflict.statusCode = 409;
      throw conflict;
    }

    if (existing.status !== "completed") {
      const inProgress = new Error("IDEMPOTENCY_IN_PROGRESS");
      inProgress.statusCode = 409;
      throw inProgress;
    }

    return {
      replayed: true,
      responseStatus: existing.responseStatus,
      responseBody: existing.responseBody,
      record: existing,
    };
  }

  try {
    const [created] = await this.create(
      [
        {
          operation,
          key,
          requestHash,
          status: "in_progress",
          createdBy,
        },
      ],
      { session },
    );
    return { replayed: false, record: created };
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    // Duplicate key aborted the current transaction; inspect outside the aborted session
    const raced = await this.findOne({ operation, key });
    if (raced && raced.requestHash !== requestHash) {
      const conflict = new Error("IDEMPOTENCY_KEY_CONFLICT");
      conflict.statusCode = 409;
      throw conflict;
    }

    const inProgress = new Error("IDEMPOTENCY_IN_PROGRESS");
    inProgress.statusCode = 409;
    throw inProgress;
  }
};

module.exports = mongoose.model("IdempotencyRecord", idempotencyRecordSchema);
