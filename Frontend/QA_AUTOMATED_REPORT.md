# تقرير الاختبارات الآلية — ELSORY STORE (`QA_AUTOMATED_REPORT.md`)

> **تاريخ التنفيذ:** 2026-11-19
> **النطاق:** تنفيذ جميع الاختبارات والفحوصات الآلية الموجودة فعلياً في **Backend** (فرع `backend`، Commit `d199eb2`) و**Frontend** (فرع `frontend`) دون تعديل أي كود أو تثبيت Dependencies جديدة.

---

## 1. ملخص نتائج الأوامر المنفذة

| الجانب | الأمر المنفذ | النتيجة | ملاحظات مختصرة |
|---|---|---|---|
| **Backend** | `npm test` (`node --test`) | **FAIL** | فشل اختبار التكامل الوحيد عند السطر `513` (`Expected HTTP 400, got 409`) قبل استكمال بقية مراحل الاختبار. |
| **Frontend** | `npx next typegen` | **PASS** | تم توليد أنواع المسارات (`✓ Types generated successfully`) دون أخطاء. |
| **Frontend** | `npx tsc --noEmit` | **PASS** | انتهى بنجاح (`exit code 0`) دون أي أخطاء TypeScript. |
| **Frontend** | `npm run lint` (`eslint`) | **PASS** | انتهى بنجاح (`exit code 0`) دون أي أخطاء أو تحذيرات ESLint. |
| **Frontend** | `npm run build` (`next build` — Turbopack) | **FAIL** | فشل ببناء Turbopack عند `[project]/app/globals.css.css` (`TurbopackInternalError: Failed to write app endpoint /page`). |
| **Frontend** *(تشخيص إضافي)* | `npx next build --webpack` | **PASS** | نجح البناء الكامل عبر Webpack وتوليد 6/6 صفحات ثابتة دون أخطاء. |

---

## 2. تفاصيل الاختبارات والأخطاء كاملة

### أ) Backend: `npm test` (`node --test`) — **FAIL**

- **ملف الاختبار:** `Backend/test/backend.integration.test.js`
- **إحصائية التشغيل:** `tests 1 | pass 0 | fail 1 | duration_ms 23327.356`
- **تفاصيل الخطأ:**
  - الاختبار عند `Backend/test/backend.integration.test.js:177:1` (`auth, permissions, inventory, purchases, sales, returns, refunds, reports, and product archive`) فشل عند:
    - `Backend/test/backend.integration.test.js:513:5` (استدعاء `expectStatus` في `Backend/test/backend.integration.test.js:40:10`)
  - **نص الخطأ الفعلي:**
    ```text
    AssertionError [ERR_ASSERTION]: Expected HTTP 400, got 409: {"success":false,"message":"You must have an open shift to create a sale"}
    409 !== 400
    ```
  - **سلسلة التنفيذ المسببة (`sales.controllers.js`):**
    - `Backend/src/controllers/sales.controllers.js:83:5` (`createSale`)
    - `Backend/src/controllers/sales.controllers.js:91:15` (`throw new Error("SHIFT_NOT_OPEN")`)
  - **السبب:** الاختبار في `backend.integration.test.js:513` يرسل طلب `POST /sales` ببيانات غير صالحة متوقعاً `400`، بينما المتحكم `createSale` يتحقق أولاً من وجود وردية مفتوحة للكاشير فيرجع `409 Conflict` قبل التحقق من صحة بقية الحقول/الأصناف.
  - **تحذيرات Mongoose المطبوعة أثناء التشغيل:**
    - `Warning: mongoose: the 'new' option for 'findOneAndUpdate()' and 'findOneAndReplace()' is deprecated. Use 'returnDocument: 'after'' instead.` (ظهرت 6 مرات).

---

### ب) Frontend: `npx next typegen` — **PASS**

- **المخرجات:**
  ```text
  Generating route types...
  ✓ Types generated successfully
  ```

---

### ج) Frontend: `npx tsc --noEmit` — **PASS**

- **المخرجات:** `exit code 0` (لا توجد أخطاء TypeScript في أي ملف).

---

### د) Frontend: `npm run lint` (`eslint`) — **PASS**

- **المخرجات:** `exit code 0` (لا توجد أخطاء أو تحذيرات ESLint).

---

### هـ) Frontend: `npm run build` (`next build` — Turbopack) — **FAIL**

- **تفاصيل الخطأ (عند التشغيل مع توفر الشبكة):**
  - فشل البناء الافتراضي (`Next.js 16.4.6 (Turbopack)`) مرتين متتاليتين:
    ```text
    Error [TurbopackInternalError]: Failed to write app endpoint /page

    Caused by:
    - [project]/app/globals.css.css [app-client] (css)
    - creating new process
    - node process exited before we could connect to it with exit code: 0
    ```
  - **ملاحظة بيئية إضافية (داخل الـ Sandbox بدون إنترنت):** فشل أيضاً بسبب `next/font`:
    - `[next]/internal/font/google/ibm_plex_sans_arabic_6c23fe30.module.css` (`Failed to fetch IBM Plex Sans Arabic from Google Fonts`).
- **التحقق البديل (`npx next build --webpack`):** **PASS**
  - تم البناء بنجاح خلال `15.2s` + فحص TypeScript خلال `8.5s` + توليد `6/6` صفحات ثابتة (`/`, `/_not-found`, `/dashboard`, `/icon.png`, `/login`).
  - هذا يؤكد أن كود الـ Frontend نفسه سليم وقابل للبناء، وأن الفشل في `npm run build` محصور في تكامل Turbopack + CSS loader (`@tailwindcss/turbopack` / `next.config.ts`) على بيئة Windows الحالية.

---

## 3. الاختبارات التي لم يمكن تشغيلها أو لم تغطَّ آلياً

1. **بقية مراحل اختبار التكامل في Backend (`sales`, `returns`, `refunds`, `reports`, `product archive`):**
   - توجد في `Backend/test/backend.integration.test.js` بعد السطر `513`، لكنها **لم تُنفذ** لأن `node --test` أوقف الاختبار الواحد المتكامل فور فشل الـ Assertion في السطر `513`.
2. **اختبارات Unit / E2E لواجهة Frontend (Jest / Playwright / Cypress):**
   - **غير موجودة** في المشروع (`Frontend/package.json` لا يحتوي أي إطار اختبارات)، وبالتالي لم يتم اختبار تدفقات المتصفح والواجهة آلياً.

---

## 4. تقييم الجاهزية للانتقال للاختبارات اليدوية

- **الوضع العام:** **جاهز جزئياً — يمكن البدء بالاختبارات اليدوية مع تسجيل ملاحظتين واضحتين:**
  1. **الـ Frontend:** جاهز تماماً لاختبارات الـ QA اليدوية (`next typegen` و`tsc` و`eslint` و`next build --webpack` جميعها **PASS**)، لكن يجب التحقق من نجاح `npm run build` على بيئة **Vercel (Linux)** أو التبديل لـ `--webpack` إذا تكرر خطأ Turbopack على Vercel.
  2. **الـ Backend:** مسارات التسجيل والمصادقة والصلاحيات والمنتجات والمشتريات تعمل حتى نقطة البيع في `backend.integration.test.js`، لكن اختبار التكامل الآلي يحتاج تحديث ترتيب فتح الوردية (أو توقع `409`) في `Backend/test/backend.integration.test.js:513` حتى تكتمل تغطية اختبارات المبيعات والمرتجعات والورديات والتقارير آلياً.
  3. **الأولوية في الاختبار اليدوي الآن:** التركيز على اختبارات **POS & Sales**، **Shifts (فصل الكاش عن الفيزا/InstaPay/المحافظ)**، **Returns**، و**Reports & Analytics** على البيئة الفعلية، لأنها الأجزاء التي توقف قبلها اختبار التكامل الآلي في Backend.
