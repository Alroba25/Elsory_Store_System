# خطة المرحلة الثانية وما بعدها: دورة المخزون الكاملة (`WAREHOUSE_PHASE_2_PLAN.md`)

> **حالة الخطة:** **معتمدة نهائياً للتنفيذ** (لم يتم تعديل أي كود أو Models أو بيانات حتى الآن).
> **التزام التصميم الأساسي:**
> - **الإكسسوارات (`accessory`) والصيانة (`maintenance`):** منتج مجمّع (`Product` واحد) بباركود واحد مشترك، دون `ProductUnit` أو باركودات متعددة للقطع.
> - **الهواتف (`phone`):** كل جهاز وثيقة `Product` مستقلة برقم `IMEI` فريد.

---

## 1. مصدر الحقيقة الوحيد (`Source of Truth`) وعلاقته بالحقل القديم `quantity`

### إلغاء التعددية ومنع اختلاف العدادات
- **الحقول الأربعة المستقلة على `Product` هي مصدر الحقيقة المخزنية الوحيد (ولا تتداخل أبداً):**
  1. `storeQuantity`: الرصيد المتاح للبيع بالمحل (`>= 0`).
  2. `warehouseQuantity`: الرصيد بالمخزن، غير متاح للبيع (`>= 0`).
  3. `damagedQuantity`: الرصيد التالف المعزول، غير متاح للبيع (`>= 0`).
  4. `unallocatedQuantity`: الرصيد القديم غير الموزع (`>= 0`)، ممنوع بيعه أو جرده أو نقله حتى يوزعه المالك.
- **مصير حقل `quantity` القديم:**
  - **يُلغى تماماً كحقل مخزن/محدّث مستقل** بعد الترحيل؛ لا يُسمح لأي Controller بكتابة أو تعديل `quantity` بالتوازي مع الحقول الأربعة حتى لا ينشأ مصدران للحقيقة.
  - إذا احتاجت أي واجهة عرض إجمالي عام، يُحسب ديناميكياً (`virtual` أو في الـ DTO) كمجموع: `storeQuantity + warehouseQuantity + damagedQuantity + unallocatedQuantity`، بينما POS يقرأ `storeQuantity` حصرياً.
- **للهواتف (`type === "phone"`):**
  - حقل `location`: `enum: ["warehouse", "store", "sold", "damaged", "unallocated"]`.
  - يلتزم الهاتف دائماً بقاعدة صارمة: واحد فقط من (`storeQuantity`, `warehouseQuantity`, `damagedQuantity`, `unallocatedQuantity`) يساوي `1` والبقية `0` (أو الكل `0` عندما `location === "sold"`).

---

## 2. سجل الحركات المحاسبي (`StockMovement`) وضمانات `Append-Only`

### بنية الوثيقة
كل تغيير على أي رصيد أو `location` يتم داخل **MongoDB Transaction** ويسجل حركة في `StockMovement`:
- `movementGroupId`: معرف مشترك يربط حركات العملية الواحدة (مثل `transfer_out` + `transfer_in`).
- `movementType`: `"purchase_receive" | "transfer_out" | "transfer_in" | "sale" | "return_salable" | "return_damaged" | "audit_adjustment" | "manual_adjustment" | "legacy_allocation"`
- `product` (`ObjectId`), `productType` (`"phone" | "accessory" | "maintenance"`), `imei` *(للهواتف)*.
- `location`: `"store" | "warehouse" | "damaged" | "unallocated"` *(وللهواتف يُسجل أيضاً `locationBefore` و`locationAfter`)*.
- `quantityDelta`: مقدار التغير (`+` أو `-`؛ وللهاتف دائماً `+1` أو `-1`).
- `balanceBefore` و`balanceAfter`: الرصيد قبل الحركة وبعدها (`balanceAfter === balanceBefore + quantityDelta`).
- `referenceType`, `referenceId`, `performedBy`, `performedByName`, `notes`, `createdAt`.

### ضمانات `Append-Only` الفعلية (أكثر من Mongoose Hooks)
لأن Mongoose hooks لا تمنع `bulkWrite` أو استدعاءات `Model.collection` المباشرة، نُطبق **3 طبقات حماية**:
1. **طبقة التطبيق (Single Write Gateway):** لا توجد أي Routes أو Services لتعديل/حذف `StockMovement`. الكتابة تتم حصراً عبر دالة موحدة `recordStockMovements(session, entries)` تستخدم `StockMovement.create(entries, { session })` فقط، مع منع استخدام `bulkWrite` أو `.collection.` على `StockMovement` في الكود والاختبارات.
2. **طبقة الـ Schema:**
   - تعريف جميع حقول `StockMovement` بخاصية `immutable: true`.
   - `pre` hooks تمنع `updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`, `findOneAndReplace`, `deleteOne`, `deleteMany`, `findOneAndDelete`, و`bulkWrite`.
3. **طبقة قاعدة البيانات (Production MongoDB Atlas):** تقييد صلاحيات مستخدم التطبيق على Collection `stockmovements` لتقتصر على `insert` و`find` فقط (دون `update` أو `remove`) في إعدادات أدوار MongoDB Atlas إن أمكن.

---

## 3. منع التكرار الدائم (`Idempotency` بدون انتهاء صلاحية خطير)

- **المشكلة التي تم حلها:** إذا انتهى TTL بعد 24 ساعة من `IdempotencyRecord`، قد يُعاد تنفيذ طلب قديم مكرر لاحقاً.
- **الحل الهندسي النهائي (حماية دائمة):**
  1. **الاحتفاظ بـ `IdempotencyRecord` بشكل دائم (بدون TTL Auto-Delete)** للعمليات المخزنية (`purchase_receive`, `transfer`, `return`, `audit`, `manual_adjustment`, `sale`) مع فهرس فريد `{ operation: 1, key: 1 }`. حجم السجل ضئيل جداً (~200 بايت لكل عملية)، وبقاؤه دائماً يمنع إعادة تنفيذ أي `idempotencyKey` قديم حتى بعد شهور.
  2. **حماية ثانوية على مستوى الحالة (`State-Machine Guards`):** حتى مع `IdempotencyRecord`، تفرض المتحكمات قيوداً لا تقبل التكرار مثل: `registeredQuantity <= item.quantity` في المشتريات، و`alreadyReturnedQty <= soldQty` في المرتجعات، وفحص `snapshot` في الجرد، و`location === "store"` للهواتف.

---

## 4. المشتريات والاستلام المقسّم (`Purchases & Split Receiving`)

- دعم تقسيم كمية الصنف داخل فاتورة الشراء الواحدة (مثلاً: 20 سماعة -> 5 للمحل + 15 للمخزن) عبر `allocations` داخل Transaction مع `idempotencyKey`.
- تحديث `Product.costPrice` من `purchasePrice` عند الاستلام وربط الحركة برقم الفاتورة والمورد.
- **الباركود:** يُولّد باركود واحد مشترك للإكسسوار/الصيانة فقط إذا دخلت كمية إلى `store` ولم يكن للمنتج باركود بعد؛ لا يُولّد باركود عند الدخول إلى `warehouse` فقط.

---

## 5. دورة حياة الهواتف الكاملة (`Phones`, `IMEI`, و`Returned Phones`)

كل هاتف وثيقة `Product` مستقلة بـ `imei` فريد (`unique, sparse`):
1. **الاستلام في المخزن:** `location: "warehouse"`, `warehouseQuantity: 1`, `storeQuantity: 0`, **بدون `barcode`**.
2. **النقل أو الاستلام في المحل:** `location: "store"`, `warehouseQuantity: 0`, `storeQuantity: 1`, **توليد `barcode` للجهاز** (إذا لم يوجد).
3. **البيع (`POST /sales`):** يشترط `location === "store"` و`storeQuantity === 1` -> يصبح `location: "sold"`, `storeQuantity: 0`.
4. **النقل العكسي (`store -> warehouse`):** يشترط `location === "store"` و`storeQuantity === 1` -> يصبح `location: "warehouse"`, `warehouseQuantity: 1`, `storeQuantity: 0` مع إزالة `barcode` (`$unset: { barcode: "" }`).
5. **إرجاع الهاتف السليم والمُتلف (`POST /return`) — دون إنشاء جهاز مكرر:**
   - يُحدّث نفس وثيقة الهاتف الأصلية (يشترط `location === "sold"`) داخل Transaction:
     - **`condition: "salable"` + `returnTo: "store"`:** يصبح `location: "store"`, `storeQuantity: 1`, مع الاحتفاظ بباركوده (أو توليد باركود إن كان مفقوداً).
     - **`condition: "salable"` + `returnTo: "warehouse"`:** يصبح `location: "warehouse"`, `warehouseQuantity: 1`, مع **إزالة `barcode` (`$unset: { barcode: "" }`)** لمنع مسحه أو بيعه وهو في المخزن (وسيُولّد له باركود جديد عند نقله للمحل لاحقاً).
     - **`condition: "damaged"`:** يصبح `location: "damaged"`, `damagedQuantity: 1`, `storeQuantity: 0`, `warehouseQuantity: 0`, مع **إزالة `barcode` (`$unset: { barcode: "" }`)**.
   - تسجيل حركة `StockMovement` تحمل `imei` و`locationBefore: "sold"` و`locationAfter`.

---

## 6. عمليات النقل، المرتجعات، الجرد، وPOS

- **عمليات النقل (`POST /transfers`):** اتجاهان (`warehouse_to_store` و`store_to_warehouse`) داخل Transaction واحدة مع `idempotencyKey`، وكتابة حركتي `transfer_out` و`transfer_in` بنفس `movementGroupId`.
- **المرتجعات (`POST /return`):**
  - التحقق الصارم أن الكمية المرتجعة لا تتجاوز المتبقي القابل للإرجاع من الفاتورة الأصلية.
  - **إلزامية** إرسال `condition` (`"salable" | "damaged"`) و`returnTo` (`"store" | "warehouse"` عند السليم) لكل صنف — يُرفض الطلب بـ `400` إذا لم تُحدد صراحة.
- **نقطة البيع (`POS`) والبحث بالباركود:** البحث والخصم يعملان حصرياً على `storeQuantity > 0` (وللهواتف `location === "store"`).
- **الجرد المنفصل (`Inventory Audit`):**
  - شاشات مستقلة لـ **جرد المحل** و**جرد المخزن** مقسمة إلى `Phones`, `Accessories`, `Maintenance`.
  - **حماية التزامن (`Optimistic Snapshot Check`):** إعادة فحص الأرصدة الحالية داخل Transaction قبل اعتماد التسوية؛ إذا تغير رصيد أي صنف منذ أخذ الـ Snapshot يُرفض الجرد بالكامل بـ `409 Conflict`.
  - الأصناف التي لا تملك `costPrice` (مضافة يدوياً دون فاتورة) تظهر قيمتها التكلفية كـ **"غير محددة"** بوضوح في تقرير الجرد دون أخطاء حسابية.

---

## 7. متطلبات MongoDB Transactions والاختبارات

- تتطلب Multi-Document Transactions تشغيل MongoDB كـ **Replica Set** (متوفر تلقائياً في MongoDB Atlas في الإنتاج والاختبار).
- يجب تضمين **اختبار Transaction Rollback** في المرحلة الثانية يثبت التراجع الكامل عن تحديث `Product` إذا فشل تسجيل `StockMovement` (والعكس).

---

## 8. استراتيجية ترحيل المخزون القديم (`Legacy Migration`)

1. إيقاف أي اعتماد على `quantity` القديم، ونقل جميع الكميات القديمة إلى `unallocatedQuantity` (و`location: "unallocated"` للهواتف).
2. إجراء Backup كامل (`mongodump`) -> تشغيل Script بوضع `--dry-run` -> ترحيل الأرصدة إلى `unallocated` -> توزيع المالك للأرصدة من شاشة مخصصة مع تسجيل `StockMovement (legacy_allocation)`.

---

## 9. القرارات الهندسية والنهائية المعتمدة

### تم حسم جميع القرارات بنجاح (لا توجد نقاط معلقة)
1. **تكلفة المنتجات (`costPrice`):** اختيارية عند إضافة منتج مباشر من `POST /products` بدون فاتورة شراء، وتُظهر تقارير الجرد القيمة التكلفية للأصناف غير المسعرة تكلفياً بوضوح كـ "غير محددة".
2. **التعديل اليدوي للرصيد (`PATCH /products/:id/stock`):** متاح للمالك فقط مع اشتراط تحديد الموقع (`store` أو `warehouse`)، وإدخال سبب إلزامي، و`idempotencyKey`، وتسجيل `StockMovement (manual_adjustment)`.
3. **ترحيل المخزون القديم:** ترحيل كل المخزون القديم أولاً إلى `unallocated` ومنع بيعه حتى يوزعه المالك رسمياً من شاشة مخصصة.
4. **الإكسسوارات والصيانة:** تجميع بباركود واحد مشترك؛ **الهواتف:** أجهزة فردية بـ `IMEI`.
5. **Idempotency دائم + `StockMovement` Append-Only + حماية التزامن في الجرد.**

---

## 10. ترتيب التنفيذ المرحلي بعد الموافقة النهائية
1. **الدفعة 2A:** النماذج الجديدة والمحدّثة (`Product`, `Purchase`, `Return`, `StockMovement`, `StockTransfer`, `InventoryAudit`, `IdempotencyRecord`).
2. **الدفعة 2B:** المشتريات المقسمة + POS (`storeQuantity` فقط) + المرتجعات الإلزامية + التعديل اليدوي + اختبارات `Transaction Rollback` و`Idempotency`.
3. **الدفعة 2C:** نظام النقل (`Transfers`) + الجرد (`Inventory Audit` مع Snapshot Concurrency) + أداة/شاشة توزيع `unallocated`.
4. **الدفعة 2D:** واجهات Frontend + تحديث اختبارات التكامل الكاملة.
