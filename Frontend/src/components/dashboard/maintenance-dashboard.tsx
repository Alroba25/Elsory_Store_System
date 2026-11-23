"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileSearch,
  Info,
  Loader2,
  Package,
  PackageSearch,
  RefreshCw,
  Search,
} from "lucide-react";
import type { AuthUser } from "@/src/components/providers/auth-provider";
import { ROLE_CONFIGURATIONS } from "@/src/components/dashboard/dashboard-config";
import { DashboardLayout } from "@/src/components/dashboard/dashboard-layout";
import {
  DashboardApiError,
  fetchMaintenanceCatalog,
  type StoreProductItem,
} from "@/src/services/dashboard.service";

interface MaintenanceDashboardProps {
  user: AuthUser;
}

/**
 * Dedicated workspace for the `maintenance_seller` role, backed by GET /products/maintenance.
 */
export function MaintenanceDashboard({ user }: MaintenanceDashboardProps) {
  const roleConfig = ROLE_CONFIGURATIONS.maintenance_seller;
  const [activeSectionId, setActiveSectionId] = useState<string>("catalog");

  const [products, setProducts] = useState<StoreProductItem[]>([]);
  const [totalProducts, setTotalProducts] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [sortOption, setSortOption] = useState<
    "newest" | "price_asc" | "price_desc"
  >("newest");
  const [selectedProduct, setSelectedProduct] =
    useState<StoreProductItem | null>(null);

  const fetchAndApplyMaintenance = useCallback(async () => {
    try {
      const response = await fetchMaintenanceCatalog({
        limit: 100,
        sort: sortOption,
      });
      setProducts(response.products);
      setTotalProducts(response.totalProducts);
      setSelectedProduct((prev) => {
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
          : "تعذر تحميل كتالوج الصيانة من الخادم";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [sortOption]);

  const loadMaintenance = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    await fetchAndApplyMaintenance();
  }, [fetchAndApplyMaintenance]);

  useEffect(() => {
    const initCatalog = async () => {
      await fetchAndApplyMaintenance();
    };
    void initCatalog();
  }, [fetchAndApplyMaintenance]);

  const filteredBySearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const b = brandFilter.trim().toLowerCase();
    return products.filter((item) => {
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        (item.model && item.model.toLowerCase().includes(q)) ||
        (item.barcode && item.barcode.toLowerCase().includes(q));
      const matchesBrand = !b || item.brand.toLowerCase().includes(b);
      return matchesQuery && matchesBrand;
    });
  }, [products, searchQuery, brandFilter]);

  const handleInspectProduct = (product: StoreProductItem) => {
    setSelectedProduct(product);
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
        {/* Department Role & Workflow Banner */}
        <section className="rounded-3xl border border-[#242424] bg-[#111111] p-6 sm:p-8 text-[#F5F5F5] shadow-lg">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#242424] bg-[#1A1A1D] px-3.5 py-1 text-xs font-semibold text-[#60a5fa]">
                <Package className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{roleConfig.accentLabel}</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F5F5]">
                مساحة عمل قسم الصيانة — {user.name}
              </h2>
              <p className="text-sm sm:text-base leading-relaxed text-[#A6A6A6]">
                {roleConfig.summaryAr}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:min-w-65">
              <div className="rounded-2xl border border-[#242424] bg-[#1A1A1D] px-4 py-3 text-xs">
                <div className="text-[#A6A6A6]">
                  إجمالي أصناف الصيانة المتاحة
                </div>
                <div className="text-xl font-bold text-[#F5F5F5] mt-1">
                  {totalProducts} صنف
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[#2563EB]/30 bg-[#2563EB]/10 px-4 py-3 text-xs text-[#93c5fd]">
                <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>البيع وإصدار الفواتير يتم حصرياً عبر الكاشير</span>
              </div>
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-5 py-4 text-sm text-danger"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="font-medium">{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadMaintenance()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-danger/30 bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-secondary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : null}

        {/* SECTION 1: CATALOG */}
        {activeSectionId === "catalog" ? (
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  كتالوج منتجات الصيانة
                </h3>
                <p className="text-xs text-muted">
                  أصناف الصيانة وقطع الغيار النشطة والمتاحة حالياً في المتجر
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  aria-label="ترتيب منتجات الصيانة"
                  value={sortOption}
                  onChange={(e) =>
                    setSortOption(
                      e.target.value as "newest" | "price_asc" | "price_desc",
                    )
                  }
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground focus:border-[#2563EB] focus:outline-none"
                >
                  <option value="newest">الأحدث أولاً</option>
                  <option value="price_asc">الأقل سعراً</option>
                  <option value="price_desc">الأعلى سعراً</option>
                </select>

                <button
                  type="button"
                  onClick={() => void loadMaintenance()}
                  disabled={isLoading}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface-secondary disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  <span>تحديث</span>
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex min-h-55 flex-col items-center justify-center gap-3 text-muted">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
                <span className="text-xs font-medium">
                  جاري تحميل كتالوج الصيانة...
                </span>
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-background/60 p-10 text-center space-y-2">
                <Package className="mx-auto h-8 w-8 text-muted" />
                <h4 className="text-sm font-bold text-foreground">
                  لا توجد منتجات صيانة متاحة حالياً
                </h4>
                <p className="text-xs text-muted">
                  عند إضافة منتجات صيانة بواسطة المالك ستظهر هنا تلقائياً.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-border bg-background p-5 flex flex-col justify-between gap-4 hover:border-[#2563EB]/40 transition-colors"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="inline-flex items-center rounded-lg bg-[#2563EB]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#2563EB]">
                          {item.brand}
                        </span>
                        <span className="inline-flex items-center rounded-lg bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success">
                          الكمية: {item.quantity}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-foreground">
                        {item.name}
                      </h4>
                      {item.model ? (
                        <p className="text-xs text-muted">
                          الموديل: {item.model}
                        </p>
                      ) : null}
                      {item.barcode ? (
                        <p
                          dir="ltr"
                          className="text-[11px] font-mono text-muted text-right"
                        >
                          {item.barcode}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <div className="text-sm font-bold text-foreground">
                        {item.sellingPrice} ج.م
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInspectProduct(item)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-secondary"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>التفاصيل</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {/* SECTION 2: SEARCH */}
        {activeSectionId === "search" ? (
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <PackageSearch className="h-5 w-5 text-[#2563EB]" />
                <h3 className="text-lg font-bold text-foreground">
                  البحث عن منتج صيانة
                </h3>
              </div>
              <p className="text-xs text-muted mt-1">
                ابحث بالاسم أو الباركود أو العلامة التجارية للتحقق السريع
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-muted" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث بالاسم أو الموديل أو الباركود..."
                  className="h-11 w-full rounded-xl border border-border bg-background pr-10 pl-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
                />
              </div>
              <input
                type="search"
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                placeholder="تصفية حسب الماركة (Apple, Samsung...)"
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
              />
            </div>

            <div className="divide-y divide-border rounded-2xl border border-border bg-background">
              {filteredBySearch.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted">
                  لا توجد نتائج مطابقة للبحث
                </div>
              ) : (
                filteredBySearch.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-4"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-foreground">
                        {item.name} —{" "}
                        <span className="text-[#2563EB]">{item.brand}</span>
                      </div>
                      <div className="text-xs text-muted">
                        السعر: {item.sellingPrice} ج.م • المتاح: {item.quantity}{" "}
                        {item.barcode ? `• باركود: ${item.barcode}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInspectProduct(item)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>عرض</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        {/* SECTION 3: DETAILS */}
        {activeSectionId === "details" ? (
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="border-b border-border pb-4 flex items-center gap-2.5">
              <FileSearch className="h-5 w-5 text-[#2563EB]" />
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  تفاصيل منتج الصيانة
                </h3>
                <p className="text-xs text-muted">
                  البيانات التفصيلية والمواصفات المسجلة للصنف المحدد
                </p>
              </div>
            </div>

            {selectedProduct ? (
              <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-bold text-foreground">
                      {selectedProduct.name}
                    </h4>
                    <p className="text-xs text-muted">
                      {selectedProduct.brand}
                      {selectedProduct.model
                        ? ` — ${selectedProduct.model}`
                        : ""}
                    </p>
                  </div>
                  <span className="rounded-xl bg-[#2563EB]/10 px-3 py-1 text-sm font-bold text-[#2563EB]">
                    {selectedProduct.sellingPrice} ج.م
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">الكمية المتاحة</span>
                    <strong className="text-sm text-foreground">
                      {selectedProduct.quantity}
                    </strong>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">الباركود</span>
                    <strong
                      dir="ltr"
                      className="text-sm font-mono text-foreground"
                    >
                      {selectedProduct.barcode || "—"}
                    </strong>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">القسم</span>
                    <strong className="text-sm text-foreground">
                      منتجات الصيانة
                    </strong>
                  </div>
                </div>

                {selectedProduct.specifications &&
                Object.keys(selectedProduct.specifications).length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-foreground">
                      المواصفات
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      {Object.entries(selectedProduct.specifications).map(
                        ([key, val]) => (
                          <div
                            key={key}
                            className="rounded-lg border border-border bg-surface px-3 py-2"
                          >
                            <span className="text-muted">{key}: </span>
                            <strong className="text-foreground">
                              {String(val)}
                            </strong>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}

                {selectedProduct.notes ? (
                  <p className="text-xs text-muted border-t border-border pt-3">
                    ملاحظات: {selectedProduct.notes}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center text-xs text-muted">
                اختر منتجاً من الكتالوج لعرض تفاصيله
              </div>
            )}
          </section>
        ) : null}

        {/* SECTION 4: AVAILABILITY */}
        {activeSectionId === "availability" ? (
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="border-b border-border pb-4 flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  توفر منتجات الصيانة
                </h3>
                <p className="text-xs text-muted">
                  نظرة سريعة على الكميات المتوفرة لكل صنف في قسم الصيانة
                </p>
              </div>
            </div>

            <div className="divide-y divide-border rounded-2xl border border-border bg-background">
              {products.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted">
                  لا توجد أصناف صيانة متاحة حالياً
                </div>
              ) : (
                products.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs"
                  >
                    <div>
                      <strong className="text-sm text-foreground">
                        {item.name}
                      </strong>
                      <span className="text-muted"> — {item.brand}</span>
                    </div>
                    <span className="rounded-lg bg-success/10 px-2.5 py-1 font-bold text-success">
                      متاح: {item.quantity} قطعة
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
