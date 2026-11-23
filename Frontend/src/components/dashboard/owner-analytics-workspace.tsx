"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Calendar,
  Download,
  Loader2,
  PieChart,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  DashboardApiError,
  fetchPurchasesReportForOwner,
  fetchReturnsReportForOwner,
  fetchSalesReportForOwner,
  type PurchasesReportData,
  type ReturnsReportData,
  type SalesReportData,
} from "@/src/services/dashboard.service";
import { downloadAnalyticsReportPdf } from "@/src/utils/elsory-pdf-reports";

export type DatePresetId =
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "current_month"
  | "previous_month"
  | "current_year"
  | "custom";

export type AnalyticsSectionTab =
  | "overview"
  | "sales"
  | "purchases"
  | "returns"
  | "performance";

interface DateRangePair {
  from: string;
  to: string;
}

function formatYmdLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPresetDateRange(preset: Exclude<DatePresetId, "custom">): DateRangePair {
  const now = new Date();
  const todayStr = formatYmdLocal(now);

  switch (preset) {
    case "today":
      return { from: todayStr, to: todayStr };
    case "last_7_days": {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { from: formatYmdLocal(start), to: todayStr };
    }
    case "last_30_days": {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { from: formatYmdLocal(start), to: todayStr };
    }
    case "current_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: formatYmdLocal(start), to: todayStr };
    }
    case "previous_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: formatYmdLocal(start), to: formatYmdLocal(end) };
    }
    case "current_year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { from: formatYmdLocal(start), to: todayStr };
    }
  }
}

function formatEgp(amount: number): string {
  return `${Number(amount || 0).toLocaleString("ar-EG")} ج.م`;
}

function formatNumberAr(num: number): string {
  return Number(num || 0).toLocaleString("ar-EG");
}

function formatDateLabelAr(ymd: string): string {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("ar-EG", {
    month: "short",
    day: "numeric",
  });
}

interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

function SvgDonutChart({
  title,
  subtitle,
  slices,
  unitLabel = "فاتورة",
  emptyText = "لا توجد بيانات مسجلة في هذه الفترة",
}: {
  title: string;
  subtitle: string;
  slices: DonutSlice[];
  unitLabel?: string;
  emptyText?: string;
}) {
  const total = slices.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  const segments = slices.reduce<{
    items: Array<DonutSlice & { percentage: number; dashArray: string; dashOffset: number }>;
    accumulatedRatio: number;
  }>(
    (acc, slice) => {
      const val = Math.max(0, slice.value);
      const ratio = total > 0 ? val / total : 0;
      const percentage = Math.round(ratio * 100);
      const strokeLen = ratio * circumference;
      const dashArray = `${strokeLen} ${circumference - strokeLen}`;
      const dashOffset = -acc.accumulatedRatio * circumference;
      acc.items.push({
        ...slice,
        percentage,
        dashArray,
        dashOffset,
      });
      acc.accumulatedRatio += ratio;
      return acc;
    },
    { items: [], accumulatedRatio: 0 },
  ).items;

  return (
    <div className="flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-border bg-background p-5 shadow-2xs space-y-5">
      <div>
        <h4 className="text-sm font-bold text-foreground">{title}</h4>
        <p className="text-xs text-muted mt-0.5">{subtitle}</p>
      </div>

      {total === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 p-6 text-center">
          <PieChart className="h-7 w-7 text-muted mb-2" aria-hidden="true" />
          <p className="text-xs font-semibold text-muted">{emptyText}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 min-w-0 w-full">
          <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
            <svg
              viewBox="0 0 140 140"
              className="h-36 w-36 -rotate-90 transform"
              role="img"
              aria-label={title}
            >
              <circle
                cx="70"
                cy="70"
                r={radius}
                fill="transparent"
                stroke="currentColor"
                strokeWidth="16"
                className="text-border/40"
              />
              {segments.map((seg, idx) =>
                seg.value > 0 ? (
                  <circle
                    key={idx}
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="16"
                    strokeDasharray={seg.dashArray}
                    strokeDashoffset={seg.dashOffset}
                    strokeLinecap="butt"
                    className="transition-all duration-500"
                  >
                    <title>{`${seg.label}: ${formatNumberAr(seg.value)} ${unitLabel} (${seg.percentage}%)`}</title>
                  </circle>
                ) : null,
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <strong className="text-lg font-bold text-foreground">
                {formatNumberAr(total)}
              </strong>
              <span className="text-[11px] text-muted">{unitLabel}</span>
            </div>
          </div>

          <div className="w-full min-w-0 space-y-2">
            {segments.map((seg, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface px-3 py-2 text-xs min-w-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="font-semibold text-foreground truncate">
                    {seg.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <strong className="font-bold text-foreground">
                    {formatNumberAr(seg.value)}
                  </strong>
                  <span className="rounded-md bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted border border-border">
                    {seg.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ComparisonBarItem {
  label: string;
  value: number;
  color: string;
  helperText?: string;
}

function HorizontalComparisonChart({
  title,
  subtitle,
  items,
  isCurrency = true,
  emptyText = "لا توجد قيم مسجلة خلال هذه الفترة",
}: {
  title: string;
  subtitle: string;
  items: ComparisonBarItem[];
  isCurrency?: boolean;
  emptyText?: string;
}) {
  const maxVal = Math.max(...items.map((i) => Math.abs(i.value)), 0);

  return (
    <div className="flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-border bg-background p-5 shadow-2xs space-y-5">
      <div>
        <h4 className="text-sm font-bold text-foreground">{title}</h4>
        <p className="text-xs text-muted mt-0.5">{subtitle}</p>
      </div>

      {maxVal === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 p-6 text-center">
          <BarChart3 className="h-7 w-7 text-muted mb-2" aria-hidden="true" />
          <p className="text-xs font-semibold text-muted">{emptyText}</p>
        </div>
      ) : (
        <div className="space-y-3.5 my-auto">
          {items.map((item, idx) => {
            const widthPercent =
              maxVal > 0
                ? Math.max(4, Math.round((Math.abs(item.value) / maxVal) * 100))
                : 0;
            return (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-foreground">
                    {item.label}
                  </span>
                  <strong className="font-bold text-foreground">
                    {isCurrency
                      ? formatEgp(item.value)
                      : formatNumberAr(item.value)}
                  </strong>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-surface border border-border/60">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.value === 0 ? 0 : widthPercent}%`,
                      backgroundColor: item.color,
                    }}
                    title={`${item.label}: ${isCurrency ? formatEgp(item.value) : formatNumberAr(item.value)}`}
                  />
                </div>
                {item.helperText ? (
                  <p className="text-[11px] text-muted">{item.helperText}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CombinedTimelinePoint {
  date: string;
  netSales: number;
  collectedAmount: number;
  totalPurchases: number;
  returnedAmount: number;
  refundedAmount: number;
  netCashFlow: number;
  salesInvoicesCount: number;
  purchasesInvoicesCount: number;
  returnsCount: number;
}

const DATE_PRESETS: ReadonlyArray<{
  id: DatePresetId;
  label: string;
}> = [
  { id: "today", label: "اليوم" },
  { id: "last_7_days", label: "آخر 7 أيام" },
  { id: "last_30_days", label: "آخر 30 يومًا" },
  { id: "current_month", label: "الشهر الحالي" },
  { id: "previous_month", label: "الشهر السابق" },
  { id: "current_year", label: "السنة الحالية" },
  { id: "custom", label: "فترة مخصصة" },
];

const ANALYTICS_TABS: ReadonlyArray<{
  id: AnalyticsSectionTab;
  label: string;
}> = [
  { id: "overview", label: "نظرة عامة (Overview)" },
  { id: "sales", label: "تحليلات المبيعات" },
  { id: "purchases", label: "تحليلات المشتريات" },
  { id: "returns", label: "تحليلات المرتجعات" },
  { id: "performance", label: "الرسوم الزمنية والأداء" },
];

export function OwnerAnalyticsWorkspace({
  initialSectionTab = "overview",
}: {
  initialSectionTab?: AnalyticsSectionTab;
}) {
  const defaultRange = useMemo(() => getPresetDateRange("last_30_days"), []);
  const [activePreset, setActivePreset] =
    useState<DatePresetId>("last_30_days");
  const [fromDate, setFromDate] = useState<string>(defaultRange.from);
  const [toDate, setToDate] = useState<string>(defaultRange.to);
  const [activeTab, setActiveTab] =
    useState<AnalyticsSectionTab>(initialSectionTab);

  const [salesReport, setSalesReport] = useState<SalesReportData | null>(null);
  const [purchasesReport, setPurchasesReport] =
    useState<PurchasesReportData | null>(null);
  const [returnsReport, setReturnsReport] =
    useState<ReturnsReportData | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hoveredTimelinePoint, setHoveredTimelinePoint] =
    useState<CombinedTimelinePoint | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  const handleExportAnalyticsPdf = async () => {
    if (!salesReport || !purchasesReport || !returnsReport || isExportingPdf) {
      return;
    }
    setIsExportingPdf(true);
    try {
      await downloadAnalyticsReportPdf({
        salesReport,
        purchasesReport,
        returnsReport,
        fromDate,
        toDate,
      });
      toast.success("تم تحميل التقرير المالي الشامل (PDF) بنجاح");
    } catch {
      toast.error("تعذر إنشاء ملف PDF للتقرير المالي");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const loadAllReports = useCallback(async (from: string, to: string) => {
    if (!from || !to) {
      toast.error("يرجى تحديد تاريخ البداية وتاريخ النهاية");
      return;
    }
    if (from > to) {
      toast.error("تاريخ البداية لا يمكن أن يتجاوز تاريخ النهاية");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [salesRes, purchasesRes, returnsRes] = await Promise.all([
        fetchSalesReportForOwner(from, to),
        fetchPurchasesReportForOwner(from, to),
        fetchReturnsReportForOwner(from, to),
      ]);

      setSalesReport(salesRes);
      setPurchasesReport(purchasesRes);
      setReturnsReport(returnsRes);
    } catch (error: unknown) {
      const msg =
        error instanceof DashboardApiError
          ? error.message
          : "تعذر جلب بيانات التقارير المالية والتشغيلية من الخادم";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      try {
        const [salesRes, purchasesRes, returnsRes] = await Promise.all([
          fetchSalesReportForOwner(defaultRange.from, defaultRange.to),
          fetchPurchasesReportForOwner(defaultRange.from, defaultRange.to),
          fetchReturnsReportForOwner(defaultRange.from, defaultRange.to),
        ]);
        if (isCancelled) return;
        setSalesReport(salesRes);
        setPurchasesReport(purchasesRes);
        setReturnsReport(returnsRes);
        setErrorMessage(null);
      } catch (error: unknown) {
        if (isCancelled) return;
        const msg =
          error instanceof DashboardApiError
            ? error.message
            : "تعذر جلب بيانات التقارير المالية والتشغيلية من الخادم";
        setErrorMessage(msg);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [defaultRange.from, defaultRange.to]);

  const handleSelectPreset = (preset: DatePresetId) => {
    setActivePreset(preset);
    if (preset === "custom") return;

    const nextRange = getPresetDateRange(preset);
    setFromDate(nextRange.from);
    setToDate(nextRange.to);
    void loadAllReports(nextRange.from, nextRange.to);
  };

  const handleApplyCustomRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActivePreset("custom");
    void loadAllReports(fromDate, toDate);
  };

  // Merge real daily time-series points from Sales, Purchases, and Returns
  const combinedTimeline = useMemo<CombinedTimelinePoint[]>(() => {
    const map = new Map<string, CombinedTimelinePoint>();

    const ensureDate = (date: string): CombinedTimelinePoint => {
      const existing = map.get(date);
      if (existing) return existing;
      const created: CombinedTimelinePoint = {
        date,
        netSales: 0,
        collectedAmount: 0,
        totalPurchases: 0,
        returnedAmount: 0,
        refundedAmount: 0,
        netCashFlow: 0,
        salesInvoicesCount: 0,
        purchasesInvoicesCount: 0,
        returnsCount: 0,
      };
      map.set(date, created);
      return created;
    };

    for (const s of salesReport?.timeline ?? []) {
      if (!s.date) continue;
      const point = ensureDate(s.date);
      point.netSales = s.netSales;
      point.collectedAmount = s.collectedAmount;
      point.returnedAmount = s.returnedAmount;
      point.refundedAmount = s.refundedAmount;
      point.netCashFlow = s.netCashFlow;
      point.salesInvoicesCount = s.invoicesCount;
      point.returnsCount = s.returnsCount;
    }

    for (const p of purchasesReport?.timeline ?? []) {
      if (!p.date) continue;
      const point = ensureDate(p.date);
      point.totalPurchases = p.totalPurchases;
      point.purchasesInvoicesCount = p.invoicesCount;
    }

    for (const r of returnsReport?.timeline ?? []) {
      if (!r.date) continue;
      const point = ensureDate(r.date);
      if (r.returnedMerchandiseAmount > point.returnedAmount) {
        point.returnedAmount = r.returnedMerchandiseAmount;
      }
      if (r.actualRefundedAmount > point.refundedAmount) {
        point.refundedAmount = r.actualRefundedAmount;
      }
      if (r.returnsCount > point.returnsCount) {
        point.returnsCount = r.returnsCount;
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }, [salesReport, purchasesReport, returnsReport]);

  const maxTimelineAmount = useMemo(() => {
    let max = 0;
    for (const pt of combinedTimeline) {
      max = Math.max(
        max,
        pt.netSales,
        pt.totalPurchases,
        pt.returnedAmount,
        pt.collectedAmount,
      );
    }
    return max;
  }, [combinedTimeline]);

  return (
    <div className="space-y-6">
      {/* Top Filter & Period Control Bar */}
      <section
        aria-label="فلاتر الفترة الزمنية للتقارير"
        className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-2xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-foreground">
                مركز التحليلات والتقارير المالية — ELSORY STORE
              </h3>
              <span className="rounded-md bg-[#2563EB]/10 px-2.5 py-0.5 text-xs font-bold text-[#2563EB]">
                بيانات فعلية مباشرة
              </span>
            </div>
            <p className="text-xs text-muted mt-1">
              متابعة شاملة للمبيعات والمشتريات والمرتجعات والتدفق النقدي للمحل
              خلال الفترة المحددة ({fromDate} إلى {toDate})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExportAnalyticsPdf()}
              disabled={
                isLoading ||
                isExportingPdf ||
                !salesReport ||
                !purchasesReport ||
                !returnsReport
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isExportingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{isExportingPdf ? "جاري إنشاء PDF..." : "تحميل التقرير PDF"}</span>
            </button>

            <button
              type="button"
              onClick={() => void loadAllReports(fromDate, toDate)}
              disabled={isLoading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground transition-colors hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>تحديث البيانات</span>
            </button>
          </div>
        </div>

        {/* Quick Date Presets */}
        <div className="flex flex-wrap items-center gap-2">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={isLoading}
              onClick={() => handleSelectPreset(preset.id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                activePreset === preset.id
                  ? "bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] shadow-2xs"
                  : "border border-border bg-background text-muted hover:text-foreground"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Date Picker Inputs (Always visible & synchronized with preset) */}
        <form
          onSubmit={handleApplyCustomRange}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background p-3.5"
        >
          <div className="space-y-1">
            <label
              htmlFor="analytics-from-date"
              className="flex items-center gap-1.5 text-xs font-semibold text-foreground"
            >
              <Calendar className="h-3.5 w-3.5 text-[#2563EB]" />
              <span>من تاريخ</span>
            </label>
            <input
              id="analytics-from-date"
              type="date"
              required
              value={fromDate}
              max={toDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setActivePreset("custom");
              }}
              className="h-10 rounded-xl border border-border bg-surface px-3 text-xs font-medium text-foreground focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="analytics-to-date"
              className="flex items-center gap-1.5 text-xs font-semibold text-foreground"
            >
              <Calendar className="h-3.5 w-3.5 text-[#2563EB]" />
              <span>إلى تاريخ</span>
            </label>
            <input
              id="analytics-to-date"
              type="date"
              required
              value={toDate}
              min={fromDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setActivePreset("custom");
              }}
              className="h-10 rounded-xl border border-border bg-surface px-3 text-xs font-medium text-foreground focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <span>تطبيق الفترة</span>
          </button>

          {salesReport?.period.timeZone ? (
            <span className="mr-auto text-[11px] text-muted">
              النطاق الزمني للمحل:{" "}
              <strong dir="ltr" className="font-mono text-foreground">
                {salesReport.period.timeZone}
              </strong>
            </span>
          ) : null}
        </form>

        {/* Sub-navigation Tabs for Analytics Views */}
        <div
          role="tablist"
          aria-label="أقسام التحليلات والتقارير"
          className="flex flex-wrap items-center gap-2 pt-2 border-t border-border"
        >
          {ANALYTICS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? "bg-[#2563EB] text-white shadow-2xs"
                  : "border border-border bg-background text-foreground hover:border-[#2563EB]/40"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* Error State */}
      {errorMessage ? (
        <div
          role="alert"
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-danger/30 bg-danger/10 p-6 text-danger"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold">
                تعذر تحميل بيانات التقارير والتحليلات
              </h4>
              <p className="text-xs opacity-90">{errorMessage}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadAllReports(fromDate, toDate)}
            className="shrink-0 rounded-xl bg-danger px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : null}

      {/* Skeleton Loading State */}
      {isLoading ? (
        <div className="space-y-6" aria-busy="true" aria-label="جاري تحميل التقارير">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div
                key={idx}
                className="h-28 animate-pulse rounded-2xl border border-border bg-surface p-5 space-y-3"
              >
                <div className="h-3 w-24 rounded bg-border/70" />
                <div className="h-6 w-32 rounded bg-border" />
                <div className="h-2.5 w-20 rounded bg-border/60" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-72 animate-pulse rounded-2xl border border-border bg-surface p-6" />
            <div className="h-72 animate-pulse rounded-2xl border border-border bg-surface p-6" />
          </div>
        </div>
      ) : salesReport && purchasesReport && returnsReport ? (
        <>
          {/* =================================================================
           * TAB 1: OVERVIEW (أهم مؤشرات المحل الشاملة)
           * ================================================================= */}
          {activeTab === "overview" ? (
            <div className="space-y-6">
              {/* Primary 5 Executive KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>صافي المبيعات</span>
                    <TrendingUp className="h-4 w-4 text-[#2563EB]" />
                  </div>
                  <strong className="block text-xl font-bold text-foreground">
                    {formatEgp(salesReport.sales.netSales)}
                  </strong>
                  <p className="text-[11px] text-muted">
                    من إجمالي {formatNumberAr(salesReport.sales.totalInvoices)}{" "}
                    فاتورة بيع
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>إجمالي المشتريات</span>
                    <ShoppingBag className="h-4 w-4 text-[#2563EB]" />
                  </div>
                  <strong className="block text-xl font-bold text-foreground">
                    {formatEgp(purchasesReport.report.totalPurchases)}
                  </strong>
                  <p className="text-[11px] text-muted">
                    من إجمالي{" "}
                    {formatNumberAr(purchasesReport.report.totalInvoices)}{" "}
                    فاتورة شراء
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>قيمة المرتجعات</span>
                    <RotateCcw className="h-4 w-4 text-danger" />
                  </div>
                  <strong className="block text-xl font-bold text-danger">
                    {formatEgp(returnsReport.report.totalRefundAmount)}
                  </strong>
                  <p className="text-[11px] text-muted">
                    {formatNumberAr(returnsReport.report.totalReturns)} عملية (
                    {formatNumberAr(returnsReport.report.totalReturnItems)}{" "}
                    قطعة)
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>صافي المبيعات بعد المرتجعات</span>
                    <Activity className="h-4 w-4 text-[#2563EB]" />
                  </div>
                  <strong className="block text-xl font-bold text-[#2563EB]">
                    {formatEgp(salesReport.netSalesAfterReturns)}
                  </strong>
                  <p className="text-[11px] text-muted">
                    بعد خصم قيمة البضاعة المرتجعة
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>صافي التدفق النقدي للمبيعات</span>
                    <Wallet className="h-4 w-4 text-success" />
                  </div>
                  <strong className="block text-xl font-bold text-success">
                    {formatEgp(salesReport.netCashFlow)}
                  </strong>
                  <p className="text-[11px] text-muted">
                    المحصل ({formatEgp(salesReport.sales.collectedAmount)}) -
                    المسترد ({formatEgp(salesReport.returns.actualRefundedAmount)})
                  </p>
                </div>
              </div>

              {/* Overview Charts Grid */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <HorizontalComparisonChart
                  title="ملخص الحركة المالية للمحل خلال الفترة"
                  subtitle="مقارنة المبيعات والتحصيل والمشتريات والمرتجعات وصافي التدفق"
                  items={[
                    {
                      label: "إجمالي المبيعات (قبل الخصم)",
                      value: salesReport.sales.grossSales,
                      color: "#334155",
                    },
                    {
                      label: "صافي المبيعات (بعد الخصم)",
                      value: salesReport.sales.netSales,
                      color: "#2563EB",
                    },
                    {
                      label: "المبالغ المحصلة فعلياً من العملاء",
                      value: salesReport.sales.collectedAmount,
                      color: "#16a34a",
                    },
                    {
                      label: "إجمالي المشتريات من الموردين",
                      value: purchasesReport.report.totalPurchases,
                      color: "#7c3aed",
                    },
                    {
                      label: "قيمة البضاعة المرتجعة",
                      value: returnsReport.report.totalRefundAmount,
                      color: "#dc2626",
                    },
                  ]}
                />

                <SvgDonutChart
                  title="توزيع حالات سداد فواتير البيع"
                  subtitle="نسبة الفواتير المدفوعة بالكامل والجزئية وغير المدفوعة"
                  unitLabel="فاتورة"
                  slices={[
                    {
                      label: "مدفوعة بالكامل",
                      value: salesReport.paymentStatistics.fullyPaidInvoices,
                      color: "#16a34a",
                    },
                    {
                      label: "مدفوعة جزئياً",
                      value:
                        salesReport.paymentStatistics.partiallyPaidInvoices,
                      color: "#2563EB",
                    },
                    {
                      label: "غير مدفوعة (آجل)",
                      value: salesReport.paymentStatistics.unpaidInvoices,
                      color: "#dc2626",
                    },
                    {
                      label: "فواتير هدايا",
                      value: salesReport.paymentStatistics.giftInvoices,
                      color: "#a855f7",
                    },
                  ]}
                />
              </div>
            </div>
          ) : null}

          {/* =================================================================
           * TAB 2: SALES ANALYTICS (تحليلات المبيعات)
           * ================================================================= */}
          {activeTab === "sales" ? (
            <div className="space-y-6">
              {/* All Sales Report Metrics Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    إجمالي المبيعات قبل الخصومات
                  </span>
                  <strong className="text-lg font-bold text-foreground">
                    {formatEgp(salesReport.sales.grossSales)}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    عدد فواتير البيع:{" "}
                    {formatNumberAr(salesReport.sales.totalInvoices)}
                  </span>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    إجمالي الخصومات الممنوحة
                  </span>
                  <strong className="text-lg font-bold text-foreground">
                    {formatEgp(salesReport.sales.totalDiscounts)}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    فواتير الهدايا:{" "}
                    {formatNumberAr(salesReport.paymentStatistics.giftInvoices)}
                  </span>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    صافي المبيعات
                  </span>
                  <strong className="text-lg font-bold text-[#2563EB]">
                    {formatEgp(salesReport.sales.netSales)}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    بعد المرتجعات: {formatEgp(salesReport.netSalesAfterReturns)}
                  </span>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    المبلغ المحصل فعلياً
                  </span>
                  <strong className="text-lg font-bold text-success">
                    {formatEgp(salesReport.sales.collectedAmount)}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    صافي التدفق النقدي: {formatEgp(salesReport.netCashFlow)}
                  </span>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    المبالغ المستحقة على الفواتير
                  </span>
                  <strong className="text-lg font-bold text-danger">
                    {formatEgp(salesReport.sales.currentOutstandingAmount)}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    إجمالي الآجل المسجل:{" "}
                    {formatEgp(salesReport.sales.outstandingAmount)}
                  </span>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    الفواتير المدفوعة كلياً
                  </span>
                  <strong className="text-lg font-bold text-success">
                    {formatNumberAr(
                      salesReport.paymentStatistics.fullyPaidInvoices,
                    )}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    مسددة بالكامل
                  </span>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    الفواتير المدفوعة جزئياً
                  </span>
                  <strong className="text-lg font-bold text-[#2563EB]">
                    {formatNumberAr(
                      salesReport.paymentStatistics.partiallyPaidInvoices,
                    )}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    عليها مبالغ متبقية
                  </span>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    الفواتير غير المدفوعة
                  </span>
                  <strong className="text-lg font-bold text-danger">
                    {formatNumberAr(
                      salesReport.paymentStatistics.unpaidInvoices,
                    )}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    لم يتم تحصيل دفعات منها
                  </span>
                </div>
              </div>

              {/* Payment Methods Breakdown (Cash vs Visa vs InstaPay vs Wallet) */}
              {salesReport.paymentMethods ? (
                <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      تفصيل التحصيل والمرتجعات حسب طريقة الدفع
                    </h4>
                    <p className="text-[11px] text-muted">
                      فصل كامل بين الكاش بالدرج وماكينة الفيزا وInstaPay والمحافظ
                      الإلكترونية
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      {
                        key: "cash",
                        label: "النقدي (Cash)",
                        data: salesReport.paymentMethods.cash,
                      },
                      {
                        key: "visa",
                        label: "الفيزا (Visa)",
                        data: salesReport.paymentMethods.visa,
                      },
                      {
                        key: "instapay",
                        label: "إنستا باي (InstaPay)",
                        data: salesReport.paymentMethods.instapay,
                      },
                      {
                        key: "wallet",
                        label: "المحافظ الإلكترونية (Wallet)",
                        data: salesReport.paymentMethods.wallet,
                      },
                    ].map((channel) => (
                      <div
                        key={channel.key}
                        className="rounded-xl border border-border bg-background p-4 space-y-2 text-xs"
                      >
                        <div className="font-bold text-foreground">
                          {channel.label}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted">المحصل:</span>
                          <strong className="text-success">
                            {formatEgp(channel.data.collected)}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted">المرتجع المسترد:</span>
                          <strong className="text-danger">
                            {formatEgp(channel.data.refunded)}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between border-t border-border pt-2">
                          <span className="font-semibold text-foreground">
                            الصافي:
                          </span>
                          <strong className="text-[#2563EB]">
                            {formatEgp(channel.data.net)}
                          </strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Sales Charts */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <SvgDonutChart
                  title="توزيع حالات الدفع لفواتير البيع"
                  subtitle="تصنيف فواتير المبيعات حسب حالة التحصيل"
                  unitLabel="فاتورة"
                  slices={[
                    {
                      label: "مدفوعة بالكامل",
                      value: salesReport.paymentStatistics.fullyPaidInvoices,
                      color: "#16a34a",
                    },
                    {
                      label: "مدفوعة جزئياً",
                      value:
                        salesReport.paymentStatistics.partiallyPaidInvoices,
                      color: "#2563EB",
                    },
                    {
                      label: "غير مدفوعة",
                      value: salesReport.paymentStatistics.unpaidInvoices,
                      color: "#dc2626",
                    },
                    {
                      label: "هدايا مجانية",
                      value: salesReport.paymentStatistics.giftInvoices,
                      color: "#a855f7",
                    },
                  ]}
                />

                <HorizontalComparisonChart
                  title="المبيعات والخصومات والتحصيل"
                  subtitle="مقارنة إجمالي المبيعات بالخصومات والمبالغ المحصلة والمستحقة"
                  items={[
                    {
                      label: "إجمالي المبيعات (Gross Sales)",
                      value: salesReport.sales.grossSales,
                      color: "#334155",
                    },
                    {
                      label: "صافي المبيعات (Net Sales)",
                      value: salesReport.sales.netSales,
                      color: "#2563EB",
                    },
                    {
                      label: "المبلغ المحصل (Collected)",
                      value: salesReport.sales.collectedAmount,
                      color: "#16a34a",
                    },
                    {
                      label: "إجمالي الخصومات (Discounts)",
                      value: salesReport.sales.totalDiscounts,
                      color: "#f59e0b",
                    },
                    {
                      label: "المتبقي المستحق حالياً",
                      value: salesReport.sales.currentOutstandingAmount,
                      color: "#dc2626",
                    },
                  ]}
                />

                <HorizontalComparisonChart
                  title="تأثير المرتجعات والاستردادات على المبيعات"
                  subtitle={`إجمالي عمليات المرتجع: ${formatNumberAr(salesReport.returns.totalReturns)} (${formatNumberAr(salesReport.returns.totalReturnedItems)} قطعة)`}
                  items={[
                    {
                      label: "صافي المبيعات بعد المرتجعات",
                      value: salesReport.netSalesAfterReturns,
                      color: "#2563EB",
                    },
                    {
                      label: "صافي التدفق النقدي",
                      value: salesReport.netCashFlow,
                      color: "#16a34a",
                    },
                    {
                      label: "قيمة البضاعة المرتجعة",
                      value: salesReport.returns.totalReturnedAmount,
                      color: "#f59e0b",
                    },
                    {
                      label: "المبالغ المستردة نقداً للعملاء",
                      value: salesReport.returns.actualRefundedAmount,
                      color: "#dc2626",
                    },
                    {
                      label: "مبالغ استرداد معلقة للعملاء",
                      value: salesReport.returns.pendingRefundAmount,
                      color: "#7c3aed",
                    },
                  ]}
                />
              </div>
            </div>
          ) : null}

          {/* =================================================================
           * TAB 3: PURCHASES ANALYTICS (تحليلات المشتريات)
           * ================================================================= */}
          {activeTab === "purchases" ? (
            <div className="space-y-6">
              {/* Purchases KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    إجمالي المشتريات المعتمدة
                  </span>
                  <strong className="text-lg font-bold text-[#2563EB]">
                    {formatEgp(purchasesReport.report.totalPurchases)}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    إجمالي الفواتير:{" "}
                    {formatNumberAr(purchasesReport.report.totalInvoices)}
                  </span>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    إجمالي المدفوع للموردين
                  </span>
                  <strong className="text-lg font-bold text-success">
                    {formatEgp(purchasesReport.report.totalPaid)}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    فواتير مسددة كلياً:{" "}
                    {formatNumberAr(purchasesReport.report.fullyPaid)}
                  </span>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    المبالغ المتبقية للموردين
                  </span>
                  <strong className="text-lg font-bold text-danger">
                    {formatEgp(purchasesReport.report.totalRemaining)}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    جزئياً: {formatNumberAr(purchasesReport.report.partiallyPaid)}{" "}
                    • غير مدفوعة:{" "}
                    {formatNumberAr(purchasesReport.report.unpaid)}
                  </span>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    حالات فواتير الشراء
                  </span>
                  <strong className="text-lg font-bold text-foreground">
                    {formatNumberAr(purchasesReport.report.completed)} مكتملة
                  </strong>
                  <span className="text-[11px] text-muted block">
                    مسودة: {formatNumberAr(purchasesReport.report.draft)} •
                    ملغاة: {formatNumberAr(purchasesReport.report.cancelled)}
                  </span>
                </div>
              </div>

              {/* Purchases Charts */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <SvgDonutChart
                  title="حالات فواتير الشراء"
                  subtitle="توزيع فواتير المشتريات بين مكتملة ومسودات وملغاة"
                  unitLabel="فاتورة"
                  slices={[
                    {
                      label: "مكتملة (Completed)",
                      value: purchasesReport.report.completed,
                      color: "#16a34a",
                    },
                    {
                      label: "مسودة قيد التسجيل (Draft)",
                      value: purchasesReport.report.draft,
                      color: "#f59e0b",
                    },
                    {
                      label: "ملغاة (Cancelled)",
                      value: purchasesReport.report.cancelled,
                      color: "#dc2626",
                    },
                  ]}
                />

                <SvgDonutChart
                  title="توزيع حالات السداد للموردين"
                  subtitle="تصنيف فواتير الشراء الفعالة حسب حالة الدفع"
                  unitLabel="فاتورة"
                  slices={[
                    {
                      label: "مدفوعة بالكامل",
                      value: purchasesReport.report.fullyPaid,
                      color: "#16a34a",
                    },
                    {
                      label: "مدفوعة جزئياً",
                      value: purchasesReport.report.partiallyPaid,
                      color: "#2563EB",
                    },
                    {
                      label: "غير مدفوعة (آجل)",
                      value: purchasesReport.report.unpaid,
                      color: "#dc2626",
                    },
                  ]}
                />

                <HorizontalComparisonChart
                  title="المدفوع للموردين مقابل المتبقي"
                  subtitle="مقارنة إجمالي المشتريات بالمبالغ المسددة والمستحقة للموردين"
                  items={[
                    {
                      label: "إجمالي قيمة المشتريات",
                      value: purchasesReport.report.totalPurchases,
                      color: "#2563EB",
                    },
                    {
                      label: "إجمالي المدفوع للموردين",
                      value: purchasesReport.report.totalPaid,
                      color: "#16a34a",
                    },
                    {
                      label: "المبالغ المتبقية للموردين",
                      value: purchasesReport.report.totalRemaining,
                      color: "#dc2626",
                    },
                  ]}
                />
              </div>
            </div>
          ) : null}

          {/* =================================================================
           * TAB 4: RETURNS ANALYTICS (تحليلات المرتجعات)
           * ================================================================= */}
          {activeTab === "returns" ? (
            <div className="space-y-6">
              {/* Returns KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    عدد عمليات المرتجعات
                  </span>
                  <strong className="text-lg font-bold text-foreground">
                    {formatNumberAr(returnsReport.report.totalReturns)} عملية
                  </strong>
                  <span className="text-[11px] text-muted block">
                    إجمالي القطع المرتجعة:{" "}
                    {formatNumberAr(returnsReport.report.totalReturnItems)} قطعة
                  </span>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    إجمالي قيمة البضائع المرتجعة
                  </span>
                  <strong className="text-lg font-bold text-[#2563EB]">
                    {formatEgp(
                      returnsReport.report.totalReturnedMerchandiseAmount,
                    )}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    هواتف: {formatNumberAr(returnsReport.report.phonesReturned)}{" "}
                    • إكسسوارات:{" "}
                    {formatNumberAr(returnsReport.report.accessoriesReturned)}
                  </span>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    المبالغ التي تم ردها فعلياً
                  </span>
                  <strong className="text-lg font-bold text-success">
                    {formatEgp(returnsReport.report.actualRefundedAmount)}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    صُرفت للعملاء خلال الفترة
                  </span>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 space-y-1.5">
                  <span className="text-xs text-muted block">
                    المبالغ المتبقية للاسترداد
                  </span>
                  <strong className="text-lg font-bold text-danger">
                    {formatEgp(returnsReport.report.pendingRefundAmount)}
                  </strong>
                  <span className="text-[11px] text-muted block">
                    إجمالي المستحق للرد:{" "}
                    {formatEgp(returnsReport.report.refundDue)}
                  </span>
                </div>
              </div>

              {/* Returns Charts */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <SvgDonutChart
                  title="توزيع المرتجعات حسب نوع المنتج"
                  subtitle="مقارنة عدد الهواتف المرتجعة مقابل الإكسسوارات المرتجعة"
                  unitLabel="قطعة"
                  slices={[
                    {
                      label: "الهواتف المرتجعة (Phones)",
                      value: returnsReport.report.phonesReturned,
                      color: "#2563EB",
                    },
                    {
                      label: "الإكسسوارات المرتجعة (Accessories)",
                      value: returnsReport.report.accessoriesReturned,
                      color: "#f59e0b",
                    },
                  ]}
                />

                <HorizontalComparisonChart
                  title="المبالغ المستردة مقابل المبالغ المعلقة"
                  subtitle="متابعة صرف مستحقات المرتجعات للعملاء"
                  items={[
                    {
                      label: "إجمالي قيمة البضائع المرتجعة",
                      value:
                        returnsReport.report.totalReturnedMerchandiseAmount,
                      color: "#2563EB",
                    },
                    {
                      label: "إجمالي المستحق للرد نقداً ( بعد خصم المديونية)",
                      value: returnsReport.report.refundDue,
                      color: "#334155",
                    },
                    {
                      label: "المبالغ التي تم ردها فعلياً",
                      value: returnsReport.report.actualRefundedAmount,
                      color: "#16a34a",
                    },
                    {
                      label: "المبالغ المعلقة المتبقية للاسترداد",
                      value: returnsReport.report.pendingRefundAmount,
                      color: "#dc2626",
                    },
                  ]}
                />
              </div>
            </div>
          ) : null}

          {/* =================================================================
           * TAB 5 (AND SHARED): TIME SERIES & PERFORMANCE CHARTS
           * ================================================================= */}
          <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-2xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h4 className="text-base font-bold text-foreground">
                  الحركة الزمنية اليومية للمحل (المبيعات • المشتريات •
                  المرتجعات)
                </h4>
                <p className="text-xs text-muted mt-0.5">
                  تجميع زمني حقيقي من قاعدة البيانات حسب التوقيت المحلي للمحل (
                  {salesReport.period.timeZone ?? "Africa/Cairo"}) — مرّر
                  المؤشر على أي يوم لعرض التفاصيل
                </p>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                  <span className="h-3 w-3 rounded-sm bg-[#2563EB]" />
                  صافي المبيعات
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                  <span className="h-3 w-3 rounded-sm bg-[#7c3aed]" />
                  المشتريات
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                  <span className="h-3 w-3 rounded-sm bg-[#dc2626]" />
                  المرتجعات
                </span>
              </div>
            </div>

            {combinedTimeline.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
                <BarChart3
                  className="h-8 w-8 text-muted mb-2"
                  aria-hidden="true"
                />
                <p className="text-sm font-bold text-foreground">
                  لا توجد حركات مسجلة خلال الفترة المحددة ({fromDate} — {toDate}
                  )
                </p>
                <p className="text-xs text-muted mt-1">
                  اختر فترة زمنية أخرى أو قم بتسجيل فواتير جديدة لعرض الرسم
                  البياني الزمني.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Active Tooltip Info Banner */}
                <div className="rounded-xl border border-border bg-background p-3.5 text-xs">
                  {hoveredTimelinePoint ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-bold text-foreground">
                        تاريخ اليوم:{" "}
                        <span
                          dir="ltr"
                          className="font-mono text-[#2563EB]"
                        >
                          {hoveredTimelinePoint.date}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        <span>
                          المبيعات:{" "}
                          <strong className="text-[#2563EB]">
                            {formatEgp(hoveredTimelinePoint.netSales)}
                          </strong>{" "}
                          ({hoveredTimelinePoint.salesInvoicesCount} فاتورة)
                        </span>
                        <span>
                          المحصل:{" "}
                          <strong className="text-success">
                            {formatEgp(hoveredTimelinePoint.collectedAmount)}
                          </strong>
                        </span>
                        <span>
                          المشتريات:{" "}
                          <strong className="text-[#7c3aed]">
                            {formatEgp(hoveredTimelinePoint.totalPurchases)}
                          </strong>{" "}
                          ({hoveredTimelinePoint.purchasesInvoicesCount} فاتورة)
                        </span>
                        <span>
                          المرتجعات:{" "}
                          <strong className="text-danger">
                            {formatEgp(hoveredTimelinePoint.returnedAmount)}
                          </strong>{" "}
                          ({hoveredTimelinePoint.returnsCount} مرتجع)
                        </span>
                        <span>
                          صافي التدفق:{" "}
                          <strong className="text-foreground">
                            {formatEgp(hoveredTimelinePoint.netCashFlow)}
                          </strong>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted">
                      مرّر الماوس أو اضغط على أعمدة أي يوم في الرسم البياني
                      بالأسفل لاستعراض الأرقام التفصيلية لذلك اليوم.
                    </div>
                  )}
                </div>

                {/* Interactive Grouped Bar Chart */}
                <div className="overflow-x-auto pb-2">
                  <div className="min-w-[560px] rounded-2xl border border-border bg-background p-5">
                    <div className="flex h-56 items-end gap-3 border-b border-border pb-3">
                      {combinedTimeline.map((pt) => {
                        const salesH =
                          maxTimelineAmount > 0
                            ? Math.round(
                                (pt.netSales / maxTimelineAmount) * 180,
                              )
                            : 0;
                        const purchasesH =
                          maxTimelineAmount > 0
                            ? Math.round(
                                (pt.totalPurchases / maxTimelineAmount) * 180,
                              )
                            : 0;
                        const returnsH =
                          maxTimelineAmount > 0
                            ? Math.round(
                                (pt.returnedAmount / maxTimelineAmount) * 180,
                              )
                            : 0;
                        const isHovered =
                          hoveredTimelinePoint?.date === pt.date;

                        return (
                          <div
                            key={pt.date}
                            onMouseEnter={() => setHoveredTimelinePoint(pt)}
                            onClick={() => setHoveredTimelinePoint(pt)}
                            className={`group flex flex-1 min-w-[48px] cursor-pointer flex-col items-center justify-end rounded-xl px-1.5 pt-2 transition-colors ${
                              isHovered
                                ? "bg-[#2563EB]/10"
                                : "hover:bg-surface-secondary"
                            }`}
                          >
                            <div className="flex items-end justify-center gap-1 w-full h-44">
                              {/* Sales Bar */}
                              <div
                                className="w-3 rounded-t-md bg-[#2563EB] transition-all duration-300"
                                style={{
                                  height: `${pt.netSales > 0 ? Math.max(6, salesH) : 2}px`,
                                  opacity: pt.netSales > 0 ? 1 : 0.2,
                                }}
                                title={`المبيعات (${pt.date}): ${formatEgp(pt.netSales)}`}
                              />
                              {/* Purchases Bar */}
                              <div
                                className="w-3 rounded-t-md bg-[#7c3aed] transition-all duration-300"
                                style={{
                                  height: `${pt.totalPurchases > 0 ? Math.max(6, purchasesH) : 2}px`,
                                  opacity: pt.totalPurchases > 0 ? 1 : 0.2,
                                }}
                                title={`المشتريات (${pt.date}): ${formatEgp(pt.totalPurchases)}`}
                              />
                              {/* Returns Bar */}
                              <div
                                className="w-3 rounded-t-md bg-[#dc2626] transition-all duration-300"
                                style={{
                                  height: `${pt.returnedAmount > 0 ? Math.max(6, returnsH) : 2}px`,
                                  opacity: pt.returnedAmount > 0 ? 1 : 0.2,
                                }}
                                title={`المرتجعات (${pt.date}): ${formatEgp(pt.returnedAmount)}`}
                              />
                            </div>
                            <span className="mt-2 text-[11px] font-semibold text-muted group-hover:text-foreground whitespace-nowrap">
                              {formatDateLabelAr(pt.date)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Detailed Daily Breakdown Table */}
                <div className="overflow-x-auto rounded-xl border border-border bg-background">
                  <table className="w-full text-right text-xs">
                    <thead className="border-b border-border bg-surface text-muted">
                      <tr>
                        <th className="px-4 py-3 font-bold text-foreground">
                          التاريخ
                        </th>
                        <th className="px-4 py-3 font-bold">
                          فواتير البيع
                        </th>
                        <th className="px-4 py-3 font-bold text-[#2563EB]">
                          صافي المبيعات
                        </th>
                        <th className="px-4 py-3 font-bold text-success">
                          المحصل نقداً/دفع
                        </th>
                        <th className="px-4 py-3 font-bold text-[#7c3aed]">
                          المشتريات
                        </th>
                        <th className="px-4 py-3 font-bold text-danger">
                          المرتجعات
                        </th>
                        <th className="px-4 py-3 font-bold text-foreground">
                          صافي التدفق اليومي
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {combinedTimeline.map((pt) => (
                        <tr
                          key={pt.date}
                          onMouseEnter={() => setHoveredTimelinePoint(pt)}
                          className="transition-colors hover:bg-surface/70"
                        >
                          <td
                            dir="ltr"
                            className="px-4 py-3 text-right font-mono font-bold text-foreground"
                          >
                            {pt.date}
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {formatNumberAr(pt.salesInvoicesCount)} فاتورة
                          </td>
                          <td className="px-4 py-3 font-bold text-[#2563EB]">
                            {formatEgp(pt.netSales)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-success">
                            {formatEgp(pt.collectedAmount)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-[#7c3aed]">
                            {formatEgp(pt.totalPurchases)} (
                            {formatNumberAr(pt.purchasesInvoicesCount)})
                          </td>
                          <td className="px-4 py-3 font-semibold text-danger">
                            {formatEgp(pt.returnedAmount)} (
                            {formatNumberAr(pt.returnsCount)})
                          </td>
                          <td className="px-4 py-3 font-bold text-foreground">
                            {formatEgp(pt.netCashFlow)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
