"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Edit3,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  ScanBarcode,
} from "lucide-react";
import {
  PrintableProductBarcodesModal,
  printProductBarcodesSheet,
} from "@/src/components/dashboard/printable-product-barcodes-modal";
import {
  createOwnerProduct,
  DashboardApiError,
  deactivateOwnerProduct,
  fetchOwnerInactiveProducts,
  fetchOwnerProductById,
  fetchOwnerProducts,
  fetchProductByBarcode,
  restoreOwnerProduct,
  updateOwnerAccessoryStock,
  updateOwnerProduct,
  type PhoneCondition,
  type ProductType,
  type StockLocation,
  type StoreProductItem,
} from "@/src/services/dashboard.service";

export function OwnerProductsSection() {
  const [products, setProducts] = useState<StoreProductItem[]>([]);
  const [showInactiveProducts, setShowInactiveProducts] =
    useState<boolean>(false);
  const [productTypeFilter, setProductTypeFilter] = useState<
    "" | ProductType
  >("");
  const [productLocationFilter, setProductLocationFilter] = useState<
    "all" | "store" | "warehouse"
  >("all");
  const [productSearchName, setProductSearchName] = useState<string>("");
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(false);
  const [barcodeQuery, setBarcodeQuery] = useState<string>("");
  const [selectedProductDetail, setSelectedProductDetail] =
    useState<StoreProductItem | null>(null);
  const [barcodePrintProduct, setBarcodePrintProduct] =
    useState<StoreProductItem | null>(null);

  // Create Product Form State
  const [newProdName, setNewProdName] = useState<string>("");
  const [newProdType, setNewProdType] = useState<ProductType>("accessory");
  const [newProdLocation, setNewProdLocation] =
    useState<StockLocation>("store");
  const [newProdBrand, setNewProdBrand] = useState<string>("");
  const [newProdModel, setNewProdModel] = useState<string>("");
  const [newProdSellingPrice, setNewProdSellingPrice] = useState<string>("");
  const [newProdCostPrice, setNewProdCostPrice] = useState<string>("");
  const [newProdQuantity, setNewProdQuantity] = useState<string>("1");
  const [newProdImei, setNewProdImei] = useState<string>("");
  const [newProdCondition, setNewProdCondition] =
    useState<PhoneCondition>("new");
  const [newProdBattery, setNewProdBattery] = useState<string>("");
  const [newProdNotes, setNewProdNotes] = useState<string>("");
  const [isCreatingProduct, setIsCreatingProduct] = useState<boolean>(false);

  // Edit Product State
  const [editingProduct, setEditingProduct] =
    useState<StoreProductItem | null>(null);
  const [editProdName, setEditProdName] = useState<string>("");
  const [editProdBrand, setEditProdBrand] = useState<string>("");
  const [editProdModel, setEditProdModel] = useState<string>("");
  const [editProdPrice, setEditProdPrice] = useState<string>("");
  const [editProdNotes, setEditProdNotes] = useState<string>("");
  const [isUpdatingProduct, setIsUpdatingProduct] = useState<boolean>(false);

  // Stock Adjustment State (Accessories & Maintenance)
  const [stockTargetProduct, setStockTargetProduct] =
    useState<StoreProductItem | null>(null);
  const [stockOperation, setStockOperation] = useState<"increase" | "decrease">(
    "increase",
  );
  const [stockLocation, setStockLocation] = useState<StockLocation>("store");
  const [stockQuantityInput, setStockQuantityInput] = useState<string>("1");
  const [stockReason, setStockReason] = useState<string>("");
  const [isUpdatingStock, setIsUpdatingStock] = useState<boolean>(false);

  const loadProducts = useCallback(
    async (
      inactive: boolean,
      typeFilter: "" | ProductType,
      nameSearch: string,
    ) => {
      setIsLoadingProducts(true);
      try {
        if (inactive) {
          const res = await fetchOwnerInactiveProducts(1, 100);
          setProducts(res.products);
        } else {
          const firstPage = await fetchOwnerProducts({
            page: 1,
            limit: 100,
            type: typeFilter || undefined,
            name: nameSearch.trim() || undefined,
          });
          let allItems = firstPage.products;
          const totalPages = Math.min(firstPage.totalPages, 10);
          if (totalPages > 1) {
            const extraPages = await Promise.all(
              Array.from({ length: totalPages - 1 }, (_, i) =>
                fetchOwnerProducts({
                  page: i + 2,
                  limit: 100,
                  type: typeFilter || undefined,
                  name: nameSearch.trim() || undefined,
                }),
              ),
            );
            allItems = [
              ...allItems,
              ...extraPages.flatMap((pageRes) => pageRes.products),
            ];
          }
          setProducts(allItems);
        }
      } catch (error: unknown) {
        toast.error(
          error instanceof DashboardApiError
            ? error.message
            : "تعذر جلب قائمة المنتجات",
        );
      } finally {
        setIsLoadingProducts(false);
      }
    },
    [],
  );

  // PRODUCT HANDLERS
  const handleBarcodeSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!barcodeQuery.trim()) return;
    try {
      const item = await fetchProductByBarcode(barcodeQuery.trim());
      setSelectedProductDetail(item);
      toast.success(`تم العثور على المنتج: ${item.name}`);
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "لم يتم العثور على المنتج بالباركود",
      );
    }
  };

  const handleCreateProduct = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isCreatingProduct) return;

    const sellingPrice = Number(newProdSellingPrice);
    if (
      !newProdName.trim() ||
      !newProdBrand.trim() ||
      !Number.isFinite(sellingPrice) ||
      sellingPrice <= 0
    ) {
      toast.error("يرجى إدخال اسم المنتج والماركة وسعر بيع موجب");
      return;
    }

    if (newProdType === "phone") {
      if (!/^\d{15}$/.test(newProdImei.trim())) {
        toast.error("رقم IMEI للهاتف يجب أن يتكون من 15 رقماً بالضبط");
        return;
      }
    } else {
      const qty = Number(newProdQuantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        toast.error("الكمية يجب أن تكون عدداً صحيحاً موجباً");
        return;
      }
    }

    const costPriceNum =
      newProdCostPrice.trim() !== "" ? Number(newProdCostPrice) : undefined;
    if (
      costPriceNum !== undefined &&
      (!Number.isFinite(costPriceNum) || costPriceNum < 0)
    ) {
      toast.error("سعر التكلفة يجب أن يكون رقماً غير سالب");
      return;
    }

    setIsCreatingProduct(true);
    try {
      const batteryNum =
        newProdType === "phone" && newProdBattery.trim() !== ""
          ? Number(newProdBattery)
          : undefined;

      const { message } = await createOwnerProduct({
        name: newProdName.trim(),
        type: newProdType,
        brand: newProdBrand.trim(),
        model: newProdModel.trim() || undefined,
        sellingPrice,
        costPrice: costPriceNum,
        location: newProdLocation,
        ...(newProdType === "phone"
          ? {
              imei: newProdImei.trim(),
              condition: newProdCondition,
              batteryHealth: batteryNum,
            }
          : {
              quantity: Number(newProdQuantity),
              specifications: {},
            }),
        notes: newProdNotes.trim() || undefined,
      });

      toast.success(message);
      setNewProdName("");
      setNewProdBrand("");
      setNewProdModel("");
      setNewProdSellingPrice("");
      setNewProdCostPrice("");
      setNewProdQuantity("1");
      setNewProdImei("");
      setNewProdBattery("");
      setNewProdNotes("");
      await loadProducts(
        showInactiveProducts,
        productTypeFilter,
        productSearchName,
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر إضافة المنتج",
      );
    } finally {
      setIsCreatingProduct(false);
    }
  };

  const handleStartEditProduct = (item: StoreProductItem) => {
    setEditingProduct(item);
    setEditProdName(item.name);
    setEditProdBrand(item.brand);
    setEditProdModel(item.model ?? "");
    setEditProdPrice(String(item.sellingPrice));
    setEditProdNotes(item.notes ?? "");
  };

  const handleSaveEditProduct = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProduct || isUpdatingProduct) return;

    const sellingPrice = Number(editProdPrice);
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      toast.error("سعر البيع غير صالح");
      return;
    }

    setIsUpdatingProduct(true);
    try {
      const { message, product } = await updateOwnerProduct(editingProduct.id, {
        name: editProdName.trim(),
        brand: editProdBrand.trim(),
        model: editProdModel.trim(),
        sellingPrice,
        notes: editProdNotes.trim(),
      });
      toast.success(message);
      if (selectedProductDetail?.id === editingProduct.id) {
        setSelectedProductDetail(product);
      }
      setEditingProduct(null);
      await loadProducts(
        showInactiveProducts,
        productTypeFilter,
        productSearchName,
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر تحديث بيانات المنتج",
      );
    } finally {
      setIsUpdatingProduct(false);
    }
  };

  const handleAdjustAccessoryStock = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stockTargetProduct || isUpdatingStock) return;

    const qty = Number(stockQuantityInput);
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error("الكمية يجب أن تكون عدداً صحيحاً موجباً");
      return;
    }

    if (!stockReason.trim()) {
      toast.error("يرجى إدخال سبب تعديل الرصيد");
      return;
    }

    setIsUpdatingStock(true);
    try {
      const { message } = await updateOwnerAccessoryStock(
        stockTargetProduct.id,
        {
          operation: stockOperation,
          quantity: qty,
          location: stockLocation,
          reason: stockReason.trim(),
        },
      );
      toast.success(message);
      setStockTargetProduct(null);
      setStockQuantityInput("1");
      setStockReason("");
      await loadProducts(
        showInactiveProducts,
        productTypeFilter,
        productSearchName,
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر تحديث رصيد المخزون",
      );
    } finally {
      setIsUpdatingStock(false);
    }
  };

  const handleDeactivateProduct = async (productId: string) => {
    try {
      const msg = await deactivateOwnerProduct(productId);
      toast.success(msg);
      await loadProducts(
        showInactiveProducts,
        productTypeFilter,
        productSearchName,
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر إيقاف تفعيل المنتج",
      );
    }
  };

  const handleRestoreProduct = async (productId: string) => {
    try {
      const msg = await restoreOwnerProduct(productId);
      toast.success(msg);
      await loadProducts(
        showInactiveProducts,
        productTypeFilter,
        productSearchName,
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر استعادة المنتج",
      );
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadProducts(false, "", "");
    };
    void init();
  }, [loadProducts]);

  const visibleProducts = showInactiveProducts
    ? products
    : productLocationFilter === "store"
      ? products.filter((p) => p.storeQuantity > 0)
      : productLocationFilter === "warehouse"
        ? products.filter((p) => p.warehouseQuantity > 0)
        : products;

  return (
    <>
      <div className="space-y-6">
        {/* Add New Product Card (POST /products) */}
        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-5">
          <div className="border-b border-border pb-4">
            <h3 className="text-base sm:text-lg font-bold text-foreground">
              إضافة منتج جديد إلى المخزون
            </h3>
            <p className="text-xs text-muted">
              إضافة هاتف جديد (بـ IMEI من 15 رقماً وحالة الجهاز) أو إكسسوار
              بكمية محددة
            </p>
          </div>

          <form
            onSubmit={handleCreateProduct}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                نوع المنتج
              </label>
              <select
                value={newProdType}
                onChange={(e) => setNewProdType(e.target.value as ProductType)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
              >
                <option value="accessory">إكسسوار (Accessory)</option>
                <option value="maintenance">صيانة (Maintenance)</option>
                <option value="phone">هاتف (Phone)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                موقع الإضافة *
              </label>
              <select
                value={newProdLocation}
                onChange={(e) =>
                  setNewProdLocation(e.target.value as StockLocation)
                }
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
              >
                <option value="store">المحل (Store — متاح للبيع)</option>
                <option value="warehouse">المخزن (Warehouse — للتخزين)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                اسم المنتج *
              </label>
              <input
                type="text"
                required
                value={newProdName}
                onChange={(e) => setNewProdName(e.target.value)}
                placeholder="مثال: iPhone 16 Pro / شاحن Apple..."
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                الماركة (Brand) *
              </label>
              <input
                type="text"
                required
                value={newProdBrand}
                onChange={(e) => setNewProdBrand(e.target.value)}
                placeholder="Apple / Samsung / Anker..."
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                الموديل (اختياري)
              </label>
              <input
                type="text"
                value={newProdModel}
                onChange={(e) => setNewProdModel(e.target.value)}
                placeholder="مثال: 256GB / Type-C..."
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                سعر البيع (ج.م) *
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={newProdSellingPrice}
                onChange={(e) => setNewProdSellingPrice(e.target.value)}
                placeholder="0.00"
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                سعر التكلفة (ج.م — اختياري)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newProdCostPrice}
                onChange={(e) => setNewProdCostPrice(e.target.value)}
                placeholder="0.00"
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
            </div>

            {newProdType === "accessory" || newProdType === "maintenance" ? (
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  الكمية *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={newProdQuantity}
                  onChange={(e) => setNewProdQuantity(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    رقم IMEI (15 رقماً) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={15}
                    value={newProdImei}
                    onChange={(e) => setNewProdImei(e.target.value)}
                    placeholder="35xxxxxxxxxxxxx"
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 font-mono text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    حالة الهاتف *
                  </label>
                  <select
                    value={newProdCondition}
                    onChange={(e) =>
                      setNewProdCondition(e.target.value as PhoneCondition)
                    }
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                  >
                    <option value="new">جديد (New)</option>
                    <option value="used">مستعمل (Used)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    صحة البطارية % (0-100 اختياري)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newProdBattery}
                    onChange={(e) => setNewProdBattery(e.target.value)}
                    placeholder="100"
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                  />
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-foreground mb-1">
                ملاحظات (اختياري)
              </label>
              <input
                type="text"
                value={newProdNotes}
                onChange={(e) => setNewProdNotes(e.target.value)}
                placeholder="أي ملاحظات إضافية..."
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={isCreatingProduct}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white disabled:opacity-60"
              >
                {isCreatingProduct ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span>إضافة المنتج</span>
              </button>
            </div>
          </form>
        </section>

        {/* Edit Product Modal/Panel & Stock Adjustment Panel */}
        {editingProduct ? (
          <section className="rounded-2xl border border-[#2563EB] bg-surface p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">
                تعديل بيانات المنتج: {editingProduct.name}
              </h4>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="text-xs text-muted hover:text-foreground"
              >
                إلغاء
              </button>
            </div>
            <form
              onSubmit={handleSaveEditProduct}
              className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
              <input
                type="text"
                required
                value={editProdName}
                onChange={(e) => setEditProdName(e.target.value)}
                placeholder="اسم المنتج"
                className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
              <input
                type="text"
                required
                value={editProdBrand}
                onChange={(e) => setEditProdBrand(e.target.value)}
                placeholder="الماركة"
                className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
              <input
                type="text"
                value={editProdModel}
                onChange={(e) => setEditProdModel(e.target.value)}
                placeholder="الموديل"
                className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={editProdPrice}
                onChange={(e) => setEditProdPrice(e.target.value)}
                placeholder="سعر البيع"
                className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
              <input
                type="text"
                value={editProdNotes}
                onChange={(e) => setEditProdNotes(e.target.value)}
                placeholder="ملاحظات"
                className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
              <button
                type="submit"
                disabled={isUpdatingProduct}
                className="h-10 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-4 text-xs font-bold"
              >
                {isUpdatingProduct ? "جاري الحفظ..." : "حفظ التعديلات"}
              </button>
            </form>
          </section>
        ) : null}

        {stockTargetProduct ? (
          <section className="rounded-2xl border border-[#2563EB] bg-surface p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">
                تعديل رصيد المخزون: {stockTargetProduct.name} (المحل:{" "}
                {stockTargetProduct.storeQuantity} • المخزن:{" "}
                {stockTargetProduct.warehouseQuantity})
              </h4>
              <button
                type="button"
                onClick={() => setStockTargetProduct(null)}
                className="text-xs text-muted hover:text-foreground"
              >
                إلغاء
              </button>
            </div>
            <form
              onSubmit={handleAdjustAccessoryStock}
              className="grid grid-cols-1 gap-3 sm:grid-cols-5"
            >
              <select
                value={stockLocation}
                onChange={(e) =>
                  setStockLocation(e.target.value as StockLocation)
                }
                className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
              >
                <option value="store">المحل (Store)</option>
                <option value="warehouse">المخزن (Warehouse)</option>
              </select>
              <select
                value={stockOperation}
                onChange={(e) =>
                  setStockOperation(e.target.value as "increase" | "decrease")
                }
                className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
              >
                <option value="increase">زيادة الرصيد (increase)</option>
                <option value="decrease">إنقاص الرصيد (decrease)</option>
              </select>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={stockQuantityInput}
                onChange={(e) => setStockQuantityInput(e.target.value)}
                placeholder="الكمية"
                className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
              <input
                type="text"
                required
                value={stockReason}
                onChange={(e) => setStockReason(e.target.value)}
                placeholder="سبب التعديل *"
                className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
              <button
                type="submit"
                disabled={isUpdatingStock}
                className="h-10 rounded-xl bg-[#2563EB] text-white px-4 text-xs font-bold"
              >
                {isUpdatingStock ? "جاري التحديث..." : "تأكيد تعديل الرصيد"}
              </button>
            </form>
          </section>
        ) : null}

        {/* Products Catalog & Filters */}
        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <h3 className="text-lg font-bold text-foreground">
                قائمة المنتجات والمخزون
              </h3>
              <p className="text-xs text-muted">
                استعراض المنتجات النشطة أو غير النشطة، الفحص بالباركود، والتحكم
                بالمخزون
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowInactiveProducts(false);
                  void loadProducts(
                    false,
                    productTypeFilter,
                    productSearchName,
                  );
                }}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold ${
                  !showInactiveProducts
                    ? "bg-[#2563EB] text-white"
                    : "border border-border bg-background text-foreground"
                }`}
              >
                المنتجات النشطة
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowInactiveProducts(true);
                  void loadProducts(true, productTypeFilter, productSearchName);
                }}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold ${
                  showInactiveProducts
                    ? "bg-[#2563EB] text-white"
                    : "border border-border bg-background text-foreground"
                }`}
              >
                المنتجات غير النشطة
              </button>
              <button
                type="button"
                onClick={() =>
                  void loadProducts(
                    showInactiveProducts,
                    productTypeFilter,
                    productSearchName,
                  )
                }
                disabled={isLoadingProducts}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoadingProducts ? "animate-spin" : ""}`}
                />
                <span>تحديث</span>
              </button>
            </div>
          </div>

          {/* Location Filter Tabs (All / Store / Warehouse) */}
          {!showInactiveProducts ? (
            <div className="flex flex-wrap items-center gap-2">
              {[
                {
                  id: "all" as const,
                  label: `الكل (${products.length})`,
                },
                {
                  id: "store" as const,
                  label: `منتجات المحل — Store (${products.filter((p) => p.storeQuantity > 0).length})`,
                },
                {
                  id: "warehouse" as const,
                  label: `منتجات المخزن — Warehouse (${products.filter((p) => p.warehouseQuantity > 0).length})`,
                },
              ].map((locTab) => (
                <button
                  key={locTab.id}
                  type="button"
                  onClick={() => setProductLocationFilter(locTab.id)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                    productLocationFilter === locTab.id
                      ? "bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] shadow-2xs"
                      : "border border-border bg-background text-foreground hover:border-[#2563EB]/50"
                  }`}
                >
                  {locTab.label}
                </button>
              ))}
            </div>
          ) : null}

          {/* Filter & Barcode Lookup Row */}
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12">
            {!showInactiveProducts ? (
              <div className="lg:col-span-7 flex flex-wrap items-center gap-2">
                <select
                  value={productTypeFilter}
                  onChange={(e) => {
                    const nextType = e.target.value as "" | ProductType;
                    setProductTypeFilter(nextType);
                    void loadProducts(false, nextType, productSearchName);
                  }}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
                >
                  <option value="">كل الأنواع</option>
                  <option value="phone">الهواتف (phone)</option>
                  <option value="accessory">الإكسسوارات (accessory)</option>
                  <option value="maintenance">الصيانة (maintenance)</option>
                </select>

                <input
                  type="search"
                  value={productSearchName}
                  onChange={(e) => setProductSearchName(e.target.value)}
                  placeholder="بحث بالاسم..."
                  className="h-10 flex-1 rounded-xl border border-border bg-background px-3.5 text-xs text-foreground"
                />
                <button
                  type="button"
                  onClick={() =>
                    void loadProducts(
                      false,
                      productTypeFilter,
                      productSearchName,
                    )
                  }
                  className="h-10 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground hover:bg-surface-secondary"
                >
                  تصفية
                </button>
              </div>
            ) : null}

            <form
              onSubmit={handleBarcodeSearch}
              className="lg:col-span-5 flex items-center gap-2"
            >
              <div className="relative flex h-10 min-w-0 flex-1 items-center">
                <ScanBarcode className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="text"
                  value={barcodeQuery}
                  onChange={(e) => setBarcodeQuery(e.target.value)}
                  placeholder="فحص بالباركود..."
                  className="h-10 w-full rounded-xl border border-border bg-background pr-9 pl-3 text-xs text-foreground"
                />
              </div>
              <button
                type="submit"
                className="h-10 shrink-0 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-4 text-xs font-semibold"
              >
                فحص
              </button>
            </form>
          </div>

          {selectedProductDetail ? (
            <div className="rounded-xl border border-[#2563EB]/40 bg-[#2563EB]/5 p-4 flex flex-wrap items-start justify-between gap-3 text-xs">
              <div className="space-y-1.5">
                <div className="font-bold text-foreground text-sm">
                  تفاصيل المنتج: {selectedProductDetail.name} (
                  {selectedProductDetail.brand}
                  {selectedProductDetail.model
                    ? ` • ${selectedProductDetail.model}`
                    : ""}
                  )
                </div>
                <div className="flex flex-wrap gap-3 text-muted">
                  <span>
                    النوع:{" "}
                    <strong className="text-foreground">
                      {selectedProductDetail.type === "phone"
                        ? "هاتف (phone)"
                        : selectedProductDetail.type === "maintenance"
                          ? "صيانة (maintenance)"
                          : "إكسسوار (accessory)"}
                    </strong>
                  </span>
                  <span>
                    السعر:{" "}
                    <strong className="text-foreground">
                      {selectedProductDetail.sellingPrice} ج.م
                    </strong>
                  </span>
                  <span>
                    الكمية:{" "}
                    <strong className="text-foreground">
                      {selectedProductDetail.quantity}
                    </strong>
                  </span>
                  {selectedProductDetail.condition ? (
                    <span>
                      الحالة:{" "}
                      <strong className="text-foreground">
                        {selectedProductDetail.condition === "new"
                          ? "جديد"
                          : "مستعمل"}
                      </strong>
                    </span>
                  ) : null}
                  {selectedProductDetail.batteryHealth !== undefined ? (
                    <span>
                      صحة البطارية:{" "}
                      <strong className="text-foreground">
                        {selectedProductDetail.batteryHealth}%
                      </strong>
                    </span>
                  ) : null}
                  {selectedProductDetail.barcode ? (
                    <span dir="ltr">
                      Barcode: {selectedProductDetail.barcode}
                    </span>
                  ) : null}
                  {selectedProductDetail.imei ? (
                    <span dir="ltr">IMEI: {selectedProductDetail.imei}</span>
                  ) : null}
                </div>
                <div className="pt-1 text-xs text-foreground">
                  <span className="font-semibold text-muted">الملاحظات: </span>
                  <span className="font-medium">
                    {selectedProductDetail.notes?.trim()
                      ? selectedProductDetail.notes
                      : "لا توجد ملاحظات مسجلة"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProductDetail(null)}
                className="text-xs font-semibold text-muted hover:text-foreground"
              >
                إغلاق
              </button>
            </div>
          ) : null}

          {isLoadingProducts ? (
            <div className="flex min-h-45 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
              <p className="text-sm font-semibold text-foreground">
                لا توجد منتجات في هذه القائمة
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProducts.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col justify-between rounded-2xl border border-border bg-background p-5 space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span className="rounded-md border border-border bg-surface px-2 py-0.5 font-semibold text-foreground">
                        {item.type === "phone"
                          ? "هاتف"
                          : item.type === "maintenance"
                            ? "صيانة"
                            : "إكسسوار"}
                      </span>
                      {item.barcode ? (
                        <span dir="ltr" className="font-mono">
                          #{item.barcode}
                        </span>
                      ) : null}
                    </div>

                    <h4 className="text-base font-bold text-foreground">
                      {item.name}
                    </h4>
                    <p className="text-xs text-muted">
                      {item.brand} {item.model ? `• ${item.model}` : ""}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border text-xs">
                      <div className="flex flex-wrap items-center gap-2 text-muted">
                        <span>
                          المحل:{" "}
                          <strong className="text-foreground">
                            {item.storeQuantity}
                          </strong>
                        </span>
                        <span>
                          • المخزن:{" "}
                          <strong className="text-foreground">
                            {item.warehouseQuantity}
                          </strong>
                        </span>
                        {item.damagedQuantity > 0 ? (
                          <span className="text-danger">
                            • تالف: <strong>{item.damagedQuantity}</strong>
                          </span>
                        ) : null}
                        {item.unallocatedQuantity > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            • غير مخصص:{" "}
                            <strong>{item.unallocatedQuantity}</strong>
                          </span>
                        ) : null}
                      </div>
                      <span className="font-bold text-foreground">
                        {item.sellingPrice} ج.م
                      </span>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-surface px-3 py-2 text-xs">
                      <span className="font-semibold text-muted">
                        الملاحظات:{" "}
                      </span>
                      <span className="text-foreground">
                        {item.notes?.trim() ? item.notes : "لا توجد ملاحظات"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const d = await fetchOwnerProductById(item.id);
                          setSelectedProductDetail(d);
                        } catch {
                          setSelectedProductDetail(item);
                        }
                      }}
                      className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:border-[#2563EB]"
                    >
                      تفاصيل
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartEditProduct(item)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:border-[#2563EB]"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>تعديل</span>
                    </button>

                    {item.isActive &&
                    (item.type === "accessory" ||
                      item.type === "maintenance") ? (
                      <button
                        type="button"
                        onClick={() => setStockTargetProduct(item)}
                        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-[#2563EB]/10"
                      >
                        الرصيد
                      </button>
                    ) : null}

                    {item.barcode ? (
                      <button
                        type="button"
                        onClick={() => {
                          setBarcodePrintProduct(item);
                          printProductBarcodesSheet(
                            item,
                            Math.max(1, item.quantity),
                          );
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#2563EB]/40 bg-[#2563EB]/10 px-2.5 py-1.5 text-xs font-bold text-[#2563EB] transition-colors hover:bg-[#2563EB] hover:text-white"
                      >
                        <Printer className="h-3 w-3" />
                        <span>
                          طباعة الباركود ({Math.max(1, item.quantity)})
                        </span>
                      </button>
                    ) : null}

                    {item.isActive ? (
                      <button
                        type="button"
                        onClick={() => void handleDeactivateProduct(item.id)}
                        title="يتطلب أن تكون الكمية 0 لإلغاء التفعيل"
                        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10"
                      >
                        إيقاف
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleRestoreProduct(item.id)}
                        className="rounded-lg bg-success/10 px-2.5 py-1.5 text-xs font-bold text-success"
                      >
                        استعادة
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <PrintableProductBarcodesModal
        key={barcodePrintProduct?.id ?? "none"}
        product={barcodePrintProduct}
        onClose={() => setBarcodePrintProduct(null)}
      />
    </>
  );
}
