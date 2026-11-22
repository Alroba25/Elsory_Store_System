# تقرير إنجاز الدفعة 2C: التحويلات (`Transfers`)، الجرد المنفصل (`Inventory Audit`)، وتخصيص غير المخصص (`Unallocated`) — `WAREHOUSE_PHASE_2C_REPORT.md`

> **حالة الدفعة:** مكتملة ومفحوصة آلياً على فرع **`backend`** (Commit `94fcb75`).
> **النطاق الملتزم به:** Backend فقط — لم يتم تعديل Frontend أو تنفيذ Migration أو دمج أي فروع أو الانتقال إلى 2D.

---

## 1. الملفات التي تم تعديلها أو إنشاؤها (على فرع `backend` — Commit `94fcb75`)

- **ملفات جديدة:**
  - `Backend/src/controllers/transfer.controllers.js` *(التحويلات وسجل `StockMovement`)*
  - `Backend/src/controllers/audit.controllers.js` *(لقطة الجرد، اعتماد الجرد، سجل وتصدير CSV)*
  - `Backend/test/batch2c.warehouse.test.js` *(اختبارات شاملة لجميع سيناريوهات 2C)*
- **ملفات تم تعديلها:**
  - `Backend/src/services/inventory.service.js` *(إضافة `executeStockTransfer`, `executeInventoryAudit`, `allocateUnallocatedStock`)*
  - `Backend/src/controllers/product.controllers.js` *(إضافة `getUnallocatedProducts` و`allocateProductUnallocatedStock`)*
  - `Backend/src/routes/index.routes.js` *(تسجيل جميع المسارات الجديدة بصلاحية `authorize("owner")` فقط)*

---

## 2. الـ APIs الجديدة المضافة (جميعها محمية بـ `middleware` + `authorize("owner")`)

| Method | Endpoint | الوظيفة |
|---|---|---|
| `POST` | `/transfers` | تحويل ذري بين `warehouse_to_store` و`store_to_warehouse` مع `idempotencyKey` إلزامي، دعم الهواتف بالـ `IMEI` والإكسسوارات/الصيانة بالكمية والباركود المشترك، وتسجيل `transfer_out` + `transfer_in` بنفس `movementGroupId`. |
| `GET` | `/transfers` & `/transfers/:id` | عرض سجل التحويلات وتفاصيل التحويل مع حركات `StockMovement` المرتبطة. |
| `GET` | `/stock-movements` | استعراض سجل الحركات المحاسبي `StockMovement` (قراءة فقط) مع فلاتر المنتج والموقع والنوع و`movementGroupId`. |
| `GET` | `/inventory-audit/snapshot?location=store\|warehouse` | أخذ لقطة جرد مستقلة للمحل أو المخزن مصنّفة إلى `phone`, `accessory`, `maintenance` مع التكلفة المعروفة/غير المعروفة وقيمة البيع. |
| `POST` | `/inventory-audit` | اعتماد جلسة الجرد مع فحص **Optimistic Concurrency** داخل Transaction؛ يرفض بـ `409 Conflict` (+ قائمة `changedProducts`) إذا تغير أي رصيد منذ أخذ الـ Snapshot، ويسجل حركات `audit_adjustment` في `StockMovement`. |
| `GET` | `/inventory-audit` & `/inventory-audit/:id` | استعراض تقارير الجرد السابقة مع دعم التصدير عبر `?format=csv`. |
| `GET` | `/products/unallocated` | عرض المنتجات التي لديها `unallocatedQuantity > 0` أو هواتف `location: "unallocated"`. |
| `POST` | `/products/:id/allocate` | توزيع المخزون غير المخصص إلى `store` و/أو `warehouse` بصلاحية `owner` فقط، مع `reason` و`idempotencyKey` وتسجيل `legacy_allocation` في `StockMovement`. |

---

## 3. نتائج التشغيل الكاملة لجميع اختبارات Backend

- **الأمر المنفذ:** `node --test --test-reporter=spec --test-force-exit`
- **النتيجة الإجمالية:** **`9/9 PASS`** (`tests 9 | pass 9 | fail 0 | duration_ms 41720.3053`):

| ملف الاختبار | عدد الاختبارات | النتيجة | ما تم التحقق منه فعلياً |
|---|---|---|---|
| `Backend/test/batch2c.warehouse.test.js` | 1 | **PASS** | تحويل في الاتجاهين (`warehouse_to_store` و`store_to_warehouse`)، توليد باركود واحد مشترك عند دخول المحل والاحتفاظ به، تحويل هاتف بالـ `IMEI` (توليد باركود بالمحل وإزالته بالمخزن)، رفض نقص الرصيد (`400`)، رفض غير المالك (`403`)، Idempotency replay + `409` conflict + التزامن، Rollback عند فشل داخل Transaction، جرد منفصل للمحل والمخزن مع عجز وزيادة وتصدير CSV، رفض جرد بـ `409` بعد تغير الرصيد منذ الـ Snapshot، وتخصيص `unallocated` (إكسسوار + هاتف) ورفض التخصيص الزائد ورفض غير المالك. |
| `Backend/test/backend.integration.test.js` | 1 | **PASS** | الدورة الكاملة (المصادقة، الصلاحيات، المشتريات، الوردية، المبيعات، المرتجعات، الاستردادات، التقارير، والأرشفة). |
| `Backend/test/batch2a.models.test.js` | 5 | **PASS** | قيود `location`، `StockMovement` Append-Only، `IdempotencyRecord`، Rollback، وحجز المرتجعات الذري. |
| `Backend/test/batch2b.controllers.test.js` | 1 | **PASS** | الشراء المقسّم، POS من `storeQuantity` فقط، المرتجعات المتزامنة، التعديل اليدوي، Idempotency، وRollback. |
| `Backend/test/maintenance.phase1.test.js` | 1 | **PASS** | دور `maintenance_seller` ومنتجات الصيانة وعزل الصلاحيات. |

---

## 4. حالة الـ Git والتوقف للمراجعة
- تم عمل Commit منفصل على فرع **`backend`** فقط: **`94fcb75`** (`6 files changed, 2103 insertions(+)`).
- لم يتم تعديل أي ملفات Frontend أو تنفيذ Migration أو الانتقال إلى **2D** بانتظار مراجعتك وموافقتك.
