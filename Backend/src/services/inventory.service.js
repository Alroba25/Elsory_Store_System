const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const mongoose = require("mongoose");
const Product = require("../models/products.model");
const StockMovement = require("../models/stockMovement.model");
const IdempotencyRecord = require("../models/idempotencyRecord.model");
const StockTransfer = require("../models/stockTransfer.model");
const InventoryAudit = require("../models/inventoryAudit.model");

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

/**
 * Executes an atomic bidirectional StockTransfer (`warehouse_to_store` or `store_to_warehouse`).
 * Supports grouped products (accessory/maintenance with single shared barcode) and individual phones (by ID or IMEI).
 * Writes paired `transfer_out` + `transfer_in` StockMovements under one `movementGroupId`.
 */
const executeStockTransfer = async ({
  direction,
  items,
  notes,
  idempotencyKey,
  user,
  session,
}) => {
  if (!["warehouse_to_store", "store_to_warehouse"].includes(direction)) {
    throw new Error("INVALID_TRANSFER_DIRECTION");
  }

  const sourceLocation =
    direction === "warehouse_to_store" ? "warehouse" : "store";
  const targetLocation =
    direction === "warehouse_to_store" ? "store" : "warehouse";
  const sourceField = bucketFieldForLocation(sourceLocation);
  const targetField = bucketFieldForLocation(targetLocation);

  const transferId = new mongoose.Types.ObjectId();
  const movementGroupId = createMovementGroupId();
  const transferItems = [];
  const updatedProducts = [];

  for (const item of items) {
    let product;
    if (item.imei) {
      product = await Product.findOne({
        imei: item.imei.trim(),
        type: "phone",
        isActive: true,
      }).session(session);
    } else {
      product = await Product.findById(item.product).session(session);
    }

    if (!product || !product.isActive) {
      throw new Error("PRODUCT_NOT_FOUND");
    }

    if (product.type === "phone") {
      const qty = item.quantity ?? 1;
      if (qty !== 1) {
        throw new Error("PHONE_TRANSFER_QUANTITY_INVALID");
      }

      const setFields = {
        location: targetLocation,
        storeQuantity: targetLocation === "store" ? 1 : 0,
        warehouseQuantity: targetLocation === "warehouse" ? 1 : 0,
        damagedQuantity: 0,
        unallocatedQuantity: 0,
      };
      const updateDoc = { $set: setFields };

      if (targetLocation === "store") {
        if (!product.barcode) {
          setFields.barcode = generateBarcode();
        }
      } else {
        updateDoc.$unset = { barcode: "" };
      }

      const updated = await Product.findOneAndUpdate(
        {
          _id: product._id,
          type: "phone",
          isActive: true,
          location: sourceLocation,
          [sourceField]: 1,
        },
        updateDoc,
        { returnDocument: "after", session },
      );

      if (!updated) {
        throw new Error("INSUFFICIENT_SOURCE_STOCK");
      }

      await recordStockMovement(
        {
          movementGroupId,
          movementType: "transfer_out",
          product: updated._id,
          productType: "phone",
          imei: updated.imei,
          location: sourceLocation,
          locationBefore: sourceLocation,
          locationAfter: targetLocation,
          quantityDelta: -1,
          balanceBefore: 1,
          balanceAfter: 0,
          ...(typeof updated.costPrice === "number" && {
            unitCost: updated.costPrice,
          }),
          referenceType: "StockTransfer",
          referenceId: transferId,
          performedBy: user._id,
          performedByName: user.name,
          notes: notes?.trim() || "",
        },
        session,
      );

      await recordStockMovement(
        {
          movementGroupId,
          movementType: "transfer_in",
          product: updated._id,
          productType: "phone",
          imei: updated.imei,
          location: targetLocation,
          locationBefore: sourceLocation,
          locationAfter: targetLocation,
          quantityDelta: 1,
          balanceBefore: 0,
          balanceAfter: 1,
          ...(typeof updated.costPrice === "number" && {
            unitCost: updated.costPrice,
          }),
          referenceType: "StockTransfer",
          referenceId: transferId,
          performedBy: user._id,
          performedByName: user.name,
          notes: notes?.trim() || "",
        },
        session,
      );

      transferItems.push({
        product: updated._id,
        productName: updated.name,
        productType: "phone",
        quantity: 1,
        imei: updated.imei,
        ...(updated.barcode && { barcode: updated.barcode }),
      });
      updatedProducts.push(updated);
    } else {
      const qty = item.quantity;
      if (!Number.isSafeInteger(qty) || qty < 1) {
        throw new Error("INVALID_TRANSFER_QUANTITY");
      }

      const updateDoc = {
        $inc: {
          [sourceField]: -qty,
          [targetField]: qty,
        },
      };

      if (targetLocation === "store" && !product.barcode) {
        updateDoc.$set = { barcode: generateBarcode() };
      }

      const updated = await Product.findOneAndUpdate(
        {
          _id: product._id,
          type: product.type,
          isActive: true,
          [sourceField]: { $gte: qty },
        },
        updateDoc,
        { returnDocument: "after", session },
      );

      if (!updated) {
        throw new Error("INSUFFICIENT_SOURCE_STOCK");
      }

      const sourceAfter = updated[sourceField];
      const sourceBefore = sourceAfter + qty;
      const targetAfter = updated[targetField];
      const targetBefore = targetAfter - qty;

      await recordStockMovement(
        {
          movementGroupId,
          movementType: "transfer_out",
          product: updated._id,
          productType: updated.type,
          location: sourceLocation,
          quantityDelta: -qty,
          balanceBefore: sourceBefore,
          balanceAfter: sourceAfter,
          ...(typeof updated.costPrice === "number" && {
            unitCost: updated.costPrice,
          }),
          referenceType: "StockTransfer",
          referenceId: transferId,
          performedBy: user._id,
          performedByName: user.name,
          notes: notes?.trim() || "",
        },
        session,
      );

      await recordStockMovement(
        {
          movementGroupId,
          movementType: "transfer_in",
          product: updated._id,
          productType: updated.type,
          location: targetLocation,
          quantityDelta: qty,
          balanceBefore: targetBefore,
          balanceAfter: targetAfter,
          ...(typeof updated.costPrice === "number" && {
            unitCost: updated.costPrice,
          }),
          referenceType: "StockTransfer",
          referenceId: transferId,
          performedBy: user._id,
          performedByName: user.name,
          notes: notes?.trim() || "",
        },
        session,
      );

      transferItems.push({
        product: updated._id,
        productName: updated.name,
        productType: updated.type,
        quantity: qty,
        ...(updated.barcode && { barcode: updated.barcode }),
      });
      updatedProducts.push(updated);
    }
  }

  const transferNumber = `TRF-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

  const [transfer] = await StockTransfer.create(
    [
      {
        _id: transferId,
        transferNumber,
        direction,
        ...(idempotencyKey && { idempotencyKey }),
        movementGroupId,
        items: transferItems,
        createdBy: user._id,
        createdByName: user.name,
        notes: notes?.trim() || "",
      },
    ],
    { session },
  );

  return { transfer, products: updatedProducts };
};

/**
 * Executes a separate `store` or `warehouse` InventoryAudit with Optimistic Snapshot Concurrency.
 * Rejects with `409 AUDIT_CONCURRENCY_CONFLICT` if any audited product's live balance changed since snapshot.
 */
const executeInventoryAudit = async ({
  location,
  items,
  applyAdjustments = true,
  notes,
  idempotencyKey,
  user,
  session,
}) => {
  if (!["store", "warehouse"].includes(location)) {
    throw new Error("INVALID_STOCK_LOCATION");
  }

  const targetField = bucketFieldForLocation(location);
  const auditId = new mongoose.Types.ObjectId();
  const movementGroupId = createMovementGroupId();

  const summaryByCategory = {
    phone: {
      itemsCount: 0,
      systemQty: 0,
      actualQty: 0,
      difference: 0,
      knownCostValue: 0,
      unknownCostItemsCount: 0,
      retailValue: 0,
    },
    accessory: {
      itemsCount: 0,
      systemQty: 0,
      actualQty: 0,
      difference: 0,
      knownCostValue: 0,
      unknownCostItemsCount: 0,
      retailValue: 0,
    },
    maintenance: {
      itemsCount: 0,
      systemQty: 0,
      actualQty: 0,
      difference: 0,
      knownCostValue: 0,
      unknownCostItemsCount: 0,
      retailValue: 0,
    },
  };

  const changedProducts = [];
  const resolvedItems = [];

  for (const entry of items) {
    const product = await Product.findById(entry.product).session(session);
    if (!product || !product.isActive) {
      throw new Error("PRODUCT_NOT_FOUND");
    }

    if (
      product.type === "phone" &&
      entry.actualQuantity !== 0 &&
      entry.actualQuantity !== 1
    ) {
      throw new Error("INVALID_PHONE_AUDIT_QUANTITY");
    }

    const liveQuantity = product[targetField] || 0;
    const liveLocationOk =
      product.type !== "phone" ||
      (liveQuantity === 1 ? product.location === location : product.location !== location);

    if (liveQuantity !== entry.snapshotQuantity || !liveLocationOk) {
      changedProducts.push({
        productId: String(product._id),
        productName: product.name,
        snapshotQuantity: entry.snapshotQuantity,
        liveQuantity,
      });
    } else {
      resolvedItems.push({ product, entry, liveQuantity });
    }
  }

  if (changedProducts.length > 0) {
    const conflict = new Error("AUDIT_CONCURRENCY_CONFLICT");
    conflict.statusCode = 409;
    conflict.changedProducts = changedProducts;
    throw conflict;
  }

  const auditItems = [];

  for (const { product, entry, liveQuantity } of resolvedItems) {
    const difference = entry.actualQuantity - liveQuantity;
    const costKnown = typeof product.costPrice === "number";
    const unitCost = costKnown ? product.costPrice : undefined;
    const totalCostValue = costKnown
      ? Number((unitCost * entry.actualQuantity).toFixed(2))
      : undefined;
    const unitSellingPrice = product.sellingPrice;
    const totalSellingValue = Number(
      (unitSellingPrice * entry.actualQuantity).toFixed(2),
    );

    if (applyAdjustments && difference !== 0) {
      if (product.type === "phone") {
        // Phone shortage (1 -> 0) moves device to damaged; phone found (0 -> 1) moves to location
        if (liveQuantity === 1 && entry.actualQuantity === 0) {
          const updated = await Product.findOneAndUpdate(
            {
              _id: product._id,
              type: "phone",
              location,
              [targetField]: 1,
            },
            {
              $set: {
                location: "damaged",
                storeQuantity: 0,
                warehouseQuantity: 0,
                damagedQuantity: 1,
                unallocatedQuantity: 0,
              },
              $unset: { barcode: "" },
            },
            { returnDocument: "after", session },
          );
          if (!updated) {
            const conflict = new Error("AUDIT_CONCURRENCY_CONFLICT");
            conflict.statusCode = 409;
            throw conflict;
          }

          await recordStockMovement(
            {
              movementGroupId,
              movementType: "audit_adjustment",
              product: updated._id,
              productType: "phone",
              imei: updated.imei,
              location,
              locationBefore: location,
              locationAfter: "damaged",
              quantityDelta: -1,
              balanceBefore: 1,
              balanceAfter: 0,
              ...(costKnown && { unitCost }),
              referenceType: "InventoryAudit",
              referenceId: auditId,
              performedBy: user._id,
              performedByName: user.name,
              notes: notes?.trim() || "Inventory audit shortage",
            },
            session,
          );
        } else {
          throw new Error("PHONE_AUDIT_OVERAGE_NOT_ALLOWED");
        }
      } else {
        const updateDoc = {
          $set: { [targetField]: entry.actualQuantity },
        };
        if (
          location === "store" &&
          entry.actualQuantity > 0 &&
          !product.barcode
        ) {
          updateDoc.$set.barcode = generateBarcode();
        }

        const updated = await Product.findOneAndUpdate(
          {
            _id: product._id,
            type: product.type,
            isActive: true,
            [targetField]: liveQuantity,
          },
          updateDoc,
          { returnDocument: "after", session },
        );

        if (!updated) {
          const conflict = new Error("AUDIT_CONCURRENCY_CONFLICT");
          conflict.statusCode = 409;
          throw conflict;
        }

        await recordStockMovement(
          {
            movementGroupId,
            movementType: "audit_adjustment",
            product: updated._id,
            productType: updated.type,
            location,
            quantityDelta: difference,
            balanceBefore: liveQuantity,
            balanceAfter: entry.actualQuantity,
            ...(costKnown && { unitCost }),
            referenceType: "InventoryAudit",
            referenceId: auditId,
            performedBy: user._id,
            performedByName: user.name,
            notes: notes?.trim() || "Inventory audit adjustment",
          },
          session,
        );
      }
    }

    const cat = summaryByCategory[product.type];
    cat.itemsCount += 1;
    cat.systemQty += liveQuantity;
    cat.actualQty += entry.actualQuantity;
    cat.difference += difference;
    cat.retailValue = Number((cat.retailValue + totalSellingValue).toFixed(2));
    if (costKnown) {
      cat.knownCostValue = Number(
        (cat.knownCostValue + totalCostValue).toFixed(2),
      );
    } else {
      cat.unknownCostItemsCount += 1;
    }

    auditItems.push({
      product: product._id,
      productName: product.name,
      productType: product.type,
      ...(product.type === "phone" && { imei: product.imei }),
      systemQuantity: liveQuantity,
      actualQuantity: entry.actualQuantity,
      difference,
      ...(costKnown && { unitCost, totalCostValue }),
      costKnown,
      unitSellingPrice,
      totalSellingValue,
    });
  }

  const auditNumber = `AUD-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

  const [audit] = await InventoryAudit.create(
    [
      {
        _id: auditId,
        auditNumber,
        location,
        ...(idempotencyKey && { idempotencyKey }),
        movementGroupId,
        adjustmentsApplied: Boolean(applyAdjustments),
        items: auditItems,
        summaryByCategory,
        auditedBy: user._id,
        auditedByName: user.name,
        notes: notes?.trim() || "",
      },
    ],
    { session },
  );

  return audit;
};

/**
 * Owner-only allocation of legacy `unallocatedQuantity` (or phone `location: "unallocated"`)
 * into `store` and/or `warehouse` with StockMovement audit entries.
 */
const allocateUnallocatedStock = async ({
  productId,
  allocations,
  targetLocation,
  reason,
  movementGroupId,
  user,
  session,
}) => {
  const product = await Product.findById(productId).session(session);
  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }
  if (!product.isActive) {
    throw new Error("PRODUCT_INACTIVE");
  }

  if (product.type === "phone") {
    const dest = targetLocation || allocations?.[0]?.location;
    if (!["store", "warehouse"].includes(dest)) {
      throw new Error("INVALID_STOCK_LOCATION");
    }

    const setFields = {
      location: dest,
      unallocatedQuantity: 0,
      storeQuantity: dest === "store" ? 1 : 0,
      warehouseQuantity: dest === "warehouse" ? 1 : 0,
      damagedQuantity: 0,
    };
    const updateDoc = { $set: setFields };
    if (dest === "store") {
      if (!product.barcode) {
        setFields.barcode = generateBarcode();
      }
    } else {
      updateDoc.$unset = { barcode: "" };
    }

    const updated = await Product.findOneAndUpdate(
      {
        _id: product._id,
        type: "phone",
        isActive: true,
        location: "unallocated",
        unallocatedQuantity: 1,
      },
      updateDoc,
      { returnDocument: "after", session },
    );

    if (!updated) {
      throw new Error("INSUFFICIENT_UNALLOCATED_STOCK");
    }

    await recordStockMovement(
      {
        movementGroupId,
        movementType: "legacy_allocation",
        product: updated._id,
        productType: "phone",
        imei: updated.imei,
        location: "unallocated",
        locationBefore: "unallocated",
        locationAfter: dest,
        quantityDelta: -1,
        balanceBefore: 1,
        balanceAfter: 0,
        referenceType: "LegacyMigration",
        referenceId: updated._id,
        performedBy: user._id,
        performedByName: user.name,
        notes: reason.trim(),
      },
      session,
    );

    await recordStockMovement(
      {
        movementGroupId,
        movementType: "legacy_allocation",
        product: updated._id,
        productType: "phone",
        imei: updated.imei,
        location: dest,
        locationBefore: "unallocated",
        locationAfter: dest,
        quantityDelta: 1,
        balanceBefore: 0,
        balanceAfter: 1,
        referenceType: "LegacyMigration",
        referenceId: updated._id,
        performedBy: user._id,
        performedByName: user.name,
        notes: reason.trim(),
      },
      session,
    );

    return updated;
  }

  // Grouped product (accessory or maintenance)
  const totalRequested = allocations.reduce((sum, a) => sum + a.quantity, 0);
  const storeAdded = allocations
    .filter((a) => a.location === "store")
    .reduce((sum, a) => sum + a.quantity, 0);
  const warehouseAdded = allocations
    .filter((a) => a.location === "warehouse")
    .reduce((sum, a) => sum + a.quantity, 0);

  const beforeUnalloc = product.unallocatedQuantity || 0;
  const beforeStore = product.storeQuantity || 0;
  const beforeWarehouse = product.warehouseQuantity || 0;

  const updateDoc = {
    $inc: {
      unallocatedQuantity: -totalRequested,
      storeQuantity: storeAdded,
      warehouseQuantity: warehouseAdded,
    },
  };

  if (storeAdded > 0 && !product.barcode) {
    updateDoc.$set = { barcode: generateBarcode() };
  }

  const updated = await Product.findOneAndUpdate(
    {
      _id: product._id,
      type: product.type,
      isActive: true,
      unallocatedQuantity: { $gte: totalRequested },
    },
    updateDoc,
    { returnDocument: "after", session },
  );

  if (!updated) {
    throw new Error("INSUFFICIENT_UNALLOCATED_STOCK");
  }

  await recordStockMovement(
    {
      movementGroupId,
      movementType: "legacy_allocation",
      product: updated._id,
      productType: updated.type,
      location: "unallocated",
      quantityDelta: -totalRequested,
      balanceBefore: beforeUnalloc,
      balanceAfter: beforeUnalloc - totalRequested,
      referenceType: "LegacyMigration",
      referenceId: updated._id,
      performedBy: user._id,
      performedByName: user.name,
      notes: reason.trim(),
    },
    session,
  );

  const running = { store: beforeStore, warehouse: beforeWarehouse };
  for (const alloc of allocations) {
    const balBefore = running[alloc.location];
    const balAfter = balBefore + alloc.quantity;
    running[alloc.location] = balAfter;

    await recordStockMovement(
      {
        movementGroupId,
        movementType: "legacy_allocation",
        product: updated._id,
        productType: updated.type,
        location: alloc.location,
        quantityDelta: alloc.quantity,
        balanceBefore: balBefore,
        balanceAfter: balAfter,
        referenceType: "LegacyMigration",
        referenceId: updated._id,
        performedBy: user._id,
        performedByName: user.name,
        notes: reason.trim(),
      },
      session,
    );
  }

  return updated;
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
  executeStockTransfer,
  executeInventoryAudit,
  allocateUnallocatedStock,
};
