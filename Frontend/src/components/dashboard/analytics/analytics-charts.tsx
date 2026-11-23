"use client";

import { BarChart3, PieChart } from "lucide-react";

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

export interface DateRangePair {
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

export function formatEgp(amount: number): string {
  return `${Number(amount || 0).toLocaleString("ar-EG")} ج.م`;
}

export function formatNumberAr(num: number): string {
  return Number(num || 0).toLocaleString("ar-EG");
}

export function formatDateLabelAr(ymd: string): string {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("ar-EG", {
    month: "short",
    day: "numeric",
  });
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function SvgDonutChart({
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
        <div className="flex min-h-45 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 p-6 text-center">
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

export interface ComparisonBarItem {
  label: string;
  value: number;
  color: string;
  helperText?: string;
}

export function HorizontalComparisonChart({
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
        <div className="flex min-h-45 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 p-6 text-center">
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

export interface CombinedTimelinePoint {
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

export const DATE_PRESETS: ReadonlyArray<{
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

export const ANALYTICS_TABS: ReadonlyArray<{
  id: AnalyticsSectionTab;
  label: string;
}> = [
  { id: "overview", label: "نظرة عامة (Overview)" },
  { id: "sales", label: "تحليلات المبيعات" },
  { id: "purchases", label: "تحليلات المشتريات" },
  { id: "returns", label: "تحليلات المرتجعات" },
  { id: "performance", label: "الرسوم الزمنية والأداء" },
];

