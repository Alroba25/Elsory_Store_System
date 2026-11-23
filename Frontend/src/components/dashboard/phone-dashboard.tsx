"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Eye,
  FileSearch,
  Info,
  Loader2,
  PackageSearch,
  RefreshCw,
  Search,
  Smartphone,
} from "lucide-react";
import type { AuthUser } from "@/src/components/providers/auth-provider";
import { ROLE_CONFIGURATIONS } from "@/src/components/dashboard/dashboard-config";
import { DashboardLayout } from "@/src/components/dashboard/dashboard-layout";
import {
  DashboardApiError,
  fetchPhonesCatalog,
  type StoreProductItem,
} from "@/src/services/dashboard.service";

interface PhoneDashboardProps {
  user: AuthUser;
}

export function PhoneDashboard({ user }: PhoneDashboardProps) {
  const roleConfig = ROLE_CONFIGURATIONS.phone_seller;
  const [activeSectionId, setActiveSectionId] = useState<string>("catalog");

  const [phones, setPhones] = useState<StoreProductItem[]>([]);
  const [totalPhones, setTotalPhones] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [sortOption, setSortOption] = useState<
    "newest" | "price_asc" | "price_desc"
  >("newest");
  const [selectedPhone, setSelectedPhone] = useState<StoreProductItem | null>(
    null,
  );

  const fetchAndApplyPhones = useCallback(async () => {
    try {
      const response = await fetchPhonesCatalog({
        limit: 100,
        sort: sortOption,
      });
      setPhones(response.products);
      setTotalPhones(response.totalProducts);
      setSelectedPhone((prev) => {
        if (!response.products.length) return null;
        if (prev) {
          return (
            response.products.find((item) => item.id === prev.id) ??
            response.products[0]
          );
        }
        return response.products[0];
      });
      setErrorMessage(null);
    } catch (error: unknown) {
      const msg =
        error instanceof DashboardApiError
          ? error.message
          : "تعذر تحميل كتالوج الهواتف من الخادم";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [sortOption]);

  const loadPhones = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    await fetchAndApplyPhones();
  }, [fetchAndApplyPhones]);

  useEffect(() => {
    const initCatalog = async () => {
      await fetchAndApplyPhones();
    };
    void initCatalog();
  }, [fetchAndApplyPhones]);

  const searchedPhones = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const b = brandFilter.trim().toLowerCase();
    return phones.filter((item) => {
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        (item.model && item.model.toLowerCase().includes(q)) ||
        (item.barcode && item.barcode.toLowerCase().includes(q)) ||
        (item.imei && item.imei.toLowerCase().includes(q));
      const matchesBrand = !b || item.brand.toLowerCase().includes(b);
      return matchesQuery && matchesBrand;
    });
  }, [phones, searchQuery, brandFilter]);

  const availablePhones = useMemo(
    () => phones.filter((item) => item.quantity > 0),
    [phones],
  );

  const handleInspectPhone = (phone: StoreProductItem) => {
    setSelectedPhone(phone);
    setActiveSectionId("details");
  };

  return (
    <DashboardLayout
      user={user}
      roleConfig={roleConfig}
      activeSectionId={activeSectionId}
      onSelectSection={setActiveSectionId}
    >
      <div className="space-y-8">
        {/* Phones & Apple Workspace Header */}
        <section className="relative overflow-hidden rounded-3xl border border-[#242424] bg-[#111111] p-6 sm:p-8 text-[#F5F5F5] shadow-xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/4 h-64 w-64 rounded-full bg-[#2563EB]/15 blur-3xl"
          />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[#242424] bg-[#1A1A1D] px-3.5 py-1 text-xs font-semibold text-[#F5F5F5]">
                <Award className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
                <span>{roleConfig.accentLabel}</span>
                <span className="text-[#A6A6A6]">•</span>
                <span className="text-[#A6A6A6]">موزع معتمد لمنتجات Apple</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F5F5]">
                مساحة عمل قسم الموبايلات — {user.name}
              </h2>
              <p className="text-sm sm:text-base leading-relaxed text-[#A6A6A6]">
                {roleConfig.summaryAr}
              </p>
            </div>

            <div className="flex flex-col gap-3 shrink-0 rounded-2xl border border-[#242424] bg-[#18181B] p-4 max-w-xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F5F5]">
                <Info
                  className="h-4 w-4 shrink-0 text-[#2563EB]"
                  aria-hidden="true"
                />
                <span>ضوابط العمل بالقسم</span>
              </div>
              <p className="text-xs leading-relaxed text-[#A6A6A6]">
                يقوم مسؤول الموبايلات باستعراض الهواتف وفحص تفاصيلها وأسعارها
                لمساعدة العميل، وتتم عملية البيع وإصدار الفاتورة حصرياً من خلال
                الكاشير.
              </p>
            </div>
          </div>
        </section>

        {/* Section Switcher Bar + Sort & Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {roleConfig.navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSectionId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSectionId(item.id)}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs sm:text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-[#2563EB] text-white shadow-xs"
                      : "border border-border bg-surface text-foreground hover:bg-surface-secondary"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="ترتيب الهواتف"
              value={sortOption}
              onChange={(e) =>
                setSortOption(
                  e.target.value as "newest" | "price_asc" | "price_desc",
                )
              }
              className="h-10 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground focus:border-[#2563EB] focus:outline-none"
            >
              <option value="newest">الأحدث إضافة</option>
              <option value="price_asc">السعر: من الأقل للأعلى</option>
              <option value="price_desc">السعر: من الأعلى للأقل</option>
            </select>

            <button
              type="button"
              onClick={loadPhones}
              disabled={isLoading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface-secondary disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {/* Loading or Error States */}
        {isLoading ? (
          <div className="flex min-h-65 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface p-8">
            <Loader2
              className="h-6 w-6 animate-spin text-[#2563EB]"
              aria-hidden="true"
            />
            <p className="text-sm text-muted">
              جاري جلب كتالوج الهواتف من الخادم...
            </p>
          </div>
        ) : errorMessage ? (
          <div
            role="alert"
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-danger/30 bg-danger/10 p-6 text-danger"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="h-5 w-5 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h3 className="text-sm font-bold">
                  تعذر جلب بيانات قسم الهواتف
                </h3>
                <p className="text-xs sm:text-sm opacity-90">{errorMessage}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={loadPhones}
              className="shrink-0 rounded-xl bg-danger px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <>
            {/* SECTION 1: PHONES CATALOG */}
            {activeSectionId === "catalog" ? (
              <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">
                      كتالوج الهواتف الذكية ومنتجات Apple
                    </h3>
                    <p className="text-xs text-muted">
                      جميع الهواتف النشطة المتوفرة في قسم الموبايلات
                    </p>
                  </div>
                  <span className="rounded-lg border border-border bg-surface-secondary px-3 py-1 text-xs font-semibold text-foreground">
                    إجمالي الأجهزة المتوفرة: {totalPhones}
                  </span>
                </div>

                {phones.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background/60 p-10 text-center space-y-2">
                    <Smartphone
                      className="mx-auto h-8 w-8 text-muted"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-bold text-foreground">
                      لا توجد هواتف مسجلة في الكتالوج حالياً
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {phones.map((phone) => (
                      <article
                        key={phone.id}
                        className="flex flex-col justify-between rounded-2xl border border-border bg-background p-5 transition-colors hover:border-[#2563EB]/45"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2.5 py-0.5 text-[11px] font-bold text-success">
                              {phone.condition === "used" ? "مستعمل" : "جديد"} •
                              الكمية: {phone.quantity}
                            </span>
                            {phone.barcode ? (
                              <span
                                dir="ltr"
                                className="text-[11px] font-mono text-muted"
                              >
                                #{phone.barcode}
                              </span>
                            ) : null}
                          </div>

                          <h4 className="text-base font-bold text-foreground">
                            {phone.name}
                          </h4>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                            <span>الماركة: {phone.brand}</span>
                            {phone.model ? (
                              <span>• الموديل: {phone.model}</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-border flex items-center justify-between gap-3">
                          <div>
                            <span className="block text-[11px] text-muted">
                              سعر البيع
                            </span>
                            <span className="text-sm font-bold text-foreground">
                              {phone.sellingPrice} ج.م
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleInspectPhone(phone)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>التفاصيل</span>
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {/* SECTION 2: PRODUCT SEARCH */}
            {activeSectionId === "search" ? (
              <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-foreground">
                    البحث في كتالوج الهواتف
                  </h3>
                  <p className="text-xs sm:text-sm text-muted">
                    ابحث باسم الهاتف، الماركة، الموديل، أو الباركود.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="relative sm:col-span-2">
                    <Search
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ابحث باسم الهاتف أو الموديل أو الباركود..."
                      className="h-11 w-full rounded-xl border border-border bg-background pr-11 pl-4 text-sm text-foreground placeholder:text-muted focus:border-[#2563EB] focus:outline-none"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={brandFilter}
                      onChange={(e) => setBrandFilter(e.target.value)}
                      placeholder="تصفية حسب الماركة (Apple, Samsung...)"
                      className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted focus:border-[#2563EB] focus:outline-none"
                    />
                  </div>
                </div>

                {searchedPhones.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
                    <PackageSearch
                      className="mx-auto h-7 w-7 text-muted mb-2"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-foreground">
                      لا توجد هواتف مطابقة لبحثك
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border rounded-xl border border-border bg-background">
                    {searchedPhones.map((phone) => (
                      <div
                        key={phone.id}
                        className="flex flex-wrap items-center justify-between gap-4 p-4"
                      >
                        <div className="space-y-1">
                          <div className="text-sm font-bold text-foreground">
                            {phone.name}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                            <span>الماركة: {phone.brand}</span>
                            {phone.model ? (
                              <span>الموديل: {phone.model}</span>
                            ) : null}
                            {phone.barcode ? (
                              <span dir="ltr">Barcode: {phone.barcode}</span>
                            ) : null}
                            <span>الكمية: {phone.quantity}</span>
                            <span className="font-semibold text-foreground">
                              السعر: {phone.sellingPrice} ج.م
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleInspectPhone(phone)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                        >
                          <FileSearch
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          <span>عرض التفاصيل</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {/* SECTION 3: PRODUCT DETAILS (READ-ONLY) */}
            {activeSectionId === "details" ? (
              <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
                <div className="border-b border-border pb-4">
                  <h3 className="text-lg font-bold text-foreground">
                    بطاقة تفاصيل الجهاز
                  </h3>
                  <p className="text-xs text-muted">
                    عرض بيانات الهاتف المسترجعة من النظام للرد على استفسارات
                    العملاء
                  </p>
                </div>

                {!selectedPhone ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center space-y-3">
                    <FileSearch
                      className="mx-auto h-8 w-8 text-muted"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-foreground">
                      لم يتم اختيار هاتف لعرض تفاصيله
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <div className="lg:col-span-8 rounded-2xl border border-border bg-background p-6 space-y-5">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                        <div>
                          <h4 className="text-xl font-bold text-foreground">
                            {selectedPhone.name}
                          </h4>
                          {selectedPhone.barcode ? (
                            <p
                              dir="ltr"
                              className="text-xs font-mono text-muted mt-1"
                            >
                              Barcode: {selectedPhone.barcode}
                            </p>
                          ) : null}
                        </div>
                        <span className="rounded-lg bg-success/10 px-3 py-1 text-xs font-bold text-success">
                          الكمية المتوفرة: {selectedPhone.quantity}
                        </span>
                      </div>

                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
                        <div className="rounded-xl border border-border bg-surface p-3.5">
                          <dt className="text-muted mb-1">سعر البيع</dt>
                          <dd className="font-bold text-foreground text-base">
                            {selectedPhone.sellingPrice} ج.م
                          </dd>
                        </div>
                        <div className="rounded-xl border border-border bg-surface p-3.5">
                          <dt className="text-muted mb-1">الماركة والموديل</dt>
                          <dd className="font-semibold text-foreground">
                            {selectedPhone.brand}{" "}
                            {selectedPhone.model
                              ? `— ${selectedPhone.model}`
                              : ""}
                          </dd>
                        </div>
                        <div className="rounded-xl border border-border bg-surface p-3.5">
                          <dt className="text-muted mb-1">حالة الجهاز</dt>
                          <dd className="font-semibold text-foreground">
                            {selectedPhone.condition === "used"
                              ? "مستعمل (Used)"
                              : "جديد (New)"}
                            {selectedPhone.batteryHealth !== undefined
                              ? ` • صحة البطارية: ${selectedPhone.batteryHealth}%`
                              : ""}
                          </dd>
                        </div>
                        <div className="rounded-xl border border-border bg-surface p-3.5">
                          <dt className="text-muted mb-1">رقم IMEI</dt>
                          <dd
                            dir="ltr"
                            className="font-mono font-semibold text-foreground text-right"
                          >
                            {selectedPhone.imei || "غير مسجل"}
                          </dd>
                        </div>
                      </dl>

                      {selectedPhone.notes ? (
                        <div className="rounded-xl border border-border bg-surface p-4 space-y-1">
                          <div className="text-xs font-bold text-foreground">
                            ملاحظات الجهاز
                          </div>
                          <p className="text-xs sm:text-sm leading-relaxed text-muted">
                            {selectedPhone.notes}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="lg:col-span-4 rounded-2xl border border-[#242424] bg-[#111111] p-6 text-[#F5F5F5] flex flex-col justify-between space-y-4">
                      <div className="space-y-3">
                        <h4 className="text-sm font-bold text-[#F5F5F5]">
                          توجيه العميل لإتمام الشراء
                        </h4>
                        <p className="text-xs leading-relaxed text-[#A6A6A6]">
                          تتم عملية البيع وإصدار الفاتورة الرسمية حصرياً لدى{" "}
                          <strong className="text-[#F5F5F5]">الكاشير</strong>.
                          يرجى تزويد العميل أو الكاشير بباركود الجهاز لإتمام
                          عملية الدفع.
                        </p>
                      </div>

                      {selectedPhone.barcode ? (
                        <div className="rounded-xl border border-[#242424] bg-[#1A1A1D] p-3.5 text-center">
                          <div className="text-[11px] text-[#A6A6A6] mb-1">
                            الباركود للكاشير
                          </div>
                          <div
                            dir="ltr"
                            className="font-mono text-sm font-bold tracking-wider text-[#60a5fa]"
                          >
                            {selectedPhone.barcode}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </section>
            ) : null}

            {/* SECTION 4: AVAILABLE PHONES ONLY */}
            {activeSectionId === "available" ? (
              <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">
                      الهواتف المتاحة حالياً في الرصيد
                    </h3>
                    <p className="text-xs text-muted">
                      عرض للأجهزة المتوفرة حالياً في المخزون للقراءة فقط
                    </p>
                  </div>

                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-success/10 px-3.5 py-1.5 text-xs font-bold text-success">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span>عدد الأجهزة المتاحة: {availablePhones.length}</span>
                  </span>
                </div>

                {availablePhones.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
                    <p className="text-sm font-semibold text-foreground">
                      لا توجد هواتف متاحة حالياً
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {availablePhones.map((phone) => (
                      <div
                        key={phone.id}
                        className="flex flex-col justify-between rounded-2xl border border-border bg-background p-5"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded-md bg-success/10 px-2.5 py-0.5 text-[11px] font-bold text-success">
                              الكمية: {phone.quantity}
                            </span>
                            {phone.barcode ? (
                              <span
                                dir="ltr"
                                className="text-[11px] font-mono text-muted"
                              >
                                #{phone.barcode}
                              </span>
                            ) : null}
                          </div>

                          <h4 className="text-base font-bold text-foreground">
                            {phone.name}
                          </h4>
                          <div className="text-xs text-muted">
                            السعر:{" "}
                            <strong className="text-foreground">
                              {phone.sellingPrice} ج.م
                            </strong>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-border">
                          <button
                            type="button"
                            onClick={() => handleInspectPhone(phone)}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2 text-xs font-semibold text-foreground transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>عرض التفاصيل</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
