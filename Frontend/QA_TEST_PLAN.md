# خطة الاختبار وضمان الجودة الشاملة — ELSORY STORE (`QA_TEST_PLAN.md`)

> **الغرض من الوثيقة:** مرجع نهائي لاختبار نظام **ELSORY STORE** بالكامل (Frontend + Backend) قبل اعتماده في بيئة الإنتاج (Production).
> **البيئات المستهدفة:**
> - **Frontend (Vercel):** `https://elsory-store-three.vercel.app` (Next.js `16.4.6` + React `19.3.0`)
> - **Backend (Render):** `https://elsory-store-system.onrender.com` (Express `5.3.0` + Mongoose `9.11.4` + MongoDB)
> - **Proxy Rewrite (`next.config.ts`):** جميع طلبات المتصفح إلى `/api/:path*` تُعاد كتابتها إلى `BACKEND_API_URL` أو `NEXT_PUBLIC_API_URL`.

---

## ملخص الصلاحيات والأدوار الموجودة فعلياً في النظام

| الدور (`role`) | اللوحة المرتبطة في Frontend | الصلاحيات الفعلية في Backend |
|---|---|---|
| `owner` | `OwnerDashboard` + `OwnerAnalyticsWorkspace` | إدارة المنتجات والمخزون، الموردين، المشتريات، الموظفين، متابعة المبيعات والمرتجعات والورديات (قراءة فقط)، والتقارير المالية والتحليلية (`GET /sales-reports`, `/purchases-reports`, `/returns-reports`, `/shift/reports`). **لا يملك صلاحية إنشاء بيع أو مرتجع أو فتح/إغلاق وردية.** |
| `cashier` | `CashierDashboard` | فتح/إغلاق الوردية، تسجيل حركات الخزينة (إيداع/سحب)، البحث بالباركود، إنشاء فواتير المبيعات (`POST /sales`)، إنشاء المرتجعات (`POST /return`)، صرف الاسترداد (`PATCH /return/:id/refund`)، متابعة مبيعاته ومرتجعاته ووردياته. |
| `phone_seller` | `PhoneDashboard` | عرض الهواتف فقط عبر `GET /products/phones` وطباعة الملصقات إن لزم؛ محظور عليه الوصول لبقية مسارات الإدارة أو المبيعات. |
| `accessories_seller` | `AccessoriesDashboard` | عرض الإكسسوارات فقط عبر `GET /products/accessories`؛ محظور عليه الوصول لبقية مسارات الإدارة أو المبيعات. |
| `general` | `GeneralDashboard` | حساب مسجل حديثاً بانتظار تفعيل الدور من المالك؛ يملك صلاحية قراءة/تحديث ملفه الشخصي (`/profile`, `/users/me`, `/change-password`) فقط. |

---

## 1. Authentication (المصادقة والجلسات)

> **ملاحظة مطابقة للكود الفعلي:** تم إزالة واجهة **نسيت كلمة المرور (`forgot-password`)** و**إعادة تعيين كلمة المرور (`reset-password`)** من الـ Frontend بناءً على قرار المشروع الحالي، بينما لا تزال الـ Endpoints الخاصة بهما (`/forgot-password`, `/reset-password`) موجودة في الـ Backend فقط.

| Test ID | Feature | Test Scenario | Steps | Expected Result | Actual Result | Status | Priority |
|---|---|---|---|---|---|---|---|
| AUTH-01 | Login | تسجيل الدخول ببيانات صحيحة (`owner` أو `cashier`) | 1. افتح `/login`<br>2. أدخل بريد وكلمة مرور صحيحين<br>3. اضغط **تسجيل الدخول** (`POST /api/login`) | استجابة `200 OK`، تعيين Cookie الـ JWT (`httpOnly`)، جلب `/api/profile` بنجاح، والتحويل التلقائي إلى `/dashboard`. | — | Not Tested | Critical |
| AUTH-02 | Login | تسجيل الدخول بكلمة مرور خاطئة أو بريد غير موجود | 1. افتح `/login`<br>2. أدخل بريد صحيح وكلمة مرور خاطئة<br>3. اضغط **تسجيل الدخول** | استجابة `401 Unauthorized`، عرض رسالة خطأ واضحة بالعربية، وعدم التحويل إلى `/dashboard`. | — | Not Tested | Critical |
| AUTH-03 | Session & Refresh | بقاء الجلسة بعد عمل Refresh للصفحة | 1. سجل الدخول بنجاح إلى `/dashboard`<br>2. اضغط `F5` أو أعد تحميل الصفحة | يتم استدعاء `GET /api/profile` مع `credentials: "include"` وإرجاع `200 OK` وبقاء المستخدم داخل `/dashboard` بنفس الدور. | — | Not Tested | Critical |
| AUTH-04 | Register | إنشاء حساب جديد من واجهة التسجيل | 1. افتح `/login` واختر تبويب **إنشاء حساب**<br>2. أدخل الاسم والبريد وكلمة المرور وتأكيدها<br>3. اضغط **إنشاء حساب** (`POST /api/register`) | استجابة `201 Created`، إنشاء الحساب بدور `general`، وظهور رسالة النجاح أو التوجيه لتسجيل الدخول. | — | Not Tested | High |
| AUTH-05 | Register (Edge Case) | التسجيل ببريد إلكتروني مسجل مسبقاً أو بيانات ناقصة | 1. حاول التسجيل ببريد مستخدم مسبقاً<br>2. حاول التسجيل بكلمة مرور قصيرة/غير متطابقة | استجابة `409 Conflict` للبريد المكرر، أو `400 Bad Request` / خطأ تحقق في النموذج للبيانات غير الصالحة. | — | Not Tested | High |
| AUTH-06 | Logout | تسجيل الخروج وإنهاء الجلسة | 1. من داخل `/dashboard` اضغط **تسجيل الخروج** (`POST /api/logout`)<br>2. حاول زيارة `/dashboard` مباشرة | مسح الـ Cookie بنفس إعدادات الإنشاء (`httpOnly`, `sameSite`, `secure`, `path: "/"`), تحويل المستخدم إلى `/login`، وإرجاع `401` لـ `/api/profile`. | — | Not Tested | Critical |
| AUTH-07 | Change Password | تغيير كلمة المرور من الملف الشخصي (`UserProfileWorkspace`) | 1. افتح تبويب **الملف الشخصي**<br>2. أدخل كلمة المرور الحالية والجديدة<br>3. أرسل الطلب (`POST /api/change-password`) | استجابة `200 OK` وتحديث `tokenVersion`؛ تسجيل الدخول بعدها بكلمة المرور الجديدة ينجح والقديمة تُرفض. | — | Not Tested | High |
| AUTH-08 | Inactive User | محاولة دخول حساب موقوف (`isActive: false`) | 1. يوقف المالك حساب موظف من قسم الموظفين<br>2. يحاول الموظف تسجيل الدخول أو استدعاء `/api/profile` | رفض الدخول/الطلب وإظهار رسالة أن الحساب غير نشط وعدم السماح بالوصول للوحة التحكم. | — | Not Tested | High |
| AUTH-09 | Rate Limiting | اختبار حدود المحاولات المتكررة على `/api/login` | 1. أرسل أكثر من 10 محاولات دخول فاشلة خلال 15 دقيقة على `POST /api/login` | استجابة `429 Too Many Requests` برسالة واضحة من الـ Rate Limiter. | — | Not Tested | Medium |
| AUTH-10 | Forgot/Reset Password (UI Scope) | التأكد من عدم وجود روابط أو صفحات معطلة لاستعادة كلمة المرور في Frontend | 1. افحص صفحة `/login`<br>2. حاول فتح `/forgot-password` و`/reset-password` على Frontend | عدم وجود زر "نسيت كلمة المرور؟" في `/login`، وعرض صفحة `404 Not Found` لمسارات `/forgot-password` و`/reset-password` في Frontend. | — | Not Tested | Medium |
| AUTH-11 | Forgot/Reset Password (Backend API) | فحص مسارات `POST /forgot-password` و`POST /reset-password` في Backend (للتوثيق الخلفي فقط) | 1. أرسل طلب `POST /forgot-password` ببريد صالح إلى Backend<br>2. اختبر `POST /reset-password` بـ token غير صالح | في حال تفعيل متغيرات البريد على السيرفر يرجع `200`؛ بدون متغيرات صالحة يرجع `503`/`502`؛ و`reset-password` بـ token خاطئ يرجع `400`. | — | Not Tested | Low |

---

## 2. Roles & Permissions (الأدوار والصلاحيات)

| Test ID | Feature | Test Scenario | Steps | Expected Result | Actual Result | Status | Priority |
|---|---|---|---|---|---|---|---|
| ROLE-01 | Owner Access | وصول المالك (`owner`) لأقسام الإدارة والمراقبة فقط | 1. سجل الدخول بحساب `owner`<br>2. تنقل بين جميع تبويبات `OwnerDashboard` | تحميل كافة أقسام المالك (التحليلات، المنتجات، الموردين، المشتريات، المبيعات عرض فقط، المرتجعات عرض فقط، الورديات، الموظفين) دون أخطاء `403`. | — | Not Tested | Critical |
| ROLE-02 | Owner Restriction | منع المالك من تنفيذ عمليات الكاشير (`POST /sales`, `/return`, `/shift/open`) | 1. باستخدام Cookie المالك، أرسل طلباً مباشراً إلى `POST /api/sales` أو `POST /api/shift/open` أو `POST /api/return` | استجابة `403 Forbidden`؛ البيع والمرتجعات وإدارة الوردية حصرياً للكاشير. | — | Not Tested | Critical |
| ROLE-03 | Cashier Access | وصول الكاشير (`cashier`) لوظائف البيع والوردية والمرتجعات | 1. سجل الدخول بحساب `cashier`<br>2. افحص الأقسام المتاحة في `CashierDashboard` | عرض نقطة البيع، فواتيري، المرتجعات، الوردية، حركات الخزينة، والملف الشخصي. | — | Not Tested | Critical |
| ROLE-04 | Cashier Restriction | منع الكاشير من الوصول لمسارات المالك | 1. باستخدام Cookie الكاشير، اطلب `GET /api/users` أو `POST /api/products` أو `GET /api/sales-reports` أو `GET /api/purchase` | استجابة `403 Forbidden` على جميع مسارات المالك وعدم ظهورها في واجهة الكاشير. | — | Not Tested | Critical |
| ROLE-05 | Phone Seller | صلاحيات بائع الهواتف (`phone_seller`) | 1. سجل الدخول بحساب `phone_seller`<br>2. افتح `/dashboard`<br>3. اختبر استدعاء `GET /api/products/accessories` و`GET /api/products` | تعرض `PhoneDashboard` منتجات الهواتف فقط (`GET /api/products/phones`)، وترجع الطلبات الأخرى `403 Forbidden`. | — | Not Tested | High |
| ROLE-06 | Accessories Seller | صلاحيات بائع الإكسسوارات (`accessories_seller`) | 1. سجل الدخول بحساب `accessories_seller`<br>2. افتح `/dashboard`<br>3. اختبر استدعاء `GET /api/products/phones` و`GET /api/products` | تعرض `AccessoriesDashboard` منتجات الإكسسوارات فقط (`GET /api/products/accessories`)، وترجع الطلبات الأخرى `403 Forbidden`. | — | Not Tested | High |
| ROLE-07 | General Role | صلاحيات الحساب العام (`general`) | 1. سجل الدخول بحساب `general`<br>2. افتح `/dashboard`<br>3. حاول استدعاء `GET /api/sales` أو `GET /api/products` | تعرض `GeneralDashboard` رسالة انتظار تعيين الصلاحية، وترجع أي APIs تشغيلية `403 Forbidden`. | — | Not Tested | High |
| ROLE-08 | Role & Status Mutation | تعديل المالك لدور وحالة موظف (`PATCH /users/:id/role`, `/status`) | 1. من تبويب الموظفين عند المالك، غيّر دور مستخدم `general` إلى `cashier`<br>2. أوقف/فعّل حسابه | تحديث الدور والحالة في قاعدة البيانات، وعند تحديث صفحة الموظف تظهر له اللوحة الجديدة فوراً. | — | Not Tested | High |

---

## 3. Dashboard (لوحة التحكم الرئيسية)

| Test ID | Feature | Test Scenario | Steps | Expected Result | Actual Result | Status | Priority |
|---|---|---|---|---|---|---|---|
| DASH-01 | Initial Load | تحميل `/dashboard` بدون أخطاء Console أو Hydration | 1. سجل الدخول كـ `owner` ثم كـ `cashier`<br>2. راقب Console وNetwork | تحميل `DashboardLayout`, `DashboardSidebar`, `DashboardHeader` والمحتوى دون أخطاء `500` أو Hydration mismatch. | — | Not Tested | Critical |
| DASH-02 | Owner Day Filter | فلترة القوائم حسب اليوم (`اليوم` افتراضياً) في لوحة المالك | 1. افتح تبويبات المبيعات، المشتريات، المرتجعات، والورديات عند المالك<br>2. بدّل بين `اليوم`، `أمس`، `تاريخ محدد`، و`كل الأيام` عبر `DayFilterBar` | افتراضياً تظهر عمليات **اليوم فقط**؛ وعند التغيير تتحدث القائمة والعداد فوراً بدقة حسب التاريخ المحلي. | — | Not Tested | High |
| DASH-03 | Cashier Day Filter | فلترة فواتير المبيعات والمرتجعات وسجل الورديات حسب اليوم عند الكاشير | 1. افتح تبويبات المبيعات، المرتجعات، وسجل الورديات عند الكاشير<br>2. بدّل أوضاع `DayFilterBar` | افتراضياً لا تظهر فواتير أو ورديات الأيام السابقة إلا عند اختيار `أمس` أو `تاريخ محدد` أو `كل الأيام`. | — | Not Tested | High |
| DASH-04 | Header & Navigation | التنقل بين الأقسام عبر الـ Sidebar وتحديث البيانات | 1. اضغط على كل قسم في الـ Sidebar<br>2. اضغط زر **تحديث** داخل كل قسم | انتقال سلس بدون إعادة تحميل الصفحة، وتحديث البيانات من الـ Backend بنجاح. | — | Not Tested | Medium |

---

## 4. Products & Inventory (المنتجات والمخزون)

| Test ID | Feature | Test Scenario | Steps | Expected Result | Actual Result | Status | Priority |
|---|---|---|---|---|---|---|---|
| PROD-01 | Create Product | إضافة منتج جديد (هاتف أو إكسسوار) بواسطة المالك | 1. افتح قسم المنتجات عند المالك<br>2. أنشئ منتجاً (`POST /api/products`) ببيانات صالحة (اسم، نوع، سعر شراء، سعر بيع، رصيد، باركود/IMEI) | استجابة `201 Created` وظهور المنتج في قائمة المنتجات النشطة. | — | Not Tested | Critical |
| PROD-02 | Barcode Lookup | البحث عن منتج بالباركود (`GET /products/barcode/:barcode`) | 1. أدخل باركود منتج نشط في حقل البحث السريع عند المالك أو الكاشير | استجابة `200 OK` وعرض بيانات المنتج وسعره ورصيده المتاح فوراً. | — | Not Tested | Critical |
| PROD-03 | Stock Adjustment | زيادة أو إنقاص رصيد منتج يدوياً (`PATCH /products/:id/stock`) | 1. اختر منتجاً في لوحة المالك<br>2. نفّذ `increase` بمقدار `5` ثم `decrease` بمقدار `2` | تحديث الرصيد بدقة في قاعدة البيانات والواجهة؛ ورفض `decrease` إذا كان سيؤدي لرصيد سالب. | — | Not Tested | High |
| PROD-04 | Soft Delete & Restore | أرشفة/حذف منتج ثم استعادته (`DELETE /products/:id`, `PATCH /products/:id/restore`) | 1. احذف منتجاً من القائمة النشطة<br>2. انتقل لتبويب **المنتجات غير النشطة** (`GET /products/inactive`)<br>3. اضغط استعادة | اختفاء المنتج من النشطة وظهوره في غير النشطة، ثم عودته للنشطة بعد الاستعادة. | — | Not Tested | Medium |
| PROD-05 | Barcode Printing | طباعة ملصقات الباركود (`PrintableProductBarcodesModal`) | 1. افتح نافذة طباعة الباركود لمنتج أو أكثر عند المالك<br>2. اضغط طباعة | عرض نافذة الطباعة بتنسيق منظم وواضح يحتوي اسم المنتج والسعر والباركود. | — | Not Tested | Low |
| PROD-06 | Validation (Edge Case) | منع إنشاء منتج بسعر سالب أو باركود مكرر | 1. أدخل سعراً أو مخزوناً سالباً أو باركود مستخدم مسبقاً | استجابة `400` / `409` ورسالة خطأ واضحة دون إنشاء سجل غير صالح. | — | Not Tested | High |

---

## 5. POS & Sales (نقطة البيع والمبيعات)

| Test ID | Feature | Test Scenario | Steps | Expected Result | Actual Result | Status | Priority |
|---|---|---|---|---|---|---|---|
| SALE-01 | Shift Gate | منع الكاشير من البيع بدون وردية مفتوحة | 1. تأكد أن الكاشير ليس لديه وردية مفتوحة<br>2. حاول إتمام فاتورة بيع (`POST /api/sales`) | رفض العملية (`409 Conflict`: `You must have an open shift to create a sale`) وإظهار تنبيه بضرورة فتح وردية أولاً. | — | Not Tested | Critical |
| SALE-02 | Create Sale (Cash) | إنشاء فاتورة بيع نقدية كاملة وحساب الإجمالي والخصم | 1. افتح وردية للكاشير<br>2. أضف منتجين للسلة وأضف خصماً<br>3. اختر الدفع `cash` بكامل الصافي وأكمل البيع | استجابة `201 Created`، خصم الكمية من مخزون المنتجات، زيادة `totalCashSales` في الوردية، وظهور الفاتورة باسم الكاشير. | — | Not Tested | Critical |
| SALE-03 | Multi-Method Payment | إنشاء فاتورة بدفعات مقسمة (`Cash` + `Visa` / `InstaPay` / `Wallet`) | 1. أنشئ فاتورة بمبلغ 1000 ج.م<br>2. ادفع 400 `cash` + 600 `visa` (أو `instapay`/`wallet`) | تسجيل مصفوفة `payments` كاملة، زيادة `totalCashSales` بـ 400 و`totalVisaSales` بـ 600، وظهور طرق الدفع في فواتير المالك. | — | Not Tested | Critical |
| SALE-04 | Partial / Unpaid Sale | إنشاء فاتورة مدفوعة جزئياً أو آجلة | 1. أنشئ فاتورة بـ 1000 ج.م وادفع 300 ج.م فقط (أو 0 ج.م) | تسجيل `paidAmount = 300` و`remainingAmount = 700`، واحتسابها ضمن الفواتير المدفوعة جزئياً/غير المدفوعة في التقارير. | — | Not Tested | High |
| SALE-05 | Stock Guard (Edge Case) | محاولة بيع كمية أكبر من الرصيد المتاح | 1. حاول بيع كمية تتجاوز `stock` المتاح للمنتج | فشل الطلب (`400 Bad Request`) وعدم خصم أي رصيد من المخزون أو إنشاء فاتورة. | — | Not Tested | Critical |
| SALE-06 | Print Invoice | عرض وطباعة فاتورة المبيعات (`PrintableSaleInvoiceModal`) | 1. افتح تفاصيل أي فاتورة بيع عند الكاشير أو المالك<br>2. اضغط طباعة الفاتورة | فتح معاينة الفاتورة متضمنة رقم الفاتورة، اسم الكاشير، الأصناف، الخصومات، طرق الدفع، والمبلغ المتبقي بشكل متناسق. | — | Not Tested | Medium |

---

## 6. Purchases & Suppliers (المشتريات والموردين)

| Test ID | Feature | Test Scenario | Steps | Expected Result | Actual Result | Status | Priority |
|---|---|---|---|---|---|---|---|
| PUR-01 | Suppliers CRUD | إضافة وتعديل وتغيير حالة مورد (`POST /suppliers`, `PATCH /suppliers/:id`, `/status/:id`) | 1. من لوحة المالك أضف مورداً جديداً<br>2. عدّل بياناته ثم غيّر حالته ثم احذفه (إذا لم يكن مرتبطاً بفواتير) | نجاح العمليات وحفظ البيانات؛ وعرض الموردين النشطين عند إنشاء فاتورة شراء. | — | Not Tested | High |
| PUR-02 | Create Purchase | تسجيل فاتورة شراء جديدة (`POST /purchase`) مع المدفوع والمتبقي | 1. اختر مورداً وأضف أصناف الشراء<br>2. أدخل المبلغ المدفوع (`paidAmount`) أقل من الإجمالي | إنشاء الفاتورة بحساب `totalAmount`, `paidAmount`, `remainingAmount` وتحديد حالة الدفع (`partially_paid` / `unpaid` / `paid`). | — | Not Tested | Critical |
| PUR-03 | Register Purchased Items | تسجيل الهواتف والإكسسوارات المشتراة وتحديث المخزون | 1. في فاتورة شراء، نفّذ تسجيل الهاتف (`/register-phone`) أو الإكسسوار (`/register-accessory`) | زيادة رصيد المنتج في المخزون وربط الصنف المسجل بفاتورة الشراء. | — | Not Tested | Critical |
| PUR-04 | Cancel Purchase | إلغاء فاتورة شراء (`PATCH /purchase/:purchaseId/cancel`) | 1. افتح فاتورة شراء قابلة للإلغاء واضغط إلغاء | تحديث حالة الفاتورة إلى `cancelled` واستبعادها من إجمالي المشتريات النشطة في التقارير. | — | Not Tested | Medium |

---

## 7. Returns (المرتجعات)

| Test ID | Feature | Test Scenario | Steps | Expected Result | Actual Result | Status | Priority |
|---|---|---|---|---|---|---|---|
| RET-01 | Create Return | إرجاع منتج من فاتورة بيع مكتملة (`POST /return`) | 1. عند الكاشير (بوردية مفتوحة)، اختر فاتورة بيع وأنشئ مرتجعاً لصنف أو أكثر | استجابة `201 Created`، استعادة الكمية المرتجعة لمخزون المنتج، وحساب قيمة المرتجع. | — | Not Tested | Critical |
| RET-02 | Debt Offset vs Refund Due | إرجاع منتج من فاتورة عليها مديونية (`remainingAmount > 0`) | 1. أنشئ مرتجعاً بقيمة 500 ج.م على فاتورة عليها متبقي 300 ج.م | تطبيق 300 ج.م على المديونية أولاً (`amountAppliedToDebt = 300`) واحتساب `refundDue = 200` ج.م فقط. | — | Not Tested | High |
| RET-03 | Process Refund (Cash/Non-Cash) | صرف مبلغ الاسترداد (`PATCH /return/:id/refund`) عبر `cash` أو `visa`/`instapay`/`wallet` | 1. نفّذ استرداداً نقدياً أو غير نقدي على مرتجع له `refundRemainingAmount > 0` | تحديث `refundedAmount` على المرتجع والفاتورة الأصلية، وزيادة حقل المرتجع المطابق (`totalCashRefunds` أو `totalVisaRefunds` إلخ) في الوردية المفتوحة. | — | Not Tested | Critical |
| RET-04 | Return Quantity Limit (Edge Case) | محاولة إرجاع كمية أكبر من الكمية المباعة أو المتبقية | 1. حاول إرجاع نفس الصنف مرة أخرى بكمية تتجاوز المتبقي | استجابة `400 Bad Request` ومنع تكرار الإرجاع أو تضخيم المخزون. | — | Not Tested | Critical |

---

## 8. Shifts (الورديات ومطابقة الخزينة)

| Test ID | Feature | Test Scenario | Steps | Expected Result | Actual Result | Status | Priority |
|---|---|---|---|---|---|---|---|
| SHF-01 | Open Shift | فتح وردية جديدة برصيد افتتاحي (`POST /shift/open`) | 1. أدخل `openingCash` (مثلاً 500 ج.م) واضغط **فتح الوردية**<br>2. حاول فتح وردية ثانية أثناء وجود وردية مفتوحة | فتح الوردية بنجاح (`201`)؛ ورفض المحاولة الثانية بـ `409 Conflict`. | — | Not Tested | Critical |
| SHF-02 | Cash Movements | تسجيل إيداع وسحب نقدي (`POST /shift/movements`) | 1. سجّل إيداع 200 ج.م (`deposit`)<br>2. سجّل سحب 100 ج.م (`withdrawal`)<br>3. حاول سحب مبلغ أكبر من المتاح بالدرج | تحديث `totalDeposits` و`totalWithdrawals` و`expectedCash`؛ ورفض السحب الزائد عن رصيد الدرج (`400 Insufficient cash`). | — | Not Tested | High |
| SHF-03 | Conditional Non-Cash Inputs | إظهار حقول الفيزا/InstaPay/المحافظ عند الإقفال فقط عند وجود نشاط لها | 1. في وردية عملياتها كاش فقط، افحص نموذج إغلاق الوردية<br>2. نفّذ بيعاً بالفيزا فقط، ثم أعد فحص نموذج الإغلاق | في الحالة (1) يظهر حقل الدرج النقدي فقط؛ في الحالة (2) يظهر حقل الفيزا مع المتوقع الخاص به دون إظهار InstaPay أو Wallet. | — | Not Tested | Critical |
| SHF-04 | Close Shift & Separate Reconciliation | إغلاق الوردية ومطابقة كل وسيلة دفع بشكل منفصل (`PATCH /shift/close`) | 1. في وردية فيها 300 كاش + 100 فيزا + افتتاح 500:<br>2. أدخل `closingCash = 800` و`closingVisa = 100`<br>3. اضغط إغلاق الوردية | إغلاق الوردية بحالة `balanced` للدرج (`expectedCash = 800`, `difference = 0`) ومطابقة منفصلة للفيزا (`expectedVisa = 100`, `visaDifference = 0`) دون تداخل. | — | Not Tested | Critical |
| SHF-05 | Owner Shift Monitoring | متابعة الورديات النشطة وسجل وتقارير الورديات عند المالك | 1. افتح قسم الورديات عند المالك<br>2. افحص الورديات المفتوحة، سجل الورديات، وتفاصيل وردية مغلقة | ظهور كل من الكاش، الفيزا، InstaPay، والمحافظ بشكل مفصل ومنفصل في التقارير وتفاصيل الوردية. | — | Not Tested | High |

---

## 9. Reports & Analytics (التقارير والتحليلات)

| Test ID | Feature | Test Scenario | Steps | Expected Result | Actual Result | Status | Priority |
|---|---|---|---|---|---|---|---|
| REP-01 | Sales Report Accuracy | مطابقة تقرير المبيعات (`GET /sales-reports?from=...&to=...`) مع الفواتير الفعلية | 1. اختر فترة تاريخ تحتوي عمليات بيع ومرتجعات معروفة<br>2. قارن `grossSales`, `totalDiscounts`, `netSales`, `collectedAmount`, `outstandingAmount`, `netCashFlow` | تطابق الأرقام 100% مع مجموع الفواتير والمرتجعات المسجلة، وتطابق تفصيل `paymentMethods` (`cash`, `visa`, `instapay`, `wallet`) مع المدفوعات. | — | Not Tested | Critical |
| REP-02 | Purchases Report Accuracy | مطابقة تقرير المشتريات (`GET /purchases-reports?from=...&to=...`) | 1. اختر فترة فيها فواتير شراء مكتملة ومسودات وملغاة<br>2. افحص الإجماليات والرسوم البيانية | تطابق عدد الفواتير وحالاتها وإجمالي المدفوع والمتبقي للموردين مع قاعدة البيانات. | — | Not Tested | High |
| REP-03 | Returns Report Accuracy | مطابقة تقرير المرتجعات (`GET /returns-reports?from=...&to=...`) | 1. اختر فترة فيها مرتجعات هواتف وإكسسوارات<br>2. افحص الرسوم البيانية والإجماليات | تطابق عدد القطع المرتجعة (هواتف/إكسسوارات) والمبالغ المستردة والمعلقة. | — | Not Tested | High |
| REP-04 | Timeline & Date Validation | عمل الرسوم الزمنية اليومية وفحص التواريخ غير الصالحة | 1. اختر فترة متعددة الأيام وتحقق من نقاط الرسم الزمني (`timeline`)<br>2. جرب `from > to` | عرض بيانات حقيقية مجمعة يومياً (بدون بيانات وهمية)؛ ورفض `from > to` برسالة `400 Bad Request`. | — | Not Tested | High |

---

## 10. UI/UX (تجربة المستخدم والواجهة)

| Test ID | Feature | Test Scenario | Steps | Expected Result | Actual Result | Status | Priority |
|---|---|---|---|---|---|---|---|
| UI-01 | RTL & Arabic | اتجاه الصفحة `dir="rtl"` وسلامة النصوص العربية | 1. تصفح `/login` وجميع تبويبات `/dashboard`<br>2. افحص محاذاة الجداول، النماذج، والأيقونات | جميع الشاشات تدعم RTL بشكل سليم، والأرقام/التواريخ/الأكواد (`INV-...`, `RET-...`) منسقة بوضوح دون تداخل. | — | Not Tested | High |
| UI-02 | Responsive Design | التجاوب على الشاشات الصغيرة (Mobile) والمتوسطة (Tablet) والكبيرة | 1. افتح DevTools وجرّب عرض `375px` و`768px` و`1440px` على المبيعات والتقارير والرسوم البيانية | عدم خروج أي عنصر أو رسم بياني عن حدود البطاقة، وعمل قائمة الـ Sidebar على الموبايل بسلاسة. | — | Not Tested | High |
| UI-03 | Dark / Light Mode | التبديل بين الوضع الفاتح والداكن (`ThemeToggle`) | 1. بدّل الثيم في `/login` وفي `DashboardHeader`<br>2. افحص التباين في النماذج والجداول والرسوم البيانية | وضوح النصوص وحدود البطاقات والألوان في كلا الوضعين دون اختفاء أي عنصر. | — | Not Tested | Medium |
| UI-04 | States & Toasts | حالات التحميل (`Loading`) والفراغ (`Empty`) والأخطاء (`Error`) وإشعارات `Sonner` | 1. راقب مؤشرات التحميل أثناء جلب البيانات<br>2. اختر يوماً بلا عمليات<br>3. نفّذ عملية ناجحة وفاشلة | ظهور Spinners عند التحميل، رسائل واضحة عند الفراغ، وإشعارات Toast دقيقة للنجاح والخطأ. | — | Not Tested | Medium |

---

## 11. Production & Security (الإنتاج والأمان)

| Test ID | Feature | Test Scenario | Steps | Expected Result | Actual Result | Status | Priority |
|---|---|---|---|---|---|---|---|
| PROD-SEC-01 | Cross-Site Cookies & Proxy | عمل Cookies المصادقة بين Vercel وRender عبر `/api/:path*` rewrite | 1. سجل الدخول على `https://elsory-store-three.vercel.app`<br>2. افحص تبويب Network لطلبات `/api/login` و`/api/profile`<br>3. حدّث الصفحة (`F5`) | تمرير Cookie بنجاح عبر Rewrite في `next.config.ts` مع `httpOnly: true`، ونجاح `/api/profile` بـ `200 OK` بعد الـ Refresh. | — | Not Tested | Critical |
| PROD-SEC-02 | CORS Configuration | التحقق من إعدادات CORS في `Backend/src/app.js` | 1. افحص قيمة `CLIENT_URL` على Render<br>2. أرسل طلباً من Origin غير مسموح به | السماح فقط للدومينات المحددة في `CLIENT_URL` مع `credentials: true` وعدم استخدام `origin: "*"`، ورفض أي Origin غير مصرح به. | — | Not Tested | Critical |
| PROD-SEC-03 | Environment Variables | مراجعة المتغيرات المطلوبة في Vercel وRender بدون كشف أسرار | 1. تحقق من Vercel (`NEXT_PUBLIC_API_URL` / `BACKEND_API_URL`)<br>2. تحقق من Render (`MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `NODE_ENV=production`, `TRUST_PROXY`) | جميع المتغيرات مضبوطة بالقيم الصحيحة للإنتاج وعدم وجود `localhost` في روابط الإنتاج. | — | Not Tested | Critical |
| PROD-SEC-04 | Secret Protection | التأكد من عدم تخزين JWT أو أسرار في `localStorage` أو كشفها في المتصفح | 1. افحص `Application -> Local Storage / Session Storage` وملفات الـ JS المبنية في المتصفح | عدم وجود `JWT` أو `JWT_SECRET` أو بيانات حساسة في `localStorage` أو Responses. | — | Not Tested | Critical |
| PROD-SEC-05 | API & Route Protection | حماية جميع المسارات الحساسة بـ `middleware` و`authorize` و`helmet` | 1. أرسل طلبات بدون Cookie إلى `/sales`, `/purchase`, `/users`, `/shift/active`, `/sales-reports`<br>2. افحص Security Headers (`helmet`) | رفض جميع الطلبات غير المصرح بها بـ `401 Unauthorized`، ووجود ترويسات الحماية القياسية من `helmet`. | — | Not Tested | Critical |

---

## 12. الأتمتة والاختبارات الآلية الموجودة (Automation)

### 1. Backend (`Backend/package.json` & `Backend/test/backend.integration.test.js`)
- **الأداة المستخدمة حالياً:** `node --test` (مدمجة في Node.js — **لا تحتاج Jest أو أي Dependencies جديدة**).
- **أمر التشغيل (من مجلد `Backend` على فرع `backend`):**
  ```bash
  npm test
  ```
- **ما تغطيه الاختبارات الموجودة في `Backend/test/backend.integration.test.js`:**
  - تسجيل الحسابات والدخول والصلاحيات (`owner`, `cashier`, `phone_seller`, `accessories_seller`, `general`).
  - إدارة المنتجات والمخزون، الموردين، المشتريات، المبيعات، المرتجعات، الورديات، والتقارير.
- **ملاحظة تشغيلية:** اختبار التكامل يتطلب اتصالاً بقاعدة بيانات MongoDB اختبارية (حسب إعدادات البيئة في `Backend`).

### 2. Frontend (`Frontend/package.json`)
- **الأدوات الموجودة حالياً:** TypeScript (`tsc`)، ESLint (`eslint-config-next`)، وNext.js Build. (لا يوجد Jest أو Playwright مثبت حالياً؛ يمكن الاكتفاء بالأدوات الحالية دون إضافة حزم جديدة إلا إذا تقرر لاحقاً إضافة E2E).
- **أوامر التحقق الآلي المتاحة (من مجلد `Frontend` على فرع `frontend`):**
  ```bash
  npx next typegen
  npx tsc --noEmit
  npm run lint
  npm run build
  ```
- **ملاحظة:** يجب تشغيل `npx next typegen` أو `npm run build` عند إضافة أو حذف صفحات App Router قبل تشغيل `npx tsc --noEmit` لتجنب أخطاء `.next` القديمة.
