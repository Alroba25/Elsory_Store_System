"use client";

import { useCallback, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Award,
  BarChart3,
  Boxes,
  CheckCircle2,
  Edit3,
  Eye,
  Loader2,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ScanBarcode,
  Search,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import type { AuthUser } from "@/src/components/providers/auth-provider";
import {
  ROLE_CONFIGURATIONS,
  type StoreUserRole,
} from "@/src/components/dashboard/dashboard-config";
import { DashboardLayout } from "@/src/components/dashboard/dashboard-layout";
import {
  DayFilterBar,
  filterBySelectedDay,
  toLocalYmd,
  type DayFilterMode,
} from "@/src/components/dashboard/day-filter-bar";
import { OwnerAnalyticsWorkspace } from "@/src/components/dashboard/owner-analytics-workspace";
import {
  OwnerWarehouseWorkspace,
  type WarehouseSectionId,
} from "@/src/components/dashboard/owner-warehouse-workspace";
import {
  PrintableProductBarcodesModal,
  printProductBarcodesSheet,
} from "@/src/components/dashboard/printable-product-barcodes-modal";
import {
  cancelPurchaseInvoice,
  createOwnerProduct,
  createPurchaseInvoice,
  createSupplier,
  DashboardApiError,
  deactivateOwnerProduct,
  deactivateSupplierById,
  fetchActiveShiftsForOwner,
  fetchOwnerInactiveProducts,
  fetchOwnerProductById,
  fetchOwnerProducts,
  fetchProductByBarcode,
  fetchPurchaseById,
  fetchPurchasesList,
  fetchReturnById,
  fetchReturnsList,
  fetchSaleById,
  fetchSalesList,
  fetchShiftByIdForOwner,
  fetchShiftHistory,
  fetchShiftReportsForOwner,
  fetchSupplierById,
  fetchSuppliersList,
  fetchUsersList,
  registerPurchasedAccessoryItem,
  registerPurchasedPhoneItem,
  restoreOwnerProduct,
  toggleUserStatusById,
  updateOwnerAccessoryStock,
  updateOwnerProduct,
  updateSupplierById,
  updateSupplierStatusById,
  updateUserRoleById,
  type PaymentMethod,
  type PhoneCondition,
  type ProductType,
  type ShiftReportGroup,
  type StoreProductItem,
  type StorePurchaseRecord,
  type StoreReturnRecord,
  type StoreSaleRecord,
  type StoreShiftRecord,
  type StoreSupplierRecord,
  type StoreUserRecord,
} from "@/src/services/dashboard.service";

interface OwnerDashboardProps {
  user: AuthUser;
}

const OWNER_PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  cash: "نقدي (Cash)",
  wallet: "محفظة إلكترونية (Wallet)",
  instapay: "إنستا باي (InstaPay)",
  visa: "فيزا (Visa)",
};

interface DraftPurchaseItem {
  productName: string;
  brand: string;
  model: string;
  productType: ProductType;
  quantity: number;
  purchasePrice: number;
}

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function getFirstDayOfMonthString(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

const OWNER_OVERVIEW_MODULES = [
  {
    id: "sales",
    title: "المبيعات والفواتير",
    accessMode: "مراقبة وعرض فقط",
    description:
      "استعراض جميع فواتير المبيعات الصادرة عبر الكاشير والاطلاع على تفاصيل كل فاتورة.",
    icon: ReceiptText,
  },
  {
    id: "products",
    title: "المنتجات والمخزون",
    accessMode: "إدارة كاملة",
    description:
      "إضافة وتعديل المنتجات، إدارة المخزون، المنتجات غير النشطة، والبحث بالباركود.",
    icon: Boxes,
  },
  {
    id: "suppliers",
    title: "إدارة الموردين",
    accessMode: "إدارة كاملة",
    description:
      "إضافة وتعديل بيانات الموردين، عرض التفاصيل، وتغيير حالة حساب المورد.",
    icon: Truck,
  },
  {
    id: "purchases",
    title: "إدارة المشتريات",
    accessMode: "إدارة كاملة",
    description:
      "إنشاء فواتير الشراء، تسجيل الهواتف والإكسسوارات المستلمة بالمخزون، أو إلغاء الفاتورة.",
    icon: ShoppingBag,
  },
  {
    id: "returns",
    title: "مراقبة المرتجعات",
    accessMode: "مراقبة وعرض فقط",
    description:
      "متابعة سجل المرتجعات وتفاصيلها المسجلة عبر الكاشير دون تعديل مباشر.",
    icon: RotateCcw,
  },
  {
    id: "shifts",
    title: "الورديات وحركة الخزينة",
    accessMode: "مراقبة وتقارير",
    description:
      "مراقبة الورديات النشطة، سجل الورديات، تفاصيل كل وردية، وتقارير الورديات.",
    icon: Wallet,
  },
  {
    id: "employees",
    title: "الموظفون والصلاحيات",
    accessMode: "إدارة كاملة",
    description:
      "استعراض حسابات الموظفين، تعديل الدور الوظيفي لكل موظف، وتفعيل أو إيقاف الحساب.",
    icon: Users,
  },
  {
    id: "reports",
    title: "التقارير المالية والتشغيلية",
    accessMode: "تقارير شاملة",
    description:
      "استعراض تقارير المبيعات والمشتريات والمرتجعات خلال فترة زمنية محددة.",
    icon: BarChart3,
  },
] as const;

export function OwnerDashboard({ user }: OwnerDashboardProps) {
  const roleConfig = ROLE_CONFIGURATIONS.owner;
  const [activeSectionId, setActiveSectionId] = useState<string>("overview");

  // 1. Sales (View Only)
  const [salesSearch, setSalesSearch] = useState<string>("");
  const [sales, setSales] = useState<StoreSaleRecord[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState<boolean>(false);
  const [selectedSale, setSelectedSale] = useState<StoreSaleRecord | null>(
    null,
  );

  // 2. Products & Inventory
  const [products, setProducts] = useState<StoreProductItem[]>([]);
  const [showInactiveProducts, setShowInactiveProducts] =
    useState<boolean>(false);
  const [productTypeFilter, setProductTypeFilter] = useState<
    "" | ProductType
  >("");
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
  const [newProdBrand, setNewProdBrand] = useState<string>("");
  const [newProdModel, setNewProdModel] = useState<string>("");
  const [newProdSellingPrice, setNewProdSellingPrice] = useState<string>("");
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

  // Stock Adjustment State (Accessories only)
  const [stockTargetProduct, setStockTargetProduct] =
    useState<StoreProductItem | null>(null);
  const [stockOperation, setStockOperation] = useState<"increase" | "decrease">(
    "increase",
  );
  const [stockQuantityInput, setStockQuantityInput] = useState<string>("1");
  const [isUpdatingStock, setIsUpdatingStock] = useState<boolean>(false);

  // 3. Suppliers
  const [suppliers, setSuppliers] = useState<StoreSupplierRecord[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState<boolean>(false);
  const [selectedSupplier, setSelectedSupplier] =
    useState<StoreSupplierRecord | null>(null);
  const [supName, setSupName] = useState<string>("");
  const [supEmail, setSupEmail] = useState<string>("");
  const [supPhone, setSupPhone] = useState<string>("");
  const [supAddress, setSupAddress] = useState<string>("");
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(
    null,
  );
  const [isSavingSupplier, setIsSavingSupplier] = useState<boolean>(false);

  // 4. Purchases
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

  // Register Purchased Item State (Phone / Accessory)
  const [regTargetItem, setRegTargetItem] = useState<{
    purchaseId: string;
    itemId: string;
    productName: string;
    productType: ProductType;
  } | null>(null);
  const [regImei, setRegImei] = useState<string>("");
  const [regSellingPrice, setRegSellingPrice] = useState<string>("");
  const [regCondition, setRegCondition] = useState<PhoneCondition>("new");
  const [regBattery, setRegBattery] = useState<string>("");
  const [regNotes, setRegNotes] = useState<string>("");
  const [isRegisteringItem, setIsRegisteringItem] = useState<boolean>(false);

  // 5. Returns (View Only)
  const [returnsInvoiceFilter, setReturnsInvoiceFilter] = useState<string>("");
  const [returnsList, setReturnsList] = useState<StoreReturnRecord[]>([]);
  const [isLoadingReturns, setIsLoadingReturns] = useState<boolean>(false);
  const [selectedReturn, setSelectedReturn] =
    useState<StoreReturnRecord | null>(null);

  // 6. Shifts Monitoring & Reports
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

  // Day-by-Day Filters (Default = Today so yesterday's records stay hidden until selected)
  const [salesDayMode, setSalesDayMode] = useState<DayFilterMode>("today");
  const [salesCustomDate, setSalesCustomDate] = useState<string>(() =>
    toLocalYmd(),
  );
  const [purchasesDayMode, setPurchasesDayMode] =
    useState<DayFilterMode>("today");
  const [purchasesCustomDate, setPurchasesCustomDate] = useState<string>(() =>
    toLocalYmd(),
  );
  const [returnsDayMode, setReturnsDayMode] = useState<DayFilterMode>("today");
  const [returnsCustomDate, setReturnsCustomDate] = useState<string>(() =>
    toLocalYmd(),
  );
  const [shiftsDayMode, setShiftsDayMode] = useState<DayFilterMode>("today");
  const [shiftsCustomDate, setShiftsCustomDate] = useState<string>(() =>
    toLocalYmd(),
  );

  // 7. Employees & Roles
  const [employees, setEmployees] = useState<StoreUserRecord[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState<boolean>(false);
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);

  // Data Loaders
  const loadSales = useCallback(async (search?: string) => {
    setIsLoadingSales(true);
    try {
      const res = await fetchSalesList({ limit: 30, search });
      setSales(res.data);
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر جلب سجل المبيعات",
      );
    } finally {
      setIsLoadingSales(false);
    }
  }, []);

  const loadProducts = useCallback(
    async (
      inactive: boolean,
      typeFilter: "" | ProductType,
      nameSearch: string,
    ) => {
      setIsLoadingProducts(true);
      try {
        if (inactive) {
          const res = await fetchOwnerInactiveProducts(1, 50);
          setProducts(res.products);
        } else {
          const res = await fetchOwnerProducts({
            limit: 50,
            type: typeFilter || undefined,
            name: nameSearch.trim() || undefined,
          });
          setProducts(res.products);
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

  const loadSuppliers = useCallback(async () => {
    setIsLoadingSuppliers(true);
    try {
      const items = await fetchSuppliersList();
      setSuppliers(items);
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر جلب قائمة الموردين",
      );
    } finally {
      setIsLoadingSuppliers(false);
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

  const loadReturns = useCallback(async (invoiceNumber?: string) => {
    setIsLoadingReturns(true);
    try {
      const res = await fetchReturnsList({ limit: 30, invoiceNumber });
      setReturnsList(res.data);
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر جلب سجل المرتجعات",
      );
    } finally {
      setIsLoadingReturns(false);
    }
  }, []);

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

  const loadEmployees = useCallback(async () => {
    setIsLoadingEmployees(true);
    try {
      const items = await fetchUsersList();
      setEmployees(items);
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر جلب قائمة الموظفين",
      );
    } finally {
      setIsLoadingEmployees(false);
    }
  }, []);

  const handleSelectSection = useCallback(
    (nextSectionId: string) => {
      setActiveSectionId(nextSectionId);
      if (nextSectionId === "sales") void loadSales(salesSearch);
      else if (nextSectionId === "products")
        void loadProducts(
          showInactiveProducts,
          productTypeFilter,
          productSearchName,
        );
      else if (nextSectionId === "suppliers") void loadSuppliers();
      else if (nextSectionId === "purchases") void loadPurchases();
      else if (nextSectionId === "returns")
        void loadReturns(returnsInvoiceFilter);
      else if (nextSectionId === "shifts")
        void loadShifts(shiftStartDate, shiftEndDate);
      else if (nextSectionId === "employees") void loadEmployees();
    },
    [
      salesSearch,
      showInactiveProducts,
      productTypeFilter,
      productSearchName,
      returnsInvoiceFilter,
      shiftStartDate,
      shiftEndDate,
      loadSales,
      loadProducts,
      loadSuppliers,
      loadPurchases,
      loadReturns,
      loadShifts,
      loadEmployees,
    ],
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
        toast.error("كمية الإكسسوار يجب أن تكون عدداً صحيحاً موجباً");
        return;
      }
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

    setIsUpdatingStock(true);
    try {
      const { message } = await updateOwnerAccessoryStock(
        stockTargetProduct.id,
        {
          operation: stockOperation,
          quantity: qty,
        },
      );
      toast.success(message);
      setStockTargetProduct(null);
      setStockQuantityInput("1");
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

  // SUPPLIER HANDLERS
  const handleSaveSupplier = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSavingSupplier) return;

    if (
      supName.trim().length < 3 ||
      !supEmail.trim() ||
      !supPhone.trim() ||
      !supAddress.trim()
    ) {
      toast.error(
        "يرجى إدخال اسم المورد (3 أحرف على الأقل)، البريد، الهاتف، والعنوان",
      );
      return;
    }

    setIsSavingSupplier(true);
    try {
      if (editingSupplierId) {
        const msg = await updateSupplierById(editingSupplierId, {
          name: supName.trim(),
          email: supEmail.trim(),
          phone: supPhone.trim(),
          address: supAddress.trim(),
        });
        toast.success(msg);
      } else {
        const msg = await createSupplier({
          name: supName.trim(),
          email: supEmail.trim(),
          phone: supPhone.trim(),
          address: supAddress.trim(),
        });
        toast.success(msg);
      }
      setEditingSupplierId(null);
      setSupName("");
      setSupEmail("");
      setSupPhone("");
      setSupAddress("");
      await loadSuppliers();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر حفظ بيانات المورد",
      );
    } finally {
      setIsSavingSupplier(false);
    }
  };

  const handleToggleSupplierStatus = async (sup: StoreSupplierRecord) => {
    try {
      const msg = await updateSupplierStatusById(sup.id, !sup.isActive);
      toast.success(msg);
      await loadSuppliers();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر تغيير حالة المورد",
      );
    }
  };

  const handleDeactivateSupplier = async (supplierId: string) => {
    try {
      const msg = await deactivateSupplierById(supplierId);
      toast.success(msg);
      await loadSuppliers();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر إيقاف تفعيل المورد",
      );
    }
  };

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
          },
        );
        toast.success(message);
        setSelectedPurchase(purchase);
      }

      setRegTargetItem(null);
      setRegImei("");
      setRegSellingPrice("");
      setRegBattery("");
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

  // EMPLOYEE HANDLERS
  const handleRoleChange = async (
    targetUserId: string,
    nextRole: StoreUserRole,
  ) => {
    setMutatingUserId(targetUserId);
    try {
      const msg = await updateUserRoleById(targetUserId, nextRole);
      toast.success(msg);
      await loadEmployees();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر تحديث الدور الوظيفي",
      );
    } finally {
      setMutatingUserId(null);
    }
  };

  const handleToggleUserStatus = async (
    targetUserId: string,
    currentStatus: boolean,
  ) => {
    setMutatingUserId(targetUserId);
    try {
      const msg = await toggleUserStatusById(targetUserId, !currentStatus);
      toast.success(msg);
      await loadEmployees();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر تحديث حالة الحساب",
      );
    } finally {
      setMutatingUserId(null);
    }
  };

  return (
    <DashboardLayout
      user={user}
      roleConfig={roleConfig}
      activeSectionId={activeSectionId}
      onSelectSection={handleSelectSection}
    >
      <div className="space-y-8">
        {/* Executive Welcome Banner */}
        <section className="relative overflow-hidden rounded-3xl border border-[#242424] bg-[#111111] p-6 sm:p-8 text-[#F5F5F5] shadow-xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#2563EB]/15 blur-3xl"
          />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[#242424] bg-[#1B1B1E] px-3.5 py-1 text-xs font-semibold text-[#F5F5F5]">
                <ShieldCheck
                  className="h-4 w-4 text-[#2563EB]"
                  aria-hidden="true"
                />
                <span>{roleConfig.accentLabel}</span>
                <span className="text-[#A6A6A6]">•</span>
                <span className="text-[#A6A6A6]">
                  ELSORY STORE (السوري ستور)
                </span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F5F5]">
                مرحباً، {user.name}
              </h2>
              <p className="text-sm sm:text-base leading-relaxed text-[#A6A6A6]">
                {roleConfig.summaryAr}
              </p>
            </div>

            <div className="flex flex-col gap-2.5 shrink-0 rounded-2xl border border-[#242424] bg-[#18181B] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F5F5]">
                <Award
                  className="h-4 w-4 text-[#2563EB]"
                  aria-hidden="true"
                />
                <span>موزع معتمد لمنتجات Apple</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#A6A6A6]">
                <CheckCircle2
                  className="h-4 w-4 text-[#2563EB]"
                  aria-hidden="true"
                />
                <span>البيع يتم حصرياً عبر الكاشير • الرقابة والإدارة للمالك</span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 1: STORE OVERVIEW */}
        {activeSectionId === "overview" ? (
          <section
            aria-labelledby="owner-overview-heading"
            className="space-y-5"
          >
            <div>
              <h3
                id="owner-overview-heading"
                className="text-lg sm:text-xl font-bold text-foreground"
              >
                وحدات الإدارة والرقابة التنفيذية
              </h3>
              <p className="text-xs sm:text-sm text-muted">
                اختر الوحدة المطلوبة لإدارة المخزون والموردين والمشتريات أو
                مراقبة المبيعات والورديات والتقارير
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {OWNER_OVERVIEW_MODULES.map((mod) => {
                const Icon = mod.icon;
                return (
                  <article
                    key={mod.id}
                    className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#2563EB]/45"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-foreground transition-colors group-hover:border-[#2563EB]/30 group-hover:bg-[#2563EB]/10 group-hover:text-[#2563EB]">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <span className="rounded-lg border border-border bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold text-muted">
                          {mod.accessMode}
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-foreground mb-2">
                        {mod.title}
                      </h4>
                      <p className="text-xs leading-relaxed text-muted">
                        {mod.description}
                      </p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-border/80">
                      <button
                        type="button"
                        onClick={() => handleSelectSection(mod.id)}
                        className="inline-flex w-full items-center justify-between text-xs font-semibold text-foreground transition-colors group-hover:text-[#2563EB]"
                      >
                        <span>فتح القسم</span>
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Live Store Financial & Operational Analytics Overview */}
            <OwnerAnalyticsWorkspace initialSectionTab="overview" />
          </section>
        ) : null}

        {/* SECTION 2: SALES & INVOICES – VIEW ONLY */}
        {activeSectionId === "sales" ? (
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-foreground">
                    مراقبة المبيعات والفواتير
                  </h3>
                  <span className="rounded-md bg-[#2563EB]/10 px-2.5 py-0.5 text-xs font-bold text-[#2563EB]">
                    عرض فقط (View Only)
                  </span>
                </div>
                <p className="text-xs text-muted mt-1">
                  استعراض فواتير المبيعات الصادرة عبر الكاشير وتفاصيلها
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadSales(salesSearch)}
                disabled={isLoadingSales}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoadingSales ? "animate-spin" : ""}`}
                />
                <span>تحديث</span>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadSales(salesSearch);
              }}
              className="flex gap-3"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="search"
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  placeholder="ابحث برقم الفاتورة (INV-...) أو اسم العميل أو الهاتف..."
                  className="h-11 w-full rounded-xl border border-border bg-background pr-10 pl-4 text-xs sm:text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="h-11 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-5 text-xs font-semibold"
              >
                بحث
              </button>
            </form>

            <DayFilterBar
              mode={salesDayMode}
              customDate={salesCustomDate}
              onModeChange={setSalesDayMode}
              onCustomDateChange={setSalesCustomDate}
              totalCount={sales.length}
              filteredCount={
                filterBySelectedDay(
                  sales,
                  (s) => s.saleDate,
                  salesDayMode,
                  salesCustomDate,
                ).length
              }
              itemLabel="فاتورة"
            />

            {isLoadingSales ? (
              <div className="flex min-h-[180px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
              </div>
            ) : filterBySelectedDay(
                sales,
                (s) => s.saleDate,
                salesDayMode,
                salesCustomDate,
              ).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
                <p className="text-sm font-semibold text-foreground">
                  لا توجد فواتير مبيعات مطابقة في هذا اليوم
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-background">
                {filterBySelectedDay(
                  sales,
                  (s) => s.saleDate,
                  salesDayMode,
                  salesCustomDate,
                ).map((sale) => (
                  <div
                    key={sale.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          dir="ltr"
                          className="text-sm font-bold font-mono text-foreground"
                        >
                          {sale.invoiceNumber}
                        </span>
                        <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted border border-border">
                          {sale.paymentStatus}
                        </span>
                        {sale.payments.map((pmt, pIdx) => (
                          <span
                            key={`${pmt.method}-${pIdx}`}
                            className="rounded-md border border-[#2563EB]/30 bg-[#2563EB]/10 px-2 py-0.5 text-[11px] font-bold text-[#2563EB]"
                          >
                            {OWNER_PAYMENT_METHOD_LABELS[pmt.method] ??
                              pmt.method}
                            : {pmt.amount} ج.م
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span>الصافي: {sale.finalAmount} ج.م</span>
                        <span>المدفوع: {sale.paidAmount} ج.م</span>
                        <span>الكاشير: {sale.cashierName}</span>
                        {sale.customerName ? (
                          <span>العميل: {sale.customerName}</span>
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const detail = await fetchSaleById(sale.id);
                          setSelectedSale(detail);
                        } catch {
                          toast.error("تعذر جلب تفاصيل الفاتورة");
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground hover:border-[#2563EB]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>عرض التفاصيل</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedSale ? (
              <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <h4 className="text-base font-bold text-foreground">
                      تفاصيل الفاتورة{" "}
                      <span dir="ltr" className="font-mono text-[#2563EB]">
                        {selectedSale.invoiceNumber}
                      </span>
                    </h4>
                    <p className="text-xs text-muted">
                      الكاشير: {selectedSale.cashierName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSale(null)}
                    className="text-xs font-semibold text-muted hover:text-foreground"
                  >
                    إغلاق
                  </button>
                </div>

                {/* Paid Payment Methods Breakdown */}
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 text-xs">
                  <span className="font-bold text-foreground">
                    طرق الدفع المسجلة:
                  </span>
                  {selectedSale.payments.length === 0 ? (
                    <span className="text-muted">لم تُسجل دفعات</span>
                  ) : (
                    selectedSale.payments.map((pmt, pIdx) => (
                      <span
                        key={`${pmt.method}-${pIdx}`}
                        className="rounded-lg border border-[#2563EB]/30 bg-[#2563EB]/10 px-2.5 py-1 font-bold text-[#2563EB]"
                      >
                        {OWNER_PAYMENT_METHOD_LABELS[pmt.method] ?? pmt.method}:{" "}
                        {pmt.amount} ج.م
                      </span>
                    ))
                  )}
                </div>

                <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                  {selectedSale.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-foreground">
                          {item.productName}
                        </span>{" "}
                        <span className="text-muted">({item.brand})</span>
                        {item.imei ? (
                          <span dir="ltr" className="ml-2 font-mono text-muted">
                            IMEI: {item.imei}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 text-muted">
                        <span>الكمية: {item.quantity}</span>
                        <span>السعر: {item.unitPrice} ج.م</span>
                        <strong className="text-foreground">
                          الإجمالي: {item.lineTotal} ج.م
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* SECTION 3: PRODUCTS & INVENTORY – FULL MANAGEMENT */}
        {activeSectionId === "products" ? (
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
                    onChange={(e) =>
                      setNewProdType(e.target.value as ProductType)
                    }
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
                  >
                    <option value="accessory">إكسسوار (Accessory)</option>
                    <option value="maintenance">صيانة (Maintenance)</option>
                    <option value="phone">هاتف (Phone)</option>
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

                {newProdType === "accessory" ||
                newProdType === "maintenance" ? (
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
                    تعديل كمية مخزون الإكسسوار: {stockTargetProduct.name}{" "}
                    (الكمية الحالية: {stockTargetProduct.quantity})
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
                  className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                >
                  <select
                    value={stockOperation}
                    onChange={(e) =>
                      setStockOperation(
                        e.target.value as "increase" | "decrease",
                      )
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
                    استعراض المنتجات النشطة أو غير النشطة، الفحص بالباركود،
                    والتحكم بالمخزون
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
                      void loadProducts(
                        true,
                        productTypeFilter,
                        productSearchName,
                      );
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
                        <span dir="ltr">
                          IMEI: {selectedProductDetail.imei}
                        </span>
                      ) : null}
                    </div>
                    <div className="pt-1 text-xs text-foreground">
                      <span className="font-semibold text-muted">
                        الملاحظات:{" "}
                      </span>
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
                <div className="flex min-h-[180px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
                </div>
              ) : products.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
                  <p className="text-sm font-semibold text-foreground">
                    لا توجد منتجات في هذه القائمة
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {products.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between rounded-2xl border border-border bg-background p-5 space-y-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted">
                          <span className="rounded-md border border-border bg-surface px-2 py-0.5 font-semibold text-foreground">
                            {item.type === "phone" ? "هاتف" : "إكسسوار"}
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
                              المحل: <strong className="text-foreground">{item.storeQuantity}</strong>
                            </span>
                            <span>
                              • المخزن: <strong className="text-foreground">{item.warehouseQuantity}</strong>
                            </span>
                            {item.damagedQuantity > 0 ? (
                              <span className="text-danger">
                                • تالف: <strong>{item.damagedQuantity}</strong>
                              </span>
                            ) : null}
                            {item.unallocatedQuantity > 0 ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                • غير مخصص: <strong>{item.unallocatedQuantity}</strong>
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
                            {item.notes?.trim()
                              ? item.notes
                              : "لا توجد ملاحظات"}
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
        ) : null}

        {/* SECTION 4: SUPPLIERS MANAGEMENT */}
        {activeSectionId === "suppliers" ? (
          <div className="space-y-6">
            {/* Add / Edit Supplier Form */}
            <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-foreground">
                    {editingSupplierId
                      ? "تعديل بيانات المورد"
                      : "إضافة مورد جديد"}
                  </h3>
                  <p className="text-xs text-muted">
                    جميع الحقول مطلوبة (الاسم، البريد الإلكتروني، رقم الهاتف،
                    والعنوان)
                  </p>
                </div>
                {editingSupplierId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSupplierId(null);
                      setSupName("");
                      setSupEmail("");
                      setSupPhone("");
                      setSupAddress("");
                    }}
                    className="text-xs font-semibold text-muted hover:text-foreground"
                  >
                    إلغاء التعديل
                  </button>
                ) : null}
              </div>

              <form
                onSubmit={handleSaveSupplier}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
              >
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={50}
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  placeholder="اسم المورد (3-50 حرفاً)"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
                <input
                  type="email"
                  required
                  value={supEmail}
                  onChange={(e) => setSupEmail(e.target.value)}
                  placeholder="email@supplier.com"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
                <input
                  type="text"
                  required
                  value={supPhone}
                  onChange={(e) => setSupPhone(e.target.value)}
                  placeholder="رقم الهاتف (7-15 رقماً)"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
                <input
                  type="text"
                  required
                  value={supAddress}
                  onChange={(e) => setSupAddress(e.target.value)}
                  placeholder="العنوان بالتفصيل"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
                <button
                  type="submit"
                  disabled={isSavingSupplier}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white disabled:opacity-60"
                >
                  {isSavingSupplier ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  <span>
                    {editingSupplierId ? "حفظ التعديلات" : "إضافة المورد"}
                  </span>
                </button>
              </form>
            </section>

            {/* Suppliers List */}
            <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <h3 className="text-lg font-bold text-foreground">
                  سجل الموردين ({suppliers.length})
                </h3>
                <button
                  type="button"
                  onClick={loadSuppliers}
                  disabled={isLoadingSuppliers}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isLoadingSuppliers ? "animate-spin" : ""}`}
                  />
                  <span>تحديث</span>
                </button>
              </div>

              {selectedSupplier ? (
                <div className="rounded-xl border border-[#2563EB]/40 bg-[#2563EB]/5 p-4 flex items-center justify-between text-xs">
                  <div className="space-y-1">
                    <div className="font-bold text-foreground text-sm">
                      بيانات المورد: {selectedSupplier.name}
                    </div>
                    <div className="flex flex-wrap gap-3 text-muted">
                      <span dir="ltr">{selectedSupplier.email}</span>
                      <span dir="ltr">{selectedSupplier.phone}</span>
                      <span>العنوان: {selectedSupplier.address}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSupplier(null)}
                    className="text-xs font-semibold text-muted hover:text-foreground"
                  >
                    إغلاق
                  </button>
                </div>
              ) : null}

              {isLoadingSuppliers ? (
                <div className="flex min-h-[180px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
                </div>
              ) : suppliers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
                  <p className="text-sm font-semibold text-foreground">
                    لا يوجد موردون مسجلون حالياً
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {suppliers.map((sup) => (
                    <div
                      key={sup.id}
                      className="rounded-2xl border border-border bg-background p-5 flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <h4 className="text-base font-bold text-foreground">
                            {sup.name}
                          </h4>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                              sup.isActive
                                ? "bg-success/10 text-success"
                                : "bg-danger/10 text-danger"
                            }`}
                          >
                            {sup.isActive ? "نشط" : "غير نشط"}
                          </span>
                        </div>
                        <p dir="ltr" className="text-xs text-muted text-right">
                          {sup.phone} • {sup.email}
                        </p>
                        <p className="text-xs text-muted">{sup.address}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border text-xs">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const d = await fetchSupplierById(sup.id);
                              setSelectedSupplier(d);
                            } catch {
                              setSelectedSupplier(sup);
                            }
                          }}
                          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-semibold text-foreground"
                        >
                          تفاصيل
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSupplierId(sup.id);
                            setSupName(sup.name);
                            setSupEmail(sup.email);
                            setSupPhone(sup.phone);
                            setSupAddress(sup.address);
                          }}
                          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-semibold text-foreground"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleSupplierStatus(sup)}
                          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-semibold text-[#2563EB]"
                        >
                          {sup.isActive ? "إيقاف" : "تفعيل"}
                        </button>
                        {sup.isActive ? (
                          <button
                            type="button"
                            onClick={() => void handleDeactivateSupplier(sup.id)}
                            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-semibold text-danger"
                          >
                            حذف/تعطيل
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}

        {/* SECTION 5: PURCHASES MANAGEMENT */}
        {activeSectionId === "purchases" ? (
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

            {/* Register Purchased Phone / Accessory Inline Form */}
            {regTargetItem ? (
              <section className="rounded-2xl border border-[#2563EB] bg-surface p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-foreground">
                    تسجيل استلام بالمخزون: {regTargetItem.productName} (
                    {regTargetItem.productType === "phone"
                      ? "هاتف — يسجل جهاز واحد لكل عملية"
                      : "إكسسوار — يسجل الكمية المتبقية بالكامل"}
                    )
                  </h4>
                  <button
                    type="button"
                    onClick={() => setRegTargetItem(null)}
                    className="text-xs text-muted hover:text-foreground"
                  >
                    إغلاق
                  </button>
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
                  ) : null}

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

                  <input
                    type="text"
                    value={regNotes}
                    onChange={(e) => setRegNotes(e.target.value)}
                    placeholder="ملاحظات (اختياري)"
                    className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                  />

                  <button
                    type="submit"
                    disabled={isRegisteringItem}
                    className="h-10 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-4 text-xs font-bold"
                  >
                    {isRegisteringItem
                      ? "جاري التسجيل..."
                      : "تأكيد الإدخال للمخزون"}
                  </button>
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
                              onClick={() =>
                                setRegTargetItem({
                                  purchaseId: selectedPurchase.id,
                                  itemId: item.id,
                                  productName: item.productName,
                                  productType: item.productType,
                                })
                              }
                              className="rounded-xl bg-[#2563EB] px-3.5 py-1.5 text-xs font-semibold text-white"
                            >
                              {item.productType === "phone"
                                ? "تسجيل جهاز هاتف (IMEI)"
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
        ) : null}

        {/* SECTION 6: RETURNS MONITORING – VIEW ONLY */}
        {activeSectionId === "returns" ? (
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-foreground">
                    مراقبة المرتجعات
                  </h3>
                  <span className="rounded-md bg-[#2563EB]/10 px-2.5 py-0.5 text-xs font-bold text-[#2563EB]">
                    عرض فقط (View Only)
                  </span>
                </div>
                <p className="text-xs text-muted mt-1">
                  استعراض سجل المرتجعات وتفاصيلها
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadReturns(returnsInvoiceFilter)}
                disabled={isLoadingReturns}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoadingReturns ? "animate-spin" : ""}`}
                />
                <span>تحديث</span>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadReturns(returnsInvoiceFilter);
              }}
              className="flex gap-3"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="search"
                  value={returnsInvoiceFilter}
                  onChange={(e) => setReturnsInvoiceFilter(e.target.value)}
                  placeholder="تصفية المرتجعات برقم الفاتورة (INV-...)..."
                  className="h-11 w-full rounded-xl border border-border bg-background pr-10 pl-4 text-xs sm:text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="h-11 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-5 text-xs font-semibold"
              >
                تصفية
              </button>
            </form>

            <DayFilterBar
              mode={returnsDayMode}
              customDate={returnsCustomDate}
              onModeChange={setReturnsDayMode}
              onCustomDateChange={setReturnsCustomDate}
              totalCount={returnsList.length}
              filteredCount={
                filterBySelectedDay(
                  returnsList,
                  (r) => r.returnDate,
                  returnsDayMode,
                  returnsCustomDate,
                ).length
              }
              itemLabel="مرتجع"
            />

            {isLoadingReturns ? (
              <div className="flex min-h-[180px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
              </div>
            ) : filterBySelectedDay(
                returnsList,
                (r) => r.returnDate,
                returnsDayMode,
                returnsCustomDate,
              ).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
                <p className="text-sm font-semibold text-foreground">
                  لا توجد مرتجعات مسجلة في هذا اليوم
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-background">
                {filterBySelectedDay(
                  returnsList,
                  (r) => r.returnDate,
                  returnsDayMode,
                  returnsCustomDate,
                ).map((ret) => (
                  <div
                    key={ret.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-4"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-foreground">
                        <span dir="ltr" className="font-mono">
                          {ret.returnNumber}
                        </span>{" "}
                        — فاتورة:{" "}
                        <span dir="ltr" className="font-mono text-muted">
                          {ret.invoiceNumber}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span>إجمالي المرتجع: {ret.totalRefundAmount} ج.م</span>
                        <span>المسترد فعلياً: {ret.refundedAmount} ج.م</span>
                        <span>الكاشير: {ret.cashierName}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const d = await fetchReturnById(ret.id);
                          setSelectedReturn(d);
                        } catch {
                          setSelectedReturn(ret);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>التفاصيل</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedReturn ? (
              <div className="rounded-2xl border border-border bg-background p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h4 className="text-sm font-bold text-foreground">
                    تفاصيل المرتجع {selectedReturn.returnNumber}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setSelectedReturn(null)}
                    className="text-xs font-semibold text-muted hover:text-foreground"
                  >
                    إغلاق
                  </button>
                </div>
                <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                  {selectedReturn.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-foreground">
                          {item.productName}
                        </span>
                        {item.reason ? (
                          <span className="text-muted">
                            {" "}
                            — السبب: {item.reason}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-muted">
                        الكمية: {item.quantity} • قيمة الاسترداد:{" "}
                        <strong className="text-foreground">
                          {item.refundAmount} ج.م
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* SECTION 7: SHIFTS & CASH MANAGEMENT – MONITORING & REPORTS */}
        {activeSectionId === "shifts" ? (
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
        ) : null}

        {/* SECTION 8: EMPLOYEES & ROLES MANAGEMENT */}
        {activeSectionId === "employees" ? (
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  إدارة الموظفين والأدوار الوظيفية
                </h3>
                <p className="text-xs text-muted">
                  تعديل الدور الوظيفي أو تفعيل/إيقاف حسابات الموظفين
                </p>
              </div>
              <button
                type="button"
                onClick={loadEmployees}
                disabled={isLoadingEmployees}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoadingEmployees ? "animate-spin" : ""}`}
                />
                <span>تحديث القائمة</span>
              </button>
            </div>

            {isLoadingEmployees ? (
              <div className="flex min-h-[180px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
              </div>
            ) : employees.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
                <p className="text-sm font-semibold text-foreground">
                  لا توجد حسابات موظفين للعرض حالياً
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-background">
                {employees.map((emp) => {
                  const isSelf = emp.id === user.id;

                  return (
                    <div
                      key={emp.id}
                      className="flex flex-wrap items-center justify-between gap-4 p-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground">
                            {emp.name}
                          </span>
                          {isSelf ? (
                            <span className="rounded-md bg-[#2563EB]/10 px-2 py-0.5 text-[10px] font-bold text-[#2563EB]">
                              حسابك الحالي
                            </span>
                          ) : null}
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              emp.isActive
                                ? "bg-success/10 text-success"
                                : "bg-danger/10 text-danger"
                            }`}
                          >
                            {emp.isActive ? "نشط" : "موقوف"}
                          </span>
                        </div>
                        <div
                          dir="ltr"
                          className="text-xs text-muted text-right"
                        >
                          {emp.email}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <select
                          aria-label={`تغيير دور ${emp.name}`}
                          value={emp.role}
                          disabled={mutatingUserId === emp.id || isSelf}
                          onChange={(e) =>
                            void handleRoleChange(
                              emp.id,
                              e.target.value as StoreUserRole,
                            )
                          }
                          className="h-9 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground focus:border-[#2563EB] focus:outline-none disabled:opacity-50"
                        >
                          <option value="owner">owner (مالك)</option>
                          <option value="cashier">cashier (كاشير)</option>
                          <option value="accessories_seller">
                            accessories_seller (قسم الإكسسوارات)
                          </option>
                          <option value="maintenance_seller">
                            maintenance_seller (قسم الصيانة)
                          </option>
                          <option value="phone_seller">
                            phone_seller (قسم الموبايلات)
                          </option>
                          <option value="general">general (موظف عام)</option>
                        </select>

                        <button
                          type="button"
                          disabled={mutatingUserId === emp.id || isSelf}
                          onClick={() =>
                            void handleToggleUserStatus(emp.id, emp.isActive)
                          }
                          className="h-9 rounded-xl border border-border bg-surface px-3.5 text-xs font-semibold text-foreground hover:border-[#2563EB] disabled:opacity-50"
                        >
                          {emp.isActive ? "إيقاف الحساب" : "تفعيل الحساب"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {/* SECTION 9: FINANCIAL & OPERATIONAL REPORTS (from & to YYYY-MM-DD) */}
        {activeSectionId === "reports" ? (
          <OwnerAnalyticsWorkspace initialSectionTab="overview" />
        ) : null}

        {/* SECTION 10: WAREHOUSE MANAGEMENT (TRANSFERS, AUDIT, UNALLOCATED, MOVEMENTS) */}
        {activeSectionId === "transfers" ||
        activeSectionId === "inventory-audit" ||
        activeSectionId === "unallocated" ||
        activeSectionId === "stock-movements" ? (
          <OwnerWarehouseWorkspace
            section={activeSectionId as WarehouseSectionId}
            onInventoryMutated={() =>
              void loadProducts(
                showInactiveProducts,
                productTypeFilter,
                productSearchName,
              )
            }
          />
        ) : null}
      </div>

      {/* Printable Product Barcodes Modal (Code 128 SVG Stickers) */}
      <PrintableProductBarcodesModal
        key={barcodePrintProduct?.id ?? "none"}
        product={barcodePrintProduct}
        onClose={() => setBarcodePrintProduct(null)}
      />
    </DashboardLayout>
  );
}
