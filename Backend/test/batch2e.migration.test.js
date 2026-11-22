const test = require("node:test");
const assert = require("node:assert/strict");
const {
  planDocumentMigration,
  verifyInventoryState,
  runLegacyInventoryMigration,
} = require("../src/scripts/migrate-legacy-inventory");
const Product = require("../src/models/products.model");

function createMockCollection(initialDocs) {
  const docs = initialDocs.map((d) => ({ ...d }));
  return {
    docs,
    find() {
      return {
        async toArray() {
          return docs.map((d) => ({ ...d }));
        },
      };
    },
    async bulkWrite(ops) {
      let modifiedCount = 0;
      for (const op of ops) {
        const target = docs.find(
          (d) => String(d._id) === String(op.updateOne.filter._id),
        );
        if (target && op.updateOne.update.$set) {
          Object.assign(target, op.updateOne.update.$set);
          modifiedCount += 1;
        }
      }
      return { modifiedCount };
    },
  };
}

test("planDocumentMigration classifies legacy phones, accessories, maintenance, and Phase-2 products", () => {
  // 1. Legacy phone in stock
  const legacyPhone = planDocumentMigration({
    _id: "p1",
    type: "phone",
    name: "iPhone 15",
    quantity: 1,
  });
  assert.equal(legacyPhone.action, "migrate");
  assert.equal(legacyPhone.category, "legacy_phone_in_stock");
  assert.equal(legacyPhone.legacyUnitsMoved, 1);
  assert.deepEqual(legacyPhone.update.$set, {
    location: "unallocated",
    storeQuantity: 0,
    warehouseQuantity: 0,
    damagedQuantity: 0,
    unallocatedQuantity: 1,
  });

  // 2. Legacy sold phone (quantity 0, no location)
  const soldPhone = planDocumentMigration({
    _id: "p2",
    type: "phone",
    name: "iPhone 14",
    quantity: 0,
  });
  assert.equal(soldPhone.action, "migrate");
  assert.equal(soldPhone.category, "legacy_phone_sold");
  assert.equal(soldPhone.legacyUnitsMoved, 0);
  assert.deepEqual(soldPhone.update.$set, {
    location: "sold",
    storeQuantity: 0,
    warehouseQuantity: 0,
    damagedQuantity: 0,
    unallocatedQuantity: 0,
  });

  // 3. Legacy accessory with quantity 12
  const legacyAcc = planDocumentMigration({
    _id: "a1",
    type: "accessory",
    name: "Anker Cable",
    quantity: 12,
  });
  assert.equal(legacyAcc.action, "migrate");
  assert.equal(legacyAcc.legacyUnitsMoved, 12);
  assert.deepEqual(legacyAcc.update.$set, {
    storeQuantity: 0,
    warehouseQuantity: 0,
    damagedQuantity: 0,
    unallocatedQuantity: 12,
  });

  // 4. Phase-2 maintenance product (already has storeQuantity: 30) -> untouched
  const phase2Maint = planDocumentMigration({
    _id: "m1",
    type: "maintenance",
    name: "شاشات GX",
    quantity: 0,
    storeQuantity: 30,
    warehouseQuantity: 0,
    damagedQuantity: 0,
    unallocatedQuantity: 0,
  });
  assert.equal(phase2Maint.action, "skip");
});

test("runLegacyInventoryMigration dryRun, apply, post-verification, and idempotency", async () => {
  const mockCollection = createMockCollection([
    { _id: "1", type: "phone", name: "iPhone 15 Pro", quantity: 1 },
    { _id: "2", type: "phone", name: "iPhone 13 Sold", quantity: 0 },
    { _id: "3", type: "accessory", name: "Charger 20W", quantity: 15 },
    { _id: "4", type: "accessory", name: "Empty Case", quantity: 0 },
    {
      _id: "5",
      type: "maintenance",
      name: "شاشات GX",
      quantity: 0,
      storeQuantity: 30,
      warehouseQuantity: 0,
      damagedQuantity: 0,
      unallocatedQuantity: 0,
    },
  ]);

  const originalCollection = Product.collection;
  Object.defineProperty(Product, "collection", {
    value: mockCollection,
    configurable: true,
  });

  try {
    // Dry run should not modify anything
    const dry = await runLegacyInventoryMigration({ dryRun: true });
    assert.equal(dry.dryRun, true);
    assert.equal(dry.plannedCount, 4);
    assert.equal(dry.modifiedCount, 0);
    assert.equal(dry.skippedCount, 1);
    assert.equal(dry.preTotalUnits, 46); // 1 + 0 + 15 + 0 + 30
    assert.equal(mockCollection.docs[0].location, undefined);

    // Apply migration
    const applied = await runLegacyInventoryMigration({ dryRun: false });
    assert.equal(applied.dryRun, false);
    assert.equal(applied.modifiedCount, 4);
    assert.equal(applied.unitsDelta, 0);
    assert.equal(applied.verification.violations.length, 0);
    assert.equal(applied.verification.totals.storeQuantity, 30);
    assert.equal(applied.verification.totals.unallocatedQuantity, 16); // 1 phone + 15 accessories
    assert.equal(applied.verification.totals.grandTotal, 46);

    // Re-running apply must be 100% idempotent (0 planned, 0 modified)
    const secondRun = await runLegacyInventoryMigration({ dryRun: false });
    assert.equal(secondRun.plannedCount, 0);
    assert.equal(secondRun.modifiedCount, 0);
    assert.equal(secondRun.skippedCount, 5);
    assert.equal(secondRun.unitsDelta, 0);

    const verified = await verifyInventoryState(mockCollection);
    assert.equal(verified.violations.length, 0);
  } finally {
    Object.defineProperty(Product, "collection", {
      value: originalCollection,
      configurable: true,
    });
  }
});
