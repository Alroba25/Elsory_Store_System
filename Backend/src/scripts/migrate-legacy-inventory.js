const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const connectDB = require("../config/db");
const Product = require("../models/products.model");

const BUCKET_FIELDS = [
  "storeQuantity",
  "warehouseQuantity",
  "damagedQuantity",
  "unallocatedQuantity",
];

function getBucketSum(doc) {
  return (
    (Number(doc.storeQuantity) || 0) +
    (Number(doc.warehouseQuantity) || 0) +
    (Number(doc.damagedQuantity) || 0) +
    (Number(doc.unallocatedQuantity) || 0)
  );
}

function getExpectedPhoneBuckets(location) {
  return {
    storeQuantity: location === "store" ? 1 : 0,
    warehouseQuantity: location === "warehouse" ? 1 : 0,
    damagedQuantity: location === "damaged" ? 1 : 0,
    unallocatedQuantity: location === "unallocated" ? 1 : 0,
  };
}

function planDocumentMigration(doc) {
  const bucketSum = getBucketSum(doc);
  const legacyQty =
    Number.isInteger(doc.quantity) && doc.quantity >= 0 ? doc.quantity : 0;
  const hasLocation =
    typeof doc.location === "string" && doc.location.trim().length > 0;
  const missingAnyBucketField = BUCKET_FIELDS.some(
    (field) => doc[field] === undefined || doc[field] === null,
  );

  if (doc.type === "phone") {
    if (hasLocation) {
      return { action: "skip", reason: "already_has_location" };
    }
    if (bucketSum > 0) {
      return {
        action: "anomaly",
        reason: "phone_has_buckets_without_location",
      };
    }

    const nextLocation = legacyQty >= 1 ? "unallocated" : "sold";
    const expected = getExpectedPhoneBuckets(nextLocation);
    return {
      action: "migrate",
      category:
        nextLocation === "unallocated"
          ? "legacy_phone_in_stock"
          : "legacy_phone_sold",
      legacyUnitsMoved: legacyQty >= 1 ? 1 : 0,
      update: {
        $set: {
          location: nextLocation,
          ...expected,
        },
      },
    };
  }

  // accessory or maintenance
  if (bucketSum > 0) {
    return { action: "skip", reason: "already_has_phase2_buckets" };
  }

  if (legacyQty > 0) {
    return {
      action: "migrate",
      category: `legacy_${doc.type}_in_stock`,
      legacyUnitsMoved: legacyQty,
      update: {
        $set: {
          storeQuantity: 0,
          warehouseQuantity: 0,
          damagedQuantity: 0,
          unallocatedQuantity: legacyQty,
        },
      },
    };
  }

  if (missingAnyBucketField) {
    return {
      action: "migrate",
      category: `legacy_${doc.type}_zero_init`,
      legacyUnitsMoved: 0,
      update: {
        $set: {
          storeQuantity: 0,
          warehouseQuantity: 0,
          damagedQuantity: 0,
          unallocatedQuantity: 0,
        },
      },
    };
  }

  return { action: "skip", reason: "already_initialized_zero" };
}

async function verifyInventoryState(collection) {
  const docs = await collection.find({}).toArray();
  const report = {
    totalProducts: docs.length,
    byType: { phone: 0, accessory: 0, maintenance: 0 },
    totals: {
      storeQuantity: 0,
      warehouseQuantity: 0,
      damagedQuantity: 0,
      unallocatedQuantity: 0,
      grandTotal: 0,
    },
    violations: [],
  };

  for (const doc of docs) {
    if (report.byType[doc.type] !== undefined) {
      report.byType[doc.type] += 1;
    }

    const s = Number(doc.storeQuantity) || 0;
    const w = Number(doc.warehouseQuantity) || 0;
    const d = Number(doc.damagedQuantity) || 0;
    const u = Number(doc.unallocatedQuantity) || 0;

    report.totals.storeQuantity += s;
    report.totals.warehouseQuantity += w;
    report.totals.damagedQuantity += d;
    report.totals.unallocatedQuantity += u;
    report.totals.grandTotal += s + w + d + u;

    if (doc.type === "phone") {
      if (!doc.location) {
        report.violations.push({
          id: String(doc._id),
          name: doc.name,
          issue: "phone_missing_location",
        });
      } else {
        const expected = getExpectedPhoneBuckets(doc.location);
        if (
          s !== expected.storeQuantity ||
          w !== expected.warehouseQuantity ||
          d !== expected.damagedQuantity ||
          u !== expected.unallocatedQuantity
        ) {
          report.violations.push({
            id: String(doc._id),
            name: doc.name,
            issue: `phone_location_bucket_mismatch (${doc.location})`,
          });
        }
      }
    } else {
      if (doc.location !== undefined && doc.location !== null) {
        report.violations.push({
          id: String(doc._id),
          name: doc.name,
          issue: "non_phone_has_location",
        });
      }
      if ((Number(doc.quantity) || 0) > 0 && s + w + d + u === 0) {
        report.violations.push({
          id: String(doc._id),
          name: doc.name,
          issue: "unmigrated_legacy_quantity",
        });
      }
    }
  }

  return report;
}

async function runLegacyInventoryMigration(options = {}) {
  const { dryRun = true, backupDir = null } = options;
  const collection = Product.collection;
  const allDocs = await collection.find({}).toArray();

  let preTotalUnits = 0;
  const planned = [];
  const anomalies = [];
  const categoryCounts = {};
  let skippedCount = 0;

  for (const doc of allDocs) {
    const plan = planDocumentMigration(doc);
    const existingBuckets = getBucketSum(doc);

    if (plan.action === "migrate") {
      preTotalUnits += plan.legacyUnitsMoved;
      planned.push({ doc, plan });
      categoryCounts[plan.category] =
        (categoryCounts[plan.category] || 0) + 1;
    } else if (plan.action === "anomaly") {
      preTotalUnits += existingBuckets;
      anomalies.push({
        id: String(doc._id),
        name: doc.name,
        type: doc.type,
        reason: plan.reason,
      });
    } else {
      preTotalUnits += existingBuckets;
      skippedCount += 1;
    }
  }

  let backupFilePath = null;
  let modifiedCount = 0;

  if (!dryRun && planned.length > 0) {
    if (backupDir) {
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      backupFilePath = path.join(
        backupDir,
        `legacy-products-backup-${stamp}.json`,
      );
      fs.writeFileSync(
        backupFilePath,
        JSON.stringify(
          planned.map((item) => item.doc),
          null,
          2,
        ),
        "utf8",
      );
    }

    const bulkOps = planned.map(({ doc, plan }) => ({
      updateOne: {
        filter: { _id: doc._id },
        update: plan.update,
      },
    }));

    const bulkResult = await collection.bulkWrite(bulkOps, { ordered: true });
    modifiedCount = bulkResult.modifiedCount ?? planned.length;
  }

  const verification = await verifyInventoryState(collection);
  const unitsDelta = dryRun
    ? 0
    : verification.totals.grandTotal - preTotalUnits;

  return {
    dryRun,
    totalScanned: allDocs.length,
    plannedCount: planned.length,
    modifiedCount,
    skippedCount,
    anomalies,
    categoryCounts,
    preTotalUnits,
    postTotalUnits: dryRun ? preTotalUnits : verification.totals.grandTotal,
    unitsDelta,
    backupFilePath,
    verification,
  };
}

if (require.main === module) {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });

  const applyFlag = process.argv.includes("--apply");
  const dryRun = !applyFlag;

  (async () => {
    await connectDB();
    const backupDir = path.resolve(__dirname, "../../backups");
    const result = await runLegacyInventoryMigration({
      dryRun,
      backupDir: dryRun ? null : backupDir,
    });

    console.log("\n=== Legacy Inventory Migration Report ===");
    console.log(`Mode:            ${dryRun ? "DRY RUN (no DB changes)" : "APPLY (committed)"}`);
    console.log(`Total Scanned:   ${result.totalScanned}`);
    console.log(`To Migrate:      ${result.plannedCount}`);
    console.log(`Modified:        ${result.modifiedCount}`);
    console.log(`Skipped:         ${result.skippedCount}`);
    console.log(`Anomalies:       ${result.anomalies.length}`);
    console.log("Breakdown:      ", result.categoryCounts);
    console.log(`Expected Units:  ${result.preTotalUnits}`);
    console.log(`Post-Run Units:  ${result.postTotalUnits} (delta: ${result.unitsDelta})`);
    if (result.backupFilePath) {
      console.log(`Backup Saved:    ${result.backupFilePath}`);
    }
    console.log("Inventory Buckets:", result.verification.totals);
    console.log("By Product Type: ", result.verification.byType);
    console.log(`Post Violations: ${result.verification.violations.length}`);
    if (result.verification.violations.length > 0 && !dryRun) {
      console.error("Violations found:", result.verification.violations);
      process.exitCode = 1;
    }

    await mongoose.disconnect();
  })().catch(async (err) => {
    console.error("Migration failed:", err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = {
  planDocumentMigration,
  verifyInventoryState,
  runLegacyInventoryMigration,
};
