"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, Loader2, RefreshCw, Search } from "lucide-react";
import {
  DayFilterBar,
  filterBySelectedDay,
  toLocalYmd,
  type DayFilterMode,
} from "@/src/components/dashboard/day-filter-bar";
import {
  DashboardApiError,
  fetchSaleById,
  fetchSalesList,
  type StoreSaleRecord,
} from "@/src/services/dashboard.service";
import { OWNER_PAYMENT_METHOD_LABELS } from "@/src/components/dashboard/owner/owner-helpers";

export function OwnerSalesSection() {
  const [salesSearch, setSalesSearch] = useState<string>("");
  const [sales, setSales] = useState<StoreSaleRecord[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState<boolean>(false);
  const [selectedSale, setSelectedSale] = useState<StoreSaleRecord | null>(
    null,
  );
  const [salesDayMode, setSalesDayMode] = useState<DayFilterMode>("today");
  const [salesCustomDate, setSalesCustomDate] = useState<string>(() =>
    toLocalYmd(),
  );

  const loadSales = useCallback(async (search?: string) => {
    setIsLoadingSales(true);
    try {
      const res = await fetchSalesList({ limit: 30, search });
      setSales(res.data);
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر جلب سجل المبيعات",
      );
    } finally {
      setIsLoadingSales(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadSales();
    };
    void init();
  }, [loadSales]);

  return (
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-foreground">
                    مراقبة المبيعات والفواتير
                  </h3>
                  <span className="rounded-md bg-[#2563EB]/10 px-2.5 py-0.5 text-xs font-bold text-[#2563EB]">
                    عرض فقط (View Only)
                  </span>
                </div>
                <p className="text-xs text-muted mt-1">
                  استعراض فواتير المبيعات الصادرة عبر الكاشير وتفاصيلها
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadSales(salesSearch)}
                disabled={isLoadingSales}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoadingSales ? "animate-spin" : ""}`}
                />
                <span>تحديث</span>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadSales(salesSearch);
              }}
              className="flex gap-3"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="search"
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  placeholder="ابحث برقم الفاتورة (INV-...) أو اسم العميل أو الهاتف..."
                  className="h-11 w-full rounded-xl border border-border bg-background pr-10 pl-4 text-xs sm:text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="h-11 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-5 text-xs font-semibold"
              >
                بحث
              </button>
            </form>

            <DayFilterBar
              mode={salesDayMode}
              customDate={salesCustomDate}
              onModeChange={setSalesDayMode}
              onCustomDateChange={setSalesCustomDate}
              totalCount={sales.length}
              filteredCount={
                filterBySelectedDay(
                  sales,
                  (s) => s.saleDate,
                  salesDayMode,
                  salesCustomDate,
                ).length
              }
              itemLabel="فاتورة"
            />

            {isLoadingSales ? (
              <div className="flex min-h-[180px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
              </div>
            ) : filterBySelectedDay(
                sales,
                (s) => s.saleDate,
                salesDayMode,
                salesCustomDate,
              ).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
                <p className="text-sm font-semibold text-foreground">
                  لا توجد فواتير مبيعات مطابقة في هذا اليوم
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-background">
                {filterBySelectedDay(
                  sales,
                  (s) => s.saleDate,
                  salesDayMode,
                  salesCustomDate,
                ).map((sale) => (
                  <div
                    key={sale.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          dir="ltr"
                          className="text-sm font-bold font-mono text-foreground"
                        >
                          {sale.invoiceNumber}
                        </span>
                        <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted border border-border">
                          {sale.paymentStatus}
                        </span>
                        {sale.payments.map((pmt, pIdx) => (
                          <span
                            key={`${pmt.method}-${pIdx}`}
                            className="rounded-md border border-[#2563EB]/30 bg-[#2563EB]/10 px-2 py-0.5 text-[11px] font-bold text-[#2563EB]"
                          >
                            {OWNER_PAYMENT_METHOD_LABELS[pmt.method] ??
                              pmt.method}
                            : {pmt.amount} ج.م
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span>الصافي: {sale.finalAmount} ج.م</span>
                        <span>المدفوع: {sale.paidAmount} ج.م</span>
                        <span>الكاشير: {sale.cashierName}</span>
                        {sale.customerName ? (
                          <span>العميل: {sale.customerName}</span>
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const detail = await fetchSaleById(sale.id);
                          setSelectedSale(detail);
                        } catch {
                          toast.error("تعذر جلب تفاصيل الفاتورة");
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground hover:border-[#2563EB]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>عرض التفاصيل</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedSale ? (
              <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <h4 className="text-base font-bold text-foreground">
                      تفاصيل الفاتورة{" "}
                      <span dir="ltr" className="font-mono text-[#2563EB]">
                        {selectedSale.invoiceNumber}
                      </span>
                    </h4>
                    <p className="text-xs text-muted">
                      الكاشير: {selectedSale.cashierName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSale(null)}
                    className="text-xs font-semibold text-muted hover:text-foreground"
                  >
                    إغلاق
                  </button>
                </div>

                {/* Paid Payment Methods Breakdown */}
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 text-xs">
                  <span className="font-bold text-foreground">
                    طرق الدفع المسجلة:
                  </span>
                  {selectedSale.payments.length === 0 ? (
                    <span className="text-muted">لم تُسجل دفعات</span>
                  ) : (
                    selectedSale.payments.map((pmt, pIdx) => (
                      <span
                        key={`${pmt.method}-${pIdx}`}
                        className="rounded-lg border border-[#2563EB]/30 bg-[#2563EB]/10 px-2.5 py-1 font-bold text-[#2563EB]"
                      >
                        {OWNER_PAYMENT_METHOD_LABELS[pmt.method] ?? pmt.method}:{" "}
                        {pmt.amount} ج.م
                      </span>
                    ))
                  )}
                </div>

                <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                  {selectedSale.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-foreground">
                          {item.productName}
                        </span>{" "}
                        <span className="text-muted">({item.brand})</span>
                        {item.imei ? (
                          <span dir="ltr" className="ml-2 font-mono text-muted">
                            IMEI: {item.imei}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 text-muted">
                        <span>الكمية: {item.quantity}</span>
                        <span>السعر: {item.unitPrice} ج.م</span>
                        <strong className="text-foreground">
                          الإجمالي: {item.lineTotal} ج.م
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
  );
}
