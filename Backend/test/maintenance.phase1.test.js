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
  "elsory_p1_" + crypto.randomBytes(4).toString("hex");
const testPassword = "Elsory-Test-Password-2026";
let ownsTestDatabase = false;
let apiBaseUrl;
let server;
let User;

const request = async (method, path, options = {}) => {
  const headers = { accept: "application/json" };
  if (options.cookie) headers.cookie = options.cookie;
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
    process.env.JWT_SECRET || "test-jwt-secret-key-for-phase1";
  process.env.CLIENT_URL = "http://localhost:3000";

  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  await mongoose.connect(mongoUri, {
    dbName: testDatabaseName,
    serverSelectionTimeoutMS: 5000,
  });
  ownsTestDatabase = true;

  User = require("../src/models/user.model");
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

test("Phase 1: maintenance_seller role, permissions, and maintenance product grouping", async () => {
  const passwordHash = await bcrypt.hash(testPassword, 4);

  const owner = await User.create({
    name: "Owner Phase1",
    email: `owner_${testRunId}@example.test`,
    password: passwordHash,
    role: "owner",
  });
  const targetUser = await User.create({
    name: "Maint Seller",
    email: `maint_${testRunId}@example.test`,
    password: passwordHash,
    role: "general",
  });
  const accSeller = await User.create({
    name: "Acc Seller",
    email: `acc_${testRunId}@example.test`,
    password: passwordHash,
    role: "accessories_seller",
  });
  const phoneSeller = await User.create({
    name: "Phone Seller",
    email: `phone_${testRunId}@example.test`,
    password: passwordHash,
    role: "phone_seller",
  });

  const ownerLogin = await login(owner.email);

  // 1. Owner assigns maintenance_seller role
  const roleRes = await request("PATCH", `/users/${targetUser._id}/role`, {
    cookie: ownerLogin.cookie,
    body: { role: "maintenance_seller" },
  });
  assert.equal(roleRes.status, 200, JSON.stringify(roleRes.body));

  // 2. maintenance_seller logs in
  const maintLogin = await login(targetUser.email);
  assert.equal(maintLogin.user.role, "maintenance_seller");

  // 3. Owner creates grouped maintenance products (should merge into 1 product + 1 barcode)
  const m1 = await request("POST", "/products", {
    cookie: ownerLogin.cookie,
    body: {
      name: "iPhone 14 Screen",
      type: "maintenance",
      brand: "Apple",
      model: "A2649",
      specifications: { quality: "Original" },
      sellingPrice: 3500,
      quantity: 3,
    },
  });
  assert.equal(m1.status, 201, JSON.stringify(m1.body));

  const m2 = await request("POST", "/products", {
    cookie: ownerLogin.cookie,
    body: {
      name: "iPhone 14 Screen",
      type: "maintenance",
      brand: "Apple",
      model: "A2649",
      specifications: { quality: "Original" },
      sellingPrice: 3600,
      quantity: 2,
    },
  });
  assert.equal(m2.status, 200, JSON.stringify(m2.body));
  assert.equal(m2.body.product._id, m1.body.product._id);
  assert.equal(m2.body.product.barcode, m1.body.product.barcode);
  assert.equal(m2.body.product.quantity, 5);

  // Also create an accessory and a phone
  const accProd = await request("POST", "/products", {
    cookie: ownerLogin.cookie,
    body: {
      name: "USB-C Cable",
      type: "accessory",
      brand: "Anker",
      sellingPrice: 250,
      quantity: 4,
    },
  });
  assert.equal(accProd.status, 201, JSON.stringify(accProd.body));

  const phoneProd = await request("POST", "/products", {
    cookie: ownerLogin.cookie,
    body: {
      name: "iPhone 15",
      type: "phone",
      brand: "Apple",
      imei: "123456789012345",
      condition: "new",
      sellingPrice: 35000,
    },
  });
  assert.equal(phoneProd.status, 201, JSON.stringify(phoneProd.body));

  // 4. maintenance_seller sees ONLY maintenance products
  const maintCatalog = await request("GET", "/products/maintenance", {
    cookie: maintLogin.cookie,
  });
  assert.equal(maintCatalog.status, 200, JSON.stringify(maintCatalog.body));
  assert.equal(maintCatalog.body.products.length, 1);
  assert.equal(maintCatalog.body.products[0].type, "maintenance");
  assert.equal(maintCatalog.body.products[0].quantity, 5);

  // 5. maintenance_seller is blocked (403) from phones, accessories, owner, and sales APIs
  const forbiddenPaths = [
    ["GET", "/products/phones"],
    ["GET", "/products/accessories"],
    ["GET", "/products"],
    ["GET", "/users"],
    ["GET", "/sales-reports?from=2026-01-01&to=2026-12-31"],
    ["POST", "/sales"],
    ["POST", "/shift/open"],
  ];
  for (const [method, path] of forbiddenPaths) {
    const res = await request(method, path, {
      cookie: maintLogin.cookie,
      body: method === "POST" ? {} : undefined,
    });
    assert.equal(res.status, 403, `Expected 403 for ${method} ${path}, got ${res.status}`);
  }

  // 6. Existing roles unaffected and blocked from /products/maintenance
  const accLogin = await login(accSeller.email);
  const phoneLogin = await login(phoneSeller.email);

  const accOnMaint = await request("GET", "/products/maintenance", {
    cookie: accLogin.cookie,
  });
  assert.equal(accOnMaint.status, 403);

  const phoneOnMaint = await request("GET", "/products/maintenance", {
    cookie: phoneLogin.cookie,
  });
  assert.equal(phoneOnMaint.status, 403);

  const accCatalog = await request("GET", "/products/accessories", {
    cookie: accLogin.cookie,
  });
  assert.equal(accCatalog.status, 200);
  assert.equal(accCatalog.body.products.length, 1);
  assert.equal(accCatalog.body.products[0].type, "accessory");
});
