import type {
  ProductType,
  StockBucketLocation,
  StockLocation,
  StockMovementType,
} from "@/src/types/dashboard.types";

export const PRODUCT_TYPE_AR: Record<ProductType, string> = {
  phone: "هواتف",
  accessory: "إكسسوارات",
  maintenance: "صيانة",
};

export const LOCATION_AR: Record<StockBucketLocation, string> = {
  store: "المحل (Store)",
  warehouse: "المخزن (Warehouse)",
  damaged: "تالف (Damaged)",
  unallocated: "غير مخصص (Unallocated)",
};

export const MOVEMENT_TYPE_AR: Record<StockMovementType, string> = {
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

export function formatDateTimeAr(value?: string): string {
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

export interface DraftTransferRow {
  rowKey: string;
  mode: "product" | "imei";
  productId: string;
  imei: string;
  quantity: string;
}

export interface UnallocatedDraft {
  storeQty: string;
  warehouseQty: string;
  phoneTarget: StockLocation;
  reason: string;
}
