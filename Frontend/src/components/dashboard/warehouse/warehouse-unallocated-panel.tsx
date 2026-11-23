"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  DashboardApiError,
  allocateUnallocatedProductStock,
  fetchUnallocatedProducts,
  generateIdempotencyKey,
  type StockLocation,
  type StoreProductItem,
} from "@/src/services/dashboard.service";
import {
  PRODUCT_TYPE_AR,
  type UnallocatedDraft,
} from "@/src/components/dashboard/warehouse/warehouse-helpers";

interface WarehouseUnallocatedPanelProps {
  onInventoryMutated?: () => void;
}

export function WarehouseUnallocatedPanel({
  onInventoryMutated,
}: WarehouseUnallocatedPanelProps) {
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

  useEffect(() => {
    const init = async () => {
      await loadUnallocatedSection();
    };
    void init();
  }, [loadUnallocatedSection]);

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
