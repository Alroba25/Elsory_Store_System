"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Eye,
  History,
  Loader2,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ScanBarcode,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import type { AuthUser } from "@/src/components/providers/auth-provider";
import { ROLE_CONFIGURATIONS } from "@/src/components/dashboard/dashboard-config";
import { DashboardLayout } from "@/src/components/dashboard/dashboard-layout";
import {
  DayFilterBar,
  filterBySelectedDay,
  toLocalYmd,
  type DayFilterMode,
} from "@/src/components/dashboard/day-filter-bar";
import {
  PrintableSaleInvoiceModal,
  printSaleInvoicePdf,
} from "@/src/components/dashboard/printable-sale-invoice-modal";
import { normalizeBarcodeScannerInput } from "@/src/utils/barcode";
import {
  closeCashierShift,
  createReturnRequest,
  createSaleInvoice,
  DashboardApiError,
  fetchCurrentShift,
  fetchProductByBarcode,
  fetchReturnsList,
  fetchSaleById,
  fetchSalesList,
  fetchShiftHistory,
  fetchShiftSummary,
  openCashierShift,
  processReturnRefund,
  recordShiftMovement,
  type CashMovementType,
  type PaymentMethod,
  type ShiftReconciliation,
  type ShiftSummaryData,
  type StoreProductItem,
  type StoreReturnRecord,
  type StoreSaleRecord,
  type StoreShiftRecord,
} from "@/src/services/dashboard.service";

interface CashierDashboardProps {
  user: AuthUser;
}

interface PosCartItem {
  product: StoreProductItem;
  quantity: number;
  discountAmount: number;
  isGift: boolean;
}

interface SelectedReturnLine {
  selected: boolean;
  quantity: number;
  reason: string;
}

const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  cash: "نقدي (Cash)",
  wallet: "محفظة إلكترونية (Wallet)",
  instapay: "إنستا باي (InstaPay)",
  visa: "بطاقة بنكية (Visa)",
};

export function CashierDashboard({ user }: CashierDashboardProps) {
  const roleConfig = ROLE_CONFIGURATIONS.cashier;
  const [activeSectionId, setActiveSectionId] = useState<string>("pos");

  // 1. POS State (GET /products/barcode/:barcode & POST /sales)
  const [barcodeInput, setBarcodeInput] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const posBarcodeInputRef = useRef<HTMLInputElement | null>(null);
  const returnInvoiceInputRef = useRef<HTMLInputElement | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const lastPosKeyTimeRef = useRef<number>(0);
  const rapidPosStepCountRef = useRef<number>(0);
  const rapidPosAutoSubmitTimerRef = useRef<number | null>(null);
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paidAmountInput, setPaidAmountInput] = useState<string>("");
  const [hasMultiplePayments, setHasMultiplePayments] =
    useState<boolean>(false);
  const [secondPaymentMethod, setSecondPaymentMethod] =
    useState<PaymentMethod>("instapay");
  const [secondPaidAmountInput, setSecondPaidAmountInput] =
    useState<string>("");
  const [isSubmittingSale, setIsSubmittingSale] = useState<boolean>(false);
  const [lastCreatedSale, setLastCreatedSale] =
    useState<StoreSaleRecord | null>(null);
  const [printableInvoiceSale, setPrintableInvoiceSale] =
    useState<StoreSaleRecord | null>(null);

  // 2. Sales & Invoices State (GET /sales & GET /sales/:id)
  const [salesSearch, setSalesSearch] = useState<string>("");
  const [salesList, setSalesList] = useState<StoreSaleRecord[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState<boolean>(false);
  const [selectedSaleDetail, setSelectedSaleDetail] =
    useState<StoreSaleRecord | null>(null);
  const [isLoadingSaleDetail, setIsLoadingSaleDetail] =
    useState<boolean>(false);

  // 3. Returns & Refunds State (GET /sales?search=..., POST /return, GET /return, PATCH /return/:id/refund)
  const [returnsList, setReturnsList] = useState<StoreReturnRecord[]>([]);
  const [isLoadingReturns, setIsLoadingReturns] = useState<boolean>(false);
  const [returnInvoiceQuery, setReturnInvoiceQuery] = useState<string>("");
  const [isLookingUpInvoice, setIsLookingUpInvoice] = useState<boolean>(false);
  const [returnTargetSale, setReturnTargetSale] =
    useState<StoreSaleRecord | null>(null);
  const [returnLines, setReturnLines] = useState<
    Record<string, SelectedReturnLine>
  >({});
  const [isSubmittingReturn, setIsSubmittingReturn] = useState<boolean>(false);

  // Refund modal/inline state per return
  const [activeRefundReturnId, setActiveRefundReturnId] = useState<
    string | null
  >(null);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("cash");
  const [refundAmountInput, setRefundAmountInput] = useState<string>("");
  const [isProcessingRefund, setIsProcessingRefund] = useState<boolean>(false);

  // 4. Current Shift State (GET /shift/current, POST /shift/open, PATCH /shift/close)
  const [currentShift, setCurrentShift] = useState<StoreShiftRecord | null>(
    null,
  );
  const [isLoadingShift, setIsLoadingShift] = useState<boolean>(false);
  const [openingCashInput, setOpeningCashInput] = useState<string>("");
  const [closingCashInput, setClosingCashInput] = useState<string>("");
  const [closingVisaInput, setClosingVisaInput] = useState<string>("");
  const [closingInstapayInput, setClosingInstapayInput] = useState<string>("");
  const [closingWalletInput, setClosingWalletInput] = useState<string>("");
  const [isMutatingShift, setIsMutatingShift] = useState<boolean>(false);
  const [lastReconciliation, setLastReconciliation] =
    useState<ShiftReconciliation | null>(null);

  // Day-by-Day Filters (Default = Today)
  const [salesDayMode, setSalesDayMode] = useState<DayFilterMode>("today");
  const [salesCustomDate, setSalesCustomDate] = useState<string>(() =>
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

  // 5. Cash Movements State (POST /shift/movements)
  const [movementType, setMovementType] = useState<CashMovementType>("deposit");
  const [movementAmount, setMovementAmount] = useState<string>("");
  const [movementReason, setMovementReason] = useState<string>("");
  const [isSubmittingMovement, setIsSubmittingMovement] =
    useState<boolean>(false);

  // 6. Shift Summary & History State (GET /shift/summary & GET /shift/history)
  const [shiftSummary, setShiftSummary] = useState<ShiftSummaryData | null>(
    null,
  );
  const [shiftHistory, setShiftHistory] = useState<StoreShiftRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Cart Calculations matching saleSchema.pre("validate")
  const cartSummary = useMemo(() => {
    let grossTotal = 0;
    let totalDiscount = 0;

    for (const entry of cart) {
      const itemTotal = entry.product.sellingPrice * entry.quantity;
      const itemDiscount = entry.isGift
        ? itemTotal
        : Math.min(itemTotal, Math.max(0, entry.discountAmount));
      grossTotal += itemTotal;
      totalDiscount += itemDiscount;
    }

    const finalAmount = Number(Math.max(0, grossTotal - totalDiscount).toFixed(2));
    return {
      grossTotal: Number(grossTotal.toFixed(2)),
      totalDiscount: Number(totalDiscount.toFixed(2)),
      finalAmount,
    };
  }, [cart]);

  // Section Data Loaders
  const loadSales = useCallback(async (search?: string) => {
    setIsLoadingSales(true);
    try {
      const response = await fetchSalesList({ limit: 30, search });
      setSalesList(response.data);
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

  const loadReturns = useCallback(async () => {
    setIsLoadingReturns(true);
    try {
      const response = await fetchReturnsList({ limit: 30 });
      setReturnsList(response.data);
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

  const loadCurrentShift = useCallback(async () => {
    setIsLoadingShift(true);
    try {
      const shift = await fetchCurrentShift();
      setCurrentShift(shift);
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر جلب بيانات الوردية الحالية",
      );
    } finally {
      setIsLoadingShift(false);
    }
  }, []);

  const loadShiftHistoryAndSummary = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const [summaryResult, historyResult] = await Promise.allSettled([
        fetchShiftSummary(),
        fetchShiftHistory(),
      ]);
      if (summaryResult.status === "fulfilled") {
        setShiftSummary(summaryResult.value);
      }
      if (historyResult.status === "fulfilled") {
        setShiftHistory(historyResult.value);
      }
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const handleSelectSection = useCallback(
    (nextSectionId: string) => {
      setActiveSectionId(nextSectionId);
      if (nextSectionId === "sales") {
        void loadSales(salesSearch);
      } else if (nextSectionId === "returns") {
        void loadReturns();
      } else if (nextSectionId === "current-shift") {
        void loadCurrentShift();
      } else if (nextSectionId === "shift-history") {
        void loadShiftHistoryAndSummary();
      }
    },
    [
      salesSearch,
      loadSales,
      loadReturns,
      loadCurrentShift,
      loadShiftHistoryAndSummary,
    ],
  );

  // 1. POS Handlers
  const executePosBarcodeScan = useCallback(async (rawCode: string) => {
    const code = normalizeBarcodeScannerInput(rawCode);
    if (!code || isScanningRef.current) return;

    if (rapidPosAutoSubmitTimerRef.current) {
      window.clearTimeout(rapidPosAutoSubmitTimerRef.current);
      rapidPosAutoSubmitTimerRef.current = null;
    }

    isScanningRef.current = true;
    setIsScanning(true);
    try {
      const product = await fetchProductByBarcode(code);

      setCart((prev) => {
        const existingIndex = prev.findIndex(
          (item) => item.product.id === product.id,
        );

        if (existingIndex > -1) {
          if (product.type === "phone") {
            toast.error("كل هاتف يباع كجهاز منفرد بكمية 1 فقط");
            return prev;
          }
          const currentQty = prev[existingIndex].quantity;
          if (currentQty + 1 > product.quantity) {
            toast.error(
              `الكمية المتاحة في المخزون لهذا الصنف هي ${product.quantity} فقط`,
            );
            return prev;
          }
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: currentQty + 1,
          };
          return updated;
        }

        return [
          ...prev,
          {
            product,
            quantity: 1,
            discountAmount: 0,
            isGift: false,
          },
        ];
      });

      setBarcodeInput("");
      rapidPosStepCountRef.current = 0;
      toast.success(`تمت إضافة: ${product.name}`);
    } catch (error: unknown) {
      setBarcodeInput("");
      rapidPosStepCountRef.current = 0;
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "لم يتم العثور على منتج متاح بهذا الباركود",
      );
    } finally {
      isScanningRef.current = false;
      setIsScanning(false);
      window.setTimeout(() => {
        posBarcodeInputRef.current?.focus();
      }, 20);
    }
  }, []);

  const handleBarcodeLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await executePosBarcodeScan(barcodeInput);
  };

  const handlePosBarcodeInputChange = (rawNextValue: string) => {
    const normalized = normalizeBarcodeScannerInput(rawNextValue);
    setBarcodeInput(normalized);

    const now = performance.now();
    const delta = now - lastPosKeyTimeRef.current;
    lastPosKeyTimeRef.current = now;

    if (delta > 0 && delta < 55) {
      rapidPosStepCountRef.current += 1;
    } else {
      rapidPosStepCountRef.current = 1;
    }

    if (rapidPosAutoSubmitTimerRef.current) {
      window.clearTimeout(rapidPosAutoSubmitTimerRef.current);
      rapidPosAutoSubmitTimerRef.current = null;
    }

    // If a hardware Barcode Reader scans rapidly (>= 6 fast keystrokes & >= 8 chars)
    // and doesn't send Enter, auto-submit as soon as the burst finishes (110ms).
    if (rapidPosStepCountRef.current >= 6 && normalized.length >= 8) {
      rapidPosAutoSubmitTimerRef.current = window.setTimeout(() => {
        void executePosBarcodeScan(normalized);
      }, 110);
    }
  };

  const handleUpdateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const target = prev[index];
      if (!target) return prev;

      if (target.product.type === "phone" && delta > 0) {
        toast.error("كل هاتف يباع بكمية 1 فقط");
        return prev;
      }

      const nextQty = target.quantity + delta;
      if (nextQty > target.product.quantity) {
        toast.error(
          `الحد الأقصى المتاح في المخزون هو ${target.product.quantity}`,
        );
        return prev;
      }

      if (nextQty <= 0) {
        return prev.filter((_, idx) => idx !== index);
      }

      return prev.map((item, idx) =>
        idx === index ? { ...item, quantity: nextQty } : item,
      );
    });
  };

  const handleUpdateDiscount = (index: number, value: number) => {
    setCart((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const maxDiscount = item.product.sellingPrice * item.quantity;
        const validDiscount = Math.min(
          maxDiscount,
          Math.max(0, Number.isFinite(value) ? value : 0),
        );
        return { ...item, discountAmount: validDiscount };
      }),
    );
  };

  const handleToggleGift = (index: number, checked: boolean) => {
    setCart((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, isGift: checked } : item,
      ),
    );
  };

  const handleCheckoutSale = async () => {
    if (cart.length === 0 || isSubmittingSale) return;

    const finalAmount = cartSummary.finalAmount;
    const payments: Array<{ method: PaymentMethod; amount: number }> = [];

    if (!hasMultiplePayments) {
      const effectivePaid =
        paidAmountInput.trim() === ""
          ? finalAmount
          : Number(paidAmountInput.trim());

      if (!Number.isFinite(effectivePaid) || effectivePaid < 0) {
        toast.error("يرجى إدخال مبلغ مدفوع صحيح");
        return;
      }

      if (effectivePaid > finalAmount) {
        toast.error(
          "المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي النهائي للفاتورة",
        );
        return;
      }

      if (effectivePaid > 0) {
        payments.push({
          method: paymentMethod,
          amount: Number(effectivePaid.toFixed(2)),
        });
      }
    } else {
      const firstPaid = Number(paidAmountInput.trim());
      if (!Number.isFinite(firstPaid) || firstPaid <= 0) {
        toast.error("يرجى إدخال المبلغ المدفوع لطريقة الدفع الأولى بشكل صحيح");
        return;
      }

      const defaultSecondAmount = Math.max(
        0,
        Number((finalAmount - firstPaid).toFixed(2)),
      );
      const secondPaid =
        secondPaidAmountInput.trim() === ""
          ? defaultSecondAmount
          : Number(secondPaidAmountInput.trim());

      if (!Number.isFinite(secondPaid) || secondPaid <= 0) {
        toast.error("يرجى إدخال المبلغ المدفوع لطريقة الدفع الثانية بشكل صحيح");
        return;
      }

      const totalPaid = Number((firstPaid + secondPaid).toFixed(2));
      if (totalPaid > finalAmount) {
        toast.error(
          "إجمالي المبالغ المدفوعة لا يمكن أن يتجاوز الصافي المطلوب للفاتورة",
        );
        return;
      }

      payments.push(
        { method: paymentMethod, amount: Number(firstPaid.toFixed(2)) },
        { method: secondPaymentMethod, amount: Number(secondPaid.toFixed(2)) },
      );
    }

    setIsSubmittingSale(true);
    try {
      const { message, sale } = await createSaleInvoice({
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        items: cart.map((entry) => ({
          product: entry.product.id,
          quantity: entry.quantity,
          discountAmount: entry.discountAmount,
          isGift: entry.isGift,
        })),
        payments,
      });

      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setPaidAmountInput("");
      setSecondPaidAmountInput("");
      setHasMultiplePayments(false);
      setLastCreatedSale(sale);
      setPrintableInvoiceSale(sale);
      toast.success(message);
      printSaleInvoicePdf(sale);

      // Refresh affected shift and sales state
      void loadCurrentShift();
      void loadShiftHistoryAndSummary();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر إتمام عملية البيع",
      );
    } finally {
      setIsSubmittingSale(false);
    }
  };

  // 2. Sales Detail Handler
  const handleInspectSale = async (saleId: string) => {
    if (!saleId) return;
    setIsLoadingSaleDetail(true);
    try {
      const detail = await fetchSaleById(saleId);
      setSelectedSaleDetail(detail);
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر جلب تفاصيل الفاتورة",
      );
    } finally {
      setIsLoadingSaleDetail(false);
    }
  };

  // 3. Returns Workflow Handlers
  const executeReturnInvoiceLookup = useCallback(
    async (rawQuery: string) => {
      const query = normalizeBarcodeScannerInput(rawQuery);
      if (!query || isLookingUpInvoice) return;

      setIsLookingUpInvoice(true);
      try {
        const response = await fetchSalesList({ search: query, limit: 10 });
        const exactMatch =
          response.data.find(
            (s) => s.invoiceNumber.toLowerCase() === query.toLowerCase(),
          ) ?? response.data[0];

        if (!exactMatch) {
          setReturnTargetSale(null);
          setReturnLines({});
          toast.error("لم يتم العثور على فاتورة بهذا الرقم");
          return;
        }

        // Fetch full sale details by ID to guarantee all item subdocument _ids
        const fullSale = await fetchSaleById(exactMatch.id);
        setReturnTargetSale(fullSale);

        const initialLines: Record<string, SelectedReturnLine> = {};
        for (const item of fullSale.items) {
          initialLines[item.id] = {
            selected: false,
            quantity: 1,
            reason: "",
          };
        }
        setReturnLines(initialLines);
        toast.success(`تم تحميل أصناف الفاتورة ${fullSale.invoiceNumber}`);
      } catch (error: unknown) {
        toast.error(
          error instanceof DashboardApiError
            ? error.message
            : "تعذر البحث عن الفاتورة",
        );
      } finally {
        setIsLookingUpInvoice(false);
        window.setTimeout(() => {
          returnInvoiceInputRef.current?.focus();
        }, 20);
      }
    },
    [isLookingUpInvoice],
  );

  const handleLookupInvoiceForReturn = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    await executeReturnInvoiceLookup(returnInvoiceQuery);
  };

  // Global Hardware Barcode Reader Listener (captures scans even when input is unfocused)
  useEffect(() => {
    let buffer = "";
    let lastKeyTime = 0;
    let flushTimer: number | null = null;

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (printableInvoiceSale) return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditableTarget =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        Boolean(target?.isContentEditable);

      if (isEditableTarget) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const now = performance.now();
      if (now - lastKeyTime > 80) {
        buffer = "";
      }
      lastKeyTime = now;

      if (event.key === "Enter") {
        if (flushTimer) {
          window.clearTimeout(flushTimer);
          flushTimer = null;
        }
        const scanned = normalizeBarcodeScannerInput(buffer);
        buffer = "";
        if (scanned.length >= 4) {
          event.preventDefault();
          if (activeSectionId === "pos") {
            setBarcodeInput(scanned);
            posBarcodeInputRef.current?.focus();
            void executePosBarcodeScan(scanned);
          } else if (activeSectionId === "returns") {
            setReturnInvoiceQuery(scanned);
            returnInvoiceInputRef.current?.focus();
            void executeReturnInvoiceLookup(scanned);
          } else if (activeSectionId === "sales") {
            setSalesSearch(scanned);
            void loadSales(scanned);
          }
        }
        return;
      }

      if (event.key.length === 1) {
        buffer += event.key;
        if (flushTimer) {
          window.clearTimeout(flushTimer);
        }
        const snapshot = buffer;
        if (snapshot.length >= 8) {
          flushTimer = window.setTimeout(() => {
            const scanned = normalizeBarcodeScannerInput(snapshot);
            buffer = "";
            if (scanned.length >= 8) {
              if (activeSectionId === "pos") {
                setBarcodeInput(scanned);
                posBarcodeInputRef.current?.focus();
                void executePosBarcodeScan(scanned);
              } else if (activeSectionId === "returns") {
                setReturnInvoiceQuery(scanned);
                returnInvoiceInputRef.current?.focus();
                void executeReturnInvoiceLookup(scanned);
              }
            }
          }, 110);
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      if (flushTimer) {
        window.clearTimeout(flushTimer);
      }
    };
  }, [
    activeSectionId,
    printableInvoiceSale,
    executePosBarcodeScan,
    executeReturnInvoiceLookup,
    loadSales,
  ]);

  const handleSubmitReturn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!returnTargetSale || isSubmittingReturn) return;

    const selectedItems = returnTargetSale.items
      .filter((item) => returnLines[item.id]?.selected)
      .map((item) => {
        const line = returnLines[item.id];
        return {
          saleItem: item.id,
          quantity: item.productType === "phone" ? 1 : line.quantity,
          reason: line.reason.trim() || undefined,
          maxQuantity: item.quantity,
          productName: item.productName,
        };
      });

    if (selectedItems.length === 0) {
      toast.error("يرجى اختيار صنف واحد على الأقل من الفاتورة للاسترجاع");
      return;
    }

    for (const item of selectedItems) {
      if (
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > item.maxQuantity
      ) {
        toast.error(
          `الكمية المرتجعة للصنف (${item.productName}) يجب أن تكون بين 1 و ${item.maxQuantity}`,
        );
        return;
      }
    }

    setIsSubmittingReturn(true);
    try {
      const { message } = await createReturnRequest({
        invoiceNumber: returnTargetSale.invoiceNumber,
        items: selectedItems.map(({ saleItem, quantity, reason }) => ({
          saleItem,
          quantity,
          reason,
        })),
      });
      toast.success(message);
      setReturnTargetSale(null);
      setReturnLines({});
      setReturnInvoiceQuery("");
      await loadReturns();
      void loadShiftHistoryAndSummary();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر تسجيل المرتجع",
      );
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const handleSubmitRefund = async (returnRecord: StoreReturnRecord) => {
    if (isProcessingRefund) return;
    const amount = Number(refundAmountInput);

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > returnRecord.refundRemainingAmount
    ) {
      toast.error(
        `مبلغ الاسترداد يجب أن يكون أكبر من صفر ولا يتجاوز ${returnRecord.refundRemainingAmount} ج.م`,
      );
      return;
    }

    setIsProcessingRefund(true);
    try {
      const { message } = await processReturnRefund(returnRecord.id, {
        method: refundMethod,
        amount: Number(amount.toFixed(2)),
      });
      toast.success(message);
      setActiveRefundReturnId(null);
      setRefundAmountInput("");
      await loadReturns();
      void loadCurrentShift();
      void loadShiftHistoryAndSummary();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر تنفيذ استرداد المبلغ",
      );
    } finally {
      setIsProcessingRefund(false);
    }
  };

  // 4. Shift Handlers (openingCash & closingCash)
  const handleOpenShift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const openingCash = Number(openingCashInput);
    if (
      !Number.isFinite(openingCash) ||
      openingCash < 0 ||
      isMutatingShift
    ) {
      toast.error("يرجى إدخال رصيد نقدي افتتاحي صحيح (0 أو أكثر)");
      return;
    }

    setIsMutatingShift(true);
    try {
      const { message, shift } = await openCashierShift(openingCash);
      toast.success(message);
      setOpeningCashInput("");
      setCurrentShift(shift);
      setLastReconciliation(null);
      void loadShiftHistoryAndSummary();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر فتح الوردية",
      );
    } finally {
      setIsMutatingShift(false);
    }
  };

  const hasVisaActivity = Boolean(
    currentShift &&
      (currentShift.totalVisaSales > 0 || currentShift.totalVisaRefunds > 0),
  );
  const hasInstapayActivity = Boolean(
    currentShift &&
      (currentShift.totalInstapaySales > 0 ||
        currentShift.totalInstapayRefunds > 0),
  );
  const hasWalletActivity = Boolean(
    currentShift &&
      (currentShift.totalWalletSales > 0 ||
        currentShift.totalWalletRefunds > 0),
  );

  const handleCloseShift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const closingCash = Number(closingCashInput);
    if (
      !Number.isFinite(closingCash) ||
      closingCash < 0 ||
      isMutatingShift
    ) {
      toast.error("يرجى إدخال النقدية الفعلية في الدرج عند الإغلاق");
      return;
    }

    const extras: {
      closingVisa?: number;
      closingInstapay?: number;
      closingWallet?: number;
    } = {};

    if (hasVisaActivity) {
      const val = Number(closingVisaInput);
      if (closingVisaInput.trim() === "" || !Number.isFinite(val) || val < 0) {
        toast.error("يرجى إدخال إجمالي مبيعات ماكينة الفيزا (Visa) الفعلي");
        return;
      }
      extras.closingVisa = val;
    }

    if (hasInstapayActivity) {
      const val = Number(closingInstapayInput);
      if (
        closingInstapayInput.trim() === "" ||
        !Number.isFinite(val) ||
        val < 0
      ) {
        toast.error("يرجى إدخال إجمالي تحويلات إنستا باي (InstaPay) الفعلي");
        return;
      }
      extras.closingInstapay = val;
    }

    if (hasWalletActivity) {
      const val = Number(closingWalletInput);
      if (
        closingWalletInput.trim() === "" ||
        !Number.isFinite(val) ||
        val < 0
      ) {
        toast.error("يرجى إدخال إجمالي المحافظ الإلكترونية (Wallet) الفعلي");
        return;
      }
      extras.closingWallet = val;
    }

    setIsMutatingShift(true);
    try {
      const { message, reconciliation } = await closeCashierShift(
        closingCash,
        extras,
      );
      toast.success(message);
      setClosingCashInput("");
      setClosingVisaInput("");
      setClosingInstapayInput("");
      setClosingWalletInput("");
      setCurrentShift(null);
      setLastReconciliation(reconciliation ?? null);
      void loadShiftHistoryAndSummary();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر إغلاق الوردية",
      );
    } finally {
      setIsMutatingShift(false);
    }
  };

  // 5. Cash Movement Handler (type: "deposit" | "withdrawal")
  const handleRecordMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(movementAmount);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !movementReason.trim() ||
      isSubmittingMovement
    ) {
      toast.error("يرجى إدخال مبلغ موجب وسبب حركة النقدية");
      return;
    }

    setIsSubmittingMovement(true);
    try {
      const { message, shift } = await recordShiftMovement({
        type: movementType,
        amount: Number(amount.toFixed(2)),
        reason: movementReason.trim(),
      });
      toast.success(message);
      setMovementAmount("");
      setMovementReason("");
      setCurrentShift(shift);
      void loadShiftHistoryAndSummary();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر تسجيل حركة النقدية",
      );
    } finally {
      setIsSubmittingMovement(false);
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
        {/* Cashier Role Header Banner */}
        <section className="rounded-3xl border border-[#242424] bg-[#111111] p-6 sm:p-8 text-[#F5F5F5] shadow-lg">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-2.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#242424] bg-[#1A1A1D] px-3.5 py-1 text-xs font-semibold text-[#60a5fa]">
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{roleConfig.accentLabel}</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F5F5]">
                محطة الكاشير المركزية — {user.name}
              </h2>
              <p className="text-sm sm:text-base leading-relaxed text-[#A6A6A6]">
                {roleConfig.summaryAr}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {roleConfig.navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSectionId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSection(item.id)}
                    className={`inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition-all ${
                      isActive
                        ? "bg-[#2563EB] text-white"
                        : "border border-[#242424] bg-[#18181B] text-[#F5F5F5] hover:border-[#A6A6A6]/40"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 1: POS – CREATE SALES FOR ALL CATEGORIES */}
        {activeSectionId === "pos" ? (
          <div className="space-y-6">
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Barcode Lookup & Cart Items */}
              <div className="lg:col-span-8 rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">
                      نقطة البيع الموحدة (جميع أقسام المتجر)
                    </h3>
                    <p className="text-xs text-muted">
                      امسح أو أدخل الباركود لإضافة أي منتج (هواتف، أجهزة Apple،
                      أو إكسسوارات) إلى فاتورة البيع. يشترط وجود وردية مفتوحة
                      لإتمام البيع.
                    </p>
                  </div>

                  <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-bold text-success">
                    <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                    <span>جاهز لقارئ الباركود (Barcode Reader)</span>
                  </span>
                </div>

                <form
                  onSubmit={handleBarcodeLookup}
                  className="flex items-center gap-3"
                >
                  <div className="relative flex h-12 min-w-0 flex-1 items-center">
                    <ScanBarcode
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted"
                      aria-hidden="true"
                    />
                    <input
                      ref={posBarcodeInputRef}
                      type="text"
                      inputMode="text"
                      autoFocus
                      autoComplete="off"
                      value={barcodeInput}
                      onChange={(e) =>
                        handlePosBarcodeInputChange(e.target.value)
                      }
                      readOnly={isScanning}
                      placeholder="امسح بجهاز الباركود مباشرة أو أدخل باركود المنتج..."
                      className="h-12 w-full rounded-xl border border-border bg-background pr-12 pl-4 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted focus:border-[#2563EB] focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isScanning || !barcodeInput.trim()}
                    className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-6 text-xs sm:text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {isScanning ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>إضافة للفاتورة</span>
                  </button>
                </form>

                {/* Invoice Items List */}
                {cart.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background/60 p-10 text-center space-y-2">
                    <ScanBarcode
                      className="mx-auto h-9 w-9 text-muted"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-bold text-foreground">
                      سلة الفاتورة الحالية فارغة
                    </p>
                    <p className="text-xs text-muted">
                      امسح باركود الهاتف أو الإكسسوار لإضافته إلى الفاتورة.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border rounded-2xl border border-border bg-background">
                    {cart.map((entry, idx) => {
                      const itemTotal =
                        entry.product.sellingPrice * entry.quantity;
                      const netLine = entry.isGift
                        ? 0
                        : Math.max(0, itemTotal - entry.discountAmount);

                      return (
                        <div key={entry.product.id} className="p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-foreground">
                                  {entry.product.name}
                                </span>
                                <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted border border-border">
                                  {entry.product.type === "phone"
                                    ? "هاتف"
                                    : entry.product.type === "maintenance"
                                      ? "صيانة"
                                      : "إكسسوار"}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                                {entry.product.barcode ? (
                                  <span dir="ltr">
                                    #{entry.product.barcode}
                                  </span>
                                ) : null}
                                {entry.product.imei ? (
                                  <span dir="ltr">
                                    IMEI: {entry.product.imei}
                                  </span>
                                ) : null}
                                <span>
                                  سعر الوحدة: {entry.product.sellingPrice} ج.م
                                </span>
                                <span className="font-semibold text-foreground">
                                  الصافي: {netLine} ج.م
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {entry.product.type !== "phone" ? (
                                <div className="inline-flex items-center rounded-xl border border-border bg-surface">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateQuantity(idx, -1)
                                    }
                                    aria-label="تقليل الكمية"
                                    className="p-2 text-muted hover:text-foreground"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="px-3 text-xs font-bold text-foreground">
                                    {entry.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateQuantity(idx, 1)}
                                    aria-label="زيادة الكمية"
                                    className="p-2 text-muted hover:text-foreground"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground">
                                  الكمية: 1 (جهاز منفرد)
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateQuantity(idx, -entry.quantity)
                                }
                                aria-label="حذف الصنف"
                                className="rounded-xl border border-border bg-surface p-2 text-danger hover:bg-danger/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {/* Discount & Gift Controls */}
                          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/60 text-xs">
                            <div className="flex items-center gap-2">
                              <label
                                htmlFor={`discount-${entry.product.id}`}
                                className="text-muted"
                              >
                                خصم على الصنف (ج.م):
                              </label>
                              <input
                                id={`discount-${entry.product.id}`}
                                type="number"
                                min="0"
                                max={itemTotal}
                                step="0.01"
                                disabled={entry.isGift}
                                value={entry.discountAmount || ""}
                                onChange={(e) =>
                                  handleUpdateDiscount(
                                    idx,
                                    Number(e.target.value),
                                  )
                                }
                                placeholder="0"
                                className="h-8 w-24 rounded-lg border border-border bg-surface px-2.5 text-xs text-foreground focus:border-[#2563EB] focus:outline-none disabled:opacity-50"
                              />
                            </div>

                            <label className="inline-flex cursor-pointer items-center gap-2 text-muted hover:text-foreground">
                              <input
                                type="checkbox"
                                checked={entry.isGift}
                                onChange={(e) =>
                                  handleToggleGift(idx, e.target.checked)
                                }
                                className="h-3.5 w-3.5 rounded accent-[#2563EB]"
                              />
                              <span>هدية مجانية (isGift)</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Checkout Summary Panel (POST /sales) */}
              <div className="lg:col-span-4 rounded-2xl border border-border bg-surface p-6 shadow-2xs flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="border-b border-border pb-4">
                    <h3 className="text-base font-bold text-foreground">
                      بيانات العميل والدفع
                    </h3>
                    <p className="text-xs text-muted mt-0.5">
                      إصدار فاتورة رسمية وحفظها بالنظام
                    </p>
                  </div>

                  {/* Customer Info */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="pos-customer-name"
                        className="block text-xs font-semibold text-foreground"
                      >
                        اسم العميل (اختياري)
                      </label>
                      <input
                        id="pos-customer-name"
                        type="text"
                        maxLength={100}
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="اسم العميل..."
                        className="h-10 w-full rounded-xl border border-border bg-background px-3.5 text-xs text-foreground focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="pos-customer-phone"
                        className="block text-xs font-semibold text-foreground"
                      >
                        رقم هاتف العميل (اختياري)
                      </label>
                      <input
                        id="pos-customer-phone"
                        type="text"
                        maxLength={30}
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="01xxxxxxxxx"
                        className="h-10 w-full rounded-xl border border-border bg-background px-3.5 text-xs text-foreground focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Totals Breakdown */}
                  <div className="space-y-2.5 border-t border-border pt-4 text-xs sm:text-sm">
                    <div className="flex items-center justify-between text-muted">
                      <span>الإجمالي قبل الخصم</span>
                      <span className="font-semibold text-foreground">
                        {cartSummary.grossTotal} ج.م
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted">
                      <span>إجمالي الخصومات</span>
                      <span className="font-semibold text-foreground">
                        {cartSummary.totalDiscount} ج.م
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-2.5 text-base font-bold text-foreground">
                      <span>الصافي المطلوب</span>
                      <span className="text-[#2563EB]">
                        {cartSummary.finalAmount} ج.م
                      </span>
                    </div>
                  </div>

                  {/* Payment Method & Amount */}
                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="space-y-1">
                      <label
                        htmlFor="pos-payment-method"
                        className="block text-xs font-semibold text-foreground"
                      >
                        {hasMultiplePayments
                          ? "طريقة الدفع الأولى"
                          : "طريقة الدفع المعتمدة"}
                      </label>
                      <select
                        id="pos-payment-method"
                        value={paymentMethod}
                        onChange={(e) =>
                          setPaymentMethod(e.target.value as PaymentMethod)
                        }
                        className="h-10 w-full rounded-xl border border-border bg-background px-3.5 text-xs font-semibold text-foreground focus:border-[#2563EB] focus:outline-none"
                      >
                        <option value="cash">نقدي (Cash)</option>
                        <option value="wallet">محفظة إلكترونية (Wallet)</option>
                        <option value="instapay">إنستا باي (InstaPay)</option>
                        <option value="visa">بطاقة بنكية (Visa)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="pos-paid-amount"
                        className="block text-xs font-semibold text-foreground"
                      >
                        {hasMultiplePayments
                          ? "المبلغ المدفوع بالطريقة الأولى"
                          : "المبلغ المدفوع (اتركه فارغاً لسداد كامل الصافي)"}
                      </label>
                      <input
                        id="pos-paid-amount"
                        type="number"
                        min="0"
                        max={cartSummary.finalAmount}
                        step="0.01"
                        value={paidAmountInput}
                        onChange={(e) => setPaidAmountInput(e.target.value)}
                        placeholder={
                          hasMultiplePayments
                            ? "أدخل مبلغ الدفعة الأولى..."
                            : String(cartSummary.finalAmount)
                        }
                        className="h-10 w-full rounded-xl border border-border bg-background px-3.5 text-xs text-foreground focus:border-[#2563EB] focus:outline-none"
                      />
                    </div>

                    {/* Checkbox for Multiple Payment Methods */}
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-xs font-semibold text-foreground transition-colors hover:border-[#2563EB]/40">
                      <input
                        type="checkbox"
                        checked={hasMultiplePayments}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setHasMultiplePayments(checked);
                          if (!checked) {
                            setSecondPaidAmountInput("");
                          }
                        }}
                        className="h-4 w-4 rounded border-border accent-[#2563EB]"
                      />
                      <span>هل يوجد أكثر من طريقة دفع؟</span>
                    </label>

                    {/* Second Payment Method & Amount */}
                    {hasMultiplePayments ? (
                      <div className="space-y-3 rounded-xl border border-[#2563EB]/25 bg-[#2563EB]/5 p-3">
                        <div className="space-y-1">
                          <label
                            htmlFor="pos-second-payment-method"
                            className="block text-xs font-semibold text-foreground"
                          >
                            طريقة الدفع الثانية
                          </label>
                          <select
                            id="pos-second-payment-method"
                            value={secondPaymentMethod}
                            onChange={(e) =>
                              setSecondPaymentMethod(
                                e.target.value as PaymentMethod,
                              )
                            }
                            className="h-10 w-full rounded-xl border border-border bg-background px-3.5 text-xs font-semibold text-foreground focus:border-[#2563EB] focus:outline-none"
                          >
                            <option value="cash">نقدي (Cash)</option>
                            <option value="wallet">
                              محفظة إلكترونية (Wallet)
                            </option>
                            <option value="instapay">
                              إنستا باي (InstaPay)
                            </option>
                            <option value="visa">بطاقة بنكية (Visa)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label
                            htmlFor="pos-second-paid-amount"
                            className="block text-xs font-semibold text-foreground"
                          >
                            المبلغ المدفوع بالطريقة الثانية (اتركه فارغاً لسداد
                            المتبقي)
                          </label>
                          <input
                            id="pos-second-paid-amount"
                            type="number"
                            min="0"
                            max={Math.max(
                              0,
                              Number(
                                (
                                  cartSummary.finalAmount -
                                  (Number(paidAmountInput) || 0)
                                ).toFixed(2),
                              ),
                            )}
                            step="0.01"
                            value={secondPaidAmountInput}
                            onChange={(e) =>
                              setSecondPaidAmountInput(e.target.value)
                            }
                            placeholder={String(
                              Math.max(
                                0,
                                Number(
                                  (
                                    cartSummary.finalAmount -
                                    (Number(paidAmountInput) || 0)
                                  ).toFixed(2),
                                ),
                              ),
                            )}
                            className="h-10 w-full rounded-xl border border-border bg-background px-3.5 text-xs text-foreground focus:border-[#2563EB] focus:outline-none"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCheckoutSale}
                  disabled={cart.length === 0 || isSubmittingSale}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-5 text-sm font-bold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmittingSale ? (
                    <>
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      <span>جاري إصدار الفاتورة...</span>
                    </>
                  ) : (
                    <>
                      <ReceiptText className="h-4 w-4" aria-hidden="true" />
                      <span>تأكيد البيع وإصدار الفاتورة</span>
                    </>
                  )}
                </button>
              </div>
            </section>

            {/* Newly Created Invoice Confirmation Card */}
            {lastCreatedSale ? (
              <section className="rounded-2xl border border-success/40 bg-success/5 p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <h4 className="text-base font-bold text-foreground">
                      تم إصدار الفاتورة رقم{" "}
                      <span dir="ltr" className="font-mono text-[#2563EB]">
                        {lastCreatedSale.invoiceNumber}
                      </span>
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPrintableInvoiceSale(lastCreatedSale);
                        printSaleInvoicePdf(lastCreatedSale);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-3.5 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>طباعة / PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLastCreatedSale(null)}
                      className="text-xs font-semibold text-muted hover:text-foreground"
                    >
                      إغلاق الملخص
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">الإجمالي الصافي</span>
                    <strong className="text-sm text-foreground">
                      {lastCreatedSale.finalAmount} ج.م
                    </strong>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">المبلغ المدفوع</span>
                    <strong className="text-sm text-success">
                      {lastCreatedSale.paidAmount} ج.م
                    </strong>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">المتبقي</span>
                    <strong className="text-sm text-foreground">
                      {lastCreatedSale.remainingAmount} ج.م
                    </strong>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">حالة الدفع</span>
                    <strong className="text-sm text-foreground">
                      {lastCreatedSale.paymentStatus}
                    </strong>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {/* SECTION 2: SALES & INVOICES (GET /sales & GET /sales/:id) */}
        {activeSectionId === "sales" ? (
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  سجل المبيعات والفواتير
                </h3>
                <p className="text-xs text-muted">
                  ابحث برقم الفاتورة أو اسم العميل أو رقم الهاتف واستعرض تفاصيل
                  الفاتورة
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadSales(salesSearch)}
                disabled={isLoadingSales}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground hover:bg-surface-secondary"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoadingSales ? "animate-spin" : ""}`}
                />
                <span>تحديث السجل</span>
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
              totalCount={salesList.length}
              filteredCount={
                filterBySelectedDay(
                  salesList,
                  (s) => s.saleDate,
                  salesDayMode,
                  salesCustomDate,
                ).length
              }
              itemLabel="فاتورة"
            />

            {isLoadingSales ? (
              <div className="flex min-h-50 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
              </div>
            ) : filterBySelectedDay(
                salesList,
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
                  salesList,
                  (s) => s.saleDate,
                  salesDayMode,
                  salesCustomDate,
                ).map((sale) => (
                  <div
                    key={sale.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          dir="ltr"
                          className="text-sm font-bold font-mono text-foreground"
                        >
                          {sale.invoiceNumber}
                        </span>
                        <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted border border-border">
                          {sale.paymentStatus === "paid"
                            ? "مدفوعة بالكامل"
                            : sale.paymentStatus === "partially_paid"
                              ? "مدفوعة جزئياً"
                              : "غير مدفوعة"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span>الصافي: {sale.finalAmount} ج.م</span>
                        <span>المدفوع: {sale.paidAmount} ج.م</span>
                        {sale.customerName ? (
                          <span>العميل: {sale.customerName}</span>
                        ) : null}
                        {sale.saleDate ? (
                          <span>
                            التاريخ:{" "}
                            {new Date(sale.saleDate).toLocaleString("ar-EG")}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleInspectSale(sale.id)}
                      disabled={isLoadingSaleDetail}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground hover:border-[#2563EB] hover:text-[#2563EB]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>تفاصيل الفاتورة</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedSaleDetail ? (
              <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <h4 className="text-base font-bold text-foreground">
                      تفاصيل الفاتورة{" "}
                      <span dir="ltr" className="font-mono text-[#2563EB]">
                        {selectedSaleDetail.invoiceNumber}
                      </span>
                    </h4>
                    <p className="text-xs text-muted">
                      الكاشير: {selectedSaleDetail.cashierName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPrintableInvoiceSale(selectedSaleDetail);
                        printSaleInvoicePdf(selectedSaleDetail);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>طباعة / PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSaleDetail(null)}
                      className="rounded-lg border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted hover:text-foreground"
                    >
                      إغلاق
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">الإجمالي النهائي</span>
                    <strong className="text-sm text-foreground">
                      {selectedSaleDetail.finalAmount} ج.م
                    </strong>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">المدفوع</span>
                    <strong className="text-sm text-success">
                      {selectedSaleDetail.paidAmount} ج.م
                    </strong>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">المتبقي</span>
                    <strong className="text-sm text-foreground">
                      {selectedSaleDetail.remainingAmount} ج.م
                    </strong>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">إجمالي المرتجعات</span>
                    <strong className="text-sm text-foreground">
                      {selectedSaleDetail.totalReturnedAmount} ج.م
                    </strong>
                  </div>
                </div>

                <div className="space-y-2">
                  <h5 className="text-xs font-bold text-foreground">
                    الأصناف المباعة ({selectedSaleDetail.items.length})
                  </h5>
                  <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                    {selectedSaleDetail.items.map((item) => (
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
                            <span
                              dir="ltr"
                              className="ml-2 font-mono text-muted"
                            >
                              IMEI: {item.imei}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 text-muted">
                          <span>الكمية: {item.quantity}</span>
                          <span>سعر الوحدة: {item.unitPrice} ج.م</span>
                          <strong className="text-foreground">
                            الإجمالي: {item.lineTotal} ج.م
                          </strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* SECTION 3: RETURNS & REFUNDS (POST /return, GET /return, PATCH /return/:id/refund) */}
        {activeSectionId === "returns" ? (
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Step-by-Step Invoice Return Builder */}
            <div className="lg:col-span-5 min-w-0 overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-2xs space-y-5">
              <div className="border-b border-border pb-4">
                <h3 className="text-base font-bold text-foreground">
                  تسجيل مرتجع على فاتورة مبيعات
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  ابحث برقم الفاتورة الأصلي، اختر الأصناف المراد إرجاعها وحدد
                  الكمية بدقة.
                </p>
              </div>

              {/* Step 1: Find Invoice */}
              <form
                onSubmit={handleLookupInvoiceForReturn}
                className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-stretch gap-2.5"
              >
                <div className="relative flex h-11 min-w-0 flex-1 items-center">
                  <ScanBarcode
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
                    aria-hidden="true"
                  />
                  <input
                    ref={returnInvoiceInputRef}
                    type="text"
                    required
                    autoFocus
                    autoComplete="off"
                    value={returnInvoiceQuery}
                    onChange={(e) =>
                      setReturnInvoiceQuery(
                        normalizeBarcodeScannerInput(e.target.value),
                      )
                    }
                    readOnly={isLookingUpInvoice}
                    placeholder="امسح أو أدخل رقم الفاتورة (INV-...)"
                    className="h-11 w-full rounded-xl border border-border bg-background pr-10 pl-3.5 font-mono text-xs sm:text-sm text-foreground placeholder:font-sans focus:border-[#2563EB] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLookingUpInvoice || !returnInvoiceQuery.trim()}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {isLookingUpInvoice ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  <span>تحميل الفاتورة</span>
                </button>
              </form>

              {/* Step 2: Select Items to Return */}
              {returnTargetSale ? (
                <form onSubmit={handleSubmitReturn} className="space-y-4">
                  <div className="rounded-xl border border-border bg-background p-3.5 text-xs space-y-1">
                    <div className="font-bold text-foreground">
                      الفاتورة المحددة:{" "}
                      <span dir="ltr" className="font-mono text-[#2563EB]">
                        {returnTargetSale.invoiceNumber}
                      </span>
                    </div>
                    <div className="text-muted">
                      اختر الأصناف وحدد الكمية المرتجعة:
                    </div>
                  </div>

                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {returnTargetSale.items.map((item) => {
                      const lineState = returnLines[item.id] ?? {
                        selected: false,
                        quantity: 1,
                        reason: "",
                      };

                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border p-3.5 space-y-2.5 transition-colors ${
                            lineState.selected
                              ? "border-[#2563EB] bg-[#2563EB]/5"
                              : "border-border bg-background"
                          }`}
                        >
                          <label className="flex cursor-pointer items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={lineState.selected}
                                onChange={(e) =>
                                  setReturnLines((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      ...lineState,
                                      selected: e.target.checked,
                                    },
                                  }))
                                }
                                className="h-4 w-4 rounded accent-[#2563EB]"
                              />
                              <div>
                                <div className="text-xs font-bold text-foreground">
                                  {item.productName}
                                </div>
                                <div className="text-[11px] text-muted">
                                  الكمية المباعة: {item.quantity} • السعر:{" "}
                                  {item.unitPrice} ج.م
                                </div>
                              </div>
                            </div>
                          </label>

                          {lineState.selected ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-border/60">
                              <div>
                                <label className="block text-[11px] text-muted mb-1">
                                  الكمية المرتجعة
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={
                                    item.productType === "phone"
                                      ? 1
                                      : item.quantity
                                  }
                                  disabled={item.productType === "phone"}
                                  value={
                                    item.productType === "phone"
                                      ? 1
                                      : lineState.quantity
                                  }
                                  onChange={(e) =>
                                    setReturnLines((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        ...lineState,
                                        quantity: Number(e.target.value),
                                      },
                                    }))
                                  }
                                  className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs text-foreground"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="block text-[11px] text-muted mb-1">
                                  سبب الإرجاع (اختياري)
                                </label>
                                <input
                                  type="text"
                                  value={lineState.reason}
                                  onChange={(e) =>
                                    setReturnLines((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        ...lineState,
                                        reason: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="سبب استرجاع الصنف..."
                                  className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs text-foreground"
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingReturn}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-5 text-xs sm:text-sm font-semibold disabled:opacity-60"
                  >
                    {isSubmittingReturn ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    <span>تأكيد تسجيل المرتجع</span>
                  </button>
                </form>
              ) : null}
            </div>

            {/* Returns List & Authorized Refund Execution */}
            <div className="lg:col-span-7 rounded-2xl border border-border bg-surface p-6 shadow-2xs space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    سجل المرتجعات وصرف المبالغ المستردة
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    إدارة استرداد المبالغ المتبقية للعملاء عبر وسائل الدفع
                    المعتمدة
                  </p>
                </div>

                <button
                  type="button"
                  onClick={loadReturns}
                  disabled={isLoadingReturns}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isLoadingReturns ? "animate-spin" : ""}`}
                  />
                  <span>تحديث</span>
                </button>
              </div>

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
                <div className="flex min-h-45 items-center justify-center">
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
                    لا توجد عمليات مرتجعات مسجلة في هذا اليوم
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border bg-background">
                  {filterBySelectedDay(
                    returnsList,
                    (r) => r.returnDate,
                    returnsDayMode,
                    returnsCustomDate,
                  ).map((ret) => {
                    const canRefund = ret.refundRemainingAmount > 0;
                    const isExpanded = activeRefundReturnId === ret.id;

                    return (
                      <div key={ret.id} className="p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span
                                dir="ltr"
                                className="text-sm font-bold font-mono text-foreground"
                              >
                                {ret.returnNumber}
                              </span>
                              <span className="text-xs text-muted">
                                (فاتورة:{" "}
                                <span dir="ltr" className="font-mono">
                                  {ret.invoiceNumber}
                                </span>
                                )
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                              <span>
                                إجمالي المرتجع: {ret.totalRefundAmount} ج.م
                              </span>
                              <span>المسترد: {ret.refundedAmount} ج.م</span>
                              <span className="font-semibold text-foreground">
                                المتبقي للاسترداد: {ret.refundRemainingAmount}{" "}
                                ج.م
                              </span>
                            </div>
                          </div>

                          {canRefund ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (isExpanded) {
                                  setActiveRefundReturnId(null);
                                } else {
                                  setActiveRefundReturnId(ret.id);
                                  setRefundAmountInput(
                                    String(ret.refundRemainingAmount),
                                  );
                                  setRefundMethod("cash");
                                }
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white"
                            >
                              <span>صرف مبلغ الاسترداد</span>
                            </button>
                          ) : (
                            <span className="rounded-lg bg-success/10 px-3 py-1 text-xs font-bold text-success">
                              {ret.refundStatus === "not_required"
                                ? "تم خصمه من المديونية"
                                : "تم الاسترداد بالكامل"}
                            </span>
                          )}
                        </div>

                        {isExpanded ? (
                          <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                            <div className="text-xs font-bold text-foreground">
                              تنفيذ رد مبلغ للمرتجع {ret.returnNumber}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[11px] text-muted mb-1">
                                  وسيلة رد المبلغ
                                </label>
                                <select
                                  value={refundMethod}
                                  onChange={(e) =>
                                    setRefundMethod(
                                      e.target.value as PaymentMethod,
                                    )
                                  }
                                  className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground"
                                >
                                  {(
                                    Object.keys(
                                      PAYMENT_METHOD_LABELS,
                                    ) as PaymentMethod[]
                                  ).map((m) => (
                                    <option key={m} value={m}>
                                      {PAYMENT_METHOD_LABELS[m]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[11px] text-muted mb-1">
                                  المبلغ (بحد أقصى {ret.refundRemainingAmount})
                                </label>
                                <input
                                  type="number"
                                  min="0.01"
                                  max={ret.refundRemainingAmount}
                                  step="0.01"
                                  value={refundAmountInput}
                                  onChange={(e) =>
                                    setRefundAmountInput(e.target.value)
                                  }
                                  className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground"
                                />
                              </div>

                              <div className="flex items-end gap-2">
                                <button
                                  type="button"
                                  disabled={isProcessingRefund}
                                  onClick={() => void handleSubmitRefund(ret)}
                                  className="h-9 flex-1 rounded-lg bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] text-xs font-semibold disabled:opacity-60"
                                >
                                  {isProcessingRefund
                                    ? "جاري التنفيذ..."
                                    : "تأكيد الصرف"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* SECTION 4: CURRENT SHIFT (GET /shift/current, POST /shift/open, PATCH /shift/close) */}
        {activeSectionId === "current-shift" ? (
          <div className="space-y-6">
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Current Shift Status */}
              <div className="lg:col-span-5 rounded-2xl border border-border bg-surface p-6 shadow-2xs space-y-5">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      حالة الوردية الحالية
                    </h3>
                    <p className="text-xs text-muted">
                      بيانات وردية الكاشير المفتوحة حالياً
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadCurrentShift}
                    disabled={isLoadingShift}
                    className="rounded-xl border border-border bg-background p-2 text-foreground"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${isLoadingShift ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>

                {isLoadingShift ? (
                  <div className="flex min-h-35 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
                  </div>
                ) : currentShift ? (
                  <div className="space-y-3 text-xs sm:text-sm">
                    <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3.5">
                      <span className="text-muted">حالة الوردية</span>
                      <span className="font-bold text-success">مفتوحة</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3.5">
                      <span className="text-muted">
                        النقدية الافتتاحية (openingCash)
                      </span>
                      <span className="font-bold text-foreground">
                        {currentShift.openingCash} ج.م
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3.5">
                      <span className="text-muted">المبيعات النقدية</span>
                      <span className="font-bold text-foreground">
                        {currentShift.totalCashSales} ج.م
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3.5">
                      <span className="text-muted">المرتجعات النقدية</span>
                      <span className="font-bold text-danger">
                        {currentShift.totalCashRefunds} ج.م
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3.5">
                      <span className="text-muted">
                        الإيداعات / المسحوبات النقدية
                      </span>
                      <span className="font-bold text-foreground">
                        +{currentShift.totalDeposits} / -
                        {currentShift.totalWithdrawals} ج.م
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5">
                      <span className="font-semibold text-foreground">
                        النقدية المتوقعة بالدرج (Cash)
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {(
                          currentShift.openingCash +
                          currentShift.totalCashSales -
                          currentShift.totalCashRefunds +
                          currentShift.totalDeposits -
                          currentShift.totalWithdrawals
                        ).toFixed(2)}{" "}
                        ج.م
                      </span>
                    </div>
                    {hasVisaActivity ? (
                      <div className="flex items-center justify-between rounded-xl border border-[#2563EB]/30 bg-[#2563EB]/5 p-3.5">
                        <span className="text-muted">مبيعات الفيزا (Visa)</span>
                        <span className="font-bold text-[#2563EB]">
                          {currentShift.totalVisaSales -
                            currentShift.totalVisaRefunds}{" "}
                          ج.م
                        </span>
                      </div>
                    ) : null}
                    {hasInstapayActivity ? (
                      <div className="flex items-center justify-between rounded-xl border border-[#2563EB]/30 bg-[#2563EB]/5 p-3.5">
                        <span className="text-muted">
                          تحويلات إنستا باي (InstaPay)
                        </span>
                        <span className="font-bold text-[#2563EB]">
                          {currentShift.totalInstapaySales -
                            currentShift.totalInstapayRefunds}{" "}
                          ج.م
                        </span>
                      </div>
                    ) : null}
                    {hasWalletActivity ? (
                      <div className="flex items-center justify-between rounded-xl border border-[#2563EB]/30 bg-[#2563EB]/5 p-3.5">
                        <span className="text-muted">
                          المحافظ الإلكترونية (Wallet)
                        </span>
                        <span className="font-bold text-[#2563EB]">
                          {currentShift.totalWalletSales -
                            currentShift.totalWalletRefunds}{" "}
                          ج.م
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-background/60 p-6 text-center">
                    <Clock className="mx-auto h-7 w-7 text-muted mb-2" />
                    <p className="text-sm font-semibold text-foreground">
                      لا توجد وردية مفتوحة حالياً
                    </p>
                    <p className="text-xs text-muted mt-1">
                      افتح وردية جديدة لتتمكن من إصدار فواتير المبيعات أو تسجيل
                      المرتجعات.
                    </p>
                  </div>
                )}
              </div>

              {/* Open / Close Shift Forms */}
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Open Shift (POST /shift/open -> { openingCash }) */}
                <form
                  onSubmit={handleOpenShift}
                  className="rounded-2xl border border-border bg-surface p-6 shadow-2xs flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-4">
                    <div className="border-b border-border pb-3">
                      <h4 className="text-sm font-bold text-foreground">
                        فتح وردية جديدة
                      </h4>
                      <p className="text-[11px] text-muted">
                        إدخال النقدية الافتتاحية بالدرج (openingCash)
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="shift-open-cash"
                        className="block text-xs font-semibold text-foreground"
                      >
                        النقدية الافتتاحية (ج.م)
                      </label>
                      <input
                        id="shift-open-cash"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={openingCashInput}
                        onChange={(e) => setOpeningCashInput(e.target.value)}
                        disabled={isMutatingShift || Boolean(currentShift)}
                        placeholder="0.00"
                        className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      isMutatingShift ||
                      !openingCashInput ||
                      Boolean(currentShift)
                    }
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <span>فتح الوردية</span>
                  </button>
                </form>

                {/* Close Shift (PATCH /shift/close -> { closingCash }) */}
                <form
                  onSubmit={handleCloseShift}
                  className="rounded-2xl border border-border bg-surface p-6 shadow-2xs flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-4">
                    <div className="border-b border-border pb-3">
                      <h4 className="text-sm font-bold text-foreground">
                        إغلاق الوردية الحالية
                      </h4>
                      <p className="text-[11px] text-muted">
                        إدخال النقدية الفعلية المعدودة بالدرج (closingCash)
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="shift-close-cash"
                        className="block text-xs font-semibold text-foreground"
                      >
                        النقدية الفعلية بالدرج (Cash) — المتوقع:{" "}
                        {currentShift
                          ? (
                              currentShift.openingCash +
                              currentShift.totalCashSales -
                              currentShift.totalCashRefunds +
                              currentShift.totalDeposits -
                              currentShift.totalWithdrawals
                            ).toFixed(2)
                          : "0.00"}{" "}
                        ج.م
                      </label>
                      <input
                        id="shift-close-cash"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={closingCashInput}
                        onChange={(e) => setClosingCashInput(e.target.value)}
                        disabled={isMutatingShift || !currentShift}
                        placeholder={
                          currentShift
                            ? String(
                                Number(
                                  (
                                    currentShift.openingCash +
                                    currentShift.totalCashSales -
                                    currentShift.totalCashRefunds +
                                    currentShift.totalDeposits -
                                    currentShift.totalWithdrawals
                                  ).toFixed(2),
                                ),
                              )
                            : "0.00"
                        }
                        className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none disabled:opacity-50"
                      />
                    </div>

                    {hasVisaActivity ? (
                      <div className="space-y-1.5">
                        <label
                          htmlFor="shift-close-visa"
                          className="block text-xs font-semibold text-foreground"
                        >
                          إجمالي ماكينة الفيزا (Visa) الفعلي — المتوقع:{" "}
                          {(
                            (currentShift?.totalVisaSales ?? 0) -
                            (currentShift?.totalVisaRefunds ?? 0)
                          ).toFixed(2)}{" "}
                          ج.م
                        </label>
                        <input
                          id="shift-close-visa"
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={closingVisaInput}
                          onChange={(e) => setClosingVisaInput(e.target.value)}
                          disabled={isMutatingShift || !currentShift}
                          placeholder={String(
                            (currentShift?.totalVisaSales ?? 0) -
                              (currentShift?.totalVisaRefunds ?? 0),
                          )}
                          className="h-11 w-full rounded-xl border border-[#2563EB]/40 bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none disabled:opacity-50"
                        />
                      </div>
                    ) : null}

                    {hasInstapayActivity ? (
                      <div className="space-y-1.5">
                        <label
                          htmlFor="shift-close-instapay"
                          className="block text-xs font-semibold text-foreground"
                        >
                          إجمالي إنستا باي (InstaPay) الفعلي — المتوقع:{" "}
                          {(
                            (currentShift?.totalInstapaySales ?? 0) -
                            (currentShift?.totalInstapayRefunds ?? 0)
                          ).toFixed(2)}{" "}
                          ج.م
                        </label>
                        <input
                          id="shift-close-instapay"
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={closingInstapayInput}
                          onChange={(e) =>
                            setClosingInstapayInput(e.target.value)
                          }
                          disabled={isMutatingShift || !currentShift}
                          placeholder={String(
                            (currentShift?.totalInstapaySales ?? 0) -
                              (currentShift?.totalInstapayRefunds ?? 0),
                          )}
                          className="h-11 w-full rounded-xl border border-[#2563EB]/40 bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none disabled:opacity-50"
                        />
                      </div>
                    ) : null}

                    {hasWalletActivity ? (
                      <div className="space-y-1.5">
                        <label
                          htmlFor="shift-close-wallet"
                          className="block text-xs font-semibold text-foreground"
                        >
                          إجمالي المحافظ الإلكترونية (Wallet) الفعلي — المتوقع:{" "}
                          {(
                            (currentShift?.totalWalletSales ?? 0) -
                            (currentShift?.totalWalletRefunds ?? 0)
                          ).toFixed(2)}{" "}
                          ج.م
                        </label>
                        <input
                          id="shift-close-wallet"
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={closingWalletInput}
                          onChange={(e) =>
                            setClosingWalletInput(e.target.value)
                          }
                          disabled={isMutatingShift || !currentShift}
                          placeholder={String(
                            (currentShift?.totalWalletSales ?? 0) -
                              (currentShift?.totalWalletRefunds ?? 0),
                          )}
                          className="h-11 w-full rounded-xl border border-[#2563EB]/40 bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none disabled:opacity-50"
                        />
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="submit"
                    disabled={
                      isMutatingShift || !closingCashInput || !currentShift
                    }
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-4 text-xs font-bold disabled:opacity-50"
                  >
                    <span>إغلاق الوردية ومطابقة الخزينة</span>
                  </button>
                </form>
              </div>
            </section>

            {lastReconciliation ? (
              <section className="rounded-2xl border border-border bg-surface p-6 space-y-4">
                <h4 className="text-sm font-bold text-foreground">
                  نتيجة مطابقة الخزينة ووسائل الدفع عند إغلاق الوردية
                </h4>

                {/* Cash Drawer Reconciliation */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted">
                    1. الدرج النقدي (Cash)
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-xl border border-border bg-background p-3.5">
                      <span className="text-muted block">
                        النقدية المتوقعة بالدرج
                      </span>
                      <strong className="text-sm text-foreground">
                        {lastReconciliation.expectedCash} ج.م
                      </strong>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3.5">
                      <span className="text-muted block">
                        النقدية الفعلية بالدرج
                      </span>
                      <strong className="text-sm text-foreground">
                        {lastReconciliation.actualCash} ج.م
                      </strong>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3.5">
                      <span className="text-muted block">الفارق</span>
                      <strong className="text-sm text-foreground">
                        {lastReconciliation.difference} ج.م
                      </strong>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3.5">
                      <span className="text-muted block">حالة المطابقة</span>
                      <strong className="text-sm text-[#2563EB]">
                        {lastReconciliation.status === "balanced"
                          ? "متطابقة تماماً"
                          : lastReconciliation.status === "shortage"
                            ? "عجز بالخزينة"
                            : "زيادة بالخزينة"}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Non-Cash Channels Reconciliation */}
                {[
                  {
                    key: "visa",
                    title: "ماكينة الفيزا (Visa)",
                    expected: lastReconciliation.expectedVisa,
                    actual: lastReconciliation.actualVisa,
                    diff: lastReconciliation.visaDifference ?? 0,
                  },
                  {
                    key: "instapay",
                    title: "إنستا باي (InstaPay)",
                    expected: lastReconciliation.expectedInstapay,
                    actual: lastReconciliation.actualInstapay,
                    diff: lastReconciliation.instapayDifference ?? 0,
                  },
                  {
                    key: "wallet",
                    title: "المحافظ الإلكترونية (Wallet)",
                    expected: lastReconciliation.expectedWallet,
                    actual: lastReconciliation.actualWallet,
                    diff: lastReconciliation.walletDifference ?? 0,
                  },
                ]
                  .filter(
                    (ch) =>
                      ch.expected !== undefined &&
                      ch.actual !== undefined &&
                      (ch.expected > 0 || ch.actual > 0 || ch.diff !== 0),
                  )
                  .map((ch) => (
                    <div
                      key={ch.key}
                      className="space-y-2 pt-2 border-t border-border"
                    >
                      <div className="text-xs font-semibold text-[#2563EB]">
                        {ch.title}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="rounded-xl border border-[#2563EB]/25 bg-[#2563EB]/5 p-3.5">
                          <span className="text-muted block">المتوقع</span>
                          <strong className="text-sm text-foreground">
                            {ch.expected} ج.م
                          </strong>
                        </div>
                        <div className="rounded-xl border border-[#2563EB]/25 bg-[#2563EB]/5 p-3.5">
                          <span className="text-muted block">الفعلي</span>
                          <strong className="text-sm text-foreground">
                            {ch.actual} ج.م
                          </strong>
                        </div>
                        <div className="rounded-xl border border-[#2563EB]/25 bg-[#2563EB]/5 p-3.5">
                          <span className="text-muted block">الفارق</span>
                          <strong className="text-sm text-foreground">
                            {ch.diff} ج.م
                          </strong>
                        </div>
                        <div className="rounded-xl border border-[#2563EB]/25 bg-[#2563EB]/5 p-3.5">
                          <span className="text-muted block">
                            حالة المطابقة
                          </span>
                          <strong className="text-sm text-[#2563EB]">
                            {ch.diff === 0
                              ? "متطابقة تماماً"
                              : ch.diff < 0
                                ? "عجز"
                                : "زيادة"}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ))}
              </section>
            ) : null}
          </div>
        ) : null}

        {/* SECTION 5: CASH MOVEMENTS (POST /shift/movements) */}
        {activeSectionId === "cash-movements" ? (
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs max-w-2xl space-y-6">
            <div className="border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB]/10 text-[#2563EB]">
                  <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    تسجيل حركة نقدية بالوردية
                  </h3>
                  <p className="text-xs text-muted">
                    تسجيل إيداع نقدي (deposit) أو سحب نقدي (withdrawal) خلال
                    الوردية المفتوحة
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleRecordMovement} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="movement-type"
                  className="block text-xs sm:text-sm font-semibold text-foreground"
                >
                  نوع الحركة النقدية
                </label>
                <select
                  id="movement-type"
                  value={movementType}
                  onChange={(e) =>
                    setMovementType(e.target.value as CashMovementType)
                  }
                  disabled={isSubmittingMovement}
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
                >
                  <option value="deposit">إيداع نقدي بالخزينة (deposit)</option>
                  <option value="withdrawal">
                    سحب / مصروف من الخزينة (withdrawal)
                  </option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="movement-amount"
                  className="block text-xs sm:text-sm font-semibold text-foreground"
                >
                  المبلغ (ج.م)
                </label>
                <input
                  id="movement-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  disabled={isSubmittingMovement}
                  placeholder="0.00"
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="movement-reason"
                  className="block text-xs sm:text-sm font-semibold text-foreground"
                >
                  سبب الحركة / البيان
                </label>
                <input
                  id="movement-reason"
                  type="text"
                  required
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  disabled={isSubmittingMovement}
                  placeholder="توضيح سبب الإيداع أو السحب..."
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingMovement}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-6 text-xs sm:text-sm font-semibold disabled:opacity-60"
              >
                {isSubmittingMovement ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                <span>تسجيل الحركة النقدية</span>
              </button>
            </form>
          </section>
        ) : null}

        {/* SECTION 6: SHIFT SUMMARY & HISTORY (GET /shift/summary & GET /shift/history) */}
        {activeSectionId === "shift-history" ? (
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  ملخص الوردية الحالية وسجل الورديات
                </h3>
                <p className="text-xs text-muted">
                  عرض تفصيلي لحركة الخزينة الحالية وسجل الورديات السابقة
                </p>
              </div>

              <button
                type="button"
                onClick={loadShiftHistoryAndSummary}
                disabled={isLoadingHistory}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoadingHistory ? "animate-spin" : ""}`}
                />
                <span>تحديث البيانات</span>
              </button>
            </div>

            {shiftSummary ? (
              <div className="rounded-2xl border border-border bg-background p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-foreground">
                    ملخص الوردية المفتوحة — {shiftSummary.cashier}
                  </h4>
                  <span className="rounded-lg bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
                    الرصيد المتوقع بالدرج: {shiftSummary.expectedCash} ج.م
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">النقدية الافتتاحية</span>
                    <strong className="text-sm text-foreground">
                      {shiftSummary.openingCash} ج.م
                    </strong>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">المبيعات النقدية</span>
                    <strong className="text-sm text-success">
                      +{shiftSummary.totalCashSales} ج.م
                    </strong>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">المرتجعات النقدية</span>
                    <strong className="text-sm text-danger">
                      -{shiftSummary.totalCashRefunds} ج.م
                    </strong>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">الإيداعات</span>
                    <strong className="text-sm text-foreground">
                      +{shiftSummary.totalDeposits} ج.م
                    </strong>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <span className="text-muted block">المسحوبات</span>
                    <strong className="text-sm text-foreground">
                      -{shiftSummary.totalWithdrawals} ج.م
                    </strong>
                  </div>
                </div>
              </div>
            ) : null}

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

            {isLoadingHistory ? (
              <div className="flex min-h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
              </div>
            ) : filterBySelectedDay(
                shiftHistory,
                (sh) => sh.openedAt,
                shiftsDayMode,
                shiftsCustomDate,
              ).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
                <History className="mx-auto h-7 w-7 text-muted mb-2" />
                <p className="text-sm font-semibold text-foreground">
                  لا يوجد سجل ورديات للعرض في هذا اليوم
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-background">
                {filterBySelectedDay(
                  shiftHistory,
                  (sh) => sh.openedAt,
                  shiftsDayMode,
                  shiftsCustomDate,
                ).map((shift) => (
                  <div
                    key={shift.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-4"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-foreground">
                        وردية — {shift.cashierName}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span>الافتتاح: {shift.openingCash} ج.م</span>
                        <span>
                          المبيعات النقدية: {shift.totalCashSales} ج.م
                        </span>
                        {shift.totalVisaSales > 0 ? (
                          <span>فيزا: {shift.totalVisaSales} ج.م</span>
                        ) : null}
                        {shift.totalInstapaySales > 0 ? (
                          <span>إنستا باي: {shift.totalInstapaySales} ج.م</span>
                        ) : null}
                        {shift.totalWalletSales > 0 ? (
                          <span>محفظة: {shift.totalWalletSales} ج.م</span>
                        ) : null}
                        {shift.closingCash !== undefined ? (
                          <span>الإغلاق الفعلي: {shift.closingCash} ج.م</span>
                        ) : null}
                        {shift.difference !== undefined ? (
                          <span>الفارق: {shift.difference} ج.م</span>
                        ) : null}
                      </div>
                    </div>

                    <span
                      className={`rounded-lg px-3 py-1 text-xs font-bold ${
                        shift.status === "open"
                          ? "bg-success/10 text-success"
                          : "border border-border bg-surface text-foreground"
                      }`}
                    >
                      {shift.status === "open" ? "مفتوحة" : "مغلقة"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>

      {/* Printable Sale Invoice Modal (PDF / Print) */}
      <PrintableSaleInvoiceModal
        sale={printableInvoiceSale}
        onClose={() => setPrintableInvoiceSale(null)}
      />
    </DashboardLayout>
  );
}
