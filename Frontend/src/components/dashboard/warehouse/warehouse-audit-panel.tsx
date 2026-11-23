"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  DashboardApiError,
  createInventoryAudit,
  fetchInventoryAuditById,
  fetchInventoryAuditSnapshot,
  fetchInventoryAudits,
  generateIdempotencyKey,
  type AuditChangedProductConflict,
  type AuditSnapshotResponse,
  type AuditSnapshotRow,
  type InventoryAuditRecord,
  type ProductType,
  type StockLocation,
  type StockMovementRecord,
} from "@/src/services/dashboard.service";
import { downloadInventoryAuditPdf } from "@/src/utils/elsory-pdf-reports";
import {
  LOCATION_AR,
  PRODUCT_TYPE_AR,
  formatDateTimeAr,
} from "@/src/components/dashboard/warehouse/warehouse-helpers";

interface WarehouseAuditPanelProps {
  onInventoryMutated?: () => void;
}

export function WarehouseAuditPanel({
  onInventoryMutated,
}: WarehouseAuditPanelProps) {
  /* ==========================================================================
   * 2. INVENTORY AUDIT STATE
   * ========================================================================== */
  const [auditLocation, setAuditLocation] = useState<StockLocation>("store");
  const [auditSnapshot, setAuditSnapshot] =
    useState<AuditSnapshotResponse | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [actualQuantities, setActualQuantities] = useState<
    Record<string, string>
  >({});
  const [applyAuditAdjustments, setApplyAuditAdjustments] = useState(true);
  const [auditNotes, setAuditNotes] = useState("");
  const [isSubmittingAudit, setIsSubmittingAudit] = useState(false);
  const [auditConflictProducts, setAuditConflictProducts] = useState<
    AuditChangedProductConflict[]
  >([]);
  const [auditHistory, setAuditHistory] = useState<InventoryAuditRecord[]>([]);
  const [isLoadingAudits, setIsLoadingAudits] = useState(false);
  const [selectedAuditDetail, setSelectedAuditDetail] = useState<{
    audit: InventoryAuditRecord;
    movements: StockMovementRecord[];
  } | null>(null);
  const [downloadingAuditId, setDownloadingAuditId] = useState<string | null>(
    null,
  );

  const handleDownloadAuditPdf = async (audit: InventoryAuditRecord) => {
    if (downloadingAuditId) return;
    setDownloadingAuditId(audit.id);
    try {
      let fullAudit = audit;
      if (!audit.items || audit.items.length === 0) {
        const detail = await fetchInventoryAuditById(audit.id);
        fullAudit = detail.audit;
      }
      await downloadInventoryAuditPdf(fullAudit);
      toast.success("تم تحميل تقرير الجرد بصيغة PDF بنجاح");
    } catch {
      toast.error("تعذر إنشاء ملف PDF لتقرير الجرد");
    } finally {
      setDownloadingAuditId(null);
    }
  };

  const loadAuditSection = useCallback(async (loc: StockLocation) => {
    setIsLoadingSnapshot(true);
    setIsLoadingAudits(true);
    setSnapshotError(null);
    setAuditConflictProducts([]);
    try {
      const [snap, historyRes] = await Promise.all([
        fetchInventoryAuditSnapshot(loc),
        fetchInventoryAudits({ location: loc, limit: 25 }),
      ]);
      setAuditSnapshot(snap);
      const nextActuals: Record<string, string> = {};
      for (const list of [
        snap.categories.phone,
        snap.categories.accessory,
        snap.categories.maintenance,
      ]) {
        for (const row of list) {
          nextActuals[row.product] = String(row.snapshotQuantity);
        }
      }
      setActualQuantities(nextActuals);
      setAuditHistory(historyRes.audits);
    } catch (err) {
      const msg =
        err instanceof DashboardApiError
          ? err.message
          : "تعذر تحميل لقطة الجرد";
      setSnapshotError(msg);
    } finally {
      setIsLoadingSnapshot(false);
      setIsLoadingAudits(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadAuditSection(auditLocation);
    };
    void init();
  }, [auditLocation, loadAuditSection]);

  /* ==========================================================================
   * AUDIT HANDLERS
   * ========================================================================== */
  const allSnapshotRows = useMemo<AuditSnapshotRow[]>(() => {
    if (!auditSnapshot) return [];
    return [
      ...auditSnapshot.categories.phone,
      ...auditSnapshot.categories.accessory,
      ...auditSnapshot.categories.maintenance,
    ];
  }, [auditSnapshot]);

  const handleSubmitAudit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingAudit || !auditSnapshot || allSnapshotRows.length === 0) {
      return;
    }

    const itemsPayload: Array<{
      product: string;
      snapshotQuantity: number;
      actualQuantity: number;
    }> = [];

    for (const row of allSnapshotRows) {
      const rawVal = actualQuantities[row.product] ?? String(row.snapshotQuantity);
      const parsed = Number.parseInt(rawVal, 10);
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        toast.error(`الكمية الفعلية غير صالحة للمنتج: ${row.productName}`);
        return;
      }
      if (row.productType === "phone" && parsed !== 0 && parsed !== 1) {
        toast.error(`الكمية الفعلية للهاتف يجب أن تكون 0 أو 1: ${row.productName}`);
        return;
      }
      itemsPayload.push({
        product: row.product,
        snapshotQuantity: row.snapshotQuantity,
        actualQuantity: parsed,
      });
    }

    setIsSubmittingAudit(true);
    setAuditConflictProducts([]);
    try {
      const idempotencyKey = generateIdempotencyKey("aud");
      const res = await createInventoryAudit(
        {
          location: auditLocation,
          items: itemsPayload,
          applyAdjustments: applyAuditAdjustments,
          notes: auditNotes.trim() || undefined,
        },
        idempotencyKey,
      );
      toast.success(res.message);
      setAuditNotes("");
      setSelectedAuditDetail({ audit: res.audit, movements: [] });
      await loadAuditSection(auditLocation);
      onInventoryMutated?.();
    } catch (err) {
      if (err instanceof DashboardApiError && err.status === 409) {
        const rawChanged = err.data?.changedProducts;
        if (Array.isArray(rawChanged)) {
          const parsedConflicts: AuditChangedProductConflict[] = rawChanged
            .filter(
              (c): c is Record<string, unknown> =>
                typeof c === "object" && c !== null,
            )
            .map((c) => ({
              productId: String(c.productId ?? ""),
              productName: String(c.productName ?? "منتج"),
              snapshotQuantity: Number(c.snapshotQuantity ?? 0),
              liveQuantity: Number(c.liveQuantity ?? 0),
            }));
          setAuditConflictProducts(parsedConflicts);
        }
        toast.error(
          "تغيرت أرصدة بعض المنتجات منذ أخذ اللقطة (409 Conflict). يرجى إعادة أخذ اللقطة ومراجعة الجرد.",
        );
      } else {
        toast.error(
          err instanceof DashboardApiError
            ? err.message
            : "تعذر اعتماد الجرد",
        );
      }
    } finally {
      setIsSubmittingAudit(false);
    }
  };

    const renderCategoryTable = (
      title: string,
      rows: AuditSnapshotRow[],
    ) => (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h5 className="text-sm font-bold text-foreground">
            {title} ({rows.length})
          </h5>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background/60 p-4 text-center text-xs text-muted">
            لا توجد أصناف في هذه الفئة داخل{" "}
            {auditLocation === "store" ? "المحل" : "المخزن"}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-background">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-border bg-surface text-muted">
                <tr>
                  <th className="p-3">المنتج</th>
                  <th className="p-3">المسجل (Snapshot)</th>
                  <th className="p-3">الفعلي</th>
                  <th className="p-3">الفرق</th>
                  <th className="p-3">التكلفة</th>
                  <th className="p-3">قيمة البيع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const rawActual =
                    actualQuantities[row.product] ??
                    String(row.snapshotQuantity);
                  const actualNum = Number.parseInt(rawActual, 10);
                  const validActual =
                    Number.isSafeInteger(actualNum) && actualNum >= 0
                      ? actualNum
                      : row.snapshotQuantity;
                  const diff = validActual - row.snapshotQuantity;

                  return (
                    <tr key={row.product}>
                      <td className="p-3">
                        <div className="font-bold text-foreground">
                          {row.productName}
                        </div>
                        <div className="text-[11px] text-muted">
                          {row.brand}
                          {row.model ? ` • ${row.model}` : ""}
                          {row.imei ? ` • IMEI: ${row.imei}` : ""}
                        </div>
                      </td>
                      <td className="p-3 font-bold text-foreground">
                        {row.snapshotQuantity}
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          min={0}
                          max={row.productType === "phone" ? 1 : undefined}
                          step={1}
                          value={rawActual}
                          onChange={(e) =>
                            setActualQuantities((prev) => ({
                              ...prev,
                              [row.product]: e.target.value,
                            }))
                          }
                          className="h-9 w-24 rounded-lg border border-border bg-surface px-2.5 text-xs text-foreground"
                        />
                      </td>
                      <td className="p-3 font-bold">
                        <span
                          className={
                            diff === 0
                              ? "text-success"
                              : diff < 0
                                ? "text-danger"
                                : "text-[#2563EB]"
                          }
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      </td>
                      <td className="p-3 text-muted">
                        {row.costKnown && row.unitCost !== null
                          ? `${(row.unitCost * validActual).toFixed(2)} ج.م`
                          : "غير محددة"}
                      </td>
                      <td className="p-3 font-semibold text-foreground">
                        {(row.unitSellingPrice * validActual).toFixed(2)} ج.م
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  جرد المخزون المنفصل (المحل / المخزن)
                </h3>
                <p className="text-xs text-muted">
                  لقطة أرصدة محمية ضد التعديل المتزامن (409 Conflict) مع تسجيل
                  تسويات الجرد في StockMovement
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAuditLocation("store")}
                className={`h-10 rounded-xl px-4 text-xs font-bold ${
                  auditLocation === "store"
                    ? "bg-[#2563EB] text-white"
                    : "border border-border bg-background text-foreground"
                }`}
              >
                جرد المحل (Store Audit)
              </button>
              <button
                type="button"
                onClick={() => setAuditLocation("warehouse")}
                className={`h-10 rounded-xl px-4 text-xs font-bold ${
                  auditLocation === "warehouse"
                    ? "bg-[#2563EB] text-white"
                    : "border border-border bg-background text-foreground"
                }`}
              >
                جرد المخزن (Warehouse Audit)
              </button>
              <button
                type="button"
                onClick={() => void loadAuditSection(auditLocation)}
                disabled={isLoadingSnapshot}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 text-xs font-semibold text-foreground"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoadingSnapshot ? "animate-spin" : ""}`}
                />
                <span>تحديث اللقطة</span>
              </button>
            </div>
          </div>

          {/* 409 Conflict Banner */}
          {auditConflictProducts.length > 0 ? (
            <div
              role="alert"
              className="rounded-2xl border border-danger/40 bg-danger/10 p-4 space-y-3 text-xs text-danger"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    تعارض تزامن (409 Conflict): تغيرت الأرصدة التالية منذ أخذ
                    اللقطة
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void loadAuditSection(auditLocation)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-danger px-3 py-1.5 font-bold text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>إعادة أخذ اللقطة</span>
                </button>
              </div>
              <ul className="list-disc pr-5 space-y-1">
                {auditConflictProducts.map((c) => (
                  <li key={c.productId}>
                    <strong>{c.productName}</strong> — في اللقطة:{" "}
                    {c.snapshotQuantity} | الرصيد الحي الآن: {c.liveQuantity}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {snapshotError ? (
            <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs text-danger">
              {snapshotError}
            </div>
          ) : isLoadingSnapshot ? (
            <div className="flex min-h-[180px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
            </div>
          ) : auditSnapshot ? (
            <form onSubmit={handleSubmitAudit} className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-3 text-xs text-muted">
                <span>
                  الموقع المختار:{" "}
                  <strong className="text-foreground">
                    {LOCATION_AR[auditSnapshot.location]}
                  </strong>
                </span>
                <span>
                  وقت اللقطة: {formatDateTimeAr(auditSnapshot.snapshotTakenAt)} •
                  إجمالي الأصناف: {auditSnapshot.totalItems}
                </span>
              </div>

              {renderCategoryTable("1. الهواتف (Phones)", auditSnapshot.categories.phone)}
              {renderCategoryTable(
                "2. الإكسسوارات (Accessories)",
                auditSnapshot.categories.accessory,
              )}
              {renderCategoryTable(
                "3. الصيانة (Maintenance)",
                auditSnapshot.categories.maintenance,
              )}

              {allSnapshotRows.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyAuditAdjustments}
                      onChange={(e) =>
                        setApplyAuditAdjustments(e.target.checked)
                      }
                      className="h-4 w-4 accent-[#2563EB]"
                    />
                    <span>تطبيق التسويات تلقائياً وتسجيل StockMovement</span>
                  </label>

                  <input
                    type="text"
                    value={auditNotes}
                    onChange={(e) => setAuditNotes(e.target.value)}
                    placeholder="ملاحظات الجرد (اختياري)..."
                    className="h-10 flex-1 min-w-[220px] rounded-xl border border-border bg-background px-3.5 text-xs text-foreground"
                  />

                  <button
                    type="submit"
                    disabled={isSubmittingAudit}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {isSubmittingAudit ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <span>
                      {isSubmittingAudit
                        ? "جاري اعتماد الجرد..."
                        : "اعتماد وحفظ الجرد"}
                    </span>
                  </button>
                </div>
              ) : null}
            </form>
          ) : null}
        </section>

        {/* Audit History */}
        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-5">
          <h4 className="text-base font-bold text-foreground">
            سجل تقارير الجرد ({auditLocation === "store" ? "المحل" : "المخزن"})
          </h4>
          {isLoadingAudits ? (
            <div className="flex min-h-[120px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[#2563EB]" />
            </div>
          ) : auditHistory.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background/60 p-8 text-center text-xs text-muted">
              لا توجد تقارير جرد محفوظة لهذا الموقع بعد
            </div>
          ) : (
            <div className="divide-y divide-border rounded-2xl border border-border bg-background">
              {auditHistory.map((aud) => (
                <div
                  key={aud.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="font-bold text-foreground">
                      <span dir="ltr" className="font-mono">
                        {aud.auditNumber}
                      </span>{" "}
                      — {LOCATION_AR[aud.location]}
                    </div>
                    <div className="text-muted">
                      الأصناف: {aud.items.length} • التسوية:{" "}
                      {aud.adjustmentsApplied ? "مطبّقة" : "مراجعة فقط"} •{" "}
                      {aud.auditedByName} • {formatDateTimeAr(aud.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDownloadAuditPdf(aud)}
                      disabled={downloadingAuditId === aud.id}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-3 py-1.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {downloadingAuditId === aud.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      <span>تحميل PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const detail = await fetchInventoryAuditById(aud.id);
                          setSelectedAuditDetail(detail);
                        } catch {
                          toast.error("تعذر تحميل تفاصيل الجرد");
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 font-semibold text-foreground"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>التفاصيل</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedAuditDetail ? (
            <div className="rounded-2xl border border-[#2563EB]/30 bg-background p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="font-bold text-foreground">
                  ملخص الجرد{" "}
                  <span dir="ltr" className="font-mono">
                    {selectedAuditDetail.audit.auditNumber}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      void handleDownloadAuditPdf(selectedAuditDetail.audit)
                    }
                    disabled={
                      downloadingAuditId === selectedAuditDetail.audit.id
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {downloadingAuditId === selectedAuditDetail.audit.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                    <span>تحميل PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAuditDetail(null)}
                    className="text-muted hover:text-foreground"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(["phone", "accessory", "maintenance"] as ProductType[]).map(
                  (catKey) => {
                    const c =
                      selectedAuditDetail.audit.summaryByCategory[catKey];
                    return (
                      <div
                        key={catKey}
                        className="rounded-xl border border-border bg-surface p-3.5 space-y-1"
                      >
                        <div className="font-bold text-foreground">
                          {PRODUCT_TYPE_AR[catKey]} ({c.itemsCount})
                        </div>
                        <div className="text-muted">
                          المسجل: {c.systemQty} • الفعلي: {c.actualQty} •
                          الفرق:{" "}
                          <strong
                            className={
                              c.difference < 0
                                ? "text-danger"
                                : c.difference > 0
                                  ? "text-[#2563EB]"
                                  : "text-success"
                            }
                          >
                            {c.difference}
                          </strong>
                        </div>
                        <div className="text-muted">
                          قيمة البيع: {c.retailValue} ج.م • التكلفة المعروفة:{" "}
                          {c.knownCostValue} ج.م
                          {c.unknownCostItemsCount > 0
                            ? ` (${c.unknownCostItemsCount} بدون تكلفة)`
                            : ""}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    );
}
