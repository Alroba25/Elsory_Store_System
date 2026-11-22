import type { StoreUserRole } from "@/src/components/dashboard/dashboard-config";

const API_BASE_URL = "/api";

export class DashboardApiError extends Error {
  public readonly status?: number;
  public readonly data?: Record<string, unknown>;

  constructor(
    message: string,
    status?: number,
    data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DashboardApiError";
    this.status = status;
    this.data = data;
  }
}

export function generateIdempotencyKey(prefix: string): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${randomPart}`.slice(0, 120);
}

/* ============================================================================
 * STRICT BACKEND DATA MODELS
 * ============================================================================ */

export type ProductType = "phone" | "accessory" | "maintenance";
export type PhoneCondition = "new" | "used";
export type PaymentMethod = "cash" | "wallet" | "instapay" | "visa";
export type CashMovementType = "deposit" | "withdrawal";
export type StockLocation = "store" | "warehouse";
export type StockBucketLocation =
  | "store"
  | "warehouse"
  | "damaged"
  | "unallocated";
export type PhoneLocation =
  | "warehouse"
  | "store"
  | "sold"
  | "damaged"
  | "unallocated";
export type TransferDirection = "warehouse_to_store" | "store_to_warehouse";
export type StockMovementType =
  | "purchase_receive"
  | "transfer_out"
  | "transfer_in"
  | "sale"
  | "return_salable"
  | "return_damaged"
  | "audit_adjustment"
  | "manual_adjustment"
  | "legacy_allocation";

export interface StoreProductItem {
  id: string;
  name: string;
  type: ProductType;
  brand: string;
  model?: string;
  specifications: Record<string, unknown>;
  barcode?: string;
  sellingPrice: number;
  costPrice?: number;
  /** Reflects storeQuantity for POS/catalog display (never legacy quantity). */
  quantity: number;
  storeQuantity: number;
  warehouseQuantity: number;
  damagedQuantity: number;
  unallocatedQuantity: number;
  location?: PhoneLocation;
  imei?: string;
  condition?: PhoneCondition;
  batteryHealth?: number;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaginatedProductsResponse {
  count: number;
  totalProducts: number;
  currentPage: number;
  totalPages: number;
  products: StoreProductItem[];
}

export interface ProductQueryParams {
  page?: number;
  limit?: number;
  name?: string;
  type?: ProductType;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  maxQuantity?: number;
  sort?: "price_asc" | "price_desc" | "newest";
}

export interface CreateProductPayload {
  name: string;
  type: ProductType;
  brand: string;
  model?: string;
  specifications?: Record<string, unknown>;
  sellingPrice: number;
  quantity?: number;
  imei?: string;
  condition?: PhoneCondition;
  batteryHealth?: number;
  notes?: string;
}

export interface UpdateProductPayload {
  name?: string;
  brand?: string;
  model?: string;
  sellingPrice?: number;
  specifications?: Record<string, unknown>;
  notes?: string;
}

export interface StoreUserRecord {
  id: string;
  name: string;
  email: string;
  role: StoreUserRole;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoreSupplierRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  isActive: boolean;
  createdAt?: string;
}

export interface SupplierInputPayload {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export interface PurchaseInvoiceItem {
  id: string;
  productName: string;
  brand: string;
  model?: string;
  specifications: Record<string, unknown>;
  productType: ProductType;
  quantity: number;
  purchasePrice: number;
  totalPrice: number;
  registeredQuantity: number;
}

export interface StorePurchaseRecord {
  id: string;
  supplierId?: string;
  supplierName: string;
  supplierPhone?: string;
  supplierEmail?: string;
  items: PurchaseInvoiceItem[];
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: "unpaid" | "partially_paid" | "paid";
  status: "draft" | "completed" | "cancelled";
  notes?: string;
  createdByName?: string;
  createdAt?: string;
}

export interface PaginatedPurchasesResponse {
  results: number;
  currentPage: number;
  totalPages: number;
  totalPurchases: number;
  data: StorePurchaseRecord[];
}

export interface CreatePurchasePayload {
  supplier: string;
  items: Array<{
    productName: string;
    brand: string;
    model?: string;
    specifications?: Record<string, unknown>;
    productType: ProductType;
    quantity: number;
    purchasePrice: number;
  }>;
  paidAmount?: number;
  notes?: string;
}

export interface SaleInvoiceItem {
  id: string;
  product: string;
  productName: string;
  productType: ProductType;
  brand: string;
  model?: string;
  imei?: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  isGift: boolean;
  lineTotal: number;
}

export interface SalePaymentEntry {
  id?: string;
  method: PaymentMethod;
  amount: number;
}

export interface StoreSaleRecord {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  cashierName: string;
  items: SaleInvoiceItem[];
  payments: SalePaymentEntry[];
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  totalReturnedAmount: number;
  refundedAmount: number;
  refundDue: number;
  paymentStatus: "unpaid" | "partially_paid" | "paid";
  isGift: boolean;
  status: "completed" | "cancelled";
  saleDate?: string;
}

export interface PaginatedSalesResponse {
  count: number;
  totalSales: number;
  currentPage: number;
  totalPages: number;
  data: StoreSaleRecord[];
}

export interface CreateSalePayload {
  customerName?: string;
  customerPhone?: string;
  items: Array<{
    product: string;
    quantity: number;
    discountAmount?: number;
    isGift?: boolean;
  }>;
  payments: Array<{
    method: PaymentMethod;
    amount: number;
  }>;
}

export interface ReturnedInvoiceItem {
  id: string;
  saleItem: string;
  product: string;
  productName: string;
  productType: ProductType;
  imei?: string;
  quantity: number;
  unitPrice: number;
  refundAmount: number;
  reason: string;
}

export interface RefundPaymentEntry {
  id?: string;
  method: PaymentMethod;
  amount: number;
  refundedAt?: string;
}

export interface StoreReturnRecord {
  id: string;
  returnNumber: string;
  saleId: string;
  invoiceNumber: string;
  cashierName: string;
  items: ReturnedInvoiceItem[];
  totalRefundAmount: number;
  amountAppliedToDebt: number;
  refundDue: number;
  refundedAmount: number;
  refundRemainingAmount: number;
  refundStatus:
    | "not_required"
    | "pending"
    | "partially_refunded"
    | "refunded";
  refundPayments: RefundPaymentEntry[];
  status: "completed" | "cancelled";
  returnDate?: string;
}

export interface PaginatedReturnsResponse {
  count: number;
  totalReturns: number;
  currentPage: number;
  totalPages: number;
  data: StoreReturnRecord[];
}

export interface CreateReturnPayload {
  invoiceNumber: string;
  items: Array<{
    saleItem: string;
    quantity: number;
    reason?: string;
  }>;
}

export interface ShiftCashMovement {
  id: string;
  type: CashMovementType;
  amount: number;
  reason: string;
  createdAt?: string;
}

export interface StoreShiftRecord {
  id: string;
  cashierId?: string;
  cashierName: string;
  openingCash: number;
  closingCash?: number;
  totalCashSales: number;
  totalVisaSales: number;
  totalInstapaySales: number;
  totalWalletSales: number;
  totalCashRefunds: number;
  totalVisaRefunds: number;
  totalInstapayRefunds: number;
  totalWalletRefunds: number;
  totalDeposits: number;
  totalWithdrawals: number;
  expectedCash?: number;
  difference?: number;
  closingVisa?: number;
  expectedVisa?: number;
  visaDifference?: number;
  closingInstapay?: number;
  expectedInstapay?: number;
  instapayDifference?: number;
  closingWallet?: number;
  expectedWallet?: number;
  walletDifference?: number;
  movements: ShiftCashMovement[];
  status: "open" | "closed";
  openedAt?: string;
  closedAt?: string;
}

export interface ShiftSummaryData {
  cashier: string;
  openedAt?: string;
  status: "open" | "closed";
  openingCash: number;
  totalCashSales: number;
  totalCashRefunds: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalVisaSales: number;
  totalVisaRefunds: number;
  expectedVisa: number;
  totalInstapaySales: number;
  totalInstapayRefunds: number;
  expectedInstapay: number;
  totalWalletSales: number;
  totalWalletRefunds: number;
  expectedWallet: number;
  expectedCash: number;
  movements: ShiftCashMovement[];
}

export interface ShiftReconciliation {
  expectedCash: number;
  actualCash: number;
  difference: number;
  expectedVisa?: number;
  actualVisa?: number;
  visaDifference?: number;
  expectedInstapay?: number;
  actualInstapay?: number;
  instapayDifference?: number;
  expectedWallet?: number;
  actualWallet?: number;
  walletDifference?: number;
  status: "balanced" | "shortage" | "overage";
}

export interface ShiftReportGroup {
  cashierId: string;
  cashierName: string;
  totalShifts: number;
  closedShifts: number;
  openShifts: number;
  totalCashSales: number;
  totalCashRefunds: number;
  totalVisaSales: number;
  totalVisaRefunds: number;
  totalInstapaySales: number;
  totalInstapayRefunds: number;
  totalWalletSales: number;
  totalWalletRefunds: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalShortage: number;
  totalOverage: number;
  totalVisaShortage: number;
  totalVisaOverage: number;
  totalInstapayShortage: number;
  totalInstapayOverage: number;
  totalWalletShortage: number;
  totalWalletOverage: number;
}

export interface PaymentMethodReportBreakdown {
  collected: number;
  refunded: number;
  net: number;
}

export interface SalesTimelinePoint {
  date: string;
  invoicesCount: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  collectedAmount: number;
  returnsCount: number;
  returnedAmount: number;
  refundedAmount: number;
  netSalesAfterReturns: number;
  netCashFlow: number;
}

export interface SalesReportData {
  period: {
    from: string;
    to: string;
    timeZone?: string;
    basis?: string;
  };
  sales: {
    totalInvoices: number;
    grossSales: number;
    totalDiscounts: number;
    netSales: number;
    collectedAmount: number;
    outstandingAmount: number;
    currentOutstandingAmount: number;
  };
  paymentStatistics: {
    fullyPaidInvoices: number;
    partiallyPaidInvoices: number;
    unpaidInvoices: number;
    giftInvoices: number;
  };
  returns: {
    totalReturns: number;
    totalReturnedItems: number;
    totalReturnedAmount: number;
    actualRefundedAmount: number;
    pendingRefundAmount: number;
  };
  netSalesAfterReturns: number;
  netCashFlow: number;
  paymentMethods?: {
    cash: PaymentMethodReportBreakdown;
    visa: PaymentMethodReportBreakdown;
    instapay: PaymentMethodReportBreakdown;
    wallet: PaymentMethodReportBreakdown;
  };
  timeline: SalesTimelinePoint[];
}

export interface PurchasesTimelinePoint {
  date: string;
  invoicesCount: number;
  completedCount: number;
  draftCount: number;
  cancelledCount: number;
  totalPurchases: number;
  totalPaid: number;
  totalRemaining: number;
}

export interface PurchasesReportData {
  period: {
    from: string;
    to: string;
    timeZone?: string;
  };
  report: {
    totalInvoices: number;
    totalPurchases: number;
    totalPaid: number;
    totalRemaining: number;
    fullyPaid: number;
    partiallyPaid: number;
    unpaid: number;
    completed: number;
    draft: number;
    cancelled: number;
  };
  timeline: PurchasesTimelinePoint[];
}

export interface ReturnsTimelinePoint {
  date: string;
  returnsCount: number;
  returnedItemsCount: number;
  phonesReturned: number;
  accessoriesReturned: number;
  returnedMerchandiseAmount: number;
  actualRefundedAmount: number;
  pendingRefundAmount: number;
}

export interface ReturnsReportData {
  period: {
    from: string;
    to: string;
    timeZone?: string;
    basis?: string;
  };
  report: {
    totalReturns: number;
    totalReturnItems: number;
    totalReturnedMerchandiseAmount: number;
    totalRefundAmount: number;
    phonesReturned: number;
    accessoriesReturned: number;
    pendingRefundAmount: number;
    refundDue: number;
    actualRefundedAmount: number;
  };
  timeline: ReturnsTimelinePoint[];
}

/* ============================================================================
 * INTERNAL HELPERS & NORMALIZERS
 * ============================================================================ */

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function buildQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const searchParams = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== "") {
      searchParams.set(key, String(val));
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : "";
}

async function apiRequest<T = JsonRecord>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Accept: "application/json",
        ...(options.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new DashboardApiError("تعذر الاتصال بالسيرفر، تحقق من تشغيل الخادم");
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new DashboardApiError(
        "حدث خطأ أثناء تنفيذ الطلب من الخادم",
        response.status,
      );
    }
  }

  if (!response.ok) {
    const message =
      (isRecord(data) && typeof data.message === "string" && data.message) ||
      "تعذر إتمام العملية المطلوبة";
    throw new DashboardApiError(
      message,
      response.status,
      isRecord(data) ? data : undefined,
    );
  }

  if (isRecord(data) && data.success === false) {
    const message =
      typeof data.message === "string"
        ? data.message
        : "رفض الخادم إتمام العملية";
    throw new DashboardApiError(message, response.status, data);
  }

  return data as T;
}

export function normalizeProductType(value: unknown): ProductType {
  if (value === "phone" || value === "maintenance") return value;
  return "accessory";
}

export function normalizeProduct(raw: JsonRecord): StoreProductItem {
  const specs = isRecord(raw.specifications) ? raw.specifications : {};
  const storeQuantity = asNumber(raw.storeQuantity, 0);
  const warehouseQuantity = asNumber(raw.warehouseQuantity, 0);
  const damagedQuantity = asNumber(raw.damagedQuantity, 0);
  const unallocatedQuantity = asNumber(raw.unallocatedQuantity, 0);
  const rawLocation = asString(raw.location);
  const location =
    rawLocation === "warehouse" ||
    rawLocation === "store" ||
    rawLocation === "sold" ||
    rawLocation === "damaged" ||
    rawLocation === "unallocated"
      ? rawLocation
      : undefined;

  return {
    id: asString(raw._id ?? raw.id),
    name: asString(raw.name, "منتج"),
    type: normalizeProductType(raw.type),
    brand: asString(raw.brand),
    model: asString(raw.model) || undefined,
    specifications: specs,
    barcode: asString(raw.barcode) || undefined,
    sellingPrice: asNumber(raw.sellingPrice, 0),
    costPrice: asOptionalNumber(raw.costPrice),
    quantity: storeQuantity,
    storeQuantity,
    warehouseQuantity,
    damagedQuantity,
    unallocatedQuantity,
    location,
    imei: asString(raw.imei) || undefined,
    condition:
      raw.condition === "new" || raw.condition === "used"
        ? raw.condition
        : undefined,
    batteryHealth: asOptionalNumber(raw.batteryHealth),
    notes: asString(raw.notes) || undefined,
    isActive: typeof raw.isActive === "boolean" ? raw.isActive : true,
    createdAt: asString(raw.createdAt) || undefined,
    updatedAt: asString(raw.updatedAt) || undefined,
  };
}

function normalizePurchase(raw: JsonRecord): StorePurchaseRecord {
  const supplierObj = isRecord(raw.supplier) ? raw.supplier : null;
  const createdByObj = isRecord(raw.createdBy) ? raw.createdBy : null;
  const rawItems = Array.isArray(raw.items) ? raw.items.filter(isRecord) : [];

  return {
    id: asString(raw._id ?? raw.id),
    supplierId: supplierObj
      ? asString(supplierObj._id ?? supplierObj.id)
      : asString(raw.supplier) || undefined,
    supplierName: supplierObj
      ? asString(supplierObj.name, "مورد")
      : asString(raw.supplierName, "مورد"),
    supplierPhone: supplierObj ? asString(supplierObj.phone) || undefined : undefined,
    supplierEmail: supplierObj ? asString(supplierObj.email) || undefined : undefined,
    items: rawItems.map((item) => ({
      id: asString(item._id ?? item.id),
      productName: asString(item.productName),
      brand: asString(item.brand),
      model: asString(item.model) || undefined,
      specifications: isRecord(item.specifications) ? item.specifications : {},
      productType: normalizeProductType(item.productType),
      quantity: asNumber(item.quantity, 1),
      purchasePrice: asNumber(item.purchasePrice, 0),
      totalPrice: asNumber(item.totalPrice, 0),
      registeredQuantity: asNumber(item.registeredQuantity, 0),
    })),
    totalAmount: asNumber(raw.totalAmount, 0),
    paidAmount: asNumber(raw.paidAmount, 0),
    remainingAmount: asNumber(raw.remainingAmount, 0),
    paymentStatus:
      raw.paymentStatus === "paid" || raw.paymentStatus === "partially_paid"
        ? raw.paymentStatus
        : "unpaid",
    status:
      raw.status === "completed" || raw.status === "cancelled"
        ? raw.status
        : "draft",
    notes: asString(raw.notes) || undefined,
    createdByName: createdByObj
      ? asString(createdByObj.name) || undefined
      : undefined,
    createdAt: asString(raw.createdAt) || undefined,
  };
}

function normalizeSale(raw: JsonRecord): StoreSaleRecord {
  const cashierObj = isRecord(raw.cashier) ? raw.cashier : null;
  const rawItems = Array.isArray(raw.items) ? raw.items.filter(isRecord) : [];
  const rawPayments = Array.isArray(raw.payments)
    ? raw.payments.filter(isRecord)
    : [];

  return {
    id: asString(raw._id ?? raw.id),
    invoiceNumber: asString(raw.invoiceNumber),
    customerName: asString(raw.customerName),
    customerPhone: asString(raw.customerPhone),
    cashierName:
      asString(raw.cashierName) ||
      (cashierObj ? asString(cashierObj.name) : ""),
    items: rawItems.map((item) => ({
      id: asString(item._id ?? item.id),
      product: asString(item.product),
      productName: asString(item.productName),
      productType: normalizeProductType(item.productType),
      brand: asString(item.brand),
      model: asString(item.model) || undefined,
      imei: asString(item.imei) || undefined,
      quantity: asNumber(item.quantity, 1),
      unitPrice: asNumber(item.unitPrice, 0),
      discountAmount: asNumber(item.discountAmount, 0),
      isGift: Boolean(item.isGift),
      lineTotal: asNumber(item.lineTotal, 0),
    })),
    payments: rawPayments.map((pmt) => ({
      id: asString(pmt._id ?? pmt.id) || undefined,
      method:
        pmt.method === "wallet" ||
        pmt.method === "instapay" ||
        pmt.method === "visa"
          ? pmt.method
          : "cash",
      amount: asNumber(pmt.amount, 0),
    })),
    totalAmount: asNumber(raw.totalAmount, 0),
    discountAmount: asNumber(raw.discountAmount, 0),
    finalAmount: asNumber(raw.finalAmount, 0),
    paidAmount: asNumber(raw.paidAmount, 0),
    remainingAmount: asNumber(raw.remainingAmount, 0),
    totalReturnedAmount: asNumber(raw.totalReturnedAmount, 0),
    refundedAmount: asNumber(raw.refundedAmount, 0),
    refundDue: asNumber(raw.refundDue, 0),
    paymentStatus:
      raw.paymentStatus === "paid" || raw.paymentStatus === "partially_paid"
        ? raw.paymentStatus
        : "unpaid",
    isGift: Boolean(raw.isGift),
    status: raw.status === "cancelled" ? "cancelled" : "completed",
    saleDate: asString(raw.saleDate ?? raw.createdAt) || undefined,
  };
}

function normalizeReturn(raw: JsonRecord): StoreReturnRecord {
  const saleObj = isRecord(raw.sale) ? raw.sale : null;
  const rawItems = Array.isArray(raw.items) ? raw.items.filter(isRecord) : [];
  const rawPayments = Array.isArray(raw.refundPayments)
    ? raw.refundPayments.filter(isRecord)
    : [];

  return {
    id: asString(raw._id ?? raw.id),
    returnNumber: asString(raw.returnNumber),
    saleId: saleObj
      ? asString(saleObj._id ?? saleObj.id)
      : asString(raw.sale),
    invoiceNumber:
      asString(raw.invoiceNumber) ||
      (saleObj ? asString(saleObj.invoiceNumber) : ""),
    cashierName: asString(raw.cashierName),
    items: rawItems.map((item) => ({
      id: asString(item._id ?? item.id),
      saleItem: asString(item.saleItem),
      product: asString(item.product),
      productName: asString(item.productName),
      productType: normalizeProductType(item.productType),
      imei: asString(item.imei) || undefined,
      quantity: asNumber(item.quantity, 1),
      unitPrice: asNumber(item.unitPrice, 0),
      refundAmount: asNumber(item.refundAmount, 0),
      reason: asString(item.reason),
    })),
    totalRefundAmount: asNumber(raw.totalRefundAmount, 0),
    amountAppliedToDebt: asNumber(raw.amountAppliedToDebt, 0),
    refundDue: asNumber(raw.refundDue, 0),
    refundedAmount: asNumber(raw.refundedAmount, 0),
    refundRemainingAmount: asNumber(raw.refundRemainingAmount, 0),
    refundStatus:
      raw.refundStatus === "pending" ||
      raw.refundStatus === "partially_refunded" ||
      raw.refundStatus === "refunded"
        ? raw.refundStatus
        : "not_required",
    refundPayments: rawPayments.map((pmt) => ({
      id: asString(pmt._id ?? pmt.id) || undefined,
      method:
        pmt.method === "wallet" ||
        pmt.method === "instapay" ||
        pmt.method === "visa"
          ? pmt.method
          : "cash",
      amount: asNumber(pmt.amount, 0),
      refundedAt: asString(pmt.refundedAt) || undefined,
    })),
    status: raw.status === "cancelled" ? "cancelled" : "completed",
    returnDate: asString(raw.returnDate ?? raw.createdAt) || undefined,
  };
}

function normalizeShift(raw: JsonRecord): StoreShiftRecord {
  const cashierObj = isRecord(raw.cashier) ? raw.cashier : null;
  const rawMovements = Array.isArray(raw.movements)
    ? raw.movements.filter(isRecord)
    : [];

  return {
    id: asString(raw._id ?? raw.id),
    cashierId: cashierObj
      ? asString(cashierObj._id ?? cashierObj.id)
      : asString(raw.cashier) || undefined,
    cashierName:
      asString(raw.cashierName) ||
      (cashierObj ? asString(cashierObj.name) : ""),
    openingCash: asNumber(raw.openingCash, 0),
    closingCash: asOptionalNumber(raw.closingCash),
    totalCashSales: asNumber(raw.totalCashSales, 0),
    totalVisaSales: asNumber(raw.totalVisaSales, 0),
    totalInstapaySales: asNumber(raw.totalInstapaySales, 0),
    totalWalletSales: asNumber(raw.totalWalletSales, 0),
    totalCashRefunds: asNumber(raw.totalCashRefunds, 0),
    totalVisaRefunds: asNumber(raw.totalVisaRefunds, 0),
    totalInstapayRefunds: asNumber(raw.totalInstapayRefunds, 0),
    totalWalletRefunds: asNumber(raw.totalWalletRefunds, 0),
    totalDeposits: asNumber(raw.totalDeposits, 0),
    totalWithdrawals: asNumber(raw.totalWithdrawals, 0),
    expectedCash: asOptionalNumber(raw.expectedCash),
    difference: asOptionalNumber(raw.difference),
    closingVisa: asOptionalNumber(raw.closingVisa),
    expectedVisa: asOptionalNumber(raw.expectedVisa),
    visaDifference: asOptionalNumber(raw.visaDifference),
    closingInstapay: asOptionalNumber(raw.closingInstapay),
    expectedInstapay: asOptionalNumber(raw.expectedInstapay),
    instapayDifference: asOptionalNumber(raw.instapayDifference),
    closingWallet: asOptionalNumber(raw.closingWallet),
    expectedWallet: asOptionalNumber(raw.expectedWallet),
    walletDifference: asOptionalNumber(raw.walletDifference),
    movements: rawMovements.map((mv) => ({
      id: asString(mv._id ?? mv.id),
      type: mv.type === "withdrawal" ? "withdrawal" : "deposit",
      amount: asNumber(mv.amount, 0),
      reason: asString(mv.reason),
      createdAt: asString(mv.createdAt) || undefined,
    })),
    status: raw.status === "closed" ? "closed" : "open",
    openedAt: asString(raw.openedAt ?? raw.createdAt) || undefined,
    closedAt: asString(raw.closedAt) || undefined,
  };
}

/* ============================================================================
 * 1. ACCESSORIES SELLER: GET /products/accessories
 * ============================================================================ */
async function fetchDepartmentCatalog(
  endpoint: "/products/accessories" | "/products/maintenance",
  params: Omit<ProductQueryParams, "type" | "maxQuantity"> = {},
): Promise<PaginatedProductsResponse> {
  const qs = buildQueryString({
    page: params.page ?? 1,
    limit: params.limit ?? 50,
    name: params.name,
    brand: params.brand,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    sort: params.sort,
  });
  const data = await apiRequest<JsonRecord>(`${endpoint}${qs}`, {
    method: "GET",
  });
  const rows = Array.isArray(data.products)
    ? data.products.filter(isRecord).map(normalizeProduct)
    : [];
  return {
    count: asNumber(data.count, rows.length),
    totalProducts: asNumber(data.totalProducts, rows.length),
    currentPage: asNumber(data.currentPage, 1),
    totalPages: asNumber(data.totalPages, 1),
    products: rows,
  };
}

export function fetchAccessoriesCatalog(
  params: Omit<ProductQueryParams, "type" | "maxQuantity"> = {},
): Promise<PaginatedProductsResponse> {
  return fetchDepartmentCatalog("/products/accessories", params);
}

export function fetchMaintenanceCatalog(
  params: Omit<ProductQueryParams, "type" | "maxQuantity"> = {},
): Promise<PaginatedProductsResponse> {
  return fetchDepartmentCatalog("/products/maintenance", params);
}

/* ============================================================================
 * 2. PHONE SELLER: GET /products/phones
 * ============================================================================ */
export async function fetchPhonesCatalog(
  params: Omit<ProductQueryParams, "type" | "maxQuantity"> = {},
): Promise<PaginatedProductsResponse> {
  const qs = buildQueryString({
    page: params.page ?? 1,
    limit: params.limit ?? 50,
    name: params.name,
    brand: params.brand,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    sort: params.sort,
  });
  const data = await apiRequest<JsonRecord>(`/products/phones${qs}`, {
    method: "GET",
  });
  const rows = Array.isArray(data.products)
    ? data.products.filter(isRecord).map(normalizeProduct)
    : [];
  return {
    count: asNumber(data.count, rows.length),
    totalProducts: asNumber(data.totalProducts, rows.length),
    currentPage: asNumber(data.currentPage, 1),
    totalPages: asNumber(data.totalPages, 1),
    products: rows,
  };
}

/* ============================================================================
 * 3. SHARED PERSONAL ACCOUNT: GET /profile, POST /change-password & PATCH /users/me
 * ============================================================================ */
export async function fetchMyProfile(): Promise<StoreUserRecord> {
  const data = await apiRequest<JsonRecord>("/profile", {
    method: "GET",
  });
  const row = isRecord(data.user) ? data.user : null;
  if (!row) {
    throw new DashboardApiError("تعذر جلب بيانات الملف الشخصي");
  }
  return {
    id: asString(row._id ?? row.id),
    name: asString(row.name),
    email: asString(row.email),
    role: (asString(row.role, "general") as StoreUserRole) || "general",
    isActive: typeof row.isActive === "boolean" ? row.isActive : true,
    createdAt: asString(row.createdAt) || undefined,
    updatedAt: asString(row.updatedAt) || undefined,
  };
}

export async function changeUserPassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<string> {
  const data = await apiRequest<JsonRecord>("/change-password", {
    method: "POST",
    body: JSON.stringify({
      currentPassword: payload.currentPassword,
      newPassword: payload.newPassword,
    }),
  });
  return asString(
    data?.message,
    "تم تغيير كلمة المرور بنجاح. يرجى تسجيل الدخول مرة أخرى.",
  );
}

export async function updateMyProfile(payload: {
  name?: string;
  email?: string;
}): Promise<string> {
  const data = await apiRequest<JsonRecord>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return asString(data?.message, "تم تحديث بيانات الحساب بنجاح");
}

/* ============================================================================
 * 4. PRODUCTS MANAGEMENT & BARCODE (OWNER & CASHIER)
 * ============================================================================ */
export async function fetchProductByBarcode(
  barcode: string,
): Promise<StoreProductItem> {
  const clean = encodeURIComponent(barcode.trim());
  const data = await apiRequest<JsonRecord>(`/products/barcode/${clean}`, {
    method: "GET",
  });
  if (!isRecord(data.product)) {
    throw new DashboardApiError("لم يتم العثور على المنتج");
  }
  return normalizeProduct(data.product);
}

export async function fetchOwnerProducts(
  params: ProductQueryParams = {},
): Promise<PaginatedProductsResponse> {
  const qs = buildQueryString({
    page: params.page ?? 1,
    limit: params.limit ?? 50,
    name: params.name,
    type: params.type,
    brand: params.brand,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    maxQuantity: params.maxQuantity,
    sort: params.sort,
  });
  const data = await apiRequest<JsonRecord>(`/products${qs}`, {
    method: "GET",
  });
  const rows = Array.isArray(data.products)
    ? data.products.filter(isRecord).map(normalizeProduct)
    : [];
  return {
    count: asNumber(data.count, rows.length),
    totalProducts: asNumber(data.totalProducts, rows.length),
    currentPage: asNumber(data.currentPage, 1),
    totalPages: asNumber(data.totalPages, 1),
    products: rows,
  };
}

export async function fetchOwnerInactiveProducts(
  page = 1,
  limit = 50,
): Promise<PaginatedProductsResponse> {
  const qs = buildQueryString({ page, limit });
  const data = await apiRequest<JsonRecord>(`/products/inactive${qs}`, {
    method: "GET",
  });
  const rows = Array.isArray(data.products)
    ? data.products.filter(isRecord).map(normalizeProduct)
    : [];
  return {
    count: asNumber(data.count, rows.length),
    totalProducts: asNumber(data.totalProducts, rows.length),
    currentPage: asNumber(data.currentPage, 1),
    totalPages: asNumber(data.totalPages, 1),
    products: rows,
  };
}

export async function fetchOwnerProductById(
  productId: string,
): Promise<StoreProductItem> {
  const clean = encodeURIComponent(productId.trim());
  const data = await apiRequest<JsonRecord>(`/products/${clean}`, {
    method: "GET",
  });
  if (!isRecord(data.product)) {
    throw new DashboardApiError("المنتج غير موجود");
  }
  return normalizeProduct(data.product);
}

export async function createOwnerProduct(
  payload: CreateProductPayload,
): Promise<{ message: string; product: StoreProductItem }> {
  const data = await apiRequest<JsonRecord>("/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!isRecord(data.product)) {
    throw new DashboardApiError("تعذر قراءة بيانات المنتج المضاف");
  }
  return {
    message: asString(data.message, "تمت إضافة المنتج بنجاح"),
    product: normalizeProduct(data.product),
  };
}

export async function updateOwnerProduct(
  productId: string,
  payload: UpdateProductPayload,
): Promise<{ message: string; product: StoreProductItem }> {
  const clean = encodeURIComponent(productId.trim());
  const data = await apiRequest<JsonRecord>(`/products/${clean}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!isRecord(data.product)) {
    throw new DashboardApiError("تعذر قراءة بيانات المنتج المحدث");
  }
  return {
    message: asString(data.message, "تم تحديث بيانات المنتج بنجاح"),
    product: normalizeProduct(data.product),
  };
}

export async function updateOwnerAccessoryStock(
  productId: string,
  payload: { operation: "increase" | "decrease"; quantity: number },
): Promise<{ message: string; product: StoreProductItem }> {
  const clean = encodeURIComponent(productId.trim());
  const data = await apiRequest<JsonRecord>(`/products/${clean}/stock`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!isRecord(data.product)) {
    throw new DashboardApiError("تعذر تحديث المخزون");
  }
  return {
    message: asString(data.message, "تم تحديث كمية المخزون بنجاح"),
    product: normalizeProduct(data.product),
  };
}

export async function deactivateOwnerProduct(
  productId: string,
): Promise<string> {
  const clean = encodeURIComponent(productId.trim());
  const data = await apiRequest<JsonRecord>(`/products/${clean}`, {
    method: "DELETE",
  });
  return asString(data.message, "تم إلغاء تفعيل المنتج بنجاح");
}

export async function restoreOwnerProduct(productId: string): Promise<string> {
  const clean = encodeURIComponent(productId.trim());
  const data = await apiRequest<JsonRecord>(`/products/${clean}/restore`, {
    method: "PATCH",
  });
  return asString(data.message, "تمت استعادة المنتج بنجاح");
}

export async function deactivateAllOwnerProducts(): Promise<string> {
  const data = await apiRequest<JsonRecord>("/products", {
    method: "DELETE",
  });
  return asString(data.message, "تم إيقاف تفعيل المنتجات النشطة");
}

/* ============================================================================
 * 5. SUPPLIERS MANAGEMENT (OWNER)
 * ============================================================================ */
export async function fetchSuppliersList(): Promise<StoreSupplierRecord[]> {
  const data = await apiRequest<JsonRecord>("/suppliers", { method: "GET" });
  const rows = Array.isArray(data.suppliers)
    ? data.suppliers.filter(isRecord)
    : [];
  return rows.map((row) => ({
    id: asString(row._id ?? row.id),
    name: asString(row.name),
    email: asString(row.email),
    phone: asString(row.phone),
    address: asString(row.address),
    isActive: typeof row.isActive === "boolean" ? row.isActive : true,
    createdAt: asString(row.createdAt) || undefined,
  }));
}

export async function fetchSupplierById(
  supplierId: string,
): Promise<StoreSupplierRecord> {
  const clean = encodeURIComponent(supplierId.trim());
  const data = await apiRequest<JsonRecord>(`/suppliers/${clean}`, {
    method: "GET",
  });
  const row = isRecord(data.supplier) ? data.supplier : null;
  if (!row) throw new DashboardApiError("المورد غير موجود");
  return {
    id: asString(row._id ?? row.id),
    name: asString(row.name),
    email: asString(row.email),
    phone: asString(row.phone),
    address: asString(row.address),
    isActive: typeof row.isActive === "boolean" ? row.isActive : true,
    createdAt: asString(row.createdAt) || undefined,
  };
}

export async function createSupplier(
  payload: SupplierInputPayload,
): Promise<string> {
  const data = await apiRequest<JsonRecord>("/suppliers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return asString(data.message, "تمت إضافة المورد بنجاح");
}

export async function updateSupplierById(
  supplierId: string,
  payload: Partial<SupplierInputPayload>,
): Promise<string> {
  const clean = encodeURIComponent(supplierId.trim());
  const data = await apiRequest<JsonRecord>(`/suppliers/${clean}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return asString(data.message, "تم تحديث بيانات المورد بنجاح");
}

export async function updateSupplierStatusById(
  supplierId: string,
  isActive: boolean,
): Promise<string> {
  const clean = encodeURIComponent(supplierId.trim());
  const data = await apiRequest<JsonRecord>(`/suppliers/status/${clean}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
  return asString(data.message, "تم تحديث حالة المورد بنجاح");
}

export async function deactivateSupplierById(
  supplierId: string,
): Promise<string> {
  const clean = encodeURIComponent(supplierId.trim());
  const data = await apiRequest<JsonRecord>(`/suppliers/${clean}`, {
    method: "DELETE",
  });
  return asString(data.message, "تم إيقاف تفعيل المورد بنجاح");
}

/* ============================================================================
 * 6. PURCHASES MANAGEMENT (OWNER)
 * ============================================================================ */
export async function fetchPurchasesList(
  page = 1,
  limit = 20,
): Promise<PaginatedPurchasesResponse> {
  const qs = buildQueryString({ page, limit });
  const data = await apiRequest<JsonRecord>(`/purchase${qs}`, {
    method: "GET",
  });
  const rows = Array.isArray(data.data)
    ? data.data.filter(isRecord).map(normalizePurchase)
    : [];
  const pagination = isRecord(data.pagination) ? data.pagination : {};
  return {
    results: asNumber(data.results, rows.length),
    currentPage: asNumber(pagination.currentPage, page),
    totalPages: asNumber(pagination.totalPages, 1),
    totalPurchases: asNumber(pagination.totalPurchases, rows.length),
    data: rows,
  };
}

export async function fetchPurchaseById(
  purchaseId: string,
): Promise<StorePurchaseRecord> {
  const clean = encodeURIComponent(purchaseId.trim());
  const data = await apiRequest<JsonRecord>(`/purchase/${clean}`, {
    method: "GET",
  });
  if (!isRecord(data.data)) {
    throw new DashboardApiError("فاتورة الشراء غير موجودة");
  }
  return normalizePurchase(data.data);
}

export async function createPurchaseInvoice(
  payload: CreatePurchasePayload,
): Promise<{ message: string; purchase: StorePurchaseRecord }> {
  const data = await apiRequest<JsonRecord>("/purchase", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!isRecord(data.data)) {
    throw new DashboardApiError("تعذر قراءة بيانات فاتورة الشراء");
  }
  return {
    message: asString(data.message, "تم إنشاء فاتورة الشراء بنجاح"),
    purchase: normalizePurchase(data.data),
  };
}

export async function registerPurchasedPhoneItem(
  purchaseId: string,
  itemId: string,
  payload: {
    imei: string;
    sellingPrice: number;
    condition: PhoneCondition;
    batteryHealth?: number;
    notes?: string;
  },
): Promise<{ message: string; purchase: StorePurchaseRecord }> {
  const pId = encodeURIComponent(purchaseId.trim());
  const iId = encodeURIComponent(itemId.trim());
  const data = await apiRequest<JsonRecord>(
    `/purchase/${pId}/items/${iId}/register-phone`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  const inner = isRecord(data.data) ? data.data : {};
  if (!isRecord(inner.purchase)) {
    throw new DashboardApiError("تم التسجيل ولكن تعذر تحديث عرض الفاتورة");
  }
  return {
    message: asString(data.message, "تم تسجيل الهاتف في المخزون بنجاح"),
    purchase: normalizePurchase(inner.purchase),
  };
}

export async function registerPurchasedAccessoryItem(
  purchaseId: string,
  itemId: string,
  payload: {
    sellingPrice: number;
    notes?: string;
  },
): Promise<{ message: string; purchase: StorePurchaseRecord }> {
  const pId = encodeURIComponent(purchaseId.trim());
  const iId = encodeURIComponent(itemId.trim());
  const data = await apiRequest<JsonRecord>(
    `/purchase/${pId}/items/${iId}/register-accessory`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  const inner = isRecord(data.data) ? data.data : {};
  if (!isRecord(inner.purchase)) {
    throw new DashboardApiError("تم التسجيل ولكن تعذر تحديث عرض الفاتورة");
  }
  return {
    message: asString(data.message, "تم تسجيل كمية الإكسسوار في المخزون بنجاح"),
    purchase: normalizePurchase(inner.purchase),
  };
}

export async function cancelPurchaseInvoice(
  purchaseId: string,
): Promise<string> {
  const clean = encodeURIComponent(purchaseId.trim());
  const data = await apiRequest<JsonRecord>(`/purchase/${clean}/cancel`, {
    method: "PATCH",
  });
  return asString(data.message, "تم إلغاء فاتورة الشراء بنجاح");
}

/* ============================================================================
 * 7. SALES & INVOICES (CASHIER & OWNER)
 * ============================================================================ */
export async function fetchSalesList(
  params: { page?: number; limit?: number; search?: string } = {},
): Promise<PaginatedSalesResponse> {
  const qs = buildQueryString({
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    search: params.search?.trim(),
  });
  const data = await apiRequest<JsonRecord>(`/sales${qs}`, { method: "GET" });
  const rows = Array.isArray(data.data)
    ? data.data.filter(isRecord).map(normalizeSale)
    : [];
  return {
    count: asNumber(data.count, rows.length),
    totalSales: asNumber(data.totalSales, rows.length),
    currentPage: asNumber(data.currentPage, 1),
    totalPages: asNumber(data.totalPages, 1),
    data: rows,
  };
}

export async function fetchSaleById(saleId: string): Promise<StoreSaleRecord> {
  const clean = encodeURIComponent(saleId.trim());
  const data = await apiRequest<JsonRecord>(`/sales/${clean}`, {
    method: "GET",
  });
  if (!isRecord(data.sale)) {
    throw new DashboardApiError("الفاتورة غير موجودة");
  }
  return normalizeSale(data.sale);
}

export async function createSaleInvoice(
  payload: CreateSalePayload,
): Promise<{ message: string; sale: StoreSaleRecord }> {
  const data = await apiRequest<JsonRecord>("/sales", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!isRecord(data.sale)) {
    throw new DashboardApiError("تم إنشاء البيع ولكن تعذر قراءة الفاتورة");
  }
  return {
    message: asString(data.message, "تم إصدار الفاتورة وتسجيل المبيعات بنجاح"),
    sale: normalizeSale(data.sale),
  };
}

/* ============================================================================
 * 8. RETURNS & REFUNDS (CASHIER & OWNER)
 * ============================================================================ */
export async function fetchReturnsList(
  params: { page?: number; limit?: number; invoiceNumber?: string } = {},
): Promise<PaginatedReturnsResponse> {
  const qs = buildQueryString({
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    invoiceNumber: params.invoiceNumber?.trim(),
  });
  const data = await apiRequest<JsonRecord>(`/return${qs}`, { method: "GET" });
  const rows = Array.isArray(data.data)
    ? data.data.filter(isRecord).map(normalizeReturn)
    : [];
  return {
    count: asNumber(data.count, rows.length),
    totalReturns: asNumber(data.totalReturns, rows.length),
    currentPage: asNumber(data.currentPage, 1),
    totalPages: asNumber(data.totalPages, 1),
    data: rows,
  };
}

export async function fetchReturnById(
  returnId: string,
): Promise<StoreReturnRecord> {
  const clean = encodeURIComponent(returnId.trim());
  const data = await apiRequest<JsonRecord>(`/return/${clean}`, {
    method: "GET",
  });
  if (!isRecord(data.data)) {
    throw new DashboardApiError("سجل المرتجع غير موجود");
  }
  return normalizeReturn(data.data);
}

export async function createReturnRequest(
  payload: CreateReturnPayload,
): Promise<{ message: string; returnRecord: StoreReturnRecord }> {
  const data = await apiRequest<JsonRecord>("/return", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!isRecord(data.data)) {
    throw new DashboardApiError("تم تسجيل المرتجع ولكن تعذر قراءة البيانات");
  }
  return {
    message: asString(data.message, "تم تسجيل المرتجع بنجاح"),
    returnRecord: normalizeReturn(data.data),
  };
}

export async function processReturnRefund(
  returnId: string,
  payload: { method: PaymentMethod; amount: number },
): Promise<{ message: string; returnRecord: StoreReturnRecord }> {
  const clean = encodeURIComponent(returnId.trim());
  const data = await apiRequest<JsonRecord>(`/return/${clean}/refund`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!isRecord(data.data)) {
    throw new DashboardApiError("تم رد المبلغ ولكن تعذر تحديث السجل");
  }
  return {
    message: asString(data.message, "تم تنفيذ استرداد المبلغ بنجاح"),
    returnRecord: normalizeReturn(data.data),
  };
}

/* ============================================================================
 * 9. SHIFTS & CASH MANAGEMENT (CASHIER & OWNER)
 * ============================================================================ */
export async function fetchCurrentShift(): Promise<StoreShiftRecord | null> {
  try {
    const data = await apiRequest<JsonRecord>("/shift/current", {
      method: "GET",
    });
    if (!isRecord(data.shift)) return null;
    return normalizeShift(data.shift);
  } catch (error: unknown) {
    if (error instanceof DashboardApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function openCashierShift(
  openingCash: number,
): Promise<{ message: string; shift: StoreShiftRecord }> {
  const data = await apiRequest<JsonRecord>("/shift/open", {
    method: "POST",
    body: JSON.stringify({ openingCash }),
  });
  if (!isRecord(data.shift)) {
    throw new DashboardApiError("تم فتح الوردية ولكن تعذر قراءة البيانات");
  }
  return {
    message: asString(data.message, "تم فتح الوردية بنجاح"),
    shift: normalizeShift(data.shift),
  };
}

export async function closeCashierShift(
  closingCash: number,
  extras?: {
    closingVisa?: number;
    closingInstapay?: number;
    closingWallet?: number;
  },
): Promise<{
  message: string;
  shift: StoreShiftRecord;
  reconciliation?: ShiftReconciliation;
}> {
  const data = await apiRequest<JsonRecord>("/shift/close", {
    method: "PATCH",
    body: JSON.stringify({
      closingCash,
      ...(extras?.closingVisa !== undefined
        ? { closingVisa: extras.closingVisa }
        : {}),
      ...(extras?.closingInstapay !== undefined
        ? { closingInstapay: extras.closingInstapay }
        : {}),
      ...(extras?.closingWallet !== undefined
        ? { closingWallet: extras.closingWallet }
        : {}),
    }),
  });
  if (!isRecord(data.shift)) {
    throw new DashboardApiError("تم إغلاق الوردية ولكن تعذر قراءة البيانات");
  }
  const reconStatus: ShiftReconciliation["status"] =
    isRecord(data.reconciliation) &&
    (data.reconciliation.status === "shortage" ||
      data.reconciliation.status === "overage")
      ? data.reconciliation.status
      : "balanced";

  const recon: ShiftReconciliation | undefined = isRecord(data.reconciliation)
    ? {
        expectedCash: asNumber(data.reconciliation.expectedCash, 0),
        actualCash: asNumber(data.reconciliation.actualCash, 0),
        difference: asNumber(data.reconciliation.difference, 0),
        expectedVisa: asOptionalNumber(data.reconciliation.expectedVisa),
        actualVisa: asOptionalNumber(data.reconciliation.actualVisa),
        visaDifference: asOptionalNumber(data.reconciliation.visaDifference),
        expectedInstapay: asOptionalNumber(
          data.reconciliation.expectedInstapay,
        ),
        actualInstapay: asOptionalNumber(data.reconciliation.actualInstapay),
        instapayDifference: asOptionalNumber(
          data.reconciliation.instapayDifference,
        ),
        expectedWallet: asOptionalNumber(data.reconciliation.expectedWallet),
        actualWallet: asOptionalNumber(data.reconciliation.actualWallet),
        walletDifference: asOptionalNumber(
          data.reconciliation.walletDifference,
        ),
        status: reconStatus,
      }
    : undefined;

  return {
    message: asString(data.message, "تم إغلاق الوردية بنجاح"),
    shift: normalizeShift(data.shift),
    reconciliation: recon,
  };
}

export async function recordShiftMovement(payload: {
  type: CashMovementType;
  amount: number;
  reason: string;
}): Promise<{ message: string; shift: StoreShiftRecord }> {
  const data = await apiRequest<JsonRecord>("/shift/movements", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!isRecord(data.shift)) {
    throw new DashboardApiError("تم تسجيل الحركة النقدية");
  }
  return {
    message: asString(data.message, "تم تسجيل حركة النقدية بنجاح"),
    shift: normalizeShift(data.shift),
  };
}

export async function fetchShiftSummary(): Promise<ShiftSummaryData | null> {
  try {
    const data = await apiRequest<JsonRecord>("/shift/summary", {
      method: "GET",
    });
    const s = isRecord(data.summary) ? data.summary : null;
    if (!s) return null;
    const rawMovements = Array.isArray(s.movements)
      ? s.movements.filter(isRecord)
      : [];
    return {
      cashier: asString(s.cashier),
      openedAt: asString(s.openedAt) || undefined,
      status: s.status === "closed" ? "closed" : "open",
      openingCash: asNumber(s.openingCash, 0),
      totalCashSales: asNumber(s.totalCashSales, 0),
      totalCashRefunds: asNumber(s.totalCashRefunds, 0),
      totalDeposits: asNumber(s.totalDeposits, 0),
      totalWithdrawals: asNumber(s.totalWithdrawals, 0),
      totalVisaSales: asNumber(s.totalVisaSales, 0),
      totalVisaRefunds: asNumber(s.totalVisaRefunds, 0),
      expectedVisa: asNumber(s.expectedVisa, 0),
      totalInstapaySales: asNumber(s.totalInstapaySales, 0),
      totalInstapayRefunds: asNumber(s.totalInstapayRefunds, 0),
      expectedInstapay: asNumber(s.expectedInstapay, 0),
      totalWalletSales: asNumber(s.totalWalletSales, 0),
      totalWalletRefunds: asNumber(s.totalWalletRefunds, 0),
      expectedWallet: asNumber(s.expectedWallet, 0),
      expectedCash: asNumber(s.expectedCash, 0),
      movements: rawMovements.map((mv) => ({
        id: asString(mv._id ?? mv.id),
        type: mv.type === "withdrawal" ? "withdrawal" : "deposit",
        amount: asNumber(mv.amount, 0),
        reason: asString(mv.reason),
        createdAt: asString(mv.createdAt) || undefined,
      })),
    };
  } catch (error: unknown) {
    if (error instanceof DashboardApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function fetchShiftHistory(): Promise<StoreShiftRecord[]> {
  const data = await apiRequest<JsonRecord>("/shift/history", {
    method: "GET",
  });
  const rows = Array.isArray(data.shifts)
    ? data.shifts.filter(isRecord).map(normalizeShift)
    : [];
  return rows;
}

export async function fetchActiveShiftsForOwner(): Promise<StoreShiftRecord[]> {
  const data = await apiRequest<JsonRecord>("/shift/active", {
    method: "GET",
  });
  const rows = Array.isArray(data.shifts)
    ? data.shifts.filter(isRecord).map(normalizeShift)
    : [];
  return rows;
}

export async function fetchShiftByIdForOwner(
  shiftId: string,
): Promise<StoreShiftRecord> {
  const clean = encodeURIComponent(shiftId.trim());
  const data = await apiRequest<JsonRecord>(`/shift/${clean}`, {
    method: "GET",
  });
  if (!isRecord(data.shift)) {
    throw new DashboardApiError("الوردية غير موجودة");
  }
  return normalizeShift(data.shift);
}

export async function fetchShiftReportsForOwner(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<ShiftReportGroup[]> {
  const qs = buildQueryString({
    startDate: params?.startDate,
    endDate: params?.endDate,
  });
  const data = await apiRequest<JsonRecord>(`/shift/reports${qs}`, {
    method: "GET",
  });
  const rows = Array.isArray(data.reports)
    ? data.reports.filter(isRecord)
    : [];
  return rows.map((r) => ({
    cashierId: asString(r._id),
    cashierName: asString(r.cashierName, "كاشير"),
    totalShifts: asNumber(r.totalShifts, 0),
    closedShifts: asNumber(r.closedShifts, 0),
    openShifts: asNumber(r.openShifts, 0),
    totalCashSales: asNumber(r.totalCashSales, 0),
    totalCashRefunds: asNumber(r.totalCashRefunds, 0),
    totalVisaSales: asNumber(r.totalVisaSales, 0),
    totalVisaRefunds: asNumber(r.totalVisaRefunds, 0),
    totalInstapaySales: asNumber(r.totalInstapaySales, 0),
    totalInstapayRefunds: asNumber(r.totalInstapayRefunds, 0),
    totalWalletSales: asNumber(r.totalWalletSales, 0),
    totalWalletRefunds: asNumber(r.totalWalletRefunds, 0),
    totalDeposits: asNumber(r.totalDeposits, 0),
    totalWithdrawals: asNumber(r.totalWithdrawals, 0),
    totalShortage: asNumber(r.totalShortage, 0),
    totalOverage: asNumber(r.totalOverage, 0),
    totalVisaShortage: asNumber(r.totalVisaShortage, 0),
    totalVisaOverage: asNumber(r.totalVisaOverage, 0),
    totalInstapayShortage: asNumber(r.totalInstapayShortage, 0),
    totalInstapayOverage: asNumber(r.totalInstapayOverage, 0),
    totalWalletShortage: asNumber(r.totalWalletShortage, 0),
    totalWalletOverage: asNumber(r.totalWalletOverage, 0),
  }));
}

/* ============================================================================
 * 10. EMPLOYEES MANAGEMENT (OWNER)
 * ============================================================================ */
export async function fetchUsersList(): Promise<StoreUserRecord[]> {
  const data = await apiRequest<JsonRecord>("/users", { method: "GET" });
  const rows = Array.isArray(data.users) ? data.users.filter(isRecord) : [];
  return rows.map((row) => ({
    id: asString(row._id ?? row.id),
    name: asString(row.name, "موظف"),
    email: asString(row.email),
    role: (asString(row.role, "general") as StoreUserRole) || "general",
    isActive: typeof row.isActive === "boolean" ? row.isActive : true,
    createdAt: asString(row.createdAt) || undefined,
  }));
}

export async function updateUserRoleById(
  userId: string,
  role: StoreUserRole,
): Promise<string> {
  const clean = encodeURIComponent(userId.trim());
  const data = await apiRequest<JsonRecord>(`/users/${clean}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  return asString(data?.message, "تم تحديث الدور الوظيفي بنجاح");
}

export async function toggleUserStatusById(
  userId: string,
  isActive: boolean,
): Promise<string> {
  const clean = encodeURIComponent(userId.trim());
  const data = await apiRequest<JsonRecord>(`/users/${clean}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
  return asString(data?.message, "تم تحديث حالة الحساب بنجاح");
}

/* ============================================================================
 * 11. OWNER REPORTS (REQUIRE from & to IN YYYY-MM-DD)
 * ============================================================================ */
export async function fetchSalesReportForOwner(
  from: string,
  to: string,
): Promise<SalesReportData> {
  const qs = buildQueryString({ from, to });
  const data = await apiRequest<JsonRecord>(`/sales-reports${qs}`, {
    method: "GET",
  });
  const period = isRecord(data.period) ? data.period : {};
  const report = isRecord(data.report) ? data.report : {};
  const sales = isRecord(report.sales) ? report.sales : {};
  const paymentStatistics = isRecord(report.paymentStatistics)
    ? report.paymentStatistics
    : {};
  const returns = isRecord(report.returns) ? report.returns : {};

  const rawTimeline = Array.isArray(report.timeline)
    ? report.timeline.filter(isRecord)
    : [];
  const rawPaymentMethods = isRecord(report.paymentMethods)
    ? report.paymentMethods
    : null;
  const parseMethodBreakdown = (key: string): PaymentMethodReportBreakdown => {
    const entry =
      rawPaymentMethods && isRecord(rawPaymentMethods[key])
        ? (rawPaymentMethods[key] as JsonRecord)
        : {};
    return {
      collected: asNumber(entry.collected, 0),
      refunded: asNumber(entry.refunded, 0),
      net: asNumber(entry.net, 0),
    };
  };

  return {
    period: {
      from: asString(period.from, from),
      to: asString(period.to, to),
      timeZone: asString(period.timeZone) || undefined,
      basis: asString(period.basis) || undefined,
    },
    sales: {
      totalInvoices: asNumber(sales.totalInvoices, 0),
      grossSales: asNumber(sales.grossSales, 0),
      totalDiscounts: asNumber(sales.totalDiscounts, 0),
      netSales: asNumber(sales.netSales, 0),
      collectedAmount: asNumber(sales.collectedAmount, 0),
      outstandingAmount: asNumber(sales.outstandingAmount, 0),
      currentOutstandingAmount: asNumber(sales.currentOutstandingAmount, 0),
    },
    paymentStatistics: {
      fullyPaidInvoices: asNumber(paymentStatistics.fullyPaidInvoices, 0),
      partiallyPaidInvoices: asNumber(
        paymentStatistics.partiallyPaidInvoices,
        0,
      ),
      unpaidInvoices: asNumber(paymentStatistics.unpaidInvoices, 0),
      giftInvoices: asNumber(paymentStatistics.giftInvoices, 0),
    },
    returns: {
      totalReturns: asNumber(returns.totalReturns, 0),
      totalReturnedItems: asNumber(returns.totalReturnedItems, 0),
      totalReturnedAmount: asNumber(returns.totalReturnedAmount, 0),
      actualRefundedAmount: asNumber(returns.actualRefundedAmount, 0),
      pendingRefundAmount: asNumber(returns.pendingRefundAmount, 0),
    },
    netSalesAfterReturns: asNumber(report.netSalesAfterReturns, 0),
    netCashFlow: asNumber(report.netCashFlow, 0),
    paymentMethods: rawPaymentMethods
      ? {
          cash: parseMethodBreakdown("cash"),
          visa: parseMethodBreakdown("visa"),
          instapay: parseMethodBreakdown("instapay"),
          wallet: parseMethodBreakdown("wallet"),
        }
      : undefined,
    timeline: rawTimeline.map((row) => ({
      date: asString(row.date),
      invoicesCount: asNumber(row.invoicesCount, 0),
      grossSales: asNumber(row.grossSales, 0),
      discounts: asNumber(row.discounts, 0),
      netSales: asNumber(row.netSales, 0),
      collectedAmount: asNumber(row.collectedAmount, 0),
      returnsCount: asNumber(row.returnsCount, 0),
      returnedAmount: asNumber(row.returnedAmount, 0),
      refundedAmount: asNumber(row.refundedAmount, 0),
      netSalesAfterReturns: asNumber(row.netSalesAfterReturns, 0),
      netCashFlow: asNumber(row.netCashFlow, 0),
    })),
  };
}

export async function fetchPurchasesReportForOwner(
  from: string,
  to: string,
): Promise<PurchasesReportData> {
  const qs = buildQueryString({ from, to });
  const data = await apiRequest<JsonRecord>(`/purchases-reports${qs}`, {
    method: "GET",
  });
  const period = isRecord(data.period) ? data.period : {};
  const report = isRecord(data.report) ? data.report : {};
  const rawTimeline = Array.isArray(report.timeline)
    ? report.timeline.filter(isRecord)
    : [];

  return {
    period: {
      from: asString(period.from, from),
      to: asString(period.to, to),
      timeZone: asString(period.timeZone) || undefined,
    },
    report: {
      totalInvoices: asNumber(report.totalInvoices, 0),
      totalPurchases: asNumber(report.totalPurchases, 0),
      totalPaid: asNumber(report.totalPaid, 0),
      totalRemaining: asNumber(report.totalRemaining, 0),
      fullyPaid: asNumber(report.fullyPaid, 0),
      partiallyPaid: asNumber(report.partiallyPaid, 0),
      unpaid: asNumber(report.unpaid, 0),
      completed: asNumber(report.completed, 0),
      draft: asNumber(report.draft, 0),
      cancelled: asNumber(report.cancelled, 0),
    },
    timeline: rawTimeline.map((row) => ({
      date: asString(row.date),
      invoicesCount: asNumber(row.invoicesCount, 0),
      completedCount: asNumber(row.completedCount, 0),
      draftCount: asNumber(row.draftCount, 0),
      cancelledCount: asNumber(row.cancelledCount, 0),
      totalPurchases: asNumber(row.totalPurchases, 0),
      totalPaid: asNumber(row.totalPaid, 0),
      totalRemaining: asNumber(row.totalRemaining, 0),
    })),
  };
}

export async function fetchReturnsReportForOwner(
  from: string,
  to: string,
): Promise<ReturnsReportData> {
  const qs = buildQueryString({ from, to });
  const data = await apiRequest<JsonRecord>(`/returns-reports${qs}`, {
    method: "GET",
  });
  const period = isRecord(data.period) ? data.period : {};
  const report = isRecord(data.report) ? data.report : {};
  const rawTimeline = Array.isArray(report.timeline)
    ? report.timeline.filter(isRecord)
    : [];

  return {
    period: {
      from: asString(period.from, from),
      to: asString(period.to, to),
      timeZone: asString(period.timeZone) || undefined,
      basis: asString(period.basis) || undefined,
    },
    report: {
      totalReturns: asNumber(report.totalReturns, 0),
      totalReturnItems: asNumber(report.totalReturnItems, 0),
      totalReturnedMerchandiseAmount: asNumber(
        report.totalReturnedMerchandiseAmount,
        0,
      ),
      totalRefundAmount: asNumber(report.totalRefundAmount, 0),
      phonesReturned: asNumber(report.phonesReturned, 0),
      accessoriesReturned: asNumber(report.accessoriesReturned, 0),
      pendingRefundAmount: asNumber(report.pendingRefundAmount, 0),
      refundDue: asNumber(report.refundDue, 0),
      actualRefundedAmount: asNumber(report.actualRefundedAmount, 0),
    },
    timeline: rawTimeline.map((row) => ({
      date: asString(row.date),
      returnsCount: asNumber(row.returnsCount, 0),
      returnedItemsCount: asNumber(row.returnedItemsCount, 0),
      phonesReturned: asNumber(row.phonesReturned, 0),
      accessoriesReturned: asNumber(row.accessoriesReturned, 0),
      returnedMerchandiseAmount: asNumber(row.returnedMerchandiseAmount, 0),
      actualRefundedAmount: asNumber(row.actualRefundedAmount, 0),
      pendingRefundAmount: asNumber(row.pendingRefundAmount, 0),
    })),
  };
}

/* ============================================================================
 * 12. WAREHOUSE MANAGEMENT (OWNER ONLY — TRANSFERS, AUDIT, UNALLOCATED, MOVEMENTS)
 * ============================================================================ */

export interface StockTransferItemRecord {
  id: string;
  product: string;
  productName: string;
  productType: ProductType;
  quantity: number;
  imei?: string;
  barcode?: string;
}

export interface StockTransferRecord {
  id: string;
  transferNumber: string;
  direction: TransferDirection;
  movementGroupId: string;
  items: StockTransferItemRecord[];
  createdByName: string;
  notes: string;
  createdAt?: string;
}

export interface StockMovementRecord {
  id: string;
  movementGroupId: string;
  movementType: StockMovementType;
  product: string;
  productType: ProductType;
  imei?: string;
  location: StockBucketLocation;
  locationBefore?: PhoneLocation;
  locationAfter?: PhoneLocation;
  quantityDelta: number;
  balanceBefore: number;
  balanceAfter: number;
  unitCost?: number;
  referenceType: string;
  referenceId?: string;
  performedByName: string;
  notes: string;
  createdAt?: string;
}

export interface AuditSnapshotRow {
  product: string;
  productName: string;
  brand: string;
  model: string;
  productType: ProductType;
  imei?: string;
  barcode: string | null;
  snapshotQuantity: number;
  unitCost: number | null;
  costKnown: boolean;
  totalCostValue: number | null;
  unitSellingPrice: number;
  totalSellingValue: number;
  snapshotUpdatedAt?: string;
}

export interface AuditSnapshotResponse {
  location: StockLocation;
  snapshotTakenAt: string;
  totalItems: number;
  categories: {
    phone: AuditSnapshotRow[];
    accessory: AuditSnapshotRow[];
    maintenance: AuditSnapshotRow[];
  };
}

export interface AuditCategorySummary {
  itemsCount: number;
  systemQty: number;
  actualQty: number;
  difference: number;
  knownCostValue: number;
  unknownCostItemsCount: number;
  retailValue: number;
}

export interface InventoryAuditItemRecord {
  id: string;
  product: string;
  productName: string;
  productType: ProductType;
  imei?: string;
  systemQuantity: number;
  actualQuantity: number;
  difference: number;
  unitCost?: number;
  costKnown: boolean;
  totalCostValue?: number;
  unitSellingPrice: number;
  totalSellingValue: number;
}

export interface InventoryAuditRecord {
  id: string;
  auditNumber: string;
  location: StockLocation;
  movementGroupId?: string;
  adjustmentsApplied: boolean;
  items: InventoryAuditItemRecord[];
  summaryByCategory: {
    phone: AuditCategorySummary;
    accessory: AuditCategorySummary;
    maintenance: AuditCategorySummary;
  };
  auditedByName: string;
  notes: string;
  createdAt?: string;
}

export interface AuditChangedProductConflict {
  productId: string;
  productName: string;
  snapshotQuantity: number;
  liveQuantity: number;
}

function normalizeTransfer(raw: JsonRecord): StockTransferRecord {
  const rawItems = Array.isArray(raw.items) ? raw.items.filter(isRecord) : [];
  return {
    id: asString(raw._id ?? raw.id),
    transferNumber: asString(raw.transferNumber),
    direction:
      raw.direction === "store_to_warehouse"
        ? "store_to_warehouse"
        : "warehouse_to_store",
    movementGroupId: asString(raw.movementGroupId),
    items: rawItems.map((it) => ({
      id: asString(it._id ?? it.id),
      product: asString(it.product),
      productName: asString(it.productName, "منتج"),
      productType: normalizeProductType(it.productType),
      quantity: asNumber(it.quantity, 1),
      imei: asString(it.imei) || undefined,
      barcode: asString(it.barcode) || undefined,
    })),
    createdByName: asString(raw.createdByName, "المالك"),
    notes: asString(raw.notes),
    createdAt: asString(raw.createdAt) || undefined,
  };
}

function normalizeMovement(raw: JsonRecord): StockMovementRecord {
  const loc = asString(raw.location);
  const location: StockBucketLocation =
    loc === "warehouse" || loc === "damaged" || loc === "unallocated"
      ? loc
      : "store";
  return {
    id: asString(raw._id ?? raw.id),
    movementGroupId: asString(raw.movementGroupId),
    movementType: asString(
      raw.movementType,
      "manual_adjustment",
    ) as StockMovementType,
    product: asString(raw.product),
    productType: normalizeProductType(raw.productType),
    imei: asString(raw.imei) || undefined,
    location,
    locationBefore: (asString(raw.locationBefore) || undefined) as
      | PhoneLocation
      | undefined,
    locationAfter: (asString(raw.locationAfter) || undefined) as
      | PhoneLocation
      | undefined,
    quantityDelta: asNumber(raw.quantityDelta, 0),
    balanceBefore: asNumber(raw.balanceBefore, 0),
    balanceAfter: asNumber(raw.balanceAfter, 0),
    unitCost: asOptionalNumber(raw.unitCost),
    referenceType: asString(raw.referenceType),
    referenceId: asString(raw.referenceId) || undefined,
    performedByName: asString(raw.performedByName, "مستخدم"),
    notes: asString(raw.notes),
    createdAt: asString(raw.createdAt) || undefined,
  };
}

function normalizeAuditCategorySummary(raw: unknown): AuditCategorySummary {
  const r = isRecord(raw) ? raw : {};
  return {
    itemsCount: asNumber(r.itemsCount, 0),
    systemQty: asNumber(r.systemQty, 0),
    actualQty: asNumber(r.actualQty, 0),
    difference: asNumber(r.difference, 0),
    knownCostValue: asNumber(r.knownCostValue, 0),
    unknownCostItemsCount: asNumber(r.unknownCostItemsCount, 0),
    retailValue: asNumber(r.retailValue, 0),
  };
}

function normalizeAudit(raw: JsonRecord): InventoryAuditRecord {
  const rawItems = Array.isArray(raw.items) ? raw.items.filter(isRecord) : [];
  const summary = isRecord(raw.summaryByCategory) ? raw.summaryByCategory : {};
  return {
    id: asString(raw._id ?? raw.id),
    auditNumber: asString(raw.auditNumber),
    location: raw.location === "warehouse" ? "warehouse" : "store",
    movementGroupId: asString(raw.movementGroupId) || undefined,
    adjustmentsApplied: Boolean(raw.adjustmentsApplied),
    items: rawItems.map((it) => ({
      id: asString(it._id ?? it.id),
      product: asString(it.product),
      productName: asString(it.productName, "منتج"),
      productType: normalizeProductType(it.productType),
      imei: asString(it.imei) || undefined,
      systemQuantity: asNumber(it.systemQuantity, 0),
      actualQuantity: asNumber(it.actualQuantity, 0),
      difference: asNumber(it.difference, 0),
      unitCost: asOptionalNumber(it.unitCost),
      costKnown: Boolean(it.costKnown),
      totalCostValue: asOptionalNumber(it.totalCostValue),
      unitSellingPrice: asNumber(it.unitSellingPrice, 0),
      totalSellingValue: asNumber(it.totalSellingValue, 0),
    })),
    summaryByCategory: {
      phone: normalizeAuditCategorySummary(summary.phone),
      accessory: normalizeAuditCategorySummary(summary.accessory),
      maintenance: normalizeAuditCategorySummary(summary.maintenance),
    },
    auditedByName: asString(raw.auditedByName, "المالك"),
    notes: asString(raw.notes),
    createdAt: asString(raw.createdAt) || undefined,
  };
}

export async function createStockTransfer(
  payload: {
    direction: TransferDirection;
    items: Array<{ product?: string; imei?: string; quantity?: number }>;
    notes?: string;
  },
  idempotencyKey: string,
): Promise<{ message: string; transfer: StockTransferRecord }> {
  const data = await apiRequest<JsonRecord>("/transfers", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
  });
  if (!isRecord(data.transfer)) {
    throw new DashboardApiError("تعذر قراءة بيانات التحويل");
  }
  return {
    message: asString(data.message, "تم تنفيذ تحويل المخزون بنجاح"),
    transfer: normalizeTransfer(data.transfer),
  };
}

export async function fetchStockTransfers(params?: {
  direction?: TransferDirection | "";
  page?: number;
  limit?: number;
}): Promise<{
  transfers: StockTransferRecord[];
  total: number;
  currentPage: number;
  totalPages: number;
}> {
  const qs = buildQueryString({
    direction: params?.direction || undefined,
    page: params?.page ?? 1,
    limit: params?.limit ?? 30,
  });
  const data = await apiRequest<JsonRecord>(`/transfers${qs}`, {
    method: "GET",
  });
  const rows = Array.isArray(data.transfers)
    ? data.transfers.filter(isRecord).map(normalizeTransfer)
    : [];
  return {
    transfers: rows,
    total: asNumber(data.total, rows.length),
    currentPage: asNumber(data.currentPage, 1),
    totalPages: asNumber(data.totalPages, 1),
  };
}

export async function fetchStockTransferById(transferId: string): Promise<{
  transfer: StockTransferRecord;
  movements: StockMovementRecord[];
}> {
  const clean = encodeURIComponent(transferId.trim());
  const data = await apiRequest<JsonRecord>(`/transfers/${clean}`, {
    method: "GET",
  });
  if (!isRecord(data.transfer)) {
    throw new DashboardApiError("التحويل غير موجود");
  }
  const movements = Array.isArray(data.movements)
    ? data.movements.filter(isRecord).map(normalizeMovement)
    : [];
  return {
    transfer: normalizeTransfer(data.transfer),
    movements,
  };
}

export async function fetchStockMovements(params?: {
  location?: StockBucketLocation | "";
  movementType?: StockMovementType | "";
  movementGroupId?: string;
  product?: string;
  page?: number;
  limit?: number;
}): Promise<{
  movements: StockMovementRecord[];
  total: number;
  currentPage: number;
  totalPages: number;
}> {
  const qs = buildQueryString({
    location: params?.location || undefined,
    movementType: params?.movementType || undefined,
    movementGroupId: params?.movementGroupId?.trim() || undefined,
    product: params?.product?.trim() || undefined,
    page: params?.page ?? 1,
    limit: params?.limit ?? 50,
  });
  const data = await apiRequest<JsonRecord>(`/stock-movements${qs}`, {
    method: "GET",
  });
  const rows = Array.isArray(data.movements)
    ? data.movements.filter(isRecord).map(normalizeMovement)
    : [];
  return {
    movements: rows,
    total: asNumber(data.total, rows.length),
    currentPage: asNumber(data.currentPage, 1),
    totalPages: asNumber(data.totalPages, 1),
  };
}

export async function fetchInventoryAuditSnapshot(
  location: StockLocation,
): Promise<AuditSnapshotResponse> {
  const qs = buildQueryString({ location });
  const data = await apiRequest<JsonRecord>(`/inventory-audit/snapshot${qs}`, {
    method: "GET",
  });
  const rawCats = isRecord(data.categories) ? data.categories : {};
  const mapRows = (val: unknown): AuditSnapshotRow[] =>
    Array.isArray(val)
      ? val.filter(isRecord).map((row) => ({
          product: asString(row.product),
          productName: asString(row.productName, "منتج"),
          brand: asString(row.brand),
          model: asString(row.model),
          productType: normalizeProductType(row.productType),
          imei: asString(row.imei) || undefined,
          barcode: asString(row.barcode) || null,
          snapshotQuantity: asNumber(row.snapshotQuantity, 0),
          unitCost:
            row.unitCost === null || row.unitCost === undefined
              ? null
              : asNumber(row.unitCost, 0),
          costKnown: Boolean(row.costKnown),
          totalCostValue:
            row.totalCostValue === null || row.totalCostValue === undefined
              ? null
              : asNumber(row.totalCostValue, 0),
          unitSellingPrice: asNumber(row.unitSellingPrice, 0),
          totalSellingValue: asNumber(row.totalSellingValue, 0),
          snapshotUpdatedAt: asString(row.snapshotUpdatedAt) || undefined,
        }))
      : [];

  return {
    location: data.location === "warehouse" ? "warehouse" : "store",
    snapshotTakenAt: asString(data.snapshotTakenAt, new Date().toISOString()),
    totalItems: asNumber(data.totalItems, 0),
    categories: {
      phone: mapRows(rawCats.phone),
      accessory: mapRows(rawCats.accessory),
      maintenance: mapRows(rawCats.maintenance),
    },
  };
}

export async function createInventoryAudit(
  payload: {
    location: StockLocation;
    items: Array<{
      product: string;
      snapshotQuantity: number;
      actualQuantity: number;
    }>;
    applyAdjustments: boolean;
    notes?: string;
  },
  idempotencyKey: string,
): Promise<{ message: string; audit: InventoryAuditRecord }> {
  const data = await apiRequest<JsonRecord>("/inventory-audit", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
  });
  if (!isRecord(data.audit)) {
    throw new DashboardApiError("تعذر قراءة نتيجة الجرد");
  }
  return {
    message: asString(data.message, "تم اعتماد الجرد بنجاح"),
    audit: normalizeAudit(data.audit),
  };
}

export async function fetchInventoryAudits(params?: {
  location?: StockLocation | "";
  page?: number;
  limit?: number;
}): Promise<{
  audits: InventoryAuditRecord[];
  total: number;
  currentPage: number;
  totalPages: number;
}> {
  const qs = buildQueryString({
    location: params?.location || undefined,
    page: params?.page ?? 1,
    limit: params?.limit ?? 20,
  });
  const data = await apiRequest<JsonRecord>(`/inventory-audit${qs}`, {
    method: "GET",
  });
  const rows = Array.isArray(data.audits)
    ? data.audits.filter(isRecord).map(normalizeAudit)
    : [];
  return {
    audits: rows,
    total: asNumber(data.total, rows.length),
    currentPage: asNumber(data.currentPage, 1),
    totalPages: asNumber(data.totalPages, 1),
  };
}

export async function fetchInventoryAuditById(auditId: string): Promise<{
  audit: InventoryAuditRecord;
  movements: StockMovementRecord[];
}> {
  const clean = encodeURIComponent(auditId.trim());
  const data = await apiRequest<JsonRecord>(`/inventory-audit/${clean}`, {
    method: "GET",
  });
  if (!isRecord(data.audit)) {
    throw new DashboardApiError("تقرير الجرد غير موجود");
  }
  const movements = Array.isArray(data.movements)
    ? data.movements.filter(isRecord).map(normalizeMovement)
    : [];
  return {
    audit: normalizeAudit(data.audit),
    movements,
  };
}

export function getInventoryAuditCsvUrl(auditId: string): string {
  return `${API_BASE_URL}/inventory-audit/${encodeURIComponent(auditId.trim())}?format=csv`;
}

export async function fetchUnallocatedProducts(
  page = 1,
  limit = 50,
): Promise<PaginatedProductsResponse> {
  const qs = buildQueryString({ page, limit });
  const data = await apiRequest<JsonRecord>(`/products/unallocated${qs}`, {
    method: "GET",
  });
  const rows = Array.isArray(data.products)
    ? data.products.filter(isRecord).map(normalizeProduct)
    : [];
  return {
    count: asNumber(data.count, rows.length),
    totalProducts: asNumber(data.totalProducts, rows.length),
    currentPage: asNumber(data.currentPage, 1),
    totalPages: asNumber(data.totalPages, 1),
    products: rows,
  };
}

export async function allocateUnallocatedProductStock(
  productId: string,
  payload: {
    allocations?: Array<{ location: StockLocation; quantity: number }>;
    targetLocation?: StockLocation;
    reason: string;
  },
  idempotencyKey: string,
): Promise<{ message: string; product: StoreProductItem }> {
  const clean = encodeURIComponent(productId.trim());
  const data = await apiRequest<JsonRecord>(`/products/${clean}/allocate`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
  });
  if (!isRecord(data.product)) {
    throw new DashboardApiError("تعذر قراءة بيانات المنتج بعد التخصيص");
  }
  return {
    message: asString(data.message, "تم تخصيص المخزون بنجاح"),
    product: normalizeProduct(data.product),
  };
}
