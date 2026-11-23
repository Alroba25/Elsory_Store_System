"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  DayFilterBar,
  filterBySelectedDay,
  toLocalYmd,
  type DayFilterMode,
} from "@/src/components/dashboard/day-filter-bar";
import {
  fetchActiveShiftsForOwner,
  fetchShiftByIdForOwner,
  fetchShiftHistory,
  fetchShiftReportsForOwner,
  type ShiftReportGroup,
  type StoreShiftRecord,
} from "@/src/services/dashboard.service";
import {
  getFirstDayOfMonthString,
  getTodayDateString,
} from "@/src/components/dashboard/owner/owner-helpers";

export function OwnerShiftsSection() {
  const [activeShifts, setActiveShifts] = useState<StoreShiftRecord[]>([]);
  const [shiftHistory, setShiftHistory] = useState<StoreShiftRecord[]>([]);
  const [shiftReports, setShiftReports] = useState<ShiftReportGroup[]>([]);
  const [selectedShiftDetail, setSelectedShiftDetail] =
    useState<StoreShiftRecord | null>(null);
  const [shiftStartDate, setShiftStartDate] = useState<string>(
    getFirstDayOfMonthString(),
  );
  const [shiftEndDate, setShiftEndDate] = useState<string>(
    getTodayDateString(),
  );
  const [isLoadingShifts, setIsLoadingShifts] = useState<boolean>(false);
  const [shiftsDayMode, setShiftsDayMode] = useState<DayFilterMode>("today");
  const [shiftsCustomDate, setShiftsCustomDate] = useState<string>(() =>
    toLocalYmd(),
  );

  const loadShifts = useCallback(
    async (startDate?: string, endDate?: string) => {
      setIsLoadingShifts(true);
      try {
        const [activeRes, historyRes, reportsRes] = await Promise.allSettled([
          fetchActiveShiftsForOwner(),
          fetchShiftHistory(),
          fetchShiftReportsForOwner({ startDate, endDate }),
        ]);
        if (activeRes.status === "fulfilled") setActiveShifts(activeRes.value);
        if (historyRes.status === "fulfilled")
          setShiftHistory(historyRes.value);
        if (reportsRes.status === "fulfilled")
          setShiftReports(reportsRes.value);
      } finally {
        setIsLoadingShifts(false);
      }
    },
    [],
  );

  useEffect(() => {
    const init = async () => {
      await loadShifts(shiftStartDate, shiftEndDate);
    };
    void init();
  }, [loadShifts, shiftStartDate, shiftEndDate]);

  return (
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  مراقبة الورديات وتقارير الخزينة
                </h3>
                <p className="text-xs text-muted">
                  الورديات النشطة، سجل الورديات، وتقارير أداء الكاشير
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={shiftStartDate}
                  onChange={(e) => setShiftStartDate(e.target.value)}
                  className="h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
                <input
                  type="date"
                  value={shiftEndDate}
                  onChange={(e) => setShiftEndDate(e.target.value)}
                  className="h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
                <button
                  type="button"
                  onClick={() => void loadShifts(shiftStartDate, shiftEndDate)}
                  disabled={isLoadingShifts}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#2563EB] px-3.5 text-xs font-semibold text-white"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isLoadingShifts ? "animate-spin" : ""}`}
                  />
                  <span>تحديث</span>
                </button>
              </div>
            </div>

            {isLoadingShifts ? (
              <div className="flex min-h-[180px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Shift Reports Summary Table */}
                {shiftReports.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-foreground">
                      ملخص تقارير الورديات حسب الكاشير
                    </h4>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {shiftReports.map((rep) => (
                        <div
                          key={rep.cashierId || rep.cashierName}
                          className="rounded-xl border border-border bg-background p-4 text-xs space-y-1.5"
                        >
                          <div className="font-bold text-sm text-foreground">
                            {rep.cashierName}
                          </div>
                          <div className="text-muted">
                            إجمالي الورديات: {rep.totalShifts} (مفتوحة:{" "}
                            {rep.openShifts} • مغلقة: {rep.closedShifts})
                          </div>
                          <div>
                            المبيعات النقدية (Cash):{" "}
                            <strong className="text-success">
                              {rep.totalCashSales} ج.م
                            </strong>
                          </div>
                          <div>
                            عجز الدرج: {rep.totalShortage} ج.م • زيادة الدرج:{" "}
                            {rep.totalOverage} ج.م
                          </div>
                          {rep.totalVisaSales > 0 ||
                          rep.totalVisaShortage > 0 ||
                          rep.totalVisaOverage > 0 ? (
                            <div className="text-[#2563EB]">
                              الفيزا (Visa): {rep.totalVisaSales} ج.م
                              {rep.totalVisaShortage > 0
                                ? ` • عجز: ${rep.totalVisaShortage}`
                                : ""}
                              {rep.totalVisaOverage > 0
                                ? ` • زيادة: ${rep.totalVisaOverage}`
                                : ""}
                            </div>
                          ) : null}
                          {rep.totalInstapaySales > 0 ||
                          rep.totalInstapayShortage > 0 ||
                          rep.totalInstapayOverage > 0 ? (
                            <div className="text-[#2563EB]">
                              إنستا باي (InstaPay): {rep.totalInstapaySales} ج.م
                              {rep.totalInstapayShortage > 0
                                ? ` • عجز: ${rep.totalInstapayShortage}`
                                : ""}
                              {rep.totalInstapayOverage > 0
                                ? ` • زيادة: ${rep.totalInstapayOverage}`
                                : ""}
                            </div>
                          ) : null}
                          {rep.totalWalletSales > 0 ||
                          rep.totalWalletShortage > 0 ||
                          rep.totalWalletOverage > 0 ? (
                            <div className="text-[#2563EB]">
                              المحافظ (Wallet): {rep.totalWalletSales} ج.م
                              {rep.totalWalletShortage > 0
                                ? ` • عجز: ${rep.totalWalletShortage}`
                                : ""}
                              {rep.totalWalletOverage > 0
                                ? ` • زيادة: ${rep.totalWalletOverage}`
                                : ""}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Active Shifts */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-foreground">
                      الورديات المفتوحة حالياً ({activeShifts.length})
                    </h4>
                    {activeShifts.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border bg-background/60 p-6 text-center text-xs text-muted">
                        لا توجد ورديات مفتوحة حالياً
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {activeShifts.map((sh) => (
                          <div
                            key={sh.id}
                            className="flex items-center justify-between rounded-xl border border-border bg-background p-4 text-xs"
                          >
                            <div className="space-y-1">
                              <div className="font-bold text-foreground">
                                الكاشير: {sh.cashierName}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-muted">
                                <span>الافتتاح: {sh.openingCash} ج.م</span>
                                <span>• المبيعات النقدية: {sh.totalCashSales} ج.م</span>
                                {sh.totalVisaSales > 0 ? (
                                  <span className="text-[#2563EB]">
                                    • فيزا: {sh.totalVisaSales} ج.م
                                  </span>
                                ) : null}
                                {sh.totalInstapaySales > 0 ? (
                                  <span className="text-[#2563EB]">
                                    • إنستا باي: {sh.totalInstapaySales} ج.م
                                  </span>
                                ) : null}
                                {sh.totalWalletSales > 0 ? (
                                  <span className="text-[#2563EB]">
                                    • محفظة: {sh.totalWalletSales} ج.م
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const d = await fetchShiftByIdForOwner(sh.id);
                                  setSelectedShiftDetail(d);
                                } catch {
                                  setSelectedShiftDetail(sh);
                                }
                              }}
                              className="rounded-lg border border-border bg-surface px-3 py-1.5 font-semibold text-foreground"
                            >
                              التفاصيل
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Shift History */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-foreground">
                      سجل الورديات حسب اليوم (
                      {
                        filterBySelectedDay(
                          shiftHistory,
                          (sh) => sh.openedAt,
                          shiftsDayMode,
                          shiftsCustomDate,
                        ).length
                      }
                      )
                    </h4>

                    <DayFilterBar
                      mode={shiftsDayMode}
                      customDate={shiftsCustomDate}
                      onModeChange={setShiftsDayMode}
                      onCustomDateChange={setShiftsCustomDate}
                      totalCount={shiftHistory.length}
                      filteredCount={
                        filterBySelectedDay(
                          shiftHistory,
                          (sh) => sh.openedAt,
                          shiftsDayMode,
                          shiftsCustomDate,
                        ).length
                      }
                      itemLabel="وردية"
                    />

                    {filterBySelectedDay(
                      shiftHistory,
                      (sh) => sh.openedAt,
                      shiftsDayMode,
                      shiftsCustomDate,
                    ).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border bg-background/60 p-6 text-center text-xs text-muted">
                        لا يوجد سجل ورديات في هذا اليوم
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-80 overflow-y-auto">
                        {filterBySelectedDay(
                          shiftHistory,
                          (sh) => sh.openedAt,
                          shiftsDayMode,
                          shiftsCustomDate,
                        ).map((sh) => (
                          <div
                            key={sh.id}
                            className="flex items-center justify-between rounded-xl border border-border bg-background p-4 text-xs"
                          >
                            <div className="space-y-1">
                              <div className="font-bold text-foreground">
                                {sh.cashierName} ({sh.status})
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-muted">
                                <span>الافتتاح: {sh.openingCash} ج.م</span>
                                {sh.closingCash !== undefined ? (
                                  <span>• الإغلاق: {sh.closingCash} ج.م</span>
                                ) : null}
                                {sh.totalVisaSales > 0 ? (
                                  <span>• فيزا: {sh.totalVisaSales} ج.م</span>
                                ) : null}
                                {sh.totalInstapaySales > 0 ? (
                                  <span>
                                    • إنستا باي: {sh.totalInstapaySales} ج.م
                                  </span>
                                ) : null}
                                {sh.totalWalletSales > 0 ? (
                                  <span>
                                    • محفظة: {sh.totalWalletSales} ج.م
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const d = await fetchShiftByIdForOwner(sh.id);
                                  setSelectedShiftDetail(d);
                                } catch {
                                  setSelectedShiftDetail(sh);
                                }
                              }}
                              className="rounded-lg border border-border bg-surface px-3 py-1.5 font-semibold text-foreground"
                            >
                              التفاصيل
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {selectedShiftDetail ? (
                  <div className="rounded-2xl border border-border bg-background p-5 space-y-4 text-xs">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <h5 className="font-bold text-sm text-foreground">
                        تفاصيل الوردية — الكاشير:{" "}
                        {selectedShiftDetail.cashierName}
                      </h5>
                      <button
                        type="button"
                        onClick={() => setSelectedShiftDetail(null)}
                        className="text-muted hover:text-foreground"
                      >
                        إغلاق
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="font-semibold text-muted">
                        تفاصيل الدرج النقدي (Cash)
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-border bg-surface p-2.5">
                          الافتتاح: {selectedShiftDetail.openingCash} ج.م
                        </div>
                        <div className="rounded-lg border border-border bg-surface p-2.5">
                          المبيعات النقدية: {selectedShiftDetail.totalCashSales}{" "}
                          ج.م
                        </div>
                        <div className="rounded-lg border border-border bg-surface p-2.5">
                          المرتجعات النقدية:{" "}
                          {selectedShiftDetail.totalCashRefunds} ج.م
                        </div>
                        <div className="rounded-lg border border-border bg-surface p-2.5">
                          الإيداعات / المسحوبات: +
                          {selectedShiftDetail.totalDeposits} / -
                          {selectedShiftDetail.totalWithdrawals} ج.م
                        </div>
                        {selectedShiftDetail.expectedCash !== undefined ? (
                          <div className="rounded-lg border border-border bg-surface p-2.5">
                            المتوقع بالدرج: {selectedShiftDetail.expectedCash}{" "}
                            ج.م
                          </div>
                        ) : null}
                        {selectedShiftDetail.closingCash !== undefined ? (
                          <div className="rounded-lg border border-border bg-surface p-2.5">
                            الفعلي عند الإغلاق:{" "}
                            {selectedShiftDetail.closingCash} ج.م
                          </div>
                        ) : null}
                        {selectedShiftDetail.difference !== undefined ? (
                          <div className="rounded-lg border border-border bg-surface p-2.5">
                            فارق الدرج: {selectedShiftDetail.difference} ج.م
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {[
                      {
                        key: "visa",
                        title: "ماكينة الفيزا (Visa)",
                        sales: selectedShiftDetail.totalVisaSales,
                        refunds: selectedShiftDetail.totalVisaRefunds,
                        expected: selectedShiftDetail.expectedVisa,
                        closing: selectedShiftDetail.closingVisa,
                        diff: selectedShiftDetail.visaDifference,
                      },
                      {
                        key: "instapay",
                        title: "إنستا باي (InstaPay)",
                        sales: selectedShiftDetail.totalInstapaySales,
                        refunds: selectedShiftDetail.totalInstapayRefunds,
                        expected: selectedShiftDetail.expectedInstapay,
                        closing: selectedShiftDetail.closingInstapay,
                        diff: selectedShiftDetail.instapayDifference,
                      },
                      {
                        key: "wallet",
                        title: "المحافظ الإلكترونية (Wallet)",
                        sales: selectedShiftDetail.totalWalletSales,
                        refunds: selectedShiftDetail.totalWalletRefunds,
                        expected: selectedShiftDetail.expectedWallet,
                        closing: selectedShiftDetail.closingWallet,
                        diff: selectedShiftDetail.walletDifference,
                      },
                    ]
                      .filter(
                        (ch) =>
                          ch.sales > 0 ||
                          ch.refunds > 0 ||
                          (ch.closing !== undefined && ch.closing > 0),
                      )
                      .map((ch) => (
                        <div
                          key={ch.key}
                          className="space-y-2 border-t border-border pt-3"
                        >
                          <div className="font-semibold text-[#2563EB]">
                            {ch.title}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            <div className="rounded-lg border border-[#2563EB]/25 bg-[#2563EB]/5 p-2.5">
                              المبيعات: {ch.sales} ج.م
                            </div>
                            <div className="rounded-lg border border-[#2563EB]/25 bg-[#2563EB]/5 p-2.5">
                              المرتجعات: {ch.refunds} ج.م
                            </div>
                            {ch.expected !== undefined ? (
                              <div className="rounded-lg border border-[#2563EB]/25 bg-[#2563EB]/5 p-2.5">
                                المتوقع: {ch.expected} ج.م
                              </div>
                            ) : null}
                            {ch.closing !== undefined ? (
                              <div className="rounded-lg border border-[#2563EB]/25 bg-[#2563EB]/5 p-2.5">
                                الفعلي: {ch.closing} ج.م
                              </div>
                            ) : null}
                            {ch.diff !== undefined ? (
                              <div className="rounded-lg border border-[#2563EB]/25 bg-[#2563EB]/5 p-2.5">
                                الفارق: {ch.diff} ج.م
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>
            )}
          </section>
  );
}
