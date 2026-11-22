# تقرير إنجاز الدفعة 2B: خدمة المخزون الموحدة وتحديث المتحكمات (`WAREHOUSE_PHASE_2B_REPORT.md`)

> **حالة الدفعة:** مكتملة ومفحوصة آلياً على فرع **`backend`** (Commit `d5b6cf7`).
> **النطاق الملتزم به:** Backend فقط — لم يتم تعديل Frontend أو تنفيذ Migration أو بناء Transfers/Audits أو الانتقال إلى 2C.

---

## 1. الملفات التي تم تعديلها أو إنشاؤها (على فرع `backend` — Commit `d5b6cf7`)

- **ملفات جديدة:**
  - `Backend/src/services/inventory.service.js` *(خدمة المخزون الموحدة وبوابة الكتابة الوحيدة لـ `Product` و`StockMovement` و`IdempotencyRecord`)*
  - `Backend/test/batch2b.controllers.test.js` *(اختبارات شاملة لجميع سيناريوهات 2B)*
- **ملفات تم تعديلها:**
  - `Backend/src/controllers/purchase.controllers.js`
  - `Backend/src/controllers/product.controllers.js`
  - `Backend/src/controllers/sales.controllers.js`
  - `Backend/src/controllers/returns.controllers.js`
  - `Backend/test/maintenance.phase1.test.js` *(تحديث التحقق من `quantity` القديم إلى `storeQuantity`)*

---

## 2. ملخص التغييرات المنفذة

1. **خدمة المخزون الموحدة (`Backend/src/services/inventory.service.js`):**
   - تنفيذ `withIdempotentTransaction` لتشغيل جميع عمليات المخزون داخل **MongoDB Transaction واحدة** تشمل تحديث الرصيد + تسجيل `StockMovement` + قفل/إعادة تشغيل `IdempotencyRecord` (إعادة النتيجة عند تطابق `requestHash` و`409 Conflict` عند اختلافه).
   - إلغاء تعديل أرصدة `Product` مباشرة من المتحكمات وإلغاء الاعتماد على حقل `quantity` القديم.
   - حساب المتوسط المرجح للتكلفة (`costPrice` + `costBasisQuantity`) مع حفظ كل دفعة شراء في `costBatches`.
   - الحفاظ على الباركود الواحد المشترك للإكسسوارات والصيانة (يُولّد عند دخول `store` فقط) والهواتف الفردية بـ `IMEI` (`location` بدون باركود في المخزن).
2. **المشتريات (`purchase.controllers.js`):**
   - تحديث `registerPurchasedAccessory` لدعم تقسيم الاستلام عبر `allocations` بين `store` و`warehouse` داخل نفس الفاتورة (مثل 5 للمحل + 15 للمخزن)، وتوثيق الدفعات في `item.allocations` و`StockMovement` بنفس `movementGroupId`.
   - تحديث `registerPurchasedPhone` لدعم `targetLocation` (`store` بباركود، أو `warehouse` بدون باركود).
3. **المنتجات والتعديل اليدوي (`product.controllers.js`):**
   - تحديث `createProduct`, `getProducts`, `getPhonesProducts`, `getAccessoriesProducts`, `getMaintenanceProducts`, `deleteProduct`, و`getProductByBarcode` للاعتماد على `storeQuantity` / `warehouseQuantity` / `location` فقط؛ ورفض `getProductByBarcode` بـ `409` إذا لم يوجد رصيد في `store`.
   - تحديث `updateProductStock` (`PATCH /products/:id/stock` — صلاحية `owner` فقط) ليشترط `location` (`store | warehouse`)، `reason` إلزامي، و`idempotencyKey` (8 أحرف على الأقل)، مع تسجيل `StockMovement (manual_adjustment)`.
4. **المبيعات / POS (`sales.controllers.js`):**
   - تحديث `createSale` ليخصم حصرياً من `storeQuantity` (وللهواتف `location: "store" -> "sold"`) عبر `deductStoreStockForSale` داخل Transaction مع `IdempotencyRecord` و`StockMovement (sale)`؛ ويمنع تماماً بيع أي كمية من `warehouseQuantity` أو `damagedQuantity` أو `unallocatedQuantity`.
5. **المرتجعات (`returns.controllers.js`):**
   - تحديث `createReturn` ليفرض إرسال `condition` (`salable | damaged`) و`returnTo` (`store | warehouse` عند السليم، وممنوع عند التالف) بشكل إلزامي (`400` عند الغياب).
   - استخدام حجز ذري على `Sale.items.returnedQuantity` (`Sale.findOneAndUpdate`) داخل Transaction لمنع المرتجعات المتزامنة من تجاوز الكمية المباعة.
   - توجيه التالف حصرياً إلى `damagedQuantity` (أو `location: "damaged"` للهاتف) دون إضافته لرصيد البيع.

---

## 3. نتائج الاختبارات الفعلية

### أ) اختبارات 2B و2A والمرحلة الأولى (`node --test --test-reporter=spec --test-force-exit test/batch2b.controllers.test.js test/batch2a.models.test.js test/maintenance.phase1.test.js`)
**النتيجة: 7/7 PASS** (`tests 7 | pass 7 | fail 0`):
- `✔ Batch 2B: Split purchase receiving, store-only POS, returns concurrency, manual adjustment, idempotency, and rollback` — **PASS**
  - تم التحقق فعلياً من: الشراء المقسّم (5 محل + 15 مخزن) بباركود واحد مشترك، استقبال هاتف في المخزن بدون باركود، رفض POS لبيع هاتف المخزن والرصيد غير المخصص (`unallocated`) وتجاوز رصيد المحل، بيع يخصم من `storeQuantity` فقط، مرتجع تالف معزول في `damagedQuantity`، رفض مرتجع بدون `condition` أو يتجاوز المتبقي، **مرتجعين متزامنين** لنفس بند البيع (نجح واحد فقط ورفض الثاني ذرياً)، التعديل اليدوي للمالك ورفض `cashier` و`maintenance_seller` بـ `403`، إعادة الطلب بنفس `idempotencyKey` و`409 Conflict` مع Payload مختلف، و**Transaction Rollback** عند فشل `StockMovement`.
- `✔ Batch 2A` (5/5 اختبارات النماذج والقيود والتراجع والتزامن) — **PASS**.
- `✔ Phase 1: maintenance_seller role, permissions, and maintenance product grouping` — **PASS**.

### ب) اختبار التكامل القديم (`Backend/test/backend.integration.test.js` ضمن التشغيل الكامل `node --test`)
- **الحالة:** **FAIL** (فشل متوقع وموثّق في الاختبار القديم فقط):
  - عند السطر `445:12`: `AssertionError: Expected values to be strictly equal: 0 !== 5` لأن الاختبار القديم ما زال يفحص الحقل القديم `product.quantity` الذي لم يعد يُكتب إليه بعد إلغائه كمصدر للأرصدة في 2B (بالإضافة إلى الفشل المسبق الموثق سابقاً في السطر `513` بشأن فتح الوردية).
  - سيتم تحديث `backend.integration.test.js` بالكامل في المرحلة النهائية (2D) وفق خطة `WAREHOUSE_PHASE_2_PLAN.md`.

---

## 4. حالة الـ Git والتوقف للمراجعة
- تم عمل Commit على فرع **`backend`** فقط: **`d5b6cf7`** (`7 files changed, 1985 insertions(+), 662 deletions(-)`).
- لم يتم الانتقال إلى **2C** (Transfers + Inventory Audit + Unallocated Allocation) بانتظار مراجعتك وموافقتك.
