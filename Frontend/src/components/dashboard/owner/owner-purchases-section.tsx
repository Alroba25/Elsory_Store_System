"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Eye, Loader2, Plus, RefreshCw, Trash2, XCircle } from "lucide-react";
import {
  DayFilterBar,
  filterBySelectedDay,
  toLocalYmd,
  type DayFilterMode,
} from "@/src/components/dashboard/day-filter-bar";
import {
  cancelPurchaseInvoice,
  createPurchaseInvoice,
  DashboardApiError,
  fetchPurchaseById,
  fetchPurchasesList,
  fetchSuppliersList,
  registerPurchasedAccessoryItem,
  registerPurchasedPhoneItem,
  type PhoneCondition,
  type ProductType,
  type StockLocation,
  type StorePurchaseRecord,
  type StoreSupplierRecord,
} from "@/src/services/dashboard.service";
import type { DraftPurchaseItem } from "@/src/components/dashboard/owner/owner-helpers";

export function OwnerPurchasesSection() {
  const [suppliers, setSuppliers] = useState<StoreSupplierRecord[]>([]);
  const [purchases, setPurchases] = useState<StorePurchaseRecord[]>([]);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState<boolean>(false);
  const [selectedPurchase, setSelectedPurchase] =
    useState<StorePurchaseRecord | null>(null);

  // Create Purchase Form State
  const [purSupplierId, setPurSupplierId] = useState<string>("");
  const [purPaidAmount, setPurPaidAmount] = useState<string>("0");
  const [purNotes, setPurNotes] = useState<string>("");
  const [purItems, setPurItems] = useState<DraftPurchaseItem[]>([
    {
      productName: "",
      brand: "",
      model: "",
      productType: "accessory",
      quantity: 1,
      purchasePrice: 0,
    },
  ]);
  const [isCreatingPurchase, setIsCreatingPurchase] = useState<boolean>(false);

  // Register Purchased Item State (Phone / Accessory / Maintenance)
  const [regTargetItem, setRegTargetItem] = useState<{
    purchaseId: string;
    itemId: string;
    productName: string;
    productType: ProductType;
    remainingQuantity: number;
  } | null>(null);
  const [regImei, setRegImei] = useState<string>("");
  const [regSellingPrice, setRegSellingPrice] = useState<string>("");
  const [regCondition, setRegCondition] = useState<PhoneCondition>("new");
  const [regBattery, setRegBattery] = useState<string>("");
  const [regTargetLocation, setRegTargetLocation] =
    useState<StockLocation>("store");
  const [regStoreQty, setRegStoreQty] = useState<string>("0");
  const [regWarehouseQty, setRegWarehouseQty] = useState<string>("0");
  const [regNotes, setRegNotes] = useState<string>("");
  const [isRegisteringItem, setIsRegisteringItem] = useState<boolean>(false);
  const [purchasesDayMode, setPurchasesDayMode] =
    useState<DayFilterMode>("today");
  const [purchasesCustomDate, setPurchasesCustomDate] = useState<string>(() =>
    toLocalYmd(),
  );

  const loadSuppliers = useCallback(async () => {
    try {
      const items = await fetchSuppliersList();
      setSuppliers(items);
    } catch {
      // Suppliers dropdown will retry on refresh
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    setIsLoadingPurchases(true);
    try {
      const [purRes, supRes] = await Promise.allSettled([
        fetchPurchasesList(1, 30),
        fetchSuppliersList(),
      ]);
      if (purRes.status === "fulfilled") {
        setPurchases(purRes.value.data);
      } else {
        toast.error("تعذر جلب فواتير المشتريات");
      }
      if (supRes.status === "fulfilled") {
        setSuppliers(supRes.value);
      }
    } finally {
      setIsLoadingPurchases(false);
    }
  }, []);

  // PURCHASE HANDLERS
  const handleCreatePurchase = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isCreatingPurchase) return;

    if (!purSupplierId) {
      toast.error("يرجى اختيار المورد");
      return;
    }

    const validItems = purItems.filter(
      (i) =>
        i.productName.trim() &&
        i.brand.trim() &&
        Number.isInteger(i.quantity) &&
        i.quantity >= 1 &&
        i.purchasePrice >= 0,
    );

    if (validItems.length === 0) {
      toast.error("يرجى إدخال بيانات صنف واحد على الأقل بشكل صحيح");
      return;
    }

    const paidAmount = Number(purPaidAmount || 0);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      toast.error("المبلغ المدفوع غير صالح");
      return;
    }

    setIsCreatingPurchase(true);
    try {
      const { message, purchase } = await createPurchaseInvoice({
        supplier: purSupplierId,
        items: validItems.map((item) => ({
          productName: item.productName.trim(),
          brand: item.brand.trim(),
          model: item.model.trim() || undefined,
          productType: item.productType,
          quantity: item.quantity,
          purchasePrice: item.purchasePrice,
        })),
        paidAmount,
        notes: purNotes.trim() || undefined,
      });

      toast.success(message);
      setPurItems([
        {
          productName: "",
          brand: "",
          model: "",
          productType: "accessory",
          quantity: 1,
          purchasePrice: 0,
        },
      ]);
      setPurPaidAmount("0");
      setPurNotes("");
      setSelectedPurchase(purchase);
      await loadPurchases();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر إنشاء فاتورة الشراء",
      );
    } finally {
      setIsCreatingPurchase(false);
    }
  };

  const handleRegisterPurchasedItem = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!regTargetItem || isRegisteringItem) return;

    const sellingPrice = Number(regSellingPrice);
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      toast.error("يرجى إدخال سعر بيع صالح");
      return;
    }

    if (
      regTargetItem.productType === "phone" &&
      !/^\d{15}$/.test(regImei.trim())
    ) {
      toast.error("رقم IMEI للهاتف يجب أن يتكون من 15 رقماً بالضبط");
      return;
    }

    let allocations: Array<{ location: StockLocation; quantity: number }> = [];
    if (regTargetItem.productType !== "phone") {
      const sQty = Number(regStoreQty || "0");
      const wQty = Number(regWarehouseQty || "0");
      if (
        !Number.isInteger(sQty) ||
        sQty < 0 ||
        !Number.isInteger(wQty) ||
        wQty < 0
      ) {
        toast.error("كميات المحل والمخزن يجب أن تكون أعداداً صحيحة غير سالبة");
        return;
      }
      const totalReceiving = sQty + wQty;
      if (totalReceiving <= 0) {
        toast.error("يرجى إدخال كمية للاستلام في المحل أو المخزن");
        return;
      }
      if (totalReceiving > regTargetItem.remainingQuantity) {
        toast.error(
          `إجمالي الكمية (${totalReceiving}) يتجاوز المتبقي للاستلام (${regTargetItem.remainingQuantity})`,
        );
        return;
      }
      allocations = [
        ...(sQty > 0 ? [{ location: "store" as const, quantity: sQty }] : []),
        ...(wQty > 0
          ? [{ location: "warehouse" as const, quantity: wQty }]
          : []),
      ];
    }

    setIsRegisteringItem(true);
    try {
      if (regTargetItem.productType === "phone") {
        const { message, purchase } = await registerPurchasedPhoneItem(
          regTargetItem.purchaseId,
          regTargetItem.itemId,
          {
            imei: regImei.trim(),
            sellingPrice,
            condition: regCondition,
            batteryHealth:
              regBattery.trim() !== "" ? Number(regBattery) : undefined,
            notes: regNotes.trim() || undefined,
            targetLocation: regTargetLocation,
          },
        );
        toast.success(message);
        setSelectedPurchase(purchase);
      } else {
        const { message, purchase } = await registerPurchasedAccessoryItem(
          regTargetItem.purchaseId,
          regTargetItem.itemId,
          {
            sellingPrice,
            notes: regNotes.trim() || undefined,
            allocations,
          },
        );
        toast.success(message);
        setSelectedPurchase(purchase);
      }

      setRegTargetItem(null);
      setRegImei("");
      setRegSellingPrice("");
      setRegBattery("");
      setRegStoreQty("0");
      setRegWarehouseQty("0");
      setRegNotes("");
      await loadPurchases();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر تسجيل الصنف في المخزون",
      );
    } finally {
      setIsRegisteringItem(false);
    }
  };

  const handleCancelPurchase = async (purchaseId: string) => {
    try {
      const msg = await cancelPurchaseInvoice(purchaseId);
      toast.success(msg);
      if (selectedPurchase?.id === purchaseId) {
        const updated = await fetchPurchaseById(purchaseId);
        setSelectedPurchase(updated);
      }
      await loadPurchases();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر إلغاء فاتورة الشراء",
      );
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadPurchases(), loadSuppliers()]);
    };
    void init();
  }, [loadPurchases, loadSuppliers]);

  return (
          <div className="space-y-6">
            {/* Create Purchase Invoice Form (POST /purchase) */}
            <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-5">
              <div className="border-b border-border pb-4">
                <h3 className="text-base sm:text-lg font-bold text-foreground">
                  إنشاء فاتورة مشتريات جديدة
                </h3>
                <p className="text-xs text-muted">
                  اختر المورد النشط، أضف الأصناف المشتراة، ثم قم بتسجيل استلام
                  الهواتف أو الإكسسوارات في المخزون
                </p>
              </div>

              <form onSubmit={handleCreatePurchase} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      المورد النشط *
                    </label>
                    <select
                      required
                      value={purSupplierId}
                      onChange={(e) => setPurSupplierId(e.target.value)}
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                    >
                      <option value="">اختر المورد...</option>
                      {suppliers
                        .filter((s) => s.isActive)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.phone})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      المبلغ المدفوع للمورد (ج.م)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={purPaidAmount}
                      onChange={(e) => setPurPaidAmount(e.target.value)}
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      ملاحظات الفاتورة
                    </label>
                    <input
                      type="text"
                      value={purNotes}
                      onChange={(e) => setPurNotes(e.target.value)}
                      placeholder="ملاحظات اختيارية..."
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                    />
                  </div>
                </div>

                {/* Purchase Items Builder */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      أصناف فاتورة الشراء
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPurItems((prev) => [
                          ...prev,
                          {
                            productName: "",
                            brand: "",
                            model: "",
                            productType: "accessory",
                            quantity: 1,
                            purchasePrice: 0,
                          },
                        ])
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold text-[#2563EB]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>إضافة سطر صنف</span>
                    </button>
                  </div>

                  {purItems.map((line, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 gap-2.5 sm:grid-cols-6 rounded-xl border border-border bg-background p-3"
                    >
                      <select
                        value={line.productType}
                        onChange={(e) =>
                          setPurItems((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? {
                                    ...p,
                                    productType: e.target.value as ProductType,
                                  }
                                : p,
                            ),
                          )
                        }
                        className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-foreground"
                      >
                        <option value="accessory">إكسسوار</option>
                        <option value="maintenance">صيانة</option>
                        <option value="phone">هاتف</option>
                      </select>

                      <input
                        type="text"
                        required
                        value={line.productName}
                        onChange={(e) =>
                          setPurItems((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? { ...p, productName: e.target.value }
                                : p,
                            ),
                          )
                        }
                        placeholder="اسم الصنف *"
                        className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs text-foreground"
                      />

                      <input
                        type="text"
                        required
                        value={line.brand}
                        onChange={(e) =>
                          setPurItems((prev) =>
                            prev.map((p, i) =>
                              i === idx ? { ...p, brand: e.target.value } : p,
                            ),
                          )
                        }
                        placeholder="الماركة *"
                        className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs text-foreground"
                      />

                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={line.quantity}
                        onChange={(e) =>
                          setPurItems((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? { ...p, quantity: Number(e.target.value) }
                                : p,
                            ),
                          )
                        }
                        placeholder="الكمية *"
                        className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs text-foreground"
                      />

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={line.purchasePrice || ""}
                        onChange={(e) =>
                          setPurItems((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? {
                                    ...p,
                                    purchasePrice: Number(e.target.value),
                                  }
                                : p,
                            ),
                          )
                        }
                        placeholder="سعر الشراء للوحدة *"
                        className="h-9 rounded-lg border border-border bg-surface px-2.5 text-xs text-foreground"
                      />

                      <div className="flex items-center justify-end">
                        {purItems.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPurItems((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                            className="rounded-lg border border-border bg-surface p-2 text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={isCreatingPurchase}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-6 text-xs font-bold text-white disabled:opacity-60"
                >
                  {isCreatingPurchase ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  <span>حفظ فاتورة الشراء</span>
                </button>
              </form>
            </section>

            {/* Register Purchased Phone / Accessory / Maintenance Inline Form */}
            {regTargetItem ? (
              <section className="rounded-2xl border border-[#2563EB] bg-surface p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      تسجيل استلام بالمخزون: {regTargetItem.productName} (
                      {regTargetItem.productType === "phone"
                        ? "هاتف — يسجل جهاز واحد لكل عملية"
                        : `${regTargetItem.productType === "maintenance" ? "صيانة" : "إكسسوار"} — المتبقي للاستلام: ${regTargetItem.remainingQuantity}`}
                      )
                    </h4>
                    {regTargetItem.productType !== "phone" ? (
                      <p className="mt-1 text-xs text-muted">
                        يمكنك إدخال الكمية بالكامل في المحل أو المخزن أو تقسيمها
                        بين الموقعين.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {regTargetItem.productType !== "phone" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setRegStoreQty(
                              String(regTargetItem.remainingQuantity),
                            );
                            setRegWarehouseQty("0");
                          }}
                          className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground hover:border-[#2563EB]"
                        >
                          الكل للمحل ({regTargetItem.remainingQuantity})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRegStoreQty("0");
                            setRegWarehouseQty(
                              String(regTargetItem.remainingQuantity),
                            );
                          }}
                          className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground hover:border-[#2563EB]"
                        >
                          الكل للمخزن ({regTargetItem.remainingQuantity})
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setRegTargetItem(null)}
                      className="text-xs text-muted hover:text-foreground"
                    >
                      إغلاق
                    </button>
                  </div>
                </div>

                <form
                  onSubmit={handleRegisterPurchasedItem}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-4"
                >
                  {regTargetItem.productType === "phone" ? (
                    <>
                      <input
                        type="text"
                        required
                        maxLength={15}
                        value={regImei}
                        onChange={(e) => setRegImei(e.target.value)}
                        placeholder="رقم IMEI (15 رقماً) *"
                        className="h-10 rounded-xl border border-border bg-background px-3 font-mono text-xs text-foreground"
                      />
                      <select
                        value={regTargetLocation}
                        onChange={(e) =>
                          setRegTargetLocation(e.target.value as StockLocation)
                        }
                        className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
                      >
                        <option value="store">
                          استلام في المحل (توليد باركود)
                        </option>
                        <option value="warehouse">
                          استلام في المخزن (بدون باركود)
                        </option>
                      </select>
                      <select
                        value={regCondition}
                        onChange={(e) =>
                          setRegCondition(e.target.value as PhoneCondition)
                        }
                        className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                      >
                        <option value="new">جديد (New)</option>
                        <option value="used">مستعمل (Used)</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={regBattery}
                        onChange={(e) => setRegBattery(e.target.value)}
                        placeholder="صحة البطارية % (اختياري)"
                        className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                      />
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[11px] font-semibold text-muted mb-1">
                          كمية المحل (Store)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={regTargetItem.remainingQuantity}
                          step="1"
                          value={regStoreQty}
                          onChange={(e) => setRegStoreQty(e.target.value)}
                          placeholder="0"
                          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-muted mb-1">
                          كمية المخزن (Warehouse)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={regTargetItem.remainingQuantity}
                          step="1"
                          value={regWarehouseQty}
                          onChange={(e) => setRegWarehouseQty(e.target.value)}
                          placeholder="0"
                          className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex flex-col justify-end">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={regSellingPrice}
                      onChange={(e) => setRegSellingPrice(e.target.value)}
                      placeholder="سعر البيع للعميل (ج.م) *"
                      className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                    />
                  </div>

                  <div className="flex flex-col justify-end">
                    <input
                      type="text"
                      value={regNotes}
                      onChange={(e) => setRegNotes(e.target.value)}
                      placeholder="ملاحظات (اختياري)"
                      className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                    />
                  </div>

                  <div className="flex flex-col justify-end sm:col-span-4">
                    <button
                      type="submit"
                      disabled={isRegisteringItem}
                      className="h-10 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-4 text-xs font-bold"
                    >
                      {isRegisteringItem
                        ? "جاري التسجيل..."
                        : "تأكيد الإدخال للمخزون"}
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            {/* Purchases List & Details */}
            <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <h3 className="text-lg font-bold text-foreground">
                  سجل فواتير المشتريات ({purchases.length})
                </h3>
                <button
                  type="button"
                  onClick={loadPurchases}
                  disabled={isLoadingPurchases}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isLoadingPurchases ? "animate-spin" : ""}`}
                  />
                  <span>تحديث</span>
                </button>
              </div>

              <DayFilterBar
                mode={purchasesDayMode}
                customDate={purchasesCustomDate}
                onModeChange={setPurchasesDayMode}
                onCustomDateChange={setPurchasesCustomDate}
                totalCount={purchases.length}
                filteredCount={
                  filterBySelectedDay(
                    purchases,
                    (p) => p.createdAt,
                    purchasesDayMode,
                    purchasesCustomDate,
                  ).length
                }
                itemLabel="فاتورة شراء"
              />

              {isLoadingPurchases ? (
                <div className="flex min-h-[180px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
                </div>
              ) : filterBySelectedDay(
                  purchases,
                  (p) => p.createdAt,
                  purchasesDayMode,
                  purchasesCustomDate,
                ).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
                  <p className="text-sm font-semibold text-foreground">
                    لا توجد فواتير مشتريات مسجلة في هذا اليوم
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border bg-background">
                  {filterBySelectedDay(
                    purchases,
                    (p) => p.createdAt,
                    purchasesDayMode,
                    purchasesCustomDate,
                  ).map((pur) => {
                    const canCancel =
                      pur.status === "draft" &&
                      pur.paidAmount === 0 &&
                      pur.items.every((i) => i.registeredQuantity === 0);

                    return (
                      <div key={pur.id} className="p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-foreground">
                                المورد: {pur.supplierName}
                              </span>
                              <span
                                className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                                  pur.status === "completed"
                                    ? "bg-success/10 text-success"
                                    : pur.status === "cancelled"
                                      ? "bg-danger/10 text-danger"
                                      : "bg-[#2563EB]/10 text-[#2563EB]"
                                }`}
                              >
                                {pur.status === "completed"
                                  ? "مكتملة"
                                  : pur.status === "cancelled"
                                    ? "ملغاة"
                                    : "مسودة (Draft)"}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                              <span>الإجمالي: {pur.totalAmount} ج.م</span>
                              <span>المدفوع: {pur.paidAmount} ج.م</span>
                              <span>المتبقي: {pur.remainingAmount} ج.م</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const d = await fetchPurchaseById(pur.id);
                                  setSelectedPurchase(d);
                                } catch {
                                  setSelectedPurchase(pur);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>الأصناف والاستلام</span>
                            </button>

                            {canCancel ? (
                              <button
                                type="button"
                                onClick={() => void handleCancelPurchase(pur.id)}
                                className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>إلغاء</span>
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selected Purchase Items & Registration Trigger */}
              {selectedPurchase ? (
                <div className="rounded-2xl border border-border bg-background p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">
                        أصناف فاتورة الشراء — المورد:{" "}
                        {selectedPurchase.supplierName}
                      </h4>
                      <p className="text-xs text-muted">
                        حالة الفاتورة: {selectedPurchase.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPurchase(null)}
                      className="text-xs font-semibold text-muted hover:text-foreground"
                    >
                      إغلاق
                    </button>
                  </div>

                  <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                    {selectedPurchase.items.map((item) => {
                      const remainingToRegister =
                        item.quantity - item.registeredQuantity;
                      const canRegister =
                        selectedPurchase.status !== "cancelled" &&
                        remainingToRegister > 0;

                      return (
                        <div
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="font-bold text-foreground">
                              {item.productName} ({item.brand}) —{" "}
                              {item.productType === "phone"
                                ? "هاتف"
                                : item.productType === "maintenance"
                                  ? "صيانة"
                                  : "إكسسوار"}
                            </div>
                            <div className="text-muted">
                              الكمية المشتراة: {item.quantity} • المسجل
                              بالمخزون: {item.registeredQuantity} • سعر الشراء:{" "}
                              {item.purchasePrice} ج.م
                            </div>
                          </div>

                          {canRegister ? (
                            <button
                              type="button"
                              onClick={() => {
                                setRegTargetItem({
                                  purchaseId: selectedPurchase.id,
                                  itemId: item.id,
                                  productName: item.productName,
                                  productType: item.productType,
                                  remainingQuantity: remainingToRegister,
                                });
                                setRegTargetLocation("store");
                                setRegStoreQty(String(remainingToRegister));
                                setRegWarehouseQty("0");
                              }}
                              className="rounded-xl bg-[#2563EB] px-3.5 py-1.5 text-xs font-semibold text-white"
                            >
                              {item.productType === "phone"
                                ? "تسجيل جهاز هاتف (IMEI)"
                                : item.productType === "maintenance"
                                  ? "تسجيل كمية الصيانة بالمخزون"
                                  : "تسجيل كمية الإكسسوار بالمخزون"}
                            </button>
                          ) : (
                            <span className="rounded-lg bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
                              تم التسجيل بالكامل
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
  );
}
