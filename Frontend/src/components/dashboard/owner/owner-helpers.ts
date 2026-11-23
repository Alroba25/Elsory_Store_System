import {
  BarChart3,
  Boxes,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import type { PaymentMethod, ProductType } from "@/src/types/dashboard.types";

export const OWNER_PAYMENT_METHOD_LABELS: Readonly<
  Record<PaymentMethod, string>
> = {
  cash: "نقدي (Cash)",
  wallet: "محفظة إلكترونية (Wallet)",
  instapay: "إنستا باي (InstaPay)",
  visa: "فيزا (Visa)",
};

export interface DraftPurchaseItem {
  productName: string;
  brand: string;
  model: string;
  productType: ProductType;
  quantity: number;
  purchasePrice: number;
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getFirstDayOfMonthString(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export const OWNER_OVERVIEW_MODULES = [
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
