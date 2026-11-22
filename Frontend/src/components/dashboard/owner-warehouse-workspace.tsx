"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  Download,
  Eye,
  History,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DashboardApiError,
  allocateUnallocatedProductStock,
  createInventoryAudit,
  createStockTransfer,
  fetchInventoryAuditById,
  fetchInventoryAuditSnapshot,
  fetchInventoryAudits,
  fetchOwnerProducts,
  fetchStockMovements,
  fetchStockTransferById,
  fetchStockTransfers,
  fetchUnallocatedProducts,
  generateIdempotencyKey,
  getInventoryAuditCsvUrl,
  type AuditChangedProductConflict,
  type AuditSnapshotResponse,
  type AuditSnapshotRow,
  type InventoryAuditRecord,
  type ProductType,
  type StockBucketLocation,
  type StockLocation,
  type StockMovementRecord,
  type StockMovementType,
  type StockTransferRecord,
  type StoreProductItem,
  type TransferDirection,
} from "@/src/services/dashboard.service";

export type WarehouseSectionId =
  | "transfers"
  | "inventory-audit"
  | "unallocated"
  | "stock-movements";

interface OwnerWarehouseWorkspaceProps {
  section: WarehouseSectionId;
  onInventoryMutated?: () => void;
}

const PRODUCT_TYPE_AR: Record<ProductType, string> = {
  phone: "هواتف",
  accessory: "إكسسوارات",
  maintenance: "صيانة",
};

const LOCATION_AR: Record<StockBucketLocation, string> = {
  store: "المحل (Store)",
  warehouse: "المخزن (Warehouse)",
  damaged: "تالف (Damaged)",
  unallocated: "غير مخصص (Unallocated)",
};

const MOVEMENT_TYPE_AR: Record<StockMovementType, string> = {
  purchase_receive: "استلام مشتريات",
  transfer_out: "خروج تحويل",
  transfer_in: "دخول تحويل",
  sale: "بيع (POS)",
  return_salable: "مرتجع سليم",
  return_damaged: "مرتجع تالف",
  audit_adjustment: "تسوية جرد",
  manual_adjustment: "تعديل يدوي",
  legacy_allocation: "تخصيص غير مخصص",
};

function formatDateTimeAr(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface DraftTransferRow {
  rowKey: string;
  mode: "product" | "imei";
  productId: string;
  imei: string;
  quantity: string;
}

interface UnallocatedDraft {
  storeQty: string;
  warehouseQty: string;
  phoneTarget: StockLocation;
  reason: string;
}

export function OwnerWarehouseWorkspace({
  section,
  onInventoryMutated,
}: OwnerWarehouseWorkspaceProps) {
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

  /* ==========================================================================
   * 3. UNALLOCATED STOCK STATE
   * ========================================================================== */
  const [unallocatedProducts, setUnallocatedProducts] = useState<
    StoreProductItem[]
  >([]);
  const [isLoadingUnallocated, setIsLoadingUnallocated] = useState(false);
  const [unallocatedError, setUnallocatedError] = useState<string | null>(null);
  const [unallocatedDrafts, setUnallocatedDrafts] = useState<
    Record<string, UnallocatedDraft>
  >({});
  const [allocatingProductId, setAllocatingProductId] = useState<string | null>(
    null,
  );

  const loadUnallocatedSection = useCallback(async () => {
    setIsLoadingUnallocated(true);
    setUnallocatedError(null);
    try {
      const res = await fetchUnallocatedProducts(1, 100);
      setUnallocatedProducts(res.products);
      setUnallocatedDrafts((prev) => {
        const next: Record<string, UnallocatedDraft> = { ...prev };
        for (const prod of res.products) {
          if (!next[prod.id]) {
            next[prod.id] = {
              storeQty: prod.type === "phone" ? "1" : String(prod.unallocatedQuantity),
              warehouseQty: "0",
              phoneTarget: "store",
              reason: "",
            };
          }
        }
        return next;
      });
    } catch (err) {
      const msg =
        err instanceof DashboardApiError
          ? err.message
          : "تعذر تحميل المخزون غير المخصص";
      setUnallocatedError(msg);
    } finally {
      setIsLoadingUnallocated(false);
    }
  }, []);

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

  /* ==========================================================================
   * SECTION INITIALIZATION EFFECT
   * ========================================================================== */
  useEffect(() => {
    const init = async () => {
      if (section === "transfers") {
        await loadTransfersSection(transfersDirectionFilter);
      } else if (section === "inventory-audit") {
        await loadAuditSection(auditLocation);
      } else if (section === "unallocated") {
        await loadUnallocatedSection();
      } else if (section === "stock-movements") {
        await loadMovementsSection(1);
      }
    };
    void init();
  }, [
    section,
    transfersDirectionFilter,
    auditLocation,
    loadTransfersSection,
    loadAuditSection,
    loadUnallocatedSection,
    loadMovementsSection,
  ]);

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

  /* ==========================================================================
   * UNALLOCATED ALLOCATION HANDLER
   * ========================================================================== */
  const handleAllocateProduct = async (product: StoreProductItem) => {
    if (allocatingProductId) return;
    const draft = unallocatedDrafts[product.id];
    if (!draft || !draft.reason.trim()) {
      toast.error("سبب التخصيص إلزامي");
      return;
    }

    const idempotencyKey = generateIdempotencyKey("alloc");
    setAllocatingProductId(product.id);
    try {
      if (product.type === "phone") {
        const res = await allocateUnallocatedProductStock(
          product.id,
          {
            targetLocation: draft.phoneTarget,
            reason: draft.reason.trim(),
          },
          idempotencyKey,
        );
        toast.success(res.message);
      } else {
        const sQty = Number.parseInt(draft.storeQty || "0", 10);
        const wQty = Number.parseInt(draft.warehouseQty || "0", 10);
        if (
          !Number.isSafeInteger(sQty) ||
          sQty < 0 ||
          !Number.isSafeInteger(wQty) ||
          wQty < 0 ||
          sQty + wQty <= 0
        ) {
          toast.error("يرجى إدخال كمية صالحة للمحل أو المخزن");
          setAllocatingProductId(null);
          return;
        }
        if (sQty + wQty > product.unallocatedQuantity) {
          toast.error("مجموع الكميات يتجاوز الرصيد غير المخصص المتاح");
          setAllocatingProductId(null);
          return;
        }
        const allocations: Array<{ location: StockLocation; quantity: number }> =
          [];
        if (sQty > 0) allocations.push({ location: "store", quantity: sQty });
        if (wQty > 0) {
          allocations.push({ location: "warehouse", quantity: wQty });
        }
        const res = await allocateUnallocatedProductStock(
          product.id,
          {
            allocations,
            reason: draft.reason.trim(),
          },
          idempotencyKey,
        );
        toast.success(res.message);
      }

      await loadUnallocatedSection();
      onInventoryMutated?.();
    } catch (err) {
      toast.error(
        err instanceof DashboardApiError
          ? err.message
          : "تعذر تخصيص المخزون",
      );
    } finally {
      setAllocatingProductId(null);
    }
  };

  /* ==========================================================================
   * RENDER SECTION 1: TRANSFERS
   * ========================================================================== */
  if (section === "transfers") {
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

  /* ==========================================================================
   * RENDER SECTION 2: INVENTORY AUDIT
   * ========================================================================== */
  if (section === "inventory-audit") {
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
                    <a
                      href={getInventoryAuditCsvUrl(aud.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 font-semibold text-foreground"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>CSV</span>
                    </a>
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
                <button
                  type="button"
                  onClick={() => setSelectedAuditDetail(null)}
                  className="text-muted hover:text-foreground"
                >
                  إغلاق
                </button>
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

  /* ==========================================================================
   * RENDER SECTION 3: UNALLOCATED STOCK
   * ========================================================================== */
  if (section === "unallocated") {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                تخصيص المخزون غير المخصص (Unallocated Stock)
              </h3>
              <p className="text-xs text-muted">
                الأرصدة غير المخصصة محجوبة عن البيع حتى يقوم المالك بتوزيعها إلى
                المحل أو المخزن بسبب موثق
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadUnallocatedSection()}
            disabled={isLoadingUnallocated}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoadingUnallocated ? "animate-spin" : ""}`}
            />
            <span>تحديث</span>
          </button>
        </div>

        {unallocatedError ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs text-danger">
            {unallocatedError}
          </div>
        ) : isLoadingUnallocated ? (
          <div className="flex min-h-[160px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
          </div>
        ) : unallocatedProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/60 p-10 text-center space-y-1">
            <p className="text-sm font-bold text-foreground">
              لا توجد أرصدة غير مخصصة حالياً
            </p>
            <p className="text-xs text-muted">
              جميع المنتجات موزعة بين المحل والمخزن.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {unallocatedProducts.map((prod) => {
              const draft = unallocatedDrafts[prod.id] || {
                storeQty: String(prod.unallocatedQuantity),
                warehouseQty: "0",
                phoneTarget: "store" as StockLocation,
                reason: "",
              };
              const isAllocating = allocatingProductId === prod.id;

              return (
                <div
                  key={prod.id}
                  className="rounded-2xl border border-border bg-background p-5 space-y-4 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-sm text-foreground">
                        [{PRODUCT_TYPE_AR[prod.type]}] {prod.name}
                      </span>{" "}
                      <span className="text-muted">
                        ({prod.brand}
                        {prod.imei ? ` • IMEI: ${prod.imei}` : ""})
                      </span>
                    </div>
                    <span className="rounded-lg bg-amber-500/15 px-2.5 py-1 font-bold text-amber-700 dark:text-amber-300">
                      غير مخصص: {prod.unallocatedQuantity}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    {prod.type === "phone" ? (
                      <div className="sm:col-span-4 space-y-1">
                        <label className="block text-[11px] font-semibold text-muted">
                          الوجهة للهاتف
                        </label>
                        <select
                          value={draft.phoneTarget}
                          onChange={(e) =>
                            setUnallocatedDrafts((prev) => ({
                              ...prev,
                              [prod.id]: {
                                ...draft,
                                phoneTarget: e.target.value as StockLocation,
                              },
                            }))
                          }
                          className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs text-foreground"
                        >
                          <option value="store">المحل (توليد باركود بيع)</option>
                          <option value="warehouse">المخزن (بدون باركود)</option>
                        </select>
                      </div>
                    ) : (
                      <>
                        <div className="sm:col-span-2 space-y-1">
                          <label className="block text-[11px] font-semibold text-muted">
                            للمحل (Store)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={prod.unallocatedQuantity}
                            step={1}
                            value={draft.storeQty}
                            onChange={(e) =>
                              setUnallocatedDrafts((prev) => ({
                                ...prev,
                                [prod.id]: {
                                  ...draft,
                                  storeQty: e.target.value,
                                },
                              }))
                            }
                            className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs text-foreground"
                          />
                        </div>
                        <div className="sm:col-span-2 space-y-1">
                          <label className="block text-[11px] font-semibold text-muted">
                            للمخزن (Warehouse)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={prod.unallocatedQuantity}
                            step={1}
                            value={draft.warehouseQty}
                            onChange={(e) =>
                              setUnallocatedDrafts((prev) => ({
                                ...prev,
                                [prod.id]: {
                                  ...draft,
                                  warehouseQty: e.target.value,
                                },
                              }))
                            }
                            className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs text-foreground"
                          />
                        </div>
                      </>
                    )}

                    <div className="sm:col-span-5 space-y-1">
                      <label className="block text-[11px] font-semibold text-muted">
                        سبب التخصيص (إلزامي) *
                      </label>
                      <input
                        type="text"
                        value={draft.reason}
                        onChange={(e) =>
                          setUnallocatedDrafts((prev) => ({
                            ...prev,
                            [prod.id]: { ...draft, reason: e.target.value },
                          }))
                        }
                        placeholder="مثال: جرد افتتاحي وتوزيع على المحل والمخزن"
                        className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs text-foreground"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <button
                        type="button"
                        disabled={isAllocating || Boolean(allocatingProductId)}
                        onClick={() => void handleAllocateProduct(prod)}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {isAllocating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        <span>تأكيد التخصيص</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  /* ==========================================================================
   * RENDER SECTION 4: STOCK MOVEMENTS
   * ========================================================================== */
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
