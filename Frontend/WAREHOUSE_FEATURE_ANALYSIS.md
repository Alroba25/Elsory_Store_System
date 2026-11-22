# دراسة وتحليل معماري: نظام إدارة المخزن (`Warehouse Management`)، فصل المخزون، الجرد، ودور الصيانة (`maintenance_seller`) — ELSORY STORE

> **حالة الوثيقة:** تحليل وتخطيط هندسي فقط (Phase 0 — لم يتم تعديل أي كود أو بيانات أو تثبيت حزم).
> **نطاق الفحص:** تم فحص ملفات الـ **Backend** (فرع `backend`) وملفات الـ **Frontend** (فرع `frontend`) بالكامل.

---

## 1. ملخص Architecture النظام الحالي

- **Frontend:** تطبيق Next.js `16.4.6` (App Router + React `19.3.0` + TypeScript + Tailwind CSS v4)، منشور على Vercel.
  - جميع طلبات المتصفح تذهب إلى `/api/:path*` وتُعاد كتابتها عبر `next.config.ts` (`rewrites`) إلى السيرفر الخلفي (`BACKEND_API_URL` أو `NEXT_PUBLIC_API_URL`).
  - المصادقة تعتمد على JWT مخزن في `httpOnly` Cookie (`credentials: "include"`), ويتم جلب المستخدم من `GET /api/profile` عبر `AuthProvider` (`src/components/providers/auth-provider.tsx`).
  - لوحة التحكم (`/dashboard`) موحدة في `DashboardContent` (`src/components/dashboard/dashboard-content.tsx`) وتعرض المكوّن المناسب حسب `user.role` المعرّف في `src/components/dashboard/dashboard-config.ts`.
- **Backend:** خادم Express `5.3.0` + Mongoose `9.11.4` + MongoDB، منشور على Render.
  - يتبع نمط `Routes -> Middlewares (middleware + authorize) -> Controllers -> Mongoose Models`.
  - يعتمد على MongoDB Transactions (`mongoose.startSession()` + `session.withTransaction`) في العمليات المالية والمخزنية الحساسة (`createPurchase`, `registerPurchasedPhone`, `registerPurchasedAccessory`, `createSale`, `createReturn`, `processRefund`, `closeShift`).

---

## 2. آلية عمل المخزون والمنتجات والهواتف والباركود حالياً (بناءً على الكود الفعلي)

1. **نموذج المنتج (`Backend/src/models/products.model.js`):**
   - أنواع المنتجات الحالية (`type`): `["phone", "accessory"]` فقط.
   - المخزون الحالي: حقل واحد `quantity` (عدد صحيح `>= 0`) دون أي تمييز للموقع (`store` vs `warehouse`).
   - الباركود الحالي: حقل واحد `barcode` (`String, unique: true, sparse: true, index: true`) على مستوى وثيقة `Product`.
   - **لا يوجد حقل للتكلفة (`costPrice`) على `Product`؛** يوجد `sellingPrice` فقط، بينما `purchasePrice` محفوظة داخل `Purchase.items` فقط.
2. **الهواتف (`phone`):**
   - كل هاتف يُسجل كوثيقة `Product` مستقلة بـ `quantity: 1`، ورقم `imei` فريد من 15 رقماً (`unique, sparse`)، وحالة `condition` (`new | used`)، و`batteryHealth`.
   - عند إنشاء هاتف (`createProduct`) أو استلامه من فاتورة شراء (`registerPurchasedPhone`)، يتم توليد `barcode` فوري بصيغة `` `2${crypto.randomInt(100000000000, 1000000000000)}` `` (13 رقماً يبدأ بـ `2`).
3. **الإكسسوارات (`accessory`):**
   - **ملاحظة معمارية مهمة:** حالياً تُسجّل دفعة الإكسسوارات (مثلاً 20 سماعة) كوثيقة `Product` واحدة تحمل `quantity: 20` و**باركود واحد مشترك** على نفس الوثيقة.
   - عند إضافة كمية جديدة لنفس الإكسسوار (`name + brand + specifications` متطابق)، يقوم `createProduct` و`registerPurchasedAccessory` بعمل `$inc: { quantity }` على نفس الوثيقة دون إنشاء باركودات جديدة للقطع.
4. **نقطة البيع (`createSale` في `sales.controllers.js`) والبحث بالباركود (`getProductByBarcode` في `product.controllers.js`):**
   - الكاشير يمسح `barcode` عبر `GET /products/barcode/:barcode` (يشترط `isActive: true` و`quantity > 0`).
   - عند إتمام البيع، يتم خصم `quantity` عبر `Product.findOneAndUpdate({ _id, isActive: true, quantity: { $gte: item.quantity } }, { $inc: { quantity: -item.quantity } })`.
5. **المرتجعات (`createReturn` في `returns.controllers.js`):**
   - عند إرجاع صنف، يتم عمل `$inc: { quantity: +requestedItem.quantity }` على وثيقة `Product` الأصلية.

---

## 3. جميع الملفات التي ستتأثر (بالمسارات الفعلية)

### Backend (فرع `backend`)
- **Models:**
  - `Backend/src/models/user.model.js` (إضافة `maintenance_seller` إلى `role.enum`)
  - `Backend/src/models/products.model.js` (إضافة `"maintenance"`، حقول `storeQuantity` / `warehouseQuantity`، `location` للهواتف، `costPrice` اختياري)
  - **Models جديدة مقترحة:**
    - `Backend/src/models/productUnit.model.js` (لباركودات القطع الفردية المنقولة للمحل)
    - `Backend/src/models/stockTransfer.model.js` (لسجل حركات النقل والمخزون)
    - `Backend/src/models/inventoryAudit.model.js` (لحفظ جلسات وتقارير الجرد للمحل والمخزن)
- **Controllers:**
  - `Backend/src/controllers/user.controllers.js` (التحقق من قائمة الأدوار عند التحديث)
  - `Backend/src/controllers/product.controllers.js` (`createProduct`, `getProducts`, `updateProductStock`, `deleteProduct`, `getProductByBarcode`, إضافة `getMaintenanceProducts`, تعديل `getAccessoriesProducts` / `getPhonesProducts` لتصفية مخزون المحل فقط)
  - `Backend/src/controllers/purchase.controllers.js` (`createPurchase`, `registerPurchasedPhone`, `registerPurchasedAccessory`, إضافة دعم `maintenance` وتحديد وجهة الاستلام `warehouse` أو `store`)
  - `Backend/src/controllers/sales.controllers.js` (`createSale` للتحقق من `storeQuantity` وحالة `ProductUnit` عند البيع)
  - `Backend/src/controllers/returns.controllers.js` (`createReturn` لإرجاع الكمية إلى `storeQuantity` وتحديث حالة `ProductUnit` أو الهاتف في `store`)
  - **Controllers جديدة مقترحة:**
    - `Backend/src/controllers/transfer.controllers.js`
    - `Backend/src/controllers/audit.controllers.js`
- **Routes & Tests:**
  - `Backend/src/routes/index.routes.js`
  - `Backend/test/backend.integration.test.js`

### Frontend (فرع `frontend`)
- **Types & Services:**
  - `Frontend/src/types/auth.types.ts` (إضافة `maintenance_seller` إلى `AuthUser["role"]`)
  - `Frontend/src/components/providers/auth-provider.tsx` (تحديث أي فحص للأدوار)
  - `Frontend/src/services/dashboard.service.ts` (تحديث أنواع المنتجات، الأدوار، المشتريات، وإضافة خدمات النقل، وحدات الباركود، الصيانة، والجرد)
- **Dashboard Core & Role Routing:**
  - `Frontend/src/components/dashboard/dashboard-config.ts` (إضافة `maintenance_seller` في `VALID_ROLES` و`ROLE_CONFIGURATIONS`، وإضافة تبويبات النقل والجرد في إعدادات `owner`)
  - `Frontend/src/components/dashboard/dashboard-content.tsx` (توجيه `maintenance_seller` إلى `MaintenanceDashboard`)
- **Components:**
  - **مكوّن جديد:** `Frontend/src/components/dashboard/maintenance-dashboard.tsx` (على غرار `accessories-dashboard.tsx`)
  - `Frontend/src/components/dashboard/owner-dashboard.tsx` (تعيين دور `maintenance_seller`، عرض مخزون المحل مقابل المخزن، تحديد وجهة الاستلام في المشتريات، تبويب **نقل المخزون Transfer**، وتبويب **الجرد Inventory Audit**)
  - `Frontend/src/components/dashboard/cashier-dashboard.tsx` (التعامل مع `storeQuantity` والباركودات الفردية للقطع في POS)
  - `Frontend/src/components/dashboard/printable-product-barcodes-modal.tsx` (دعم طباعة الباركودات الفردية الناتجة عن عملية النقل)

---

## 4. التصميم المقترح لقاعدة البيانات (Schemas & Relationships)

### أ) تحديث `User` (`user.model.js`)
```js
role: {
  type: String,
  enum: [
    "owner",
    "cashier",
    "accessories_seller",
    "phone_seller",
    "maintenance_seller",
    "general",
  ],
  default: "general",
}
```

### ب) تحديث `Product` (`products.model.js`)
- `type`: `enum: ["phone", "accessory", "maintenance"]`
- **توزيع المخزون:**
  - `storeQuantity`: `{ type: Number, default: 0, min: 0 }` (متاح للبيع؛ للهواتف `0` أو `1`)
  - `warehouseQuantity`: `{ type: Number, default: 0, min: 0 }` (غير متاح للبيع؛ للهواتف `0` أو `1`)
  - *(ملاحظة)*: الإبقاء على `quantity` مؤقتاً أو حسابه كمرآة لـ `storeQuantity` فقط أثناء المرحلة الانتقالية، مع منع جمع `storeQuantity + warehouseQuantity` في منطق البيع أو الجرد المنفصل.
- **للهواتف (`type === "phone"`):**
  - `location`: `{ type: String, enum: ["warehouse", "store", "sold"], default: "store" }` — يضمن أن الهاتف لا يمكن أن يكون في الموقعين معاً.
  - `barcode`: يكون `undefined` طالما `location === "warehouse"`، ويُولّد فقط عند الدخول أو النقل إلى `"store"`.
- **التكلفة (مطلوب قرار بشأنها):**
  - `costPrice`: `{ type: Number, min: 0 }` (اختياري، يُحدّث من `purchasePrice` عند الاستلام من المشتريات).

### ج) Collection جديد: `ProductUnit` (`productUnit.model.js`) — لباركود القطع الفردية
يمثل كل قطعة `accessory` أو `maintenance` دخلت إلى **المحل (`store`)** بعدد باركودات مطابق لعدد القطع:
```js
{
  product: { type: ObjectId, ref: "Product", required: true, index: true },
  productType: { type: String, enum: ["accessory", "maintenance"], required: true },
  barcode: { type: String, required: true, unique: true, index: true },
  status: {
    type: String,
    enum: ["in_store", "sold", "transferred_to_warehouse"],
    default: "in_store",
    index: true,
  },
  transferId: { type: ObjectId, ref: "StockTransfer" },
  saleId: { type: ObjectId, ref: "Sale" },
  soldAt: { type: Date },
  createdAt: Date
}
```
> **لماذا `ProductUnit` أفضل من وضع مصفوفة باركودات داخل `Product`؟**
> 1. تجنب تجاوز حد حجم الوثيقة في MongoDB (16MB) عند تراكم آلاف القطع.
> 2. فهرس `unique` مباشر وفوري على `barcode` عند مسح الباركود في الكاشير (`findOne({ barcode, status: "in_store" })`).
> 3. تتبع دقيق لكل قطعة: هل ما زالت في المحل أم بيعت أم أُعيدت للمخزن؟

### د) Collection جديد: `StockTransfer` (`stockTransfer.model.js`)
يسجل كل حركة بين المخزن والمحل (أو دخول/خروج):
```js
{
  transferNumber: { type: String, required: true, unique: true }, // TRF-...
  direction: { type: String, enum: ["warehouse_to_store", "store_to_warehouse"], required: true },
  idempotencyKey: { type: String, unique: true, sparse: true }, // لمنع التكرار بالخطأ
  items: [{
    product: { type: ObjectId, ref: "Product", required: true },
    productName: String,
    productType: { type: String, enum: ["phone", "accessory", "maintenance"] },
    quantity: { type: Number, required: true, min: 1 },
    imei: String, // للهواتف
    generatedBarcodes: [String], // للقطع المنقولة للمحل
  }],
  createdBy: { type: ObjectId, ref: "User", required: true },
  createdByName: String,
  notes: String,
  createdAt: Date
}
```

### هـ) Collection جديد: `InventoryAudit` (`inventoryAudit.model.js`)
لحفظ نتائج جلسات الجرد المنفصلة:
```js
{
  auditNumber: { type: String, required: true, unique: true }, // AUD-...
  location: { type: String, enum: ["store", "warehouse"], required: true, index: true },
  items: [{
    product: { type: ObjectId, ref: "Product", required: true },
    productName: String,
    productType: { type: String, enum: ["phone", "accessory", "maintenance"] },
    systemQuantity: Number,
    actualQuantity: Number,
    difference: Number, // actualQuantity - systemQuantity
    unitCost: Number,   // إن وجد
    totalCostValue: Number,
    unitSellingPrice: Number,
    totalSellingValue: Number,
  }],
  summaryByCategory: {
    phone: { itemsCount, systemQty, actualQty, diff, costValue, retailValue },
    accessory: { ... },
    maintenance: { ... },
  },
  auditedBy: { type: ObjectId, ref: "User", required: true },
  auditedByName: String,
  notes: String,
  createdAt: Date
}
```

---

## 5. تصميم الـ APIs المطلوبة

| Method | Endpoint | الصلاحية (`authorize`) | الوظيفة |
|---|---|---|---|
| `GET` | `/products/maintenance` | `maintenance_seller` | عرض منتجات الصيانة المتاحة بالمحل (`storeQuantity > 0` أو حسب السياسة المعتمدة) مع Pagination وبحث. |
| `POST` | `/products` *(تحديث)* | `owner` | قبول `type = "maintenance"` + تحديد `location` (`store` أو `warehouse`). |
| `POST` | `/purchase/:purchaseId/items/:itemId/register-phone` *(تحديث)* | `owner` | قبول `targetLocation: "warehouse" \| "store"`؛ في `warehouse` لا يُنشأ `barcode`. |
| `POST` | `/purchase/:purchaseId/items/:itemId/register-accessory` *(تحديث)* | `owner` | تعميمها أو إضافة `/register-maintenance` مع `targetLocation: "warehouse" \| "store"`. |
| `POST` | `/transfers` | `owner` | تنفيذ نقل ذري (Transaction) من `warehouse -> store` أو العكس، مع `idempotencyKey`، وتوليد باركودات `ProductUnit`. |
| `GET` | `/transfers` | `owner` | سجل عمليات النقل مع فلاتر التاريخ والاتجاه. |
| `GET` | `/transfers/:id` | `owner` | تفاصيل عملية نقل والباركودات المولدة لطباعتها. |
| `GET` | `/products/:id/units` | `owner` | استعراض باركودات القطع الفردية الموجودة في المحل لمنتج معين (للطباعة). |
| `GET` | `/products/barcode/:barcode` *(تحديث)* | `owner`, `cashier` | البحث أولاً في `ProductUnit` (`status: "in_store"`) ثم في `Product` (للهواتف في `store` والبيانات القديمة). **يرفض أي منتج في `warehouse`**. |
| `GET` | `/inventory-audit/snapshot?location=store\|warehouse` | `owner` | جلب لقطة الجرد الحالية للمحل فقط أو المخزن فقط مصنفة حسب النوع (`phone`, `accessory`, `maintenance`). |
| `POST` | `/inventory-audit` | `owner` | حفظ جلسة جرد (`location`, `actualQuantities`) وحساب العجز/الزيادة والقيمة المالية. |
| `GET` | `/inventory-audit` & `/inventory-audit/:id` | `owner` | استعراض وطباعة تقارير الجرد السابقة. |

---

## 6. تصميم صلاحيات دور `maintenance_seller`

- **Backend:**
  - إضافة `"maintenance_seller"` إلى `User` schema و`authorize("maintenance_seller")`.
  - مسار مخصص `GET /products/maintenance` يرجع فقط المنتجات من نوع `maintenance`، النشطة، وبمخزون المحل (`storeQuantity > 0`).
  - منع الوصول التلقائي لـ `/products`, `/products/phones`, `/products/accessories`, `/sales`, `/purchase`, `/return`, `/shift/*`, `/users`, `/*-reports` (`403 Forbidden`).
  - تفعيل قدرة المالك على اختيار `"maintenance_seller"` في `PATCH /users/:id/role`.
- **Frontend:**
  - إضافة `"maintenance_seller"` إلى `StoreUserRole` و`VALID_ROLES` و`ROLE_CONFIGURATIONS` (`dashboard-config.ts`).
  - إنشاء `MaintenanceDashboard` (`src/components/dashboard/maintenance-dashboard.tsx`) تعرض قسم **منتجات الصيانة** و**الملف الشخصي** فقط، وتوجيهه من `DashboardContent`.
  - إضافة خيار `maintenance_seller` ("بائع صيانة") في قائمة إدارة الموظفين داخل `OwnerDashboard`.

---

## 7. تصميم واجهات Frontend المطلوبة

1. **لوحة `MaintenanceDashboard`:**
   - واجهة مماثلة لـ `AccessoriesDashboard` تعرض منتجات الصيانة (الاسم، الماركة، الموديل، المواصفات، السعر، الكمية المتاحة بالمحل) مع بحث بالاسم والفلترة.
2. **تحديث `OwnerDashboard` — قسم المنتجات والمخزون:**
   - عرض عمودين منفصلين للكمية: **مخزون المحل (`storeQuantity`)** و**مخزون المخزن (`warehouseQuantity`)** دون دمجهما.
   - إضافة نوع **الصيانة (`maintenance`)** في الفلاتر ونماذج الإضافة والشراء.
   - زر **طباعة باركودات القطع** يقرأ `ProductUnit` للقطع الفردية الموجودة في المحل.
3. **قسم جديد في `OwnerDashboard` — `نقل المخزون (Transfers)`:**
   - اختيار الاتجاه (`من المخزن إلى المحل` أو العكسي إذا اعتُمد).
   - اختيار المنتجات المتاح لها رصيد في المصدر وتحديد الكمية المطلوب نقلها (أو اختيار الهاتف بالـ IMEI).
   - فور إتمام النقل: عرض قائمة الباركودات المولدة مع زر **طباعة جميع الباركودات الجديدة**.
   - جدول سجل حركات النقل السابقة مع التاريخ والمستخدم.
4. **قسم جديد في `OwnerDashboard` — `جرد المخزون (Inventory Audit)`:**
   - اختيار صريح بين: **1) جرد المحل (`Store Inventory Audit`)** و**2) جرد المخزن (`Warehouse Inventory Audit`)** (شاشات منفصلة تماماً).
   - تبويبات/تصنيفات داخل الجرد: **الهواتف**، **الإكسسوارات**، **الصيانة**.
   - جدول الجرد: اسم المنتج | الكمية المسجلة بالنظام | حقل إدخال الكمية الفعلية | الفرق (عجز/زيادة تلقائي) | القيمة المالية.
   - ملخص إجمالي لكل Category + زر **طباعة تقرير الجرد** (عبر نافذة طباعة مثل فواتير البيع والباركود).

---

## 8. طريقة نقل المنتجات وإنشاء الباركودات (والتحليل العكسي)

1. **النقل من المخزن إلى المحل (`warehouse_to_store`):**
   - يتم داخل MongoDB Transaction مع `idempotencyKey` (يُرسل من Frontend لمنع النقل المكرر عند النقر المزدوج أو إعادة إرسال الشبكة).
   - **للإكسسوارات والصيانة:**
     - تحقق ذري: `{ _id, type: { $in: ["accessory", "maintenance"] }, warehouseQuantity: { $gte: qty } }`.
     - تحديث: `$inc: { warehouseQuantity: -qty, storeQuantity: +qty }`.
     - توليد `qty` وثيقة في `ProductUnit`، كل منها بـ `barcode` فريد (`2` + 12 رقم عشوائي مع فحص عدم التكرار).
   - **للهواتف:**
     - تحقق ذري: `{ _id, type: "phone", location: "warehouse", warehouseQuantity: 1 }`.
     - توليد `barcode` فريد للهاتف.
     - تحديث: `$set: { location: "store", warehouseQuantity: 0, storeQuantity: 1, barcode }`.
2. **دراسة النقل العكسي (`store_to_warehouse`):**
   - **هل نحتاجه؟** نعم، مفيد عملياً لإعادة بضاعة فائضة من المحل للمخزن أو عند خطأ إدخال.
   - **كيف يتم دون كسر الباركود والمبيعات السابقة؟**
     - **للهواتف:** إذا كان `location === "store"` ولم يُبع، يصبح `location: "warehouse"`, `storeQuantity: 0`, `warehouseQuantity: 1` ويُحذف/يُزال `barcode` (`$unset: { barcode: "" }`) حتى لا يقبل POS مسحه. (الفواتير القديمة تحفظ `productName` و`imei` داخل `Sale.items` فلا تتأثر).
     - **للإكسسوارات والصيانة:** يُخصم `qty` من `storeQuantity` ويُضاف إلى `warehouseQuantity`، ويتم تحديث أقدم `qty` وحدات `in_store` في `ProductUnit` إلى `status: "transferred_to_warehouse"` (أو يحدد المالك الباركودات المراد سحبها). تبقى السجلات محفوظة لأغراض التدقيق لكنها ترفض البيع في POS.

---

## 9. طريقة الجرد المنفصل للمحل والمخزن

- **جرد المحل (`location = "store"`):**
  - يجلب جميع المنتجات النشطة التي لها علاقة بالمحل (`storeQuantity > 0` أو `location === "store"`، ويمكن شمول `0` عند الرغبة).
  - يعرض `systemQuantity = product.storeQuantity`، ويقارنها بالـ `actualQuantity` المدخلة.
- **جرد المخزن (`location = "warehouse"`):**
  - يجلب جميع المنتجات النشطة التي لها رصيد مخزن (`warehouseQuantity > 0` أو `location === "warehouse"`).
  - يعرض `systemQuantity = product.warehouseQuantity` بشكل معزول تماماً عن المحل.
- **حساب القيمة المالية:**
  - تُحسب قيمة البيع المتوقعة (`sellingPrice * systemQuantity` أو `actualQuantity`) لكل المنتجات.
  - تُحسب قيمة التكلفة (`costPrice * qty`) للمنتجات التي يتوفر لها `costPrice` مع توضيح أي أصناف بدون تكلفة مسجلة.

---

## 10. استراتيجية التعامل مع البيانات القديمة وترحيل المخزون (Migration Strategy)

- **القاعدة الذهبية:** لا نفترض تلقائياً توزيع المخزون القديم بين المحل والمخزن دون تأكيد المالك، ولا نحذف أي باركود قديم.
- **خطة الترحيل الآمنة (تُنفذ عبر Script مخصص بعد موافقة المالك وعمل Backup كامل لـ MongoDB):**
  1. **المنتجات القديمة (`Product`):**
     - نسخ `quantity` الحالية إلى `storeQuantity` (إذا أكد المالك أن المخزون الحالي كله في المحل) وتعيين `warehouseQuantity = 0`، أو توفير أداة مراجعة أولية للمالك لتوزيع الأصناف.
     - للهواتف القديمة: إذا `quantity === 1` تصبح `location: "store"`؛ إذا `quantity === 0` تصبح `location: "sold"`.
  2. **الباركودات القديمة للإكسسوارات:**
     - الإكسسوارات القديمة تملك باركوداً واحداً على `Product.barcode` و`storeQuantity = N`.
     - **التوافق المزدوج في POS (`getProductByBarcode` & `createSale`):** يبحث النظام أولاً في `ProductUnit` (الباركودات الجديدة)، وإذا لم يجد يبحث في `Product.barcode` القديم (أو يتم توليد `N` وحدات في `ProductUnit` أثناء الترحيل إذا رغب المالك في استبدال ملصقات القطع القديمة).

---

## 11. المخاطر والحالات الاستثنائية (Edge Cases & Risks)

1. **تزامن البيع مع النقل العكسي أو تعديل المخزون (Race Condition):** استخدام MongoDB Transactions + شروط ذرية (`storeQuantity: { $gte: qty }`, `warehouseQuantity: { $gte: qty }`).
2. **مسح باركود قطعة بيعت بالفعل (`ProductUnit.status === "sold"`):** يجب أن يرفض `getProductByBarcode` و`createSale` العملية برسالة واضحة (`"تم بيع هذه القطعة مسبقاً"`).
3. **إرجاع قطعة إكسسوار/صيانة في المرتجعات:** عند بيع قطعة عبر `ProductUnit` ثم إرجاعها، هل تعود نفس `ProductUnit` إلى `in_store` أم يُنشأ باركود جديد؟ (الأفضل إعادة تفعيل نفس الـ `ProductUnit` إلى `in_store` إذا كان الملصق ما زال على المنتج).
4. **النقر المزدوج أثناء النقل:** قد ينشئ ضعف العدد من الباركودات؛ يُمنع باستخدام `idempotencyKey` فريد لكل عملية نقل.
5. **نقص حقل `costPrice` على المنتجات القديمة:** يؤثر على حساب القيمة المالية بالتكلفة في الجرد ما لم يُضف ويُرحّل من فواتير الشراء.
6. **اختبارات Backend الحالية:** `Backend/test/backend.integration.test.js` تفترض حالياً وجود `quantity` و`["phone", "accessory"]` ويجب تحديثها في المرحلة الأخيرة دون كسر السلوك القديم.

---

## 12. خطة التنفيذ المقسمة إلى مراحل صغيرة (Phased Implementation Plan)

| المرحلة | النطاق | المهام الرئيسية | الاختبار المطلوب بعد المرحلة |
|---|---|---|---|
| **المرحلة 1** | **إضافة دور `maintenance_seller` + نوع `maintenance`** | تحديث `User` و`Product` و`Purchase`؛ إضافة `GET /products/maintenance`؛ إنشاء `MaintenanceDashboard` وتحديث `dashboard-config.ts` و`OwnerDashboard`. | اختبار دخول `maintenance_seller`، منع وصوله للهواتف/الإكسسوارات (`403`)، ونجاح `tsc` و`lint`. |
| **المرحلة 2** | **فصل المخزون (`storeQuantity` / `warehouseQuantity` / `location`) + `costPrice`** | تحديث `Product` و`Purchase` لاختيار وجهة الاستلام (`warehouse` أو `store`)؛ عدم توليد باركود داخل `warehouse`؛ تشغيل Script الترحيل بعد Backup. | اختبار استلام هواتف وإكسسوارات في المخزن والتأكد أن POS يرفض بيعها. |
| **المرحلة 3** | **نظام النقل (`StockTransfer`) + باركود القطع الفردية (`ProductUnit`)** | إنشاء `ProductUnit` و`StockTransfer` وواجهات النقل في `OwnerDashboard`؛ تحديث `getProductByBarcode` و`createSale` و`createReturn` ونافذة طباعة الباركودات. | اختبار نقل 5 إكسسوارات -> توليد 5 باركودات مختلفة -> بيع واحدة بالباركود -> منع بيع نفس الباركود مرتين -> اختبار المرتجع. |
| **المرحلة 4** | **نظام الجرد المنفصل (`InventoryAudit`)** | إنشاء `InventoryAudit` وواجهات الجرد المنفصلة للمحل والمخزن مع التقارير الإجمالية والطباعة. | اختبار جرد المحل وجرد المخزن بشكل مستقل ومطابقة الفروق والقيم المالية. |
| **المرحلة 5** | **الاختبارات الشاملة والتحديث النهائي للوثائق** | تحديث `backend.integration.test.js`، تشغيل `npm test` و`tsc` و`lint` و`build` واختبارات `QA_TEST_PLAN.md`. | نجاح جميع الاختبارات الآلية واليدوية قبل النشر. |

---

## 13. قرارات مطلوبة من صاحب المشروع قبل بدء البرمجة

1. **ترحيل المخزون الحالي في MongoDB:** هل كل الكميات المسجلة حالياً في قاعدة البيانات موجودة فعلياً داخل **المحل (`store`)**، أم يوجد جزء منها في المخزن يحتاج تقسيماً يدوياً؟
2. **الباركودات القديمة للإكسسوارات في المحل:** هل نُبقي الباركود القديم المشترك يعمل كـ Fallback للقطع الموجودة حالياً في المحل حتى نفادها، أم تريد توليد باركود مستقل لكل قطعة موجودة حالياً وإعادة طباعة ملصقاتها؟
3. **إخفاء أو إتاحة التعديل المباشر للكمية (`updateProductStock`):** هل يبقى تعديل الرصيد اليدوي في لوحة المالك مقتصراً على تصحيح رصيد مع تحديد الموقع (`store` أو `warehouse`) أم يُقيّد عبر الجرد والنقل فقط؟
4. **مبيعات الصيانة (`maintenance`):** هل منتجات الصيانة تُباع عبر **الكاشير (POS)** كالإكسسوارات تماماً أم لها تسعير/خصائص إضافية خاصة بأجهزة الصيانة؟
5. **التكلفة المالية في الجرد (`costPrice`):** هل نضيف حقل `costPrice` على `Product` ليُحسب الجرد بسعر التكلفة (مع تعبئته من آخر فاتورة شراء للمنتجات القديمة)، أم يُحسب الجرد بسعر البيع فقط للمنتجات التي ليس لها فاتورة شراء؟
6. **النقل العكسي (`store -> warehouse`):** هل نفعّل النقل العكسي من المحل للمخزن في المرحلة الأولى مع تعطيل باركودات القطع العائدة، أم نكتفي بالنقل من المخزن للمحل أولاً؟
