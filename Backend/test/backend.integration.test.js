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

const testRunId = crypto.randomBytes(5).toString("hex");
const testDatabaseName =
  "elsory_test_" +
  process.pid +
  "_" +
  Date.now().toString(36) +
  "_" +
  crypto.randomBytes(3).toString("hex");
const testPassword = "Elsory-Test-Password-2026";
let ownsTestDatabase = false;
let apiBaseUrl;
let server;
let User;
let Product;
let Supplier;
let Purchase;
let Sale;
let ReturnModel;

const fixtures = {};

const expectStatus = (result, expectedStatus) => {
  assert.equal(
    result.status,
    expectedStatus,
    "Expected HTTP " +
      expectedStatus +
      ", got " +
      result.status +
      ": " +
      JSON.stringify(result.body),
  );
};

const request = async (method, path, options = {}) => {
  const headers = { accept: "application/json" };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(apiBaseUrl + path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const responseText = await response.text();
  let body = null;

  if (responseText) {
    try {
      body = JSON.parse(responseText);
    } catch {
      body = { raw: responseText };
    }
  }

  return { status: response.status, body, headers: response.headers };
};

const login = async (email, password = testPassword) => {
  const result = await request("POST", "/login", {
    body: { email, password },
  });
  expectStatus(result, 200);

  const setCookie = result.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  assert.ok(cookie.startsWith("token="), "Login should set an auth cookie");
  return cookie;
};

const createRoleUser = async (role, suffix) => {
  const emailPrefix = suffix.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return User.create({
    name: "Test " + suffix,
    email: emailPrefix + "_" + testRunId + "@example.test",
    password: await bcrypt.hash(testPassword, 4),
    role,
  });
};

const storeToday = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: process.env.STORE_TIME_ZONE || "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
};

before(async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required in .env to run integration tests.");
  }
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required in .env to run integration tests.");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    dbName: testDatabaseName,
    serverSelectionTimeoutMS: 15000,
  });

  const actualDatabaseName = mongoose.connection.db?.databaseName;
  if (
    !testDatabaseName.startsWith("elsory_test_") ||
    actualDatabaseName !== testDatabaseName
  ) {
    await mongoose.disconnect();
    throw new Error("Refusing to run against a database that is not isolated.");
  }
  ownsTestDatabase = true;

  User = require("../src/models/user.model");
  Product = require("../src/models/products.model");
  Supplier = require("../src/models/supplier.model");
  Purchase = require("../src/models/purchase.model");
  Sale = require("../src/models/sales.model");
  ReturnModel = require("../src/models/returns.model");

  await Promise.all(
    [User, Product, Supplier, Purchase, Sale, ReturnModel].map((model) =>
      model.init(),
    ),
  );

  const app = require("../src/app");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  apiBaseUrl = "http://127.0.0.1:" + server.address().port;
});

after(async () => {
  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }

    if (ownsTestDatabase && mongoose.connection.readyState === 1) {
      const actualDatabaseName = mongoose.connection.db?.databaseName;
      if (
        !testDatabaseName.startsWith("elsory_test_") ||
        actualDatabaseName !== testDatabaseName
      ) {
        throw new Error("Refusing to drop a database outside the test namespace.");
      }
      await mongoose.connection.dropDatabase();
    }
  } finally {
    await mongoose.disconnect();
  }
});

test(
  "auth, permissions, inventory, purchases, sales, returns, refunds, reports, and product archive",
  { timeout: 120000 },
  async () => {
    const noAuth = await request("GET", "/profile");
    expectStatus(noAuth, 401);

    const invalidRegistration = await request("POST", "/register", {
      body: { name: "Bad", email: "not-an-email", password: "short" },
    });
    expectStatus(invalidRegistration, 400);

    const registration = await request("POST", "/register", {
      body: {
        name: "General Tester",
        email: "general_" + testRunId + "@example.test",
        password: testPassword,
      },
    });
    expectStatus(registration, 201);
    assert.equal(registration.body.user.role, "general");
    assert.equal(Object.hasOwn(registration.body.user, "password"), false);

    const duplicateRegistration = await request("POST", "/register", {
      body: {
        name: "General Tester",
        email: "general_" + testRunId + "@example.test",
        password: testPassword,
      },
    });
    expectStatus(duplicateRegistration, 409);

    const invalidLogin = await request("POST", "/login", {
      body: {
        email: "general_" + testRunId + "@example.test",
        password: "incorrect-password",
      },
    });
    expectStatus(invalidLogin, 401);

    fixtures.generalCookie = await login(
      "general_" + testRunId + "@example.test",
    );
    const generalProfile = await request("GET", "/profile", {
      cookie: fixtures.generalCookie,
    });
    expectStatus(generalProfile, 200);
    assert.equal(Object.hasOwn(generalProfile.body.user, "password"), false);

    const ownerA = await createRoleUser("owner", "Owner A");
    const ownerB = await createRoleUser("owner", "Owner B");
    const cashier = await createRoleUser("cashier", "Cashier");
    const accessorySeller = await createRoleUser(
      "accessories_seller",
      "Accessory Seller",
    );
    const phoneSeller = await createRoleUser("phone_seller", "Phone Seller");

    fixtures.ownerCookies = new Map([
      [String(ownerA._id), await login(ownerA.email)],
      [String(ownerB._id), await login(ownerB.email)],
    ]);
    fixtures.cashierCookie = await login(cashier.email);
    fixtures.accessorySellerCookie = await login(accessorySeller.email);
    fixtures.phoneSellerCookie = await login(phoneSeller.email);

    const generalOwnerRoute = await request("GET", "/test", {
      cookie: fixtures.generalCookie,
    });
    expectStatus(generalOwnerRoute, 403);

    const generalProductsRoute = await request("GET", "/products", {
      cookie: fixtures.generalCookie,
    });
    expectStatus(generalProductsRoute, 403);

    const ownerSaleRoute = await request("POST", "/sales", {
      cookie: fixtures.ownerCookies.get(String(ownerA._id)),
      body: {},
    });
    expectStatus(ownerSaleRoute, 403);

    const concurrentOwnerMutations = await Promise.all([
      request("PATCH", "/users/" + ownerB._id + "/role", {
        cookie: fixtures.ownerCookies.get(String(ownerA._id)),
        body: { role: "general" },
      }),
      request("PATCH", "/users/" + ownerA._id + "/role", {
        cookie: fixtures.ownerCookies.get(String(ownerB._id)),
        body: { role: "general" },
      }),
    ]);
    assert.deepEqual(
      concurrentOwnerMutations.map((result) => result.status).sort(),
      [200, 400],
      "Concurrent owner changes must preserve one active owner",
    );

    const activeOwners = await User.find({ role: "owner", isActive: true });
    assert.equal(activeOwners.length, 1);
    fixtures.ownerId = String(activeOwners[0]._id);
    fixtures.ownerCookie = fixtures.ownerCookies.get(fixtures.ownerId);
    assert.ok(fixtures.ownerCookie, "The remaining owner must have a login cookie");

    const ownerRoute = await request("GET", "/test", {
      cookie: fixtures.ownerCookie,
    });
    expectStatus(ownerRoute, 200);

    const supplierEmail = "supplier_" + testRunId + "@example.test";
    const invalidSupplier = await request("POST", "/suppliers", {
      cookie: fixtures.ownerCookie,
      body: {
        name: "Bad Supplier",
        email: "invalid",
        phone: "123",
        address: "Test Street",
      },
    });
    expectStatus(invalidSupplier, 400);

    const supplierResponse = await request("POST", "/suppliers", {
      cookie: fixtures.ownerCookie,
      body: {
        name: "Test Supplier",
        email: supplierEmail,
        phone: "+1 (202) 555-0101",
        address: "Test Street",
      },
    });
    expectStatus(supplierResponse, 201);
    fixtures.supplierId = supplierResponse.body.supplier._id;
    assert.equal(supplierResponse.body.supplier.phone, "+12025550101");

    const supplierUpdate = await request(
      "PATCH",
      "/suppliers/" + fixtures.supplierId,
      {
        cookie: fixtures.ownerCookie,
        body: {
          email: supplierEmail,
          name: "Updated Supplier " + testRunId,
        },
      },
    );
    expectStatus(supplierUpdate, 200);
    assert.equal(
      supplierUpdate.body.supplier.name,
      "Updated Supplier " + testRunId,
    );

    const nonOwnerPurchase = await request("POST", "/purchase", {
      cookie: fixtures.cashierCookie,
      body: {},
    });
    expectStatus(nonOwnerPurchase, 403);

    const invalidPurchase = await request("POST", "/purchase", {
      cookie: fixtures.ownerCookie,
      body: {
        supplier: fixtures.supplierId,
        items: [
          {
            productName: "Test Accessory",
            brand: "Test Brand",
            productType: "accessory",
            quantity: 1.5,
            purchasePrice: 10,
          },
        ],
      },
    });
    expectStatus(invalidPurchase, 400);

    const purchaseResponse = await request("POST", "/purchase", {
      cookie: fixtures.ownerCookie,
      body: {
        supplier: fixtures.supplierId,
        items: [
          {
            productName: "Test Accessory " + testRunId,
            brand: "Test Brand",
            model: "Model A",
            specifications: { color: "black" },
            productType: "accessory",
            quantity: 5,
            purchasePrice: 10,
          },
        ],
        paidAmount: 10,
      },
    });
    expectStatus(purchaseResponse, 201);
    fixtures.purchaseId = purchaseResponse.body.data._id;
    const purchaseItemId = purchaseResponse.body.data.items[0]._id;

    const cancelledPurchaseResponse = await request("POST", "/purchase", {
      cookie: fixtures.ownerCookie,
      body: {
        supplier: fixtures.supplierId,
        items: [
          {
            productName: "Cancelled Test Item " + testRunId,
            brand: "Test Brand",
            productType: "accessory",
            quantity: 1,
            purchasePrice: 1,
          },
        ],
      },
    });
    expectStatus(cancelledPurchaseResponse, 201);
    const cancelledPurchaseId = cancelledPurchaseResponse.body.data._id;
    const cancelledItemId = cancelledPurchaseResponse.body.data.items[0]._id;

    const cancelResponse = await request(
      "PATCH",
      "/purchase/" + cancelledPurchaseId + "/cancel",
      { cookie: fixtures.ownerCookie },
    );
    expectStatus(cancelResponse, 200);
    assert.equal(cancelResponse.body.data.status, "cancelled");

    const registerCancelledItem = await request(
      "POST",
      "/purchase/" +
        cancelledPurchaseId +
        "/items/" +
        cancelledItemId +
        "/register-accessory",
      {
        cookie: fixtures.ownerCookie,
        body: { sellingPrice: 5 },
      },
    );
    expectStatus(registerCancelledItem, 400);

    const mismatchRegistration = await request(
      "POST",
      "/purchase/" +
        fixtures.purchaseId +
        "/items/" +
        purchaseItemId +
        "/register-accessory",
      {
        cookie: fixtures.ownerCookie,
        body: {
          sellingPrice: 25,
          specifications: { color: "white" },
        },
      },
    );
    expectStatus(mismatchRegistration, 400);

    const accessoryRegistration = await request(
      "POST",
      "/purchase/" +
        fixtures.purchaseId +
        "/items/" +
        purchaseItemId +
        "/register-accessory",
      {
        cookie: fixtures.ownerCookie,
        body: { sellingPrice: 25 },
      },
    );
    expectStatus(accessoryRegistration, 200);
    fixtures.accessoryId = accessoryRegistration.body.data.product._id;
    assert.equal(accessoryRegistration.body.data.product.storeQuantity, 5);
    assert.equal(accessoryRegistration.body.data.purchase.status, "completed");

    const duplicatePurchaseRegistration = await request(
      "POST",
      "/purchase/" +
        fixtures.purchaseId +
        "/items/" +
        purchaseItemId +
        "/register-accessory",
      {
        cookie: fixtures.ownerCookie,
        body: { sellingPrice: 25 },
      },
    );
    expectStatus(duplicatePurchaseRegistration, 400);

    const phoneCreation = await request("POST", "/products", {
      cookie: fixtures.ownerCookie,
      body: {
        name: "Test Phone " + testRunId,
        type: "phone",
        brand: "Test Brand",
        model: "Phone X",
        specifications: { storage: "128GB" },
        sellingPrice: 1000,
        imei: "356938035643809",
        condition: "new",
        batteryHealth: 100,
      },
    });
    expectStatus(phoneCreation, 201);
    fixtures.phoneId = phoneCreation.body.product._id;
    fixtures.phoneBarcode = phoneCreation.body.product.barcode;

    const accessoryList = await request("GET", "/products/accessories", {
      cookie: fixtures.accessorySellerCookie,
    });
    expectStatus(accessoryList, 200);

    const phoneList = await request("GET", "/products/phones", {
      cookie: fixtures.phoneSellerCookie,
    });
    expectStatus(phoneList, 200);

    const wrongAccessoryRole = await request("GET", "/products/accessories", {
      cookie: fixtures.phoneSellerCookie,
    });
    expectStatus(wrongAccessoryRole, 403);

    const wrongPhoneRole = await request("GET", "/products/phones", {
      cookie: fixtures.accessorySellerCookie,
    });
    expectStatus(wrongPhoneRole, 403);

    const cashierBarcodeLookup = await request(
      "GET",
      "/products/barcode/" + encodeURIComponent(fixtures.phoneBarcode),
      { cookie: fixtures.cashierCookie },
    );
    expectStatus(cashierBarcodeLookup, 200);

    // Business rule: cashier cannot sell before opening a shift (409)
    const saleWithoutShift = await request("POST", "/sales", {
      cookie: fixtures.cashierCookie,
      body: {
        items: [{ product: fixtures.phoneId, quantity: 1 }],
      },
    });
    expectStatus(saleWithoutShift, 409);

    const openShiftResponse = await request("POST", "/shift/open", {
      cookie: fixtures.cashierCookie,
      body: { openingCash: 1000 },
    });
    expectStatus(openShiftResponse, 201);

    const invalidPhoneSale = await request("POST", "/sales", {
      cookie: fixtures.cashierCookie,
      body: {
        items: [{ product: fixtures.phoneId, quantity: 2 }],
      },
    });
    expectStatus(invalidPhoneSale, 400);
    const phoneAfterInvalidSale = await Product.findById(fixtures.phoneId);
    assert.equal(
      phoneAfterInvalidSale.storeQuantity,
      1,
      "Invalid phone sales must not change stock",
    );
    assert.equal(phoneAfterInvalidSale.location, "store");

    const saleResponse = await request("POST", "/sales", {
      cookie: fixtures.cashierCookie,
      body: {
        customerName: "Test Customer",
        customerPhone: "01000000000",
        items: [
          { product: fixtures.accessoryId, quantity: 2 },
          { product: fixtures.phoneId, quantity: 1 },
        ],
        payments: [{ method: "cash", amount: 1050 }],
      },
    });
    expectStatus(saleResponse, 201);
    fixtures.saleId = saleResponse.body.sale._id;
    fixtures.invoiceNumber = saleResponse.body.sale.invoiceNumber;
    assert.equal(saleResponse.body.sale.finalAmount, 1050);
    assert.equal(saleResponse.body.sale.paidAmount, 1050);
    assert.equal(saleResponse.body.sale.remainingAmount, 0);

    const accessoryAfterSale = await Product.findById(fixtures.accessoryId);
    const phoneAfterSale = await Product.findById(fixtures.phoneId);
    assert.equal(accessoryAfterSale.storeQuantity, 3);
    assert.equal(phoneAfterSale.storeQuantity, 0);
    assert.equal(phoneAfterSale.location, "sold");

    const oversell = await request("POST", "/sales", {
      cookie: fixtures.cashierCookie,
      body: {
        items: [{ product: fixtures.accessoryId, quantity: 4 }],
      },
    });
    expectStatus(oversell, 400);
    assert.equal(
      (await Product.findById(fixtures.accessoryId)).storeQuantity,
      3,
      "Failed sales must roll back stock changes",
    );

    const saleItem = saleResponse.body.sale.items.find(
      (item) => String(item.product) === String(fixtures.accessoryId),
    );
    assert.ok(saleItem, "Sale must contain the accessory line");

    const excessiveReturn = await request("POST", "/return", {
      cookie: fixtures.cashierCookie,
      body: {
        invoiceNumber: fixtures.invoiceNumber,
        items: [
          {
            saleItem: saleItem._id,
            quantity: 3,
            condition: "salable",
            returnTo: "store",
          },
        ],
      },
    });
    expectStatus(excessiveReturn, 400);

    const returnResponse = await request("POST", "/return", {
      cookie: fixtures.cashierCookie,
      body: {
        invoiceNumber: fixtures.invoiceNumber,
        items: [
          {
            saleItem: saleItem._id,
            quantity: 1,
            condition: "salable",
            returnTo: "store",
            reason: "Automated integration test",
          },
        ],
      },
    });
    expectStatus(returnResponse, 201);
    fixtures.returnId = returnResponse.body.data._id;
    assert.equal(returnResponse.body.data.refundDue, 25);
    assert.equal(returnResponse.body.data.refundStatus, "pending");
    assert.equal(
      (await Product.findById(fixtures.accessoryId)).storeQuantity,
      4,
      "Returns must restore stock",
    );

    const overReturnAfterPartial = await request("POST", "/return", {
      cookie: fixtures.cashierCookie,
      body: {
        invoiceNumber: fixtures.invoiceNumber,
        items: [
          {
            saleItem: saleItem._id,
            quantity: 2,
            condition: "salable",
            returnTo: "store",
          },
        ],
      },
    });
    expectStatus(overReturnAfterPartial, 400);

    const partialRefund = await request(
      "PATCH",
      "/return/" + fixtures.returnId + "/refund",
      {
        cookie: fixtures.cashierCookie,
        body: { method: "cash", amount: 10 },
      },
    );
    expectStatus(partialRefund, 200);
    assert.equal(partialRefund.body.data.refundStatus, "partially_refunded");
    assert.equal(partialRefund.body.data.refundRemainingAmount, 15);

    const finalRefund = await request(
      "PATCH",
      "/return/" + fixtures.returnId + "/refund",
      {
        cookie: fixtures.cashierCookie,
        body: { method: "wallet", amount: 15 },
      },
    );
    expectStatus(finalRefund, 200);
    assert.equal(finalRefund.body.data.refundStatus, "refunded");
    assert.equal(finalRefund.body.data.refundedAmount, 25);

    const excessiveRefund = await request(
      "PATCH",
      "/return/" + fixtures.returnId + "/refund",
      {
        cookie: fixtures.cashierCookie,
        body: { method: "cash", amount: 1 },
      },
    );
    expectStatus(excessiveRefund, 400);

    const savedSaleAfterRefund = await Sale.findById(fixtures.saleId);
    assert.equal(savedSaleAfterRefund.refundedAmount, 25);
    assert.equal(savedSaleAfterRefund.refundDue, 0);

    const debtSaleResponse = await request("POST", "/sales", {
      cookie: fixtures.cashierCookie,
      body: {
        items: [{ product: fixtures.accessoryId, quantity: 1 }],
        payments: [],
      },
    });
    expectStatus(debtSaleResponse, 201);
    const debtSale = debtSaleResponse.body.sale;
    assert.equal(debtSale.remainingAmount, 25);

    const debtReturnResponse = await request("POST", "/return", {
      cookie: fixtures.cashierCookie,
      body: {
        invoiceNumber: debtSale.invoiceNumber,
        items: [
          {
            saleItem: debtSale.items[0]._id,
            quantity: 1,
            condition: "salable",
            returnTo: "store",
          },
        ],
      },
    });
    expectStatus(debtReturnResponse, 201);
    assert.equal(debtReturnResponse.body.data.amountAppliedToDebt, 25);
    assert.equal(debtReturnResponse.body.data.refundDue, 0);
    assert.equal(debtReturnResponse.body.data.refundStatus, "not_required");
    assert.equal(
      (await Product.findById(fixtures.accessoryId)).storeQuantity,
      4,
      "Debt returns must restore inventory",
    );

    const changedPassword = await request("POST", "/change-password", {
      cookie: fixtures.generalCookie,
      body: {
        currentPassword: testPassword,
        newPassword: "Elsory-Test-Password-Changed-2026",
      },
    });
    expectStatus(changedPassword, 200);

    const staleSession = await request("GET", "/profile", {
      cookie: fixtures.generalCookie,
    });
    expectStatus(staleSession, 401);

    const refreshedGeneralCookie = await login(
      "general_" + testRunId + "@example.test",
      "Elsory-Test-Password-Changed-2026",
    );
    const activeSession = await request("GET", "/profile", {
      cookie: refreshedGeneralCookie,
    });
    expectStatus(activeSession, 200);

    const logout = await request("POST", "/logout", {
      cookie: refreshedGeneralCookie,
    });
    expectStatus(logout, 200);

    const currentDate = storeToday();
    const salesReport = await request(
      "GET",
      "/sales-reports?from=" + currentDate + "&to=" + currentDate,
      { cookie: fixtures.ownerCookie },
    );
    expectStatus(salesReport, 200);
    assert.ok(salesReport.body.report.sales.totalInvoices >= 2);
    assert.ok(salesReport.body.report.returns.totalReturns >= 2);

    const purchasesReport = await request(
      "GET",
      "/purchases-reports?from=" + currentDate + "&to=" + currentDate,
      { cookie: fixtures.ownerCookie },
    );
    expectStatus(purchasesReport, 200);

    const returnsReport = await request(
      "GET",
      "/returns-reports?from=" + currentDate + "&to=" + currentDate,
      { cookie: fixtures.ownerCookie },
    );
    expectStatus(returnsReport, 200);
    assert.ok(returnsReport.body.report.totalReturns >= 2);
    assert.ok(returnsReport.body.report.actualRefundedAmount >= 25);

    const invalidReportDates = await request(
      "GET",
      "/sales-reports?from=2026-02-30&to=" + currentDate,
      { cookie: fixtures.ownerCookie },
    );
    expectStatus(invalidReportDates, 400);

    const forbiddenReport = await request(
      "GET",
      "/sales-reports?from=" + currentDate + "&to=" + currentDate,
      { cookie: fixtures.generalCookie },
    );
    expectStatus(forbiddenReport, 401);

    const purchaseHistoryBeforeSupplierDeactivation = await request(
      "GET",
      "/purchase/" + fixtures.purchaseId,
      { cookie: fixtures.ownerCookie },
    );
    expectStatus(purchaseHistoryBeforeSupplierDeactivation, 200);

    const supplierDeactivation = await request(
      "DELETE",
      "/suppliers/" + fixtures.supplierId,
      { cookie: fixtures.ownerCookie },
    );
    expectStatus(supplierDeactivation, 200);

    const inactiveSupplierPurchase = await request("POST", "/purchase", {
      cookie: fixtures.ownerCookie,
      body: {
        supplier: fixtures.supplierId,
        items: [
          {
            productName: "Should Not Be Purchased",
            brand: "Test Brand",
            productType: "accessory",
            quantity: 1,
            purchasePrice: 1,
          },
        ],
      },
    });
    expectStatus(inactiveSupplierPurchase, 404);

    const deleteAllProducts = await request("DELETE", "/products", {
      cookie: fixtures.ownerCookie,
    });
    expectStatus(deleteAllProducts, 200);
    assert.equal(deleteAllProducts.body.affectedCount, 2);

    const inactiveProducts = await request("GET", "/products/inactive", {
      cookie: fixtures.ownerCookie,
    });
    expectStatus(inactiveProducts, 200);
    assert.equal(inactiveProducts.body.totalProducts, 2);

    const saleHistory = await Sale.findById(fixtures.saleId);
    const returnHistory = await ReturnModel.findById(fixtures.returnId);
    assert.ok(saleHistory, "Archiving all products must preserve sales");
    assert.ok(returnHistory, "Archiving all products must preserve returns");

    const restoreProduct = await request(
      "PATCH",
      "/products/" + fixtures.accessoryId + "/restore",
      { cookie: fixtures.ownerCookie },
    );
    expectStatus(restoreProduct, 200);
    assert.equal(restoreProduct.body.product.isActive, true);
    assert.equal(
      (await Product.findById(fixtures.accessoryId)).storeQuantity,
      4,
      "Restoring an archived product must preserve its stock count",
    );
  },
);

