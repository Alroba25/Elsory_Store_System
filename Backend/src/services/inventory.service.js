const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const mongoose = require("mongoose");
const Product = require("../models/products.model");
const StockMovement = require("../models/stockMovement.model");
const IdempotencyRecord = require("../models/idempotencyRecord.model");

const generateBarcode = () =>
  `2${crypto.randomInt(100000000000, 1000000000000)}`;

const createMovementGroupId = () => crypto.randomUUID();

const bucketFieldForLocation = (location) => {
  const map = {
    store: "storeQuantity",
    warehouse: "warehouseQuantity",
    damaged: "damagedQuantity",
    unallocated: "unallocatedQuantity",
  };
  const field = map[location];
  if (!field) {
    throw new Error("INVALID_STOCK_LOCATION");
  }
  return field;
};

const computeWeightedAverageCost = (product, addedQty, unitPurchasePrice) => {
  if (
    unitPurchasePrice === undefined ||
    unitPurchasePrice === null ||
    typeof unitPurchasePrice !== "number" ||
    !Number.isFinite(unitPurchasePrice)
  ) {
    return {
      costPrice: product?.costPrice,
      costBasisQuantity: product?.costBasisQuantity || 0,
    };
  }

  const prevBasis = product?.costBasisQuantity || 0;
  const prevCost = typeof product?.costPrice === "number" ? product.costPrice : 0;
  const newBasis = prevBasis + addedQty;
  const newCost =
    newBasis > 0
      ? Number(
          ((prevCost * prevBasis + unitPurchasePrice * addedQty) / newBasis).toFixed(2),
        )
      : unitPurchasePrice;

  return {
    costPrice: newCost,
    costBasisQuantity: newBasis,
  };
};

const extractIdempotencyKey = (req) => {
  const headerKey = req.headers?.["idempotency-key"];
  const bodyKey = req.body?.idempotencyKey;
  const raw = typeof headerKey === "string" && headerKey.trim()
    ? headerKey.trim()
    : typeof bodyKey === "string" && bodyKey.trim()
      ? bodyKey.trim()
      : undefined;
  return raw;
};

/**
 * Executes an inventory-mutating operation inside a single MongoDB Transaction,
 * optionally guarded by permanent IdempotencyRecord replay/conflict protection.
 */
const withIdempotentTransaction = async ({
  operation,
  idempotencyKey,
  requestPayload,
  userId,
  handler,
}) => {
  const session = await mongoose.startSession();

  try {
    let outcome;

    await session.withTransaction(async () => {
      let idempotencyDoc = null;

      if (idempotencyKey) {
        const requestHash = IdempotencyRecord.hashPayload(requestPayload);
        const lock = await IdempotencyRecord.acquireOrReplay({
          operation,
          key: idempotencyKey,
          requestHash,
          createdBy: userId,
          session,
        });

        if (lock.replayed) {
          outcome = {
            replayed: true,
            status: lock.responseStatus,
            body: lock.responseBody,
          };
          return;
        }

        idempotencyDoc = lock.record;
      }

      const result = await handler(session);
      outcome = {
        replayed: false,
        status: result.status,
        body: result.body,
      };

      if (idempotencyDoc) {
        idempotencyDoc.status = "completed";
        idempotencyDoc.responseStatus = result.status;
        idempotencyDoc.responseBody = result.body;
        await idempotencyDoc.save({ session });
      }
    });

    return outcome;
  } finally {
    await session.endSession();
  }
};

const recordStockMovement = async (entry, session) => {
  const [movement] = await StockMovement.create([entry], { session });
  return movement;
};

/**
 * Receives quantity-based product stock (`accessory` or `maintenance`) into one or more
 * locations (`store`, `warehouse`) using the shared-barcode grouped product model.
 */
const receiveGroupedProductStock = async ({
  type,
  name,
  brand,
  model,
  specifications = {},
  sellingPrice,
  notes,
  allocations,
  purchaseId,
  purchasePrice,
  movementGroupId,
  user,
  referenceType,
  referenceId,
  session,
}) => {
  if (!["accessory", "maintenance"].includes(type)) {
    throw new Error("INVALID_GROUPED_PRODUCT_TYPE");
  }

  const normalizedSpecs = specifications ?? {};
  const totalAdded = allocations.reduce((sum, a) => sum + a.quantity, 0);
  const storeAdded = allocations
    .filter((a) => a.location === "store")
    .reduce((sum, a) => sum + a.quantity, 0);
  const warehouseAdded = allocations
    .filter((a) => a.location === "warehouse")
    .reduce((sum, a) => sum + a.quantity, 0);

  const candidates = await Product.find({
    type,
    name: name.trim(),
    brand: brand.trim(),
    isActive: true,
  }).session(session);

  let product = candidates.find((p) => {
    const sameModel = (p.model || "") === (model?.trim() || "");
    const existingSpecs = p.specifications?.toObject?.() ?? p.specifications ?? {};
    return sameModel && isDeepStrictEqual(existingSpecs, normalizedSpecs);
  });

  const beforeBalances = {
    store: product ? product.storeQuantity : 0,
    warehouse: product ? product.warehouseQuantity : 0,
  };

  let isNew = false;

  if (product) {
    const { costPrice, costBasisQuantity } = computeWeightedAverageCost(
      product,
      totalAdded,
      purchasePrice,
    );

    product.storeQuantity += storeAdded;
    product.warehouseQuantity += warehouseAdded;
    product.sellingPrice = sellingPrice;
    if (costPrice !== undefined) {
      product.costPrice = costPrice;
      product.costBasisQuantity = costBasisQuantity;
    }
    if (notes !== undefined) {
      product.notes = notes;
    }
    if (product.storeQuantity > 0 && !product.barcode) {
      product.barcode = generateBarcode();
    }
    if (purchasePrice !== undefined) {
      for (const alloc of allocations) {
        product.costBatches.push({
          purchaseId,
          purchasePrice,
          quantity: alloc.quantity,
          location: alloc.location,
          receivedAt: new Date(),
        });
      }
    }

    await product.save({ session });
  } else {
    isNew = true;
    const costBatches =
      purchasePrice !== undefined
        ? allocations.map((alloc) => ({
            purchaseId,
            purchasePrice,
            quantity: alloc.quantity,
            location: alloc.location,
            receivedAt: new Date(),
          }))
        : [];

    const [created] = await Product.create(
      [
        {
          name: name.trim(),
          type,
          brand: brand.trim(),
          model: model?.trim(),
          specifications: normalizedSpecs,
          sellingPrice,
          ...(purchasePrice !== undefined && {
            costPrice: purchasePrice,
            costBasisQuantity: totalAdded,
          }),
          costBatches,
          storeQuantity: storeAdded,
          warehouseQuantity: warehouseAdded,
          damagedQuantity: 0,
          unallocatedQuantity: 0,
          ...(storeAdded > 0 && { barcode: generateBarcode() }),
          notes,
        },
      ],
      { session },
    );
    product = created;
  }

  const runningBalances = { ...beforeBalances };
  for (const alloc of allocations) {
    const balanceBefore = runningBalances[alloc.location];
    const balanceAfter = balanceBefore + alloc.quantity;
    runningBalances[alloc.location] = balanceAfter;

    await recordStockMovement(
      {
        movementGroupId,
        movementType: "purchase_receive",
        product: product._id,
        productType: type,
        location: alloc.location,
        quantityDelta: alloc.quantity,
        balanceBefore,
        balanceAfter,
        ...(purchasePrice !== undefined && { unitCost: purchasePrice }),
        referenceType,
        referenceId,
        performedBy: user._id,
        performedByName: user.name,
        notes: notes?.trim() || "",
      },
      session,
    );
  }

  return { product, isNew };
};

/**
 * Receives an individual phone device with unique IMEI into `store` or `warehouse`.
 * Barcode is ONLY generated when entering `store`.
 */
const receivePhoneStock = async ({
  name,
  brand,
  model,
  specifications = {},
  imei,
  condition,
  batteryHealth,
  sellingPrice,
  notes,
  targetLocation = "store",
  purchaseId,
  purchasePrice,
  movementGroupId,
  user,
  referenceType,
  referenceId,
  session,
}) => {
  if (!["store", "warehouse"].includes(targetLocation)) {
    throw new Error("INVALID_STOCK_LOCATION");
  }

  const [phone] = await Product.create(
    [
      {
        name: name.trim(),
        type: "phone",
        brand: brand.trim(),
        model: model?.trim(),
        specifications: specifications ?? {},
        imei: imei.trim(),
        condition,
        batteryHealth,
        sellingPrice,
        ...(purchasePrice !== undefined && {
          costPrice: purchasePrice,
          costBasisQuantity: 1,
          costBatches: [
            {
              purchaseId,
              purchasePrice,
              quantity: 1,
              location: targetLocation,
              receivedAt: new Date(),
            },
          ],
        }),
        location: targetLocation,
        ...(targetLocation === "store" && { barcode: generateBarcode() }),
        notes,
      },
    ],
    { session },
  );

  await recordStockMovement(
    {
      movementGroupId,
      movementType: "purchase_receive",
      product: phone._id,
      productType: "phone",
      imei: phone.imei,
      location: targetLocation,
      locationAfter: targetLocation,
      quantityDelta: 1,
      balanceBefore: 0,
      balanceAfter: 1,
      ...(purchasePrice !== undefined && { unitCost: purchasePrice }),
      referenceType,
      referenceId,
      performedBy: user._id,
      performedByName: user.name,
      notes: notes?.trim() || "",
    },
    session,
  );

  return phone;
};

/**
 * Deducts sold stock strictly from `storeQuantity` (and `location: "store"` for phones).
 * Never touches warehouse, damaged, or unallocated stock.
 */
const deductStoreStockForSale = async ({
  product,
  quantity,
  saleId,
  movementGroupId,
  user,
  session,
}) => {
  const isPhone = product.type === "phone";
  const filter = {
    _id: product._id,
    isActive: true,
    storeQuantity: { $gte: quantity },
    ...(isPhone && { location: "store" }),
  };

  const update = isPhone
    ? {
        $set: {
          location: "sold",
          storeQuantity: 0,
          warehouseQuantity: 0,
          damagedQuantity: 0,
          unallocatedQuantity: 0,
        },
      }
    : {
        $inc: { storeQuantity: -quantity },
      };

  const updated = await Product.findOneAndUpdate(filter, update, {
    returnDocument: "after",
    session,
  });

  if (!updated) {
    throw new Error("INSUFFICIENT_STOCK");
  }

  const balanceAfter = updated.storeQuantity;
  const balanceBefore = balanceAfter + quantity;

  await recordStockMovement(
    {
      movementGroupId,
      movementType: "sale",
      product: updated._id,
      productType: updated.type,
      ...(isPhone && {
        imei: updated.imei,
        locationBefore: "store",
        locationAfter: "sold",
      }),
      location: "store",
      quantityDelta: -quantity,
      balanceBefore,
      balanceAfter,
      ...(typeof updated.costPrice === "number" && { unitCost: updated.costPrice }),
      referenceType: "Sale",
      referenceId: saleId,
      performedBy: user._id,
      performedByName: user.name,
    },
    session,
  );

  return updated;
};

/**
 * Restores returned stock into `store`, `warehouse`, or `damaged` according to
 * explicit return condition and routing. Damaged stock NEVER enters salable stock.
 */
const restoreStockForReturn = async ({
  product,
  quantity,
  condition,
  returnTo,
  returnId,
  reason,
  movementGroupId,
  user,
  session,
}) => {
  const isPhone = product.type === "phone";
  const targetBucketLocation = condition === "damaged" ? "damaged" : returnTo;
  const targetField = bucketFieldForLocation(targetBucketLocation);
  const movementType =
    condition === "damaged" ? "return_damaged" : "return_salable";

  let updated;
  let balanceBefore;
  let balanceAfter;

  if (isPhone) {
    const setFields = {
      isActive: true,
      location: targetBucketLocation,
      storeQuantity: targetBucketLocation === "store" ? 1 : 0,
      warehouseQuantity: targetBucketLocation === "warehouse" ? 1 : 0,
      damagedQuantity: targetBucketLocation === "damaged" ? 1 : 0,
      unallocatedQuantity: 0,
    };

    const updateDoc = { $set: setFields };
    if (targetBucketLocation === "store") {
      if (!product.barcode) {
        setFields.barcode = generateBarcode();
      }
    } else {
      updateDoc.$unset = { barcode: "" };
    }

    updated = await Product.findOneAndUpdate(
      { _id: product._id, type: "phone", location: "sold" },
      updateDoc,
      { returnDocument: "after", session },
    );

    if (!updated) {
      throw new Error("PHONE_NOT_SOLD");
    }

    balanceBefore = 0;
    balanceAfter = 1;
  } else {
    const updateDoc = {
      $inc: { [targetField]: quantity },
      $set: { isActive: true },
    };

    if (targetBucketLocation === "store" && !product.barcode) {
      updateDoc.$set.barcode = generateBarcode();
    }

    updated = await Product.findOneAndUpdate({ _id: product._id }, updateDoc, {
      returnDocument: "after",
      session,
    });

    if (!updated) {
      throw new Error("PRODUCT_UPDATE_FAILED");
    }

    balanceAfter = updated[targetField];
    balanceBefore = balanceAfter - quantity;
  }

  await recordStockMovement(
    {
      movementGroupId,
      movementType,
      product: updated._id,
      productType: updated.type,
      ...(isPhone && {
        imei: updated.imei,
        locationBefore: "sold",
        locationAfter: targetBucketLocation,
      }),
      location: targetBucketLocation,
      quantityDelta: quantity,
      balanceBefore,
      balanceAfter,
      ...(typeof updated.costPrice === "number" && { unitCost: updated.costPrice }),
      referenceType: "Return",
      referenceId: returnId,
      performedBy: user._id,
      performedByName: user.name,
      notes: reason?.trim() || "",
    },
    session,
  );

  return updated;
};

/**
 * Owner-only manual stock adjustment for `accessory` and `maintenance` products
 * on `store` or `warehouse` with mandatory reason and StockMovement audit entry.
 */
const adjustProductStockManually = async ({
  productId,
  location,
  operation,
  quantity,
  reason,
  movementGroupId,
  user,
  session,
}) => {
  if (!["store", "warehouse"].includes(location)) {
    throw new Error("INVALID_STOCK_LOCATION");
  }

  const product = await Product.findById(productId).session(session);
  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }
  if (!product.isActive) {
    throw new Error("PRODUCT_INACTIVE");
  }
  if (!["accessory", "maintenance"].includes(product.type)) {
    throw new Error("STOCK_ADJUSTMENT_UNSUPPORTED_TYPE");
  }

  const targetField = bucketFieldForLocation(location);
  const delta = operation === "increase" ? quantity : -quantity;

  const filter = {
    _id: productId,
    type: product.type,
    isActive: true,
    ...(operation === "decrease" && { [targetField]: { $gte: quantity } }),
  };

  const update =
    operation === "increase"
      ? {
          $inc: { [targetField]: quantity },
          ...(location === "store" &&
            !product.barcode && { $set: { barcode: generateBarcode() } }),
        }
      : {
          $inc: { [targetField]: -quantity },
        };

  const updated = await Product.findOneAndUpdate(filter, update, {
    returnDocument: "after",
    runValidators: true,
    session,
  });

  if (!updated) {
    throw new Error("INSUFFICIENT_STOCK");
  }

  const balanceAfter = updated[targetField];
  const balanceBefore = balanceAfter - delta;

  const movement = await recordStockMovement(
    {
      movementGroupId,
      movementType: "manual_adjustment",
      product: updated._id,
      productType: updated.type,
      location,
      quantityDelta: delta,
      balanceBefore,
      balanceAfter,
      ...(typeof updated.costPrice === "number" && { unitCost: updated.costPrice }),
      referenceType: "ManualAdjustment",
      referenceId: updated._id,
      performedBy: user._id,
      performedByName: user.name,
      notes: reason.trim(),
    },
    session,
  );

  return { product: updated, movement };
};

module.exports = {
  generateBarcode,
  createMovementGroupId,
  bucketFieldForLocation,
  computeWeightedAverageCost,
  extractIdempotencyKey,
  withIdempotentTransaction,
  recordStockMovement,
  receiveGroupedProductStock,
  receivePhoneStock,
  deductStoreStockForSale,
  restoreStockForReturn,
  adjustProductStockManually,
};
