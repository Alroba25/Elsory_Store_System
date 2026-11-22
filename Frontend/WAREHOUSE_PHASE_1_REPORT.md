# تقرير إنجاز المرحلة الأولى: دور الصيانة (`maintenance_seller`) ومنتجات الصيانة (`maintenance`) — `WAREHOUSE_PHASE_1_REPORT.md`

> **حالة المرحلة:** مكتملة ومفحوصة آلياً (لم تبدأ المرحلة الثانية بعد).
> **الفروع المستخدمة:**
> - **Backend:** فرع `backend` (Commit `fe951a9`)
> - **Frontend:** فرع `frontend`

---

## 1. الملفات التي تم تعديلها أو إضافتها

### أ) Backend (فرع `backend` — Commit `fe951a9`)
- `Backend/src/models/user.model.js`
- `Backend/src/models/products.model.js`
- `Backend/src/models/purchase.model.js`
- `Backend/src/models/sales.model.js`
- `Backend/src/models/returns.model.js`
- `Backend/src/controllers/user.controllers.js`
- `Backend/src/controllers/product.controllers.js`
- `Backend/src/controllers/purchase.controllers.js`
- `Backend/src/routes/index.routes.js`
- `Backend/test/maintenance.phase1.test.js` *(ملف اختبار جديد للمرحلة الأولى)*

### ب) Frontend (فرع `frontend`)
- `Frontend/src/types/auth.types.ts`
- `Frontend/src/components/providers/auth-provider.tsx`
- `Frontend/src/services/dashboard.service.ts`
- `Frontend/src/components/dashboard/dashboard-config.ts`
- `Frontend/src/components/dashboard/dashboard-content.tsx`
- `Frontend/src/components/dashboard/maintenance-dashboard.tsx` *(مكوّن جديد)*
- `Frontend/src/components/dashboard/owner-dashboard.tsx`
- `Frontend/src/components/dashboard/cashier-dashboard.tsx`

---

## 2. التغييرات المنفذة

### Backend
1. **إضافة دور `maintenance_seller`:**
   - إضافته إلى `role.enum` في `user.model.js` وإلى قائمة `allowedRoles` في `updateUserRole` (`user.controllers.js`) حتى يتمكن المالك فقط من تعيينه للموظفين.
2. **إضافة نوع المنتجات `maintenance`:**
   - إضافته إلى `type.enum` في `products.model.js` وإلى `productType.enum` في `purchase.model.js` و`sales.model.js` و`returns.model.js`.
3. **تطبيق نفس نظام تجميع الإكسسوارات والباركود المشترك على `maintenance`:**
   - في `createProduct` و`registerPurchasedAccessory`: عند إضافة منتج `maintenance` بنفس `name + brand + model + specifications` يتم زيادة `quantity` على نفس وثيقة `Product` والاحتفاظ بنفس `barcode` الواحد المشترك (دون إنشاء باركودات متعددة أو `ProductUnit`).
   - دعم تعديل رصيد الصيانة في `updateProductStock` وفلترة `type=maintenance` في `getProducts`.
4. **صلاحيات وحماية المسار:**
   - إنشاء دالة مساعدة مشتركة `getCatalogProductsByType` في `product.controllers.js` لخدمة `getAccessoriesProducts` و`getMaintenanceProducts`، وحماية `/products/maintenance` بـ `middleware` + `authorize("maintenance_seller")`.

### Frontend
1. **الأنواع والإعدادات والتوجيه:**
   - إضافة `maintenance_seller` في `AuthUser["role"]` (`auth.types.ts` و`auth-provider.tsx`)، وفي `VALID_ROLES` و`ROLE_CONFIGURATIONS` (`dashboard-config.ts`)، والتوجيه التلقائي إليه في `dashboard-content.tsx`.
2. **لوحة `MaintenanceDashboard` (`maintenance-dashboard.tsx`):**
   - لوحة مستقلة مماثلة لـ `AccessoriesDashboard` تعرض كتالوج الصيانة فقط (`GET /products/maintenance`) مع البحث، التفاصيل، وحالة التوفر، وتوجيه البيع للكاشير.
3. **خدمات ولوحات الإدارة والبيع:**
   - تحديث `ProductType` وإضافة `normalizeProductType` و`fetchMaintenanceCatalog` في `dashboard.service.ts`.
   - إضافة نوع `صيانة (maintenance)` وخيار دور `maintenance_seller` في `owner-dashboard.tsx`.
   - السماح بتعديل كمية منتجات الصيانة في سلة البيع داخل `cashier-dashboard.tsx`.

---

## 3. الـ APIs التي تمت إضافتها أو تحديثها

| Method | Endpoint | الصلاحية | التغيير |
|---|---|---|---|
| `GET` | `/products/maintenance` | `maintenance_seller` فقط | **جديد:** عرض منتجات الصيانة النشطة المتوفرة (`type: "maintenance"`, `quantity > 0`) مع البحث والفرز والـ Pagination. |
| `POST` | `/products` | `owner` | **محدّث:** قبول `type: "maintenance"` بنفس آلية التجميع والباركود المشترك. |
| `GET` | `/products` | `owner` | **محدّث:** قبول الفلتر `?type=maintenance`. |
| `PATCH` | `/products/:id/stock` | `owner` | **محدّث:** دعم زيادة/إنقاص الرصيد لمنتجات `maintenance`. |
| `POST` | `/purchase` & `/purchase/:pId/items/:iId/register-accessory` | `owner` | **محدّث:** دعم بنود الشراء من نوع `maintenance`. |
| `PATCH` | `/users/:id/role` | `owner` | **محدّث:** السماح بتعيين دور `maintenance_seller`. |

---

## 4. نتائج الاختبارات الفعلية

| الاختبار / الأمر | النتيجة | التفاصيل المرصودة |
|---|---|---|
| Backend: `node --test --test-reporter=spec --test-force-exit test/maintenance.phase1.test.js` | **PASS** (`1/1`) | تحقق فعلياً على MongoDB من: تعيين المالك لدور `maintenance_seller`، تسجيل دخول `maintenance_seller`، تجميع منتجين متشابهين من نوع `maintenance` في وثيقة واحدة وباركود واحد (`quantity = 5`)، رؤية منتجات الصيانة فقط عبر `GET /products/maintenance`، رفض `403` على `/products/phones`, `/products/accessories`, `/products`, `/users`, `/sales-reports`, `POST /sales`, `POST /shift/open`، وتأكيد عدم تأثر `accessories_seller` و`phone_seller` ومنعهما من `/products/maintenance` (`403`). |
| Frontend: `npx next typegen` | **PASS** | `✓ Types generated successfully` |
| Frontend: `npx tsc --noEmit` | **PASS** | `exit code 0` دون أي أخطاء TypeScript. |
| Frontend: `npm run lint` | **PASS** | `exit code 0` دون أي أخطاء أو تحذيرات ESLint. |

---

## 5. أي أخطاء أو مشاكل متبقية

- لم تظهر أي أخطاء في اختبارات المرحلة الأولى (`maintenance.phase1.test.js` و`tsc` و`eslint`).
- **ملاحظة مسبقة (من قبل المرحلة الأولى):** الاختبار القديم `Backend/test/backend.integration.test.js` ما زال يحتوي على الـ Assertion المعروف في السطر `513` (`Expected HTTP 400, got 409`) ولم يُعدّل في هذه المرحلة.
- **ملاحظة متبقية في Frontend عند الاستخدام اليدوي:** يجب اختبار تسجيل الدخول الفعلي بحساب `maintenance_seller` على المتصفح وعمل Refresh للصفحة للتأكد من التوجيه على البيئة الحية.

---

## 6. تأكيد عدم التأثير على الأدوار والوظائف الحالية

- **دور `owner`، `cashier`، `accessories_seller`، `phone_seller`، `general`:** لم تتغير مساراتهم أو صلاحياتهم؛ وبقي نظام الباركود الواحد المشترك للإكسسوارات كما هو دون استخدام `ProductUnit`، ولم تُجرَ أي تعديلات على البيانات القديمة في MongoDB.

---

## 7. خطة المرحلة الثانية (فصل المخزون إلى المحل `store` والمخزن `warehouse`)

1. **تحديث نموذج `Product` (`products.model.js`):**
   - إضافة `storeQuantity` و`warehouseQuantity` (دون خلطهما في البيع أو البحث بالباركود).
   - إضافة `location: "warehouse" | "store" | "sold"` للهواتف (`phone`) لمنع وجود الهاتف في الموقعين معاً، وعدم إنشاء `barcode` عند دخول الهاتف للمخزن.
2. **تحديث المشتريات واستلام البضاعة (`purchase.controllers.js`):**
   - تحديد وجهة الاستلام (`warehouse` أو `store`) عند تسجيل الهواتف والإكسسوارات/الصيانة.
   - في `warehouse`: تدخل الإكسسوارات والصيانة بالكمية دون إنشاء `barcode` بيع، وتدخل الهواتف بالـ `IMEI` دون `barcode` بيع.
3. **حماية نقطة البيع (`getProductByBarcode` و`createSale` و`createReturn`):**
   - قصر البيع والبحث بالباركود داخل POS على `storeQuantity > 0` (أو `location === "store"` للهواتف) ومنع بيع أي بضاعة موجودة في المخزن فقط.
   - إعادة المرتجعات إلى `storeQuantity` / `store`.
4. **اختبار المرحلة الثانية** والتأكد من التوافق قبل الانتقال إلى نظام النقل (`Transfers`) ثم الجرد (`Inventory Audit`).
