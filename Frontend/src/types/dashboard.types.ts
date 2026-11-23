import type { StoreUserRole } from "@/src/components/dashboard/dashboard-config";

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
  costPrice?: number;
  quantity?: number;
  location?: StockLocation;
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
 * WAREHOUSE & INVENTORY AUDIT TYPES
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

