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
const testDatabaseName = "elsory_2c_" + testRunId;
const testPassword = "Elsory-Test-Password-2026";
let ownsTestDatabase = false;
let apiBaseUrl;
let server;

let User;
let Product;
let StockMovement;
let inventoryService;

const request = async (method, path, options = {}) => {
  const headers = { accept: options.accept || "application/json" };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(apiBaseUrl + path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body = text;
  if (text && !options.rawText) {
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
    process.env.JWT_SECRET || "test-jwt-secret-key-for-batch2c";
  process.env.CLIENT_URL = "http://localhost:3000";

  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  await mongoose.connect(mongoUri, {
    dbName: testDatabaseName,
    serverSelectionTimeoutMS: 5000,
  });
  ownsTestDatabase = true;

  User = require("../src/models/user.model");
  Product = require("../src/models/products.model");
  StockMovement = require("../src/models/stockMovement.model");
  const IdempotencyRecord = require("../src/models/idempotencyRecord.model");
  const StockTransfer = require("../src/models/stockTransfer.model");
  const InventoryAudit = require("../src/models/inventoryAudit.model");
  inventoryService = require("../src/services/inventory.service");

  await Promise.all([
    Product.syncIndexes(),
    StockMovement.syncIndexes(),
    IdempotencyRecord.syncIndexes(),
    StockTransfer.syncIndexes(),
    InventoryAudit.syncIndexes(),
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

test("Batch 2C: Bidirectional Transfers, Phone IMEI Transfer, Idempotency, Rollback, Separate Audits with Concurrency Guard, and Unallocated Allocation", async () => {
  const passwordHash = await bcrypt.hash(testPassword, 4);
  const [owner, cashier, maintSeller] = await Promise.all([
    User.create({
      name: "Owner 2C",
      email: `owner_${testRunId}@example.test`,
      password: passwordHash,
      role: "owner",
    }),
    User.create({
      name: "Cashier 2C",
      email: `cashier_${testRunId}@example.test`,
      password: passwordHash,
      role: "cashier",
    }),
    User.create({
      name: "Maint 2C",
      email: `maint_${testRunId}@example.test`,
      password: passwordHash,
      role: "maintenance_seller",
    }),
  ]);

  const ownerAuth = await login(owner.email);
  const cashierAuth = await login(cashier.email);
  const maintAuth = await login(maintSeller.email);

  // Seed warehouse accessory (NO barcode yet), maintenance product, and warehouse phone
  const whAccRes = await request("POST", "/products", {
    cookie: ownerAuth.cookie,
    body: {
      name: "Lightning Cable",
      type: "accessory",
      brand: "Apple",
      sellingPrice: 400,
      costPrice: 180,
      quantity: 20,
      location: "warehouse",
    },
  });
  assert.equal(whAccRes.status, 201, JSON.stringify(whAccRes.body));
  const whAcc = whAccRes.body.product;
  assert.equal(whAcc.warehouseQuantity, 20);
  assert.equal(whAcc.storeQuantity, 0);
  assert.equal(whAcc.barcode, undefined);

  const whMaintRes = await request("POST", "/products", {
    cookie: ownerAuth.cookie,
    body: {
      name: "iPhone 13 Battery",
      type: "maintenance",
      brand: "Apple",
      sellingPrice: 1200,
      quantity: 10,
      location: "warehouse",
    },
  });
  assert.equal(whMaintRes.status, 201);
  const whMaint = whMaintRes.body.product;

  const whPhoneRes = await request("POST", "/products", {
    cookie: ownerAuth.cookie,
    body: {
      name: "iPhone 16 Pro",
      type: "phone",
      brand: "Apple",
      imei: "777888999000111",
      condition: "new",
      sellingPrice: 55000,
      costPrice: 49000,
      location: "warehouse",
    },
  });
  assert.equal(whPhoneRes.status, 201);
  const whPhone = whPhoneRes.body.product;
  assert.equal(whPhone.location, "warehouse");
  assert.equal(whPhone.barcode, undefined);

  // 1. Transfer warehouse -> store (accessory 6 + maintenance 4 + phone by IMEI)
  const trfKey = `idem-trf1-${testRunId}`;
  const trfBody = {
    direction: "warehouse_to_store",
    items: [
      { product: whAcc._id, quantity: 6 },
      { product: whMaint._id, quantity: 4 },
      { imei: "777888999000111" },
    ],
    notes: "Morning store restock",
  };

  // Non-owner rejected (403)
  const cashierTrf = await request("POST", "/transfers", {
    cookie: cashierAuth.cookie,
    idempotencyKey: trfKey,
    body: trfBody,
  });
  assert.equal(cashierTrf.status, 403);

  const trfRes = await request("POST", "/transfers", {
    cookie: ownerAuth.cookie,
    idempotencyKey: trfKey,
    body: trfBody,
  });
  assert.equal(trfRes.status, 201, JSON.stringify(trfRes.body));
  const transfer1 = trfRes.body.transfer;

  const accAfterTrf1 = await Product.findById(whAcc._id);
  const phoneAfterTrf1 = await Product.findById(whPhone._id);
  assert.equal(accAfterTrf1.warehouseQuantity, 14);
  assert.equal(accAfterTrf1.storeQuantity, 6);
  assert.ok(accAfterTrf1.barcode, "Shared barcode created on store entry");
  assert.equal(phoneAfterTrf1.location, "store");
  assert.equal(phoneAfterTrf1.storeQuantity, 1);
  assert.equal(phoneAfterTrf1.warehouseQuantity, 0);
  assert.ok(phoneAfterTrf1.barcode, "Phone barcode created on store entry");

  // Paired transfer_out + transfer_in movements under same movementGroupId
  const trfMovements = await StockMovement.find({
    movementGroupId: transfer1.movementGroupId,
  });
  assert.equal(trfMovements.length, 6); // 3 items * 2 movements
  assert.equal(
    trfMovements.filter((m) => m.movementType === "transfer_out").length,
    3,
  );
  assert.equal(
    trfMovements.filter((m) => m.movementType === "transfer_in").length,
    3,
  );

  // 2. Idempotency replay & 409 conflict on transfer
  const trfReplay = await request("POST", "/transfers", {
    cookie: ownerAuth.cookie,
    idempotencyKey: trfKey,
    body: trfBody,
  });
  assert.equal(trfReplay.status, 201);
  assert.equal((await Product.findById(whAcc._id)).storeQuantity, 6);

  const trfConflict = await request("POST", "/transfers", {
    cookie: ownerAuth.cookie,
    idempotencyKey: trfKey,
    body: { ...trfBody, notes: "Different payload" },
  });
  assert.equal(trfConflict.status, 409);

  // 3. Reject transfer when insufficient stock
  const trfInsufficient = await request("POST", "/transfers", {
    cookie: ownerAuth.cookie,
    idempotencyKey: `idem-trf-insuff-${testRunId}`,
    body: {
      direction: "warehouse_to_store",
      items: [{ product: whAcc._id, quantity: 99 }],
    },
  });
  assert.equal(trfInsufficient.status, 400);

  // 4. Reverse transfer (store -> warehouse) keeps shared barcode for accessory, unsets phone barcode
  const revTrf = await request("POST", "/transfers", {
    cookie: ownerAuth.cookie,
    idempotencyKey: `idem-trf-rev-${testRunId}`,
    body: {
      direction: "store_to_warehouse",
      items: [
        { product: whAcc._id, quantity: 2 },
        { imei: "777888999000111" },
      ],
    },
  });
  assert.equal(revTrf.status, 201, JSON.stringify(revTrf.body));
  const accAfterRev = await Product.findById(whAcc._id);
  const phoneAfterRev = await Product.findById(whPhone._id);
  assert.equal(accAfterRev.storeQuantity, 4);
  assert.equal(accAfterRev.warehouseQuantity, 16);
  assert.equal(accAfterRev.barcode, accAfterTrf1.barcode);
  assert.equal(phoneAfterRev.location, "warehouse");
  assert.equal(phoneAfterRev.barcode, undefined);

  // 5. Concurrent transfers with same fresh key -> only 1 executes
  const concTrfKey = `idem-trf-conc-${testRunId}`;
  const concTrfBody = {
    direction: "warehouse_to_store",
    items: [{ product: whAcc._id, quantity: 1 }],
  };
  const [ct1, ct2] = await Promise.all([
    request("POST", "/transfers", {
      cookie: ownerAuth.cookie,
      idempotencyKey: concTrfKey,
      body: concTrfBody,
    }),
    request("POST", "/transfers", {
      cookie: ownerAuth.cookie,
      idempotencyKey: concTrfKey,
      body: concTrfBody,
    }),
  ]);
  const concStatuses = [ct1.status, ct2.status];
  if (concStatuses.every((s) => s === 201)) {
    // Second request arrived after first committed and replayed the exact same transfer
    assert.equal(ct1.body.transfer._id, ct2.body.transfer._id);
  } else {
    assert.equal(concStatuses.filter((s) => s === 201).length, 1);
    assert.equal(concStatuses.filter((s) => s === 409).length, 1);
  }
  assert.equal((await Product.findById(whAcc._id)).storeQuantity, 5); // 4 + 1 (never 6!)

  // 6. Rollback test: failure inside transfer transaction leaves balances intact
  const beforeRbStore = (await Product.findById(whAcc._id)).storeQuantity;
  const beforeRbWh = (await Product.findById(whAcc._id)).warehouseQuantity;
  await assert.rejects(
    inventoryService.withIdempotentTransaction({
      operation: "transfer",
      idempotencyKey: `idem-trf-rb-${testRunId}`,
      requestPayload: { rb: true },
      userId: owner._id,
      handler: async (session) => {
        await inventoryService.executeStockTransfer({
          direction: "warehouse_to_store",
          items: [{ product: whAcc._id, quantity: 1 }],
          user: owner,
          session,
        });
        throw new Error("SIMULATED_MOVEMENT_FAILURE");
      },
    }),
  );
  const afterRb = await Product.findById(whAcc._id);
  assert.equal(afterRb.storeQuantity, beforeRbStore);
  assert.equal(afterRb.warehouseQuantity, beforeRbWh);

  // 7. Separate Store & Warehouse Inventory Audit + Shortage/Overage + CSV export
  const storeSnap = await request(
    "GET",
    "/inventory-audit/snapshot?location=store",
    { cookie: ownerAuth.cookie },
  );
  assert.equal(storeSnap.status, 200);
  assert.equal(storeSnap.body.location, "store");
  assert.equal(storeSnap.body.categories.accessory.length, 1);
  assert.equal(storeSnap.body.categories.maintenance.length, 1);
  assert.equal(storeSnap.body.categories.phone.length, 0); // phone was moved back to warehouse!

  const whSnap = await request(
    "GET",
    "/inventory-audit/snapshot?location=warehouse",
    { cookie: ownerAuth.cookie },
  );
  assert.equal(whSnap.status, 200);
  assert.equal(whSnap.body.categories.phone.length, 1);

  // Submit Store Audit: accessory shortage (5 -> 4), maintenance overage (4 -> 5)
  const storeAuditRes = await request("POST", "/inventory-audit", {
    cookie: ownerAuth.cookie,
    idempotencyKey: `idem-aud-store-${testRunId}`,
    body: {
      location: "store",
      applyAdjustments: true,
      items: [
        { product: whAcc._id, snapshotQuantity: 5, actualQuantity: 4 },
        { product: whMaint._id, snapshotQuantity: 4, actualQuantity: 5 },
      ],
      notes: "End of day store audit",
    },
  });
  assert.equal(storeAuditRes.status, 201, JSON.stringify(storeAuditRes.body));
  const storeAudit = storeAuditRes.body.audit;
  assert.equal(storeAudit.summaryByCategory.accessory.difference, -1);
  assert.equal(storeAudit.summaryByCategory.maintenance.difference, 1);
  assert.equal(storeAudit.summaryByCategory.maintenance.unknownCostItemsCount, 1);
  assert.equal((await Product.findById(whAcc._id)).storeQuantity, 4);
  assert.equal((await Product.findById(whMaint._id)).storeQuantity, 5);

  // CSV export check
  const csvRes = await request(
    "GET",
    `/inventory-audit/${storeAudit._id}?format=csv`,
    { cookie: ownerAuth.cookie, accept: "text/csv", rawText: true },
  );
  assert.equal(csvRes.status, 200);
  assert.ok(csvRes.body.includes("ProductName,Category,IMEI"));

  // 8. Audit Optimistic Concurrency Conflict (409): stale snapshotQuantity after stock changed
  const staleAuditRes = await request("POST", "/inventory-audit", {
    cookie: ownerAuth.cookie,
    idempotencyKey: `idem-aud-stale-${testRunId}`,
    body: {
      location: "store",
      applyAdjustments: true,
      items: [
        { product: whAcc._id, snapshotQuantity: 5, actualQuantity: 3 }, // live is 4, NOT 5!
      ],
    },
  });
  assert.equal(staleAuditRes.status, 409, JSON.stringify(staleAuditRes.body));
  assert.equal(staleAuditRes.body.changedProducts.length, 1);
  assert.equal((await Product.findById(whAcc._id)).storeQuantity, 4); // unchanged!

  // 9. Unallocated Stock Allocation (Owner only, split store/warehouse, over-allocation rejected, 403 for non-owner)
  const unallocAcc = await Product.create({
    name: "Legacy Unallocated Charger",
    type: "accessory",
    brand: "Anker",
    sellingPrice: 300,
    unallocatedQuantity: 10,
    storeQuantity: 0,
    warehouseQuantity: 0,
  });
  const unallocPhone = await Product.create({
    name: "Legacy Unallocated Phone",
    type: "phone",
    brand: "Samsung",
    imei: "999000111222333",
    condition: "used",
    sellingPrice: 12000,
    location: "unallocated",
  });

  const unallocList = await request("GET", "/products/unallocated", {
    cookie: ownerAuth.cookie,
  });
  assert.equal(unallocList.status, 200);
  assert.equal(unallocList.body.totalProducts, 2);

  // Non-owner forbidden (403)
  const maintAlloc = await request(
    "POST",
    `/products/${unallocAcc._id}/allocate`,
    {
      cookie: maintAuth.cookie,
      idempotencyKey: `idem-alloc-f-${testRunId}`,
      body: {
        allocations: [{ location: "store", quantity: 2 }],
        reason: "Unauthorized attempt",
      },
    },
  );
  assert.equal(maintAlloc.status, 403);

  // Over-allocation rejected (400)
  const overAlloc = await request(
    "POST",
    `/products/${unallocAcc._id}/allocate`,
    {
      cookie: ownerAuth.cookie,
      idempotencyKey: `idem-alloc-over-${testRunId}`,
      body: {
        allocations: [{ location: "store", quantity: 11 }],
        reason: "Too much",
      },
    },
  );
  assert.equal(overAlloc.status, 400);

  // Valid split allocation: 4 store + 6 warehouse
  const allocKey = `idem-alloc-ok-${testRunId}`;
  const allocBody = {
    allocations: [
      { location: "store", quantity: 4 },
      { location: "warehouse", quantity: 6 },
    ],
    reason: "Initial legacy count distribution",
  };
  const okAlloc = await request(
    "POST",
    `/products/${unallocAcc._id}/allocate`,
    { cookie: ownerAuth.cookie, idempotencyKey: allocKey, body: allocBody },
  );
  assert.equal(okAlloc.status, 200, JSON.stringify(okAlloc.body));
  assert.equal(okAlloc.body.product.unallocatedQuantity, 0);
  assert.equal(okAlloc.body.product.storeQuantity, 4);
  assert.equal(okAlloc.body.product.warehouseQuantity, 6);
  assert.ok(okAlloc.body.product.barcode);

  // Idempotency replay on allocation
  const okAllocReplay = await request(
    "POST",
    `/products/${unallocAcc._id}/allocate`,
    { cookie: ownerAuth.cookie, idempotencyKey: allocKey, body: allocBody },
  );
  assert.equal(okAllocReplay.status, 200);
  assert.equal((await Product.findById(unallocAcc._id)).storeQuantity, 4);

  // Allocate unallocated phone to store -> gets barcode + location="store"
  const phoneAlloc = await request(
    "POST",
    `/products/${unallocPhone._id}/allocate`,
    {
      cookie: ownerAuth.cookie,
      idempotencyKey: `idem-alloc-ph-${testRunId}`,
      body: {
        targetLocation: "store",
        reason: "Verified in store display",
      },
    },
  );
  assert.equal(phoneAlloc.status, 200, JSON.stringify(phoneAlloc.body));
  assert.equal(phoneAlloc.body.product.location, "store");
  assert.equal(phoneAlloc.body.product.storeQuantity, 1);
  assert.equal(phoneAlloc.body.product.unallocatedQuantity, 0);
  assert.ok(phoneAlloc.body.product.barcode);
});
