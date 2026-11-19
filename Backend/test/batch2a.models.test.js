"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const dns = require("node:dns");
const mongoose = require("mongoose");
const { test, before, after } = require("node:test");

require("dotenv").config({ quiet: true });

const configuredDns = (process.env.MONGO_DNS_SERVERS || "")
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);
if (configuredDns.length) dns.setServers(configuredDns);

const testDatabaseName =
  "elsory_2a_" + crypto.randomBytes(4).toString("hex");
let ownsTestDatabase = false;

let Product;
let StockMovement;
let IdempotencyRecord;
let StockTransfer;
let InventoryAudit;
let Purchase;
let Sale;
let ReturnModel;

before(async () => {
  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  await mongoose.connect(mongoUri, {
    dbName: testDatabaseName,
    serverSelectionTimeoutMS: 5000,
  });
  ownsTestDatabase = true;

  Product = require("../src/models/products.model");
  StockMovement = require("../src/models/stockMovement.model");
  IdempotencyRecord = require("../src/models/idempotencyRecord.model");
  StockTransfer = require("../src/models/stockTransfer.model");
  InventoryAudit = require("../src/models/inventoryAudit.model");
  Purchase = require("../src/models/purchase.model");
  Sale = require("../src/models/sales.model");
  ReturnModel = require("../src/models/returns.model");

  await Promise.all([
    Product.syncIndexes(),
    StockMovement.syncIndexes(),
    IdempotencyRecord.syncIndexes(),
    StockTransfer.syncIndexes(),
    InventoryAudit.syncIndexes(),
    ReturnModel.syncIndexes(),
  ]);
});

after(async () => {
  if (ownsTestDatabase && mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

test("Batch 2A: Phone location invariant & non-phone location rejection", async () => {
  const phone = await Product.create({
    name: "iPhone 15 Pro",
    type: "phone",
    brand: "Apple",
    sellingPrice: 50000,
    imei: "111222333444555",
    condition: "new",
    location: "warehouse",
  });
  assert.equal(phone.warehouseQuantity, 1);
  assert.equal(phone.storeQuantity, 0);
  assert.equal(phone.damagedQuantity, 0);
  assert.equal(phone.unallocatedQuantity, 0);

  await assert.rejects(
    Product.create({
      name: "iPhone 15 Conflicting",
      type: "phone",
      brand: "Apple",
      sellingPrice: 50000,
      imei: "111222333444556",
      condition: "new",
      location: "warehouse",
      storeQuantity: 1,
    }),
    /requires storeQuantity to equal 0/,
  );

  await assert.rejects(
    Product.create({
      name: "USB Cable",
      type: "accessory",
      brand: "Anker",
      sellingPrice: 200,
      location: "store",
    }),
    /Location field is only applicable to phone products/,
  );
});

test("Batch 2A: StockMovement Append-Only & balance validation", async () => {
  const userId = new mongoose.Types.ObjectId();
  const prod = await Product.create({
    name: "Screen Protector",
    type: "accessory",
    brand: "Belkin",
    sellingPrice: 300,
    storeQuantity: 10,
  });

  const movement = await StockMovement.create({
    movementGroupId: "grp-1",
    movementType: "purchase_receive",
    product: prod._id,
    productType: "accessory",
    location: "store",
    quantityDelta: 10,
    balanceBefore: 0,
    balanceAfter: 10,
    unitCost: 120,
    referenceType: "Purchase",
    performedBy: userId,
    performedByName: "Owner",
  });
  assert.equal(movement.balanceAfter, 10);

  await assert.rejects(
    StockMovement.create({
      movementGroupId: "grp-bad",
      movementType: "sale",
      product: prod._id,
      productType: "accessory",
      location: "store",
      quantityDelta: -2,
      balanceBefore: 10,
      balanceAfter: 9,
      referenceType: "Sale",
      performedBy: userId,
      performedByName: "Cashier",
    }),
    /balanceAfter must equal balanceBefore \+ quantityDelta/,
  );

  await assert.rejects(
    StockMovement.updateOne({ _id: movement._id }, { $set: { quantityDelta: 5 } }),
    /STOCK_MOVEMENT_APPEND_ONLY/,
  );
  await assert.rejects(
    StockMovement.replaceOne({ _id: movement._id }, {}),
    /STOCK_MOVEMENT_APPEND_ONLY/,
  );
  await assert.rejects(
    StockMovement.deleteOne({ _id: movement._id }),
    /STOCK_MOVEMENT_APPEND_ONLY/,
  );
  assert.throws(
    () => StockMovement.bulkWrite([]),
    /STOCK_MOVEMENT_APPEND_ONLY/,
  );
});

test("Batch 2A: IdempotencyRecord replay, 409 conflict, and concurrent calls", async () => {
  const userId = new mongoose.Types.ObjectId();
  const payload = { productId: "p1", quantity: 5 };
  const hash = IdempotencyRecord.hashPayload(payload);
  const key = "idem-transfer-key-001";

  const s1 = await mongoose.startSession();
  await s1.withTransaction(async () => {
    const acquired = await IdempotencyRecord.acquireOrReplay({
      operation: "transfer",
      key,
      requestHash: hash,
      createdBy: userId,
      session: s1,
    });
    assert.equal(acquired.replayed, false);
    acquired.record.status = "completed";
    acquired.record.responseStatus = 201;
    acquired.record.responseBody = { ok: true };
    await acquired.record.save({ session: s1 });
  });
  await s1.endSession();

  // Replay with same key + same hash
  const s2 = await mongoose.startSession();
  await s2.withTransaction(async () => {
    const replayed = await IdempotencyRecord.acquireOrReplay({
      operation: "transfer",
      key,
      requestHash: hash,
      createdBy: userId,
      session: s2,
    });
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.responseStatus, 201);
    assert.deepEqual(replayed.responseBody, { ok: true });
  });
  await s2.endSession();

  // Conflict with same key + different hash -> 409
  const s3 = await mongoose.startSession();
  await assert.rejects(
    s3.withTransaction(async () => {
      await IdempotencyRecord.acquireOrReplay({
        operation: "transfer",
        key,
        requestHash: IdempotencyRecord.hashPayload({ productId: "p1", quantity: 9 }),
        createdBy: userId,
        session: s3,
      });
    }),
    (err) => err.message === "IDEMPOTENCY_KEY_CONFLICT" && err.statusCode === 409,
  );
  await s3.endSession();

  // Concurrent acquisition with the same fresh key
  const concurrentKey = "idem-concurrent-key-002";
  const concurrentHash = IdempotencyRecord.hashPayload({ qty: 3 });

  const runAttempt = async () => {
    const sess = await mongoose.startSession();
    try {
      await sess.withTransaction(async () => {
        const res = await IdempotencyRecord.acquireOrReplay({
          operation: "return",
          key: concurrentKey,
          requestHash: concurrentHash,
          createdBy: userId,
          session: sess,
        });
        return res;
      });
      return "won";
    } catch {
      return "blocked";
    } finally {
      await sess.endSession();
    }
  };

  const results = await Promise.all([runAttempt(), runAttempt()]);
  assert.equal(results.filter((r) => r === "won").length, 1);
  assert.equal(results.filter((r) => r === "blocked").length, 1);
});

test("Batch 2A: Transaction Rollback between Product and StockMovement", async () => {
  const userId = new mongoose.Types.ObjectId();
  const prod = await Product.create({
    name: "Rollback Test Item",
    type: "maintenance",
    brand: "Apple",
    sellingPrice: 500,
    storeQuantity: 10,
  });

  const session = await mongoose.startSession();
  await assert.rejects(
    session.withTransaction(async () => {
      await Product.findOneAndUpdate(
        { _id: prod._id, storeQuantity: { $gte: 3 } },
        { $inc: { storeQuantity: -3 } },
        { session },
      );

      // Intentionally fail StockMovement validation (balanceAfter mismatch)
      await StockMovement.create(
        [
          {
            movementGroupId: "grp-rollback",
            movementType: "sale",
            product: prod._id,
            productType: "maintenance",
            location: "store",
            quantityDelta: -3,
            balanceBefore: 10,
            balanceAfter: 999,
            referenceType: "Sale",
            performedBy: userId,
            performedByName: "Cashier",
          },
        ],
        { session },
      );
    }),
  );
  await session.endSession();

  const fresh = await Product.findById(prod._id);
  assert.equal(fresh.storeQuantity, 10);
});

test("Batch 2A: Atomic concurrent returns guard & Purchase/Return schema constraints", async () => {
  const userId = new mongoose.Types.ObjectId();
  const supplierId = new mongoose.Types.ObjectId();
  const prodId = new mongoose.Types.ObjectId();

  // Purchase allocation cannot exceed item.quantity
  await assert.rejects(
    Purchase.create({
      supplier: supplierId,
      createdBy: userId,
      items: [
        {
          productName: "EarPods",
          brand: "Apple",
          productType: "accessory",
          quantity: 5,
          purchasePrice: 400,
          allocations: [
            { location: "store", quantity: 3, purchasePrice: 400 },
            { location: "warehouse", quantity: 4, purchasePrice: 400 },
          ],
        },
      ],
    }),
    /Total allocated quantity cannot exceed purchased quantity/,
  );

  // Damaged return item cannot specify returnTo
  await assert.rejects(
    ReturnModel.create({
      returnNumber: "RET-2A-1",
      sale: new mongoose.Types.ObjectId(),
      invoiceNumber: "INV-2A-1",
      returnedBy: userId,
      cashierName: "Cashier",
      items: [
        {
          saleItem: new mongoose.Types.ObjectId(),
          product: prodId,
          productName: "EarPods",
          productType: "accessory",
          quantity: 1,
          unitPrice: 500,
          refundAmount: 500,
          condition: "damaged",
          returnTo: "store",
        },
      ],
    }),
    /Damaged returned items cannot be routed to store or warehouse/,
  );

  // Concurrent atomic return reservation on Sale.items.returnedQuantity
  const sale = await Sale.create({
    invoiceNumber: "INV-CONC-" + crypto.randomBytes(3).toString("hex"),
    cashier: userId,
    cashierName: "Cashier",
    items: [
      {
        product: prodId,
        productName: "EarPods",
        productType: "accessory",
        brand: "Apple",
        quantity: 2,
        unitPrice: 500,
      },
    ],
    payments: [{ method: "cash", amount: 1000 }],
  });

  const saleItemId = sale.items[0]._id;

  const tryReturnTwo = async () => {
    const sess = await mongoose.startSession();
    try {
      let reserved = false;
      await sess.withTransaction(async () => {
        const updated = await Sale.findOneAndUpdate(
          {
            _id: sale._id,
            items: {
              $elemMatch: {
                _id: saleItemId,
                returnedQuantity: { $lte: 0 },
              },
            },
          },
          { $inc: { "items.$.returnedQuantity": 2 } },
          { new: true, session: sess },
        );
        if (!updated) throw new Error("RETURN_QUANTITY_EXCEEDED");
        reserved = true;
      });
      return reserved ? "won" : "blocked";
    } catch {
      return "blocked";
    } finally {
      await sess.endSession();
    }
  };

  const concResults = await Promise.all([tryReturnTwo(), tryReturnTwo()]);
  assert.equal(concResults.filter((r) => r === "won").length, 1);
  assert.equal(concResults.filter((r) => r === "blocked").length, 1);
});
