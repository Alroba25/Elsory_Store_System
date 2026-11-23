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
  fetchReturnById,
  fetchReturnsList,
  type StoreReturnRecord,
} from "@/src/services/dashboard.service";

export function OwnerReturnsSection() {
  const [returnsInvoiceFilter, setReturnsInvoiceFilter] = useState<string>("");
  const [returnsList, setReturnsList] = useState<StoreReturnRecord[]>([]);
  const [isLoadingReturns, setIsLoadingReturns] = useState<boolean>(false);
  const [selectedReturn, setSelectedReturn] =
    useState<StoreReturnRecord | null>(null);
  const [returnsDayMode, setReturnsDayMode] = useState<DayFilterMode>("today");
  const [returnsCustomDate, setReturnsCustomDate] = useState<string>(() =>
    toLocalYmd(),
  );

  const loadReturns = useCallback(async (invoiceNumber?: string) => {
    setIsLoadingReturns(true);
    try {
      const res = await fetchReturnsList({ limit: 30, invoiceNumber });
      setReturnsList(res.data);
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر جلب سجل المرتجعات",
      );
    } finally {
      setIsLoadingReturns(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadReturns();
    };
    void init();
  }, [loadReturns]);

  return (
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-foreground">
                    مراقبة المرتجعات
                  </h3>
                  <span className="rounded-md bg-[#2563EB]/10 px-2.5 py-0.5 text-xs font-bold text-[#2563EB]">
                    عرض فقط (View Only)
                  </span>
                </div>
                <p className="text-xs text-muted mt-1">
                  استعراض سجل المرتجعات وتفاصيلها
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadReturns(returnsInvoiceFilter)}
                disabled={isLoadingReturns}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoadingReturns ? "animate-spin" : ""}`}
                />
                <span>تحديث</span>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadReturns(returnsInvoiceFilter);
              }}
              className="flex gap-3"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="search"
                  value={returnsInvoiceFilter}
                  onChange={(e) => setReturnsInvoiceFilter(e.target.value)}
                  placeholder="تصفية المرتجعات برقم الفاتورة (INV-...)..."
                  className="h-11 w-full rounded-xl border border-border bg-background pr-10 pl-4 text-xs sm:text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="h-11 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-5 text-xs font-semibold"
              >
                تصفية
              </button>
            </form>

            <DayFilterBar
              mode={returnsDayMode}
              customDate={returnsCustomDate}
              onModeChange={setReturnsDayMode}
              onCustomDateChange={setReturnsCustomDate}
              totalCount={returnsList.length}
              filteredCount={
                filterBySelectedDay(
                  returnsList,
                  (r) => r.returnDate,
                  returnsDayMode,
                  returnsCustomDate,
                ).length
              }
              itemLabel="مرتجع"
            />

            {isLoadingReturns ? (
              <div className="flex min-h-[180px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
              </div>
            ) : filterBySelectedDay(
                returnsList,
                (r) => r.returnDate,
                returnsDayMode,
                returnsCustomDate,
              ).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
                <p className="text-sm font-semibold text-foreground">
                  لا توجد مرتجعات مسجلة في هذا اليوم
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-background">
                {filterBySelectedDay(
                  returnsList,
                  (r) => r.returnDate,
                  returnsDayMode,
                  returnsCustomDate,
                ).map((ret) => (
                  <div
                    key={ret.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-4"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-foreground">
                        <span dir="ltr" className="font-mono">
                          {ret.returnNumber}
                        </span>{" "}
                        — فاتورة:{" "}
                        <span dir="ltr" className="font-mono text-muted">
                          {ret.invoiceNumber}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span>إجمالي المرتجع: {ret.totalRefundAmount} ج.م</span>
                        <span>المسترد فعلياً: {ret.refundedAmount} ج.م</span>
                        <span>الكاشير: {ret.cashierName}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const d = await fetchReturnById(ret.id);
                          setSelectedReturn(d);
                        } catch {
                          setSelectedReturn(ret);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>التفاصيل</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedReturn ? (
              <div className="rounded-2xl border border-border bg-background p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h4 className="text-sm font-bold text-foreground">
                    تفاصيل المرتجع {selectedReturn.returnNumber}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setSelectedReturn(null)}
                    className="text-xs font-semibold text-muted hover:text-foreground"
                  >
                    إغلاق
                  </button>
                </div>
                <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                  {selectedReturn.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-foreground">
                          {item.productName}
                        </span>
                        {item.reason ? (
                          <span className="text-muted">
                            {" "}
                            — السبب: {item.reason}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-muted">
                        الكمية: {item.quantity} • قيمة الاسترداد:{" "}
                        <strong className="text-foreground">
                          {item.refundAmount} ج.م
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
