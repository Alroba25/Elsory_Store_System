"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeftRight,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DashboardApiError,
  createStockTransfer,
  fetchOwnerProducts,
  fetchStockTransferById,
  fetchStockTransfers,
  generateIdempotencyKey,
  type StockMovementRecord,
  type StockTransferRecord,
  type StoreProductItem,
  type TransferDirection,
} from "@/src/services/dashboard.service";
import {
  PRODUCT_TYPE_AR,
  formatDateTimeAr,
  type DraftTransferRow,
} from "@/src/components/dashboard/warehouse/warehouse-helpers";

interface WarehouseTransfersPanelProps {
  onInventoryMutated?: () => void;
}

export function WarehouseTransfersPanel({
  onInventoryMutated,
}: WarehouseTransfersPanelProps) {
  /* ==========================================================================
   * 1. TRANSFERS STATE
   * ========================================================================== */
  const [transferDirection, setTransferDirection] =
    useState<TransferDirection>("warehouse_to_store");
  const [transferProducts, setTransferProducts] = useState<StoreProductItem[]>(
    [],
  );
  const [isLoadingTransferProducts, setIsLoadingTransferProducts] =
    useState(false);
  const [draftRows, setDraftRows] = useState<DraftTransferRow[]>([
    {
      rowKey: "row-1",
      mode: "product",
      productId: "",
      imei: "",
      quantity: "1",
    },
  ]);
  const [transferNotes, setTransferNotes] = useState("");
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [transfersList, setTransfersList] = useState<StockTransferRecord[]>([]);
  const [transfersDirectionFilter, setTransfersDirectionFilter] = useState<
    "" | TransferDirection
  >("");
  const [isLoadingTransfers, setIsLoadingTransfers] = useState(false);
  const [transfersError, setTransfersError] = useState<string | null>(null);
  const [selectedTransferDetail, setSelectedTransferDetail] = useState<{
    transfer: StockTransferRecord;
    movements: StockMovementRecord[];
  } | null>(null);

  const loadTransfersSection = useCallback(
    async (dirFilter: "" | TransferDirection) => {
      setIsLoadingTransfers(true);
      setIsLoadingTransferProducts(true);
      setTransfersError(null);
      try {
        const [trfRes, prodRes] = await Promise.all([
          fetchStockTransfers({ direction: dirFilter, limit: 50 }),
          fetchOwnerProducts({ limit: 100 }),
        ]);
        setTransfersList(trfRes.transfers);
        setTransferProducts(prodRes.products);
      } catch (err) {
        const msg =
          err instanceof DashboardApiError
            ? err.message
            : "تعذر تحميل بيانات التحويلات";
        setTransfersError(msg);
      } finally {
        setIsLoadingTransfers(false);
        setIsLoadingTransferProducts(false);
      }
    },
    [],
  );

  useEffect(() => {
    const init = async () => {
      await loadTransfersSection(transfersDirectionFilter);
    };
    void init();
  }, [transfersDirectionFilter, loadTransfersSection]);

  /* ==========================================================================
   * TRANSFER HANDLERS
   * ========================================================================== */
  const eligibleSourceProducts = useMemo(() => {
    return transferProducts.filter((p) => {
      const avail =
        transferDirection === "warehouse_to_store"
          ? p.warehouseQuantity
          : p.storeQuantity;
      return p.isActive && avail > 0;
    });
  }, [transferProducts, transferDirection]);

  const handleSubmitTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingTransfer) return;

    const payloadItems: Array<{
      product?: string;
      imei?: string;
      quantity?: number;
    }> = [];

    for (const row of draftRows) {
      if (row.mode === "imei") {
        const cleanImei = row.imei.trim();
        if (!/^\d{15}$/.test(cleanImei)) {
          toast.error("يرجى إدخال رقم IMEI صحيح مكون من 15 رقماً");
          return;
        }
        payloadItems.push({ imei: cleanImei, quantity: 1 });
      } else {
        if (!row.productId) {
          toast.error("يرجى اختيار المنتج في جميع الصفوف");
          return;
        }
        const selected = transferProducts.find((p) => p.id === row.productId);
        const qty =
          selected?.type === "phone" ? 1 : Number.parseInt(row.quantity, 10);
        if (!Number.isSafeInteger(qty) || qty < 1) {
          toast.error("يرجى إدخال كمية صحيحة أكبر من صفر");
          return;
        }
        payloadItems.push({ product: row.productId, quantity: qty });
      }
    }

    setIsSubmittingTransfer(true);
    try {
      const idempotencyKey = generateIdempotencyKey("trf");
      const res = await createStockTransfer(
        {
          direction: transferDirection,
          items: payloadItems,
          notes: transferNotes.trim() || undefined,
        },
        idempotencyKey,
      );
      toast.success(res.message);
      setDraftRows([
        {
          rowKey: `row-${Date.now()}`,
          mode: "product",
          productId: "",
          imei: "",
          quantity: "1",
        },
      ]);
      setTransferNotes("");
      await loadTransfersSection(transfersDirectionFilter);
      onInventoryMutated?.();
    } catch (err) {
      toast.error(
        err instanceof DashboardApiError
          ? err.message
          : "تعذر تنفيذ عملية التحويل",
      );
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB]/10 text-[#2563EB]">
                <ArrowLeftRight className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  تحويل المخزون بين المخزن والمحل
                </h3>
                <p className="text-xs text-muted">
                  نقل ذري للإكسسوارات والصيانة بالكمية والهواتف بالـ IMEI مع تسجيل
                  حركات المخزون تلقائياً
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void loadTransfersSection(transfersDirectionFilter)}
              disabled={isLoadingTransfers}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoadingTransfers ? "animate-spin" : ""}`}
              />
              <span>تحديث</span>
            </button>
          </div>

          <form onSubmit={handleSubmitTransfer} className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setTransferDirection("warehouse_to_store");
                  setDraftRows([
                    {
                      rowKey: `row-${Date.now()}`,
                      mode: "product",
                      productId: "",
                      imei: "",
                      quantity: "1",
                    },
                  ]);
                }}
                className={`h-10 rounded-xl px-4 text-xs font-bold transition-colors ${
                  transferDirection === "warehouse_to_store"
                    ? "bg-[#2563EB] text-white"
                    : "border border-border bg-background text-foreground"
                }`}
              >
                من المخزن إلى المحل (Warehouse → Store)
              </button>
              <button
                type="button"
                onClick={() => {
                  setTransferDirection("store_to_warehouse");
                  setDraftRows([
                    {
                      rowKey: `row-${Date.now()}`,
                      mode: "product",
                      productId: "",
                      imei: "",
                      quantity: "1",
                    },
                  ]);
                }}
                className={`h-10 rounded-xl px-4 text-xs font-bold transition-colors ${
                  transferDirection === "store_to_warehouse"
                    ? "bg-[#2563EB] text-white"
                    : "border border-border bg-background text-foreground"
                }`}
              >
                من المحل إلى المخزن (Store → Warehouse)
              </button>
            </div>

            <div className="space-y-3">
              {draftRows.map((row, idx) => {
                const selectedProd = transferProducts.find(
                  (p) => p.id === row.productId,
                );
                const maxAvail = selectedProd
                  ? transferDirection === "warehouse_to_store"
                    ? selectedProd.warehouseQuantity
                    : selectedProd.storeQuantity
                  : undefined;

                return (
                  <div
                    key={row.rowKey}
                    className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-xl border border-border bg-background p-3.5 items-end"
                  >
                    <div className="md:col-span-3 space-y-1">
                      <label className="block text-[11px] font-semibold text-muted">
                        طريقة الاختيار
                      </label>
                      <select
                        value={row.mode}
                        onChange={(e) => {
                          const nextMode = e.target.value as "product" | "imei";
                          setDraftRows((prev) =>
                            prev.map((r, i) =>
                              i === idx
                                ? {
                                    ...r,
                                    mode: nextMode,
                                    productId: "",
                                    imei: "",
                                    quantity: "1",
                                  }
                                : r,
                            ),
                          );
                        }}
                        className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs text-foreground"
                      >
                        <option value="product">اختيار منتج من القائمة</option>
                        <option value="imei">إدخال IMEI لهاتف</option>
                      </select>
                    </div>

                    {row.mode === "imei" ? (
                      <div className="md:col-span-6 space-y-1">
                        <label className="block text-[11px] font-semibold text-muted">
                          رقم IMEI (15 رقماً)
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          maxLength={15}
                          required
                          value={row.imei}
                          onChange={(e) =>
                            setDraftRows((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, imei: e.target.value } : r,
                              ),
                            )
                          }
                          placeholder="356938035643809"
                          className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs font-mono text-foreground"
                        />
                      </div>
                    ) : (
                      <div className="md:col-span-5 space-y-1">
                        <label className="block text-[11px] font-semibold text-muted">
                          المنتج المتاح في{" "}
                          {transferDirection === "warehouse_to_store"
                            ? "المخزن"
                            : "المحل"}
                        </label>
                        <select
                          required
                          disabled={isLoadingTransferProducts}
                          value={row.productId}
                          onChange={(e) =>
                            setDraftRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? {
                                      ...r,
                                      productId: e.target.value,
                                      quantity: "1",
                                    }
                                  : r,
                              ),
                            )
                          }
                          className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs text-foreground"
                        >
                          <option value="">-- اختر منتجاً --</option>
                          {eligibleSourceProducts.map((p) => {
                            const avail =
                              transferDirection === "warehouse_to_store"
                                ? p.warehouseQuantity
                                : p.storeQuantity;
                            return (
                              <option key={p.id} value={p.id}>
                                [{PRODUCT_TYPE_AR[p.type]}] {p.name} ({p.brand})
                                {p.imei ? ` • IMEI: ${p.imei}` : ""} — متاح:{" "}
                                {avail}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}

                    <div className="md:col-span-2 space-y-1">
                      <label className="block text-[11px] font-semibold text-muted">
                        الكمية {maxAvail !== undefined ? `(أقصى ${maxAvail})` : ""}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={maxAvail}
                        step={1}
                        required
                        disabled={
                          row.mode === "imei" || selectedProd?.type === "phone"
                        }
                        value={
                          row.mode === "imei" || selectedProd?.type === "phone"
                            ? "1"
                            : row.quantity
                        }
                        onChange={(e) =>
                          setDraftRows((prev) =>
                            prev.map((r, i) =>
                              i === idx
                                ? { ...r, quantity: e.target.value }
                                : r,
                            ),
                          )
                        }
                        className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs text-foreground disabled:opacity-60"
                      />
                    </div>

                    <div className="md:col-span-1 flex justify-end">
                      {draftRows.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setDraftRows((prev) =>
                              prev.filter((_, i) => i !== idx),
                            )
                          }
                          aria-label="حذف الصف"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-danger/30 bg-danger/10 text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() =>
                  setDraftRows((prev) => [
                    ...prev,
                    {
                      rowKey: `row-${Date.now()}-${prev.length}`,
                      mode: "product",
                      productId: "",
                      imei: "",
                      quantity: "1",
                    },
                  ])
                }
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground"
              >
                <Plus className="h-4 w-4" />
                <span>إضافة صنف آخر للتحويل</span>
              </button>

              <input
                type="text"
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder="ملاحظات التحويل (اختياري)..."
                className="h-10 flex-1 min-w-[220px] rounded-xl border border-border bg-background px-3.5 text-xs text-foreground"
              />

              <button
                type="submit"
                disabled={isSubmittingTransfer}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-5 text-xs font-bold text-white disabled:opacity-50"
              >
                {isSubmittingTransfer ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowLeftRight className="h-4 w-4" />
                )}
                <span>
                  {isSubmittingTransfer
                    ? "جاري تنفيذ التحويل..."
                    : "اعتماد وتنفيذ التحويل"}
                </span>
              </button>
            </div>
          </form>
        </section>

        {/* Transfers History */}
        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <h4 className="text-base font-bold text-foreground">
              سجل التحويلات ({transfersList.length})
            </h4>
            <select
              value={transfersDirectionFilter}
              onChange={(e) =>
                setTransfersDirectionFilter(
                  e.target.value as "" | TransferDirection,
                )
              }
              className="h-9 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
            >
              <option value="">كل الاتجاهات</option>
              <option value="warehouse_to_store">المخزن → المحل</option>
              <option value="store_to_warehouse">المحل → المخزن</option>
            </select>
          </div>

          {transfersError ? (
            <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs text-danger">
              {transfersError}
            </div>
          ) : isLoadingTransfers ? (
            <div className="flex min-h-[140px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
            </div>
          ) : transfersList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background/60 p-8 text-center text-xs text-muted">
              لا توجد عمليات تحويل مسجلة بعد
            </div>
          ) : (
            <div className="divide-y divide-border rounded-2xl border border-border bg-background">
              {transfersList.map((trf) => (
                <div
                  key={trf.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 font-bold text-foreground">
                      <span dir="ltr" className="font-mono">
                        {trf.transferNumber}
                      </span>
                      <span className="rounded-lg bg-[#2563EB]/10 px-2 py-0.5 text-[11px] text-[#2563EB]">
                        {trf.direction === "warehouse_to_store"
                          ? "المخزن → المحل"
                          : "المحل → المخزن"}
                      </span>
                    </div>
                    <div className="text-muted">
                      الأصناف: {trf.items.length} • المنفذ: {trf.createdByName}{" "}
                      • {formatDateTimeAr(trf.createdAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const detail = await fetchStockTransferById(trf.id);
                        setSelectedTransferDetail(detail);
                      } catch {
                        toast.error("تعذر تحميل تفاصيل التحويل");
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 font-semibold text-foreground"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>التفاصيل</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedTransferDetail ? (
            <div className="rounded-2xl border border-[#2563EB]/30 bg-background p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="font-bold text-foreground">
                  تفاصيل التحويل{" "}
                  <span dir="ltr" className="font-mono">
                    {selectedTransferDetail.transfer.transferNumber}
                  </span>{" "}
                  • Group:{" "}
                  <span dir="ltr" className="font-mono text-muted">
                    {selectedTransferDetail.transfer.movementGroupId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTransferDetail(null)}
                  className="text-muted hover:text-foreground"
                >
                  إغلاق
                </button>
              </div>
              <div className="space-y-2">
                {selectedTransferDetail.transfer.items.map((it) => (
                  <div
                    key={it.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3"
                  >
                    <span className="font-bold text-foreground">
                      [{PRODUCT_TYPE_AR[it.productType]}] {it.productName}
                      {it.imei ? ` • IMEI: ${it.imei}` : ""}
                    </span>
                    <span className="text-muted">
                      الكمية: <strong className="text-foreground">{it.quantity}</strong>
                      {it.barcode ? ` • باركود: ${it.barcode}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    );
}
