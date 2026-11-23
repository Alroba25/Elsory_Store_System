"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Loader2, RefreshCw } from "lucide-react";
import {
  DashboardApiError,
  fetchStockMovements,
  type StockBucketLocation,
  type StockMovementRecord,
  type StockMovementType,
} from "@/src/services/dashboard.service";
import {
  LOCATION_AR,
  MOVEMENT_TYPE_AR,
  PRODUCT_TYPE_AR,
  formatDateTimeAr,
} from "@/src/components/dashboard/warehouse/warehouse-helpers";

export function WarehouseMovementsPanel() {
  /* ==========================================================================
   * 4. STOCK MOVEMENTS STATE
   * ========================================================================== */
  const [movementsList, setMovementsList] = useState<StockMovementRecord[]>([]);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [movementsPage, setMovementsPage] = useState(1);
  const [movementsTotalPages, setMovementsTotalPages] = useState(1);
  const [movementsLocationFilter, setMovementsLocationFilter] = useState<
    "" | StockBucketLocation
  >("");
  const [movementsTypeFilter, setMovementsTypeFilter] = useState<
    "" | StockMovementType
  >("");
  const [movementsGroupFilter, setMovementsGroupFilter] = useState("");
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);

  const loadMovementsSection = useCallback(
    async (
      page = 1,
      loc: "" | StockBucketLocation = movementsLocationFilter,
      mType: "" | StockMovementType = movementsTypeFilter,
      grp: string = movementsGroupFilter,
    ) => {
      setIsLoadingMovements(true);
      setMovementsError(null);
      try {
        const res = await fetchStockMovements({
          page,
          limit: 50,
          location: loc,
          movementType: mType,
          movementGroupId: grp,
        });
        setMovementsList(res.movements);
        setMovementsTotal(res.total);
        setMovementsPage(res.currentPage);
        setMovementsTotalPages(res.totalPages);
      } catch (err) {
        const msg =
          err instanceof DashboardApiError
            ? err.message
            : "تعذر تحميل سجل حركات المخزون";
        setMovementsError(msg);
      } finally {
        setIsLoadingMovements(false);
      }
    },
    [movementsLocationFilter, movementsTypeFilter, movementsGroupFilter],
  );

  useEffect(() => {
    const init = async () => {
      await loadMovementsSection(1);
    };
    void init();
  }, [loadMovementsSection]);

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB]/10 text-[#2563EB]">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">
              سجل حركات المخزون (Stock Movements — Append-Only)
            </h3>
            <p className="text-xs text-muted">
              إجمالي الحركات المطابقة: {movementsTotal}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadMovementsSection(movementsPage)}
          disabled={isLoadingMovements}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isLoadingMovements ? "animate-spin" : ""}`}
          />
          <span>تحديث</span>
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <select
          value={movementsLocationFilter}
          onChange={(e) => {
            const loc = e.target.value as "" | StockBucketLocation;
            setMovementsLocationFilter(loc);
            void loadMovementsSection(1, loc, movementsTypeFilter, movementsGroupFilter);
          }}
          className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
        >
          <option value="">كل المواقع</option>
          <option value="store">المحل (Store)</option>
          <option value="warehouse">المخزن (Warehouse)</option>
          <option value="damaged">تالف (Damaged)</option>
          <option value="unallocated">غير مخصص (Unallocated)</option>
        </select>

        <select
          value={movementsTypeFilter}
          onChange={(e) => {
            const mt = e.target.value as "" | StockMovementType;
            setMovementsTypeFilter(mt);
            void loadMovementsSection(1, movementsLocationFilter, mt, movementsGroupFilter);
          }}
          className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
        >
          <option value="">كل أنواع الحركات</option>
          {(Object.keys(MOVEMENT_TYPE_AR) as StockMovementType[]).map((k) => (
            <option key={k} value={k}>
              {MOVEMENT_TYPE_AR[k]}
            </option>
          ))}
        </select>

        <input
          type="search"
          dir="ltr"
          value={movementsGroupFilter}
          onChange={(e) => setMovementsGroupFilter(e.target.value)}
          placeholder="movementGroupId..."
          className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-mono text-foreground"
        />

        <button
          type="button"
          onClick={() =>
            void loadMovementsSection(
              1,
              movementsLocationFilter,
              movementsTypeFilter,
              movementsGroupFilter,
            )
          }
          className="h-10 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white"
        >
          تطبيق الفلتر
        </button>
      </div>

      {movementsError ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs text-danger">
          {movementsError}
        </div>
      ) : isLoadingMovements ? (
        <div className="flex min-h-[180px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
        </div>
      ) : movementsList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/60 p-8 text-center text-xs text-muted">
          لا توجد حركات مخزون مطابقة للفلتر
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-border bg-background">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-border bg-surface text-muted">
                <tr>
                  <th className="p-3">نوع الحركة</th>
                  <th className="p-3">الموقع</th>
                  <th className="p-3">التغير</th>
                  <th className="p-3">الرصيد (قبل → بعد)</th>
                  <th className="p-3">المنفذ والتاريخ</th>
                  <th className="p-3">movementGroupId</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movementsList.map((mv) => (
                  <tr key={mv.id}>
                    <td className="p-3">
                      <div className="font-bold text-foreground">
                        {MOVEMENT_TYPE_AR[mv.movementType] ?? mv.movementType}
                      </div>
                      <div className="text-[11px] text-muted">
                        {PRODUCT_TYPE_AR[mv.productType]}
                        {mv.imei ? ` • IMEI: ${mv.imei}` : ""}
                      </div>
                    </td>
                    <td className="p-3 text-foreground">
                      {LOCATION_AR[mv.location]}
                    </td>
                    <td className="p-3 font-bold">
                      <span
                        className={
                          mv.quantityDelta > 0 ? "text-success" : "text-danger"
                        }
                      >
                        {mv.quantityDelta > 0
                          ? `+${mv.quantityDelta}`
                          : mv.quantityDelta}
                      </span>
                    </td>
                    <td className="p-3 text-muted">
                      {mv.balanceBefore} →{" "}
                      <strong className="text-foreground">
                        {mv.balanceAfter}
                      </strong>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-foreground">
                        {mv.performedByName}
                      </div>
                      <div className="text-[11px] text-muted">
                        {formatDateTimeAr(mv.createdAt)}
                      </div>
                    </td>
                    <td dir="ltr" className="p-3 font-mono text-[11px] text-muted">
                      {mv.movementGroupId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {movementsTotalPages > 1 ? (
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                disabled={movementsPage <= 1 || isLoadingMovements}
                onClick={() => void loadMovementsSection(movementsPage - 1)}
                className="rounded-xl border border-border bg-background px-3.5 py-1.5 font-semibold text-foreground disabled:opacity-50"
              >
                السابق
              </button>
              <span className="text-muted">
                صفحة {movementsPage} من {movementsTotalPages}
              </span>
              <button
                type="button"
                disabled={
                  movementsPage >= movementsTotalPages || isLoadingMovements
                }
                onClick={() => void loadMovementsSection(movementsPage + 1)}
                className="rounded-xl border border-border bg-background px-3.5 py-1.5 font-semibold text-foreground disabled:opacity-50"
              >
                التالي
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
