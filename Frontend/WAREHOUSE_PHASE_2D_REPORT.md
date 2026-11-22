# تقرير إنجاز الدفعة 2D — واجهات Warehouse Management في Frontend (`WAREHOUSE_PHASE_2D_REPORT.md`)

> **حالة الدفعة:** مكتملة ومفحوصة آلياً على فرع **`frontend`** فقط (دون تعديل Backend أو تنفيذ Migration أو دمج أي فروع).
> **الصلاحيات:** جميع الشاشات الجديدة مخصصة وحصرية لدور **`owner`** فقط في `dashboard-config.ts` و`OwnerDashboard`، ومحمية في الـ Backend بـ `authorize("owner")`.

---

## 1. الملفات التي تم تعديلها أو إنشاؤها (على فرع `frontend`)

- **ملف جديد:**
  - `Frontend/src/components/dashboard/owner-warehouse-workspace.tsx` *(مكوّن موحد يحتوي شاشات: `Transfers`, `Inventory Audit`, `Unallocated Stock`, `Stock Movements`)*
- **ملفات تم تعديلها:**
  - `Frontend/src/services/dashboard.service.ts` *(تحديث `StoreProductItem` و`normalizeProduct` للاعتماد على `storeQuantity`, `warehouseQuantity`, `damagedQuantity`, `unallocatedQuantity`, `location`, `costPrice` دون `raw.quantity` القديم؛ إضافة `generateIdempotencyKey` ودعم `DashboardApiError.data` لـ `409 Conflict`؛ وإضافة خدمات APIs الدفعة 2C)*
  - `Frontend/src/components/dashboard/dashboard-config.ts` *(إضافة 4 تبويبات جديدة في `ROLE_CONFIGURATIONS.owner` فقط: `transfers`, `inventory-audit`, `unallocated`, `stock-movements`)*
  - `Frontend/src/components/dashboard/owner-dashboard.tsx` *(ربط التبويبات الأربعة بـ `OwnerWarehouseWorkspace` وتحديث عرض بطاقات المنتجات لإظهار أرصدة المحل والمخزن والتالف وغير المخصص)*

---

## 2. الشاشات المنفذة والـ APIs المستخدمة (مطابقة تماماً لعقد Backend)

### أ) تحويل المخزون (`Transfers` — `activeSectionId === "transfers"`)
- **APIs المستخدمة:** `POST /api/transfers` (مع Header `Idempotency-Key`)، `GET /api/transfers`، `GET /api/transfers/:id`، و`GET /api/products`.
- **الوظائف:**
  - التحويل في الاتجاهين (`warehouse_to_store` و`store_to_warehouse`).
  - دعم اختيار الإكسسوارات والصيانة بالكمية (مع التحقق من الحد الأقصى المتاح في الموقع المصدر) والهواتف بالاختيار المباشر أو بإدخال رقم **IMEI** (15 رقماً).
  - منع تكرار الإرسال أثناء التنفيذ (`isSubmittingTransfer` + مفتاح `Idempotency-Key` فريد).
  - عرض سجل التحويلات مع فلتر الاتجاه ولوحة تفاصيل التحويل متضمنة `movementGroupId` والأصناف والباركود.

### ب) جرد المخزون المنفصل (`Inventory Audit` — `activeSectionId === "inventory-audit"`)
- **APIs المستخدمة:** `GET /api/inventory-audit/snapshot?location=store|warehouse`، `POST /api/inventory-audit` (مع `Idempotency-Key`)، `GET /api/inventory-audit`، `GET /api/inventory-audit/:id`، وتصدير CSV عبر `/api/inventory-audit/:id?format=csv`.
- **الوظائف:**
  - اختيار موقع الجرد بشكل منفصل: **جرد المحل (`store`)** أو **جرد المخزن (`warehouse`)**.
  - عرض الجرد مقسّماً إلى 3 جداول مستقلة: **الهواتف (`phone`)**، **الإكسسوارات (`accessory`)**، **الصيانة (`maintenance`)**.
  - إدخال الكميات الفعلية مع حساب فوري للعجز والزيادة وعرض التكلفة (`غير محددة` إن لم تتوفر `costPrice`) وقيمة البيع.
  - معالجة صريحة لـ **`409 Conflict`**: عرض تنبيه واضح بقائمة المنتجات المتغيرة (`changedProducts`: الرصيد في اللقطة مقابل الرصيد الحي) وزر فوري **إعادة أخذ اللقطة (Refresh Snapshot)**.
  - عرض سجل تقارير الجرد السابقة وملخص كل فئة ورابط تحميل CSV.

### ج) المخزون غير المخصص (`Unallocated Stock` — `activeSectionId === "unallocated"`)
- **APIs المستخدمة:** `GET /api/products/unallocated` و`POST /api/products/:id/allocate` (مع `Idempotency-Key`).
- **الوظائف:**
  - عرض جميع المنتجات غير المخصصة (هواتف، إكسسوارات، صيانة).
  - توزيع كمية الإكسسوارات والصيانة بين المحل والمخزن مع التحقق من عدم تجاوز `unallocatedQuantity`، واختيار وجهة الهاتف (`store` أو `warehouse`).
  - اشتراط إدخال سبب التخصيص ومنع الإرسال المكرر أثناء التنفيذ.

### د) سجل حركات المخزون (`Stock Movements` — `activeSectionId === "stock-movements"`)
- **APIs المستخدمة:** `GET /api/stock-movements`.
- **الوظائف:**
  - فلاتر: الموقع (`store | warehouse | damaged | unallocated`)، نوع الحركة (`movementType`)، ومعرف المجموعة (`movementGroupId`).
  - عرض نوع الحركة، الموقع، مقدار التغير (`+` / `-`)، الرصيد (`قبل → بعد`)، رقم `IMEI` للهواتف، المنفذ، التاريخ، و`movementGroupId` مع Pagination.

---

## 3. نتائج الاختبارات الفعلية

| الاختبار / الأمر | النتيجة | التفاصيل المرصودة |
|---|---|---|
| `npx next typegen` | **PASS** | `✓ Types generated successfully` |
| `npx tsc --noEmit` | **PASS** | `exit code 0` (0 أخطاء TypeScript) |
| `npm run lint` (`eslint`) | **PASS** | `exit code 0` (0 أخطاء، 0 تحذيرات) |
| `npx next build --webpack` | **PASS** | `✓ Compiled successfully in 5.9s`, `Finished TypeScript in 9.5s`, توليد `6/6` صفحات ثابتة (`/`, `/_not-found`, `/dashboard`, `/icon.png`, `/login`). |
| الاختبارات التفاعلية في المتصفح (تحويل، جرد `409`، تخصيص، حركات) | **Not Run (تتطلب نشر `backend`)** | الـ `.env` في Frontend يشير إلى Render (`https://elsory-store-system.onrender.com`) الذي لم يُدفع إليه بعد فرع `backend` بتحديثات 2A/2B/2C؛ يجب عمل `git push` لفرع `backend` (أو التشغيل محلياً) لتنفيذ اختبارات المتصفح الحية. |

---

## 4. ملاحظات ومشاكل متبقية للمراجعة قبل أي خطوة تالية
1. **نشر الـ Backend قبل الاختبار الحي:** فرع `backend` يحتوي Commits `2A` و`2B` و`2C` محلياً ويجب دفعه إلى Render حتى تستجيب مسارات `/transfers` و`/inventory-audit` و`/products/unallocated` و`/stock-movements` في الإنتاج.
2. **نقطة متابعة اختيارية لاحقاً:** شاشات المشتريات القديمة في `owner-dashboard.tsx` والمرتجعات في `cashier-dashboard.tsx` يمكن تحديث نماذجها لاحقاً لإظهار حقول تقسيم الاستلام (`allocations`) وحالة المرتجع (`condition` / `returnTo`) عند اعتماد الانتقال للتشغيل الكامل.
