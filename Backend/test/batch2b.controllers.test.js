"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const dns = require("node:dns");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { test, before, after } = require("node:test");

require("dotenv").config({ quiet: true });

const configuredDns = (process.env.MONGO_DNS_SERVERS || "")
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);
if (configuredDns.length) dns.setServers(configuredDns);

const testRunId = crypto.randomBytes(4).toString("hex");
const testDatabaseName = "elsory_2b_" + testRunId;
const testPassword = "Elsory-Test-Password-2026";
let ownsTestDatabase = false;
let apiBaseUrl;
let server;

let User;
let Supplier;
let Product;
let StockMovement;
let IdempotencyRecord;
let inventoryService;

const request = async (method, path, options = {}) => {
  const headers = { accept: "application/json" };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(apiBaseUrl + path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, headers: response.headers, body };
};

const login = async (email) => {
  const res = await request("POST", "/login", {
    body: { email, password: testPassword },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const setCookie = res.headers.get("set-cookie") || "";
  return { cookie: setCookie.split(";")[0], user: res.body.user };
};

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || "test-jwt-secret-key-for-batch2b";
  process.env.CLIENT_URL = "http://localhost:3000";

  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  await mongoose.connect(mongoUri, {
    dbName: testDatabaseName,
    serverSelectionTimeoutMS: 5000,
  });
  ownsTestDatabase = true;

  User = require("../src/models/user.model");
  Supplier = require("../src/models/supplier.model");
  Product = require("../src/models/products.model");
  StockMovement = require("../src/models/stockMovement.model");
  IdempotencyRecord = require("../src/models/idempotencyRecord.model");
  inventoryService = require("../src/services/inventory.service");

  await Promise.all([
    Product.syncIndexes(),
    StockMovement.syncIndexes(),
    IdempotencyRecord.syncIndexes(),
  ]);

  const app = require("../src/app");
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  apiBaseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (ownsTestDatabase && mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

test("Batch 2B: Split purchase receiving, store-only POS, returns concurrency, manual adjustment, idempotency, and rollback", async () => {
  const passwordHash = await bcrypt.hash(testPassword, 4);

  const [owner, cashier, maintSeller] = await Promise.all([
    User.create({
      name: "Owner 2B",
      email: `owner_${testRunId}@example.test`,
      password: passwordHash,
      role: "owner",
    }),
    User.create({
      name: "Cashier 2B",
      email: `cashier_${testRunId}@example.test`,
      password: passwordHash,
      role: "cashier",
    }),
    User.create({
      name: "Maint 2B",
      email: `maint_${testRunId}@example.test`,
      password: passwordHash,
      role: "maintenance_seller",
    }),
  ]);

  const ownerAuth = await login(owner.email);
  const cashierAuth = await login(cashier.email);
  const maintAuth = await login(maintSeller.email);

  const supplier = await Supplier.create({
    name: "Main Supplier",
    email: `sup_${testRunId}@example.test`,
    phone: "+201000000001",
    address: "Cairo",
  });

  // 1. Create purchase with 20 earphones (accessory) + 1 warehouse phone
  const purchaseRes = await request("POST", "/purchase", {
    cookie: ownerAuth.cookie,
    body: {
      supplier: supplier._id,
      paidAmount: 2000,
      items: [
        {
          productName: "AirPods Case",
          brand: "Apple",
          model: "Pro2",
          productType: "accessory",
          quantity: 20,
          purchasePrice: 100,
        },
        {
          productName: "iPhone 15 Warehouse",
          brand: "Apple",
          model: "128GB",
          productType: "phone",
          quantity: 1,
          purchasePrice: 30000,
        },
      ],
    },
  });
  assert.equal(purchaseRes.status, 201, JSON.stringify(purchaseRes.body));
  const purchase = purchaseRes.body.data || purchaseRes.body.purchase;
  const accItem = purchase.items.find((i) => i.productType === "accessory");
  const phoneItem = purchase.items.find((i) => i.productType === "phone");

  // 2. Split receive 20 earphones: 5 -> store, 15 -> warehouse (with idempotencyKey)
  const splitKey = `idem-split-${testRunId}`;
  const splitBody = {
    sellingPrice: 250,
    allocations: [
      { location: "store", quantity: 5 },
      { location: "warehouse", quantity: 15 },
    ],
  };

  const splitRes = await request(
    "POST",
    `/purchase/${purchase._id}/items/${accItem._id}/register-accessory`,
    { cookie: ownerAuth.cookie, idempotencyKey: splitKey, body: splitBody },
  );
  assert.equal(splitRes.status, 200, JSON.stringify(splitRes.body));
  const accProduct = splitRes.body.data.product;
  assert.equal(accProduct.storeQuantity, 5);
  assert.equal(accProduct.warehouseQuantity, 15);
  assert.equal(accProduct.costPrice, 100);
  assert.ok(accProduct.barcode, "Shared barcode must exist when storeQuantity > 0");

  // 2a. Idempotency replay: same key + same body -> returns 200 without duplicating stock
  const splitReplay = await request(
    "POST",
    `/purchase/${purchase._id}/items/${accItem._id}/register-accessory`,
    { cookie: ownerAuth.cookie, idempotencyKey: splitKey, body: splitBody },
  );
  assert.equal(splitReplay.status, 200);
  const accAfterReplay = await Product.findById(accProduct._id);
  assert.equal(accAfterReplay.storeQuantity, 5);
  assert.equal(accAfterReplay.warehouseQuantity, 15);

  // 2b. Idempotency conflict: same key + DIFFERENT body -> 409 Conflict
  const splitConflict = await request(
    "POST",
    `/purchase/${purchase._id}/items/${accItem._id}/register-accessory`,
    {
      cookie: ownerAuth.cookie,
      idempotencyKey: splitKey,
      body: { ...splitBody, sellingPrice: 999 },
    },
  );
  assert.equal(splitConflict.status, 409);

  // 3. Receive phone into warehouse -> NO barcode generated, location = warehouse
  const whPhoneRes = await request(
    "POST",
    `/purchase/${purchase._id}/items/${phoneItem._id}/register-phone`,
    {
      cookie: ownerAuth.cookie,
      idempotencyKey: `idem-phone-${testRunId}`,
      body: {
        imei: "555666777888999",
        sellingPrice: 36000,
        condition: "new",
        targetLocation: "warehouse",
      },
    },
  );
  assert.equal(whPhoneRes.status, 201, JSON.stringify(whPhoneRes.body));
  const whPhone = whPhoneRes.body.data.product;
  assert.equal(whPhone.location, "warehouse");
  assert.equal(whPhone.warehouseQuantity, 1);
  assert.equal(whPhone.storeQuantity, 0);
  assert.equal(whPhone.barcode, undefined);

  // Open cashier shift
  const shiftRes = await request("POST", "/shift/open", {
    cookie: cashierAuth.cookie,
    body: { openingCash: 1000 },
  });
  assert.equal(shiftRes.status, 201);

  // 4. Prevent selling from warehouse phone OR unallocated stock
  const unallocatedProd = await Product.create({
    name: "Legacy Unallocated Cable",
    type: "accessory",
    brand: "Anker",
    sellingPrice: 150,
    unallocatedQuantity: 10,
    storeQuantity: 0,
    barcode: "2999888777666",
  });

  const barcodeCheckUnalloc = await request(
    "GET",
    `/products/barcode/${unallocatedProd.barcode}`,
    { cookie: cashierAuth.cookie },
  );
  assert.equal(barcodeCheckUnalloc.status, 409);

  const saleWarehousePhone = await request("POST", "/sales", {
    cookie: cashierAuth.cookie,
    body: {
      items: [{ product: whPhone._id, quantity: 1 }],
      payments: [{ method: "cash", amount: 36000 }],
    },
  });
  assert.equal(saleWarehousePhone.status, 400);

  const saleUnalloc = await request("POST", "/sales", {
    cookie: cashierAuth.cookie,
    body: {
      items: [{ product: unallocatedProd._id, quantity: 1 }],
      payments: [{ method: "cash", amount: 150 }],
    },
  });
  assert.equal(saleUnalloc.status, 400);

  // Selling 6 of accProduct when storeQuantity=5 and warehouseQuantity=15 MUST FAIL
  const saleExceedStore = await request("POST", "/sales", {
    cookie: cashierAuth.cookie,
    body: {
      items: [{ product: accProduct._id, quantity: 6 }],
      payments: [{ method: "cash", amount: 1500 }],
    },
  });
  assert.equal(saleExceedStore.status, 400);

  // 5. Valid sale of 3 units -> deducts ONLY from storeQuantity (5 -> 2), warehouse stays 15
  const saleKey = `idem-sale-${testRunId}`;
  const saleBody = {
    items: [{ product: accProduct._id, quantity: 3 }],
    payments: [{ method: "cash", amount: 750 }],
  };
  const saleRes = await request("POST", "/sales", {
    cookie: cashierAuth.cookie,
    idempotencyKey: saleKey,
    body: saleBody,
  });
  assert.equal(saleRes.status, 201, JSON.stringify(saleRes.body));
  const sale = saleRes.body.sale;
  const accAfterSale = await Product.findById(accProduct._id);
  assert.equal(accAfterSale.storeQuantity, 2);
  assert.equal(accAfterSale.warehouseQuantity, 15);

  // 6. Returns: missing condition -> 400; exceeding sold qty -> 400
  const saleItemId = sale.items[0]._id;
  const badReturnNoCondition = await request("POST", "/return", {
    cookie: cashierAuth.cookie,
    body: {
      invoiceNumber: sale.invoiceNumber,
      items: [{ saleItem: saleItemId, quantity: 1 }],
    },
  });
  assert.equal(badReturnNoCondition.status, 400);

  const badReturnExceed = await request("POST", "/return", {
    cookie: cashierAuth.cookie,
    body: {
      invoiceNumber: sale.invoiceNumber,
      items: [
        {
          saleItem: saleItemId,
          quantity: 4,
          condition: "salable",
          returnTo: "store",
        },
      ],
    },
  });
  assert.equal(badReturnExceed.status, 400);

  // 6a. Valid return: 1 unit damaged -> goes to damagedQuantity ONLY (NOT storeQuantity)
  const damagedReturn = await request("POST", "/return", {
    cookie: cashierAuth.cookie,
    idempotencyKey: `idem-ret-dmg-${testRunId}`,
    body: {
      invoiceNumber: sale.invoiceNumber,
      items: [
        {
          saleItem: saleItemId,
          quantity: 1,
          condition: "damaged",
          reason: "Broken lid",
        },
      ],
    },
  });
  assert.equal(damagedReturn.status, 201, JSON.stringify(damagedReturn.body));
  const accAfterDmgRet = await Product.findById(accProduct._id);
  assert.equal(accAfterDmgRet.storeQuantity, 2);
  assert.equal(accAfterDmgRet.damagedQuantity, 1);

  // 6b. Concurrent returns for the remaining 2 units: ONLY ONE may succeed
  const [concR1, concR2] = await Promise.all([
    request("POST", "/return", {
      cookie: cashierAuth.cookie,
      idempotencyKey: `idem-ret-c1-${testRunId}`,
      body: {
        invoiceNumber: sale.invoiceNumber,
        items: [
          {
            saleItem: saleItemId,
            quantity: 2,
            condition: "salable",
            returnTo: "store",
          },
        ],
      },
    }),
    request("POST", "/return", {
      cookie: cashierAuth.cookie,
      idempotencyKey: `idem-ret-c2-${testRunId}`,
      body: {
        invoiceNumber: sale.invoiceNumber,
        items: [
          {
            saleItem: saleItemId,
            quantity: 2,
            condition: "salable",
            returnTo: "store",
          },
        ],
      },
    }),
  ]);
  const concStatuses = [concR1.status, concR2.status].sort();
  assert.equal(concStatuses.filter((s) => s === 201).length, 1);
  assert.equal(concStatuses.filter((s) => s !== 201).length, 1);

  const accAfterConcRet = await Product.findById(accProduct._id);
  assert.equal(accAfterConcRet.storeQuantity, 4); // 2 + 2 (NOT 6!)

  // 7. Manual Stock Adjustment: Owner succeeds, Cashier & Maintenance Seller get 403
  const adjKey = `idem-adj-${testRunId}`;
  const adjBody = {
    operation: "increase",
    quantity: 3,
    location: "warehouse",
    reason: "Found 3 boxes during physical check",
  };

  const cashierAdj = await request("PATCH", `/products/${accProduct._id}/stock`, {
    cookie: cashierAuth.cookie,
    idempotencyKey: adjKey,
    body: adjBody,
  });
  assert.equal(cashierAdj.status, 403);

  const maintAdj = await request("PATCH", `/products/${accProduct._id}/stock`, {
    cookie: maintAuth.cookie,
    idempotencyKey: adjKey,
    body: adjBody,
  });
  assert.equal(maintAdj.status, 403);

  const ownerAdj = await request("PATCH", `/products/${accProduct._id}/stock`, {
    cookie: ownerAuth.cookie,
    idempotencyKey: adjKey,
    body: adjBody,
  });
  assert.equal(ownerAdj.status, 200, JSON.stringify(ownerAdj.body));
  assert.equal(ownerAdj.body.product.warehouseQuantity, 18); // 15 + 3

  // Replay with same key + same body -> 200 without adding again
  const ownerAdjReplay = await request(
    "PATCH",
    `/products/${accProduct._id}/stock`,
    { cookie: ownerAuth.cookie, idempotencyKey: adjKey, body: adjBody },
  );
  assert.equal(ownerAdjReplay.status, 200);
  const accAfterAdjReplay = await Product.findById(accProduct._id);
  assert.equal(accAfterAdjReplay.warehouseQuantity, 18);

  // Conflict with same key + different body -> 409
  const ownerAdjConflict = await request(
    "PATCH",
    `/products/${accProduct._id}/stock`,
    {
      cookie: ownerAuth.cookie,
      idempotencyKey: adjKey,
      body: { ...adjBody, quantity: 9 },
    },
  );
  assert.equal(ownerAdjConflict.status, 409);

  // 8. Rollback test: failure in StockMovement inside withIdempotentTransaction rolls back Product & IdempotencyRecord
  const rollbackKey = `idem-rb-${testRunId}`;
  const storeBeforeRb = accAfterAdjReplay.storeQuantity;

  await assert.rejects(
    inventoryService.withIdempotentTransaction({
      operation: "manual_adjustment",
      idempotencyKey: rollbackKey,
      requestPayload: { test: "rollback" },
      userId: owner._id,
      handler: async (session) => {
        await Product.findOneAndUpdate(
          { _id: accProduct._id },
          { $inc: { storeQuantity: -1 } },
          { session },
        );
        // Intentionally trigger validation error on StockMovement (balanceAfter mismatch)
        await inventoryService.recordStockMovement(
          {
            movementGroupId: "grp-rb-2b",
            movementType: "manual_adjustment",
            product: accProduct._id,
            productType: "accessory",
            location: "store",
            quantityDelta: -1,
            balanceBefore: storeBeforeRb,
            balanceAfter: 9999,
            referenceType: "ManualAdjustment",
            performedBy: owner._id,
            performedByName: owner.name,
          },
          session,
        );
        return { status: 200, body: { ok: true } };
      },
    }),
  );

  const accAfterRb = await Product.findById(accProduct._id);
  assert.equal(accAfterRb.storeQuantity, storeBeforeRb);
  const rbIdem = await IdempotencyRecord.findOne({ key: rollbackKey });
  assert.equal(rbIdem, null);

  // Verify StockMovements recorded for accProduct
  const movements = await StockMovement.find({ product: accProduct._id });
  assert.ok(movements.length >= 5);
});
