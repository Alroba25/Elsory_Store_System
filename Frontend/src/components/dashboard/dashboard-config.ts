import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock,
  FileSearch,
  History,
  KeyRound,
  LayoutDashboard,
  Package,
  PackageSearch,
  ReceiptText,
  RotateCcw,
  ScanBarcode,
  Settings,
  ShoppingBag,
  Smartphone,
  Truck,
  User,
  Users,
  Wallet,
} from "lucide-react";
import type { AuthUser } from "@/src/components/providers/auth-provider";

export type StoreUserRole = AuthUser["role"];

export interface RoleNavItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
}

export interface RoleConfiguration {
  role: StoreUserRole;
  titleAr: string;
  badgeAr: string;
  departmentAr: string;
  summaryAr: string;
  accentLabel: string;
  navItems: readonly RoleNavItem[];
}

const VALID_ROLES: ReadonlySet<string> = new Set<StoreUserRole>([
  "owner",
  "cashier",
  "accessories_seller",
  "phone_seller",
  "maintenance_seller",
  "general",
]);

export function isSupportedRole(
  role: string | undefined | null,
): role is StoreUserRole {
  return typeof role === "string" && VALID_ROLES.has(role);
}

export const ROLE_CONFIGURATIONS: Readonly<
  Record<StoreUserRole, RoleConfiguration>
> = {
  owner: {
    role: "owner",
    titleAr: "لوحة تحكم المالك والإدارة التنفيذية",
    badgeAr: "المالك (Owner)",
    departmentAr: "الإدارة الشاملة ومراقبة عمليات المتجر",
    summaryAr:
      "صلاحيات إدارية كاملة لإدارة المنتجات والمخزون، الموردين، المشتريات، الموظفين، مع مراقبة المبيعات، المرتجعات، الورديات، والتقارير المالية.",
    accentLabel: "الإدارة التنفيذية الكاملة",
    navItems: [
      {
        id: "overview",
        label: "نظرة عامة على المتجر",
        description: "ملخص تنفيذي لوحدات المتجر وحالة الأقسام التشغيلية",
        icon: LayoutDashboard,
      },
      {
        id: "sales",
        label: "المبيعات والفواتير",
        description: "استعراض ومراقبة فواتير المبيعات الصادرة عبر الكاشير (عرض فقط)",
        icon: ReceiptText,
        badge: "عرض فقط",
      },
      {
        id: "products",
        label: "المنتجات والمخزون",
        description: "إدارة شاملة للمنتجات، المخزون، المنتجات غير النشطة، والباركود",
        icon: Boxes,
        badge: "إدارة كاملة",
      },
      {
        id: "transfers",
        label: "تحويل المخزون",
        description: "نقل المنتجات بين المخزن والمحل بالكميات أو IMEI وسجل التحويلات",
        icon: ArrowLeftRight,
      },
      {
        id: "inventory-audit",
        label: "جرد المخزون",
        description: "جرد منفصل للمحل والمخزن (هواتف، إكسسوارات، صيانة) مع التسويات والتصدير",
        icon: CheckCircle2,
      },
      {
        id: "unallocated",
        label: "المخزون غير المخصص",
        description: "توزيع الأرصدة غير المخصصة بين المحل والمخزن بسبب موثق",
        icon: Package,
      },
      {
        id: "stock-movements",
        label: "سجل حركات المخزون",
        description: "سجل محاسبي كامل لجميع حركات الإضافة والخصم والنقل والجرد",
        icon: History,
      },
      {
        id: "suppliers",
        label: "إدارة الموردين",
        description: "إضافة وتعديل الموردين وإدارة حالة حساباتهم",
        icon: Truck,
      },
      {
        id: "purchases",
        label: "إدارة المشتريات",
        description: "فواتير الشراء، تسجيل الهواتف والإكسسوارات الواردة، أو إلغاء الفواتير",
        icon: ShoppingBag,
      },
      {
        id: "returns",
        label: "مراقبة المرتجعات",
        description: "الاطلاع على سجل وتفاصيل المرتجعات المسجلة بالنظام (عرض فقط)",
        icon: RotateCcw,
        badge: "عرض فقط",
      },
      {
        id: "shifts",
        label: "الورديات وحركة الخزينة",
        description: "متابعة الورديات النشطة، سجل الورديات، وتقارير الورديات",
        icon: Wallet,
      },
      {
        id: "employees",
        label: "الموظفون والصلاحيات",
        description: "إدارة حسابات الموظفين، تعديل الأدوار الوظيفية، وتفعيل/إيقاف الحسابات",
        icon: Users,
      },
      {
        id: "reports",
        label: "التقارير المالية والتشغيلية",
        description: "تقارير المبيعات، تقارير المشتريات، وتقارير المرتجعات",
        icon: BarChart3,
      },
    ],
  },

  cashier: {
    role: "cashier",
    titleAr: "لوحة الكاشير ونقطة البيع المعتمدة",
    badgeAr: "الكاشير (Cashier)",
    departmentAr: "المسؤول الحصري عن عمليات البيع والخزينة",
    summaryAr:
      "الكاشير هو المسؤول الوحيد عن إتمام المبيعات وإصدار الفواتير لجميع أقسام المتجر (موبايلات، منتجات Apple، إكسسوارات، وأجهزة)، بالإضافة إلى إدارة الوردية والمرتجعات.",
    accentLabel: "نقطة البيع المركزية والخزينة",
    navItems: [
      {
        id: "pos",
        label: "نقطة البيع (POS)",
        description: "إنشاء فواتير البيع لجميع فئات منتجات المتجر عبر الباركود",
        icon: ScanBarcode,
        badge: "جميع الأقسام",
      },
      {
        id: "sales",
        label: "المبيعات والفواتير",
        description: "عرض سجل المبيعات واستعراض تفاصيل الفواتير الصادرة",
        icon: ReceiptText,
      },
      {
        id: "returns",
        label: "المرتجعات والاسترداد",
        description: "تسجيل المرتجعات، عرض التفاصيل، وتأكيد استرداد المبالغ",
        icon: RotateCcw,
      },
      {
        id: "current-shift",
        label: "الوردية الحالية",
        description: "فتح وردية جديدة، متابعة الوردية الحالية، وإغلاق الوردية",
        icon: Clock,
      },
      {
        id: "cash-movements",
        label: "حركة النقدية",
        description: "تسجيل الإيداعات والمسحوبات النقدية خلال الوردية المفتوحة",
        icon: ArrowLeftRight,
      },
      {
        id: "shift-history",
        label: "ملخص وسجل الورديات",
        description: "استعراض ملخص الوردية وسجل الورديات السابقة",
        icon: History,
      },
    ],
  },

  accessories_seller: {
    role: "accessories_seller",
    titleAr: "مساحة عمل قسم الإكسسوارات",
    badgeAr: "مسؤول قسم الإكسسوارات",
    departmentAr: "استعراض وفحص منتجات الإكسسوارات (توجيه البيع للكاشير)",
    summaryAr:
      "مساحة مخصصة لاستعراض كتالوج الإكسسوارات والبحث عن الأصناف والتحقق من توفرها للرد على استفسارات العملاء، بينما تتم عمليات البيع وإصدار الفواتير حصرياً عبر الكاشير.",
    accentLabel: "كتالوج قسم الإكسسوارات",
    navItems: [
      {
        id: "catalog",
        label: "كتالوج الإكسسوارات",
        description: "استعراض جميع منتجات قسم الإكسسوارات المسجلة بالنظام",
        icon: Package,
      },
      {
        id: "search",
        label: "البحث عن منتج",
        description: "البحث في الإكسسوارات بالاسم أو الباركود أو العلامة التجارية",
        icon: PackageSearch,
      },
      {
        id: "details",
        label: "تفاصيل المنتج",
        description: "فحص بيانات وسعر ووصف الصنف المحدد للرد على استفسارات العميل",
        icon: FileSearch,
      },
      {
        id: "availability",
        label: "توفر المنتجات",
        description: "متابعة حالة توفر أصناف الإكسسوارات والكميات المتاحة للعرض",
        icon: CheckCircle2,
      },
    ],
  },

  maintenance_seller: {
    role: "maintenance_seller",
    titleAr: "مساحة عمل قسم الصيانة",
    badgeAr: "مسؤول قسم الصيانة",
    departmentAr: "استعراض وفحص منتجات وقطع غيار الصيانة (توجيه البيع للكاشير)",
    summaryAr:
      "مساحة مخصصة لاستعراض كتالوج منتجات وقطع غيار الصيانة والبحث عن الأصناف والتحقق من توفرها، بينما تتم عمليات البيع وإصدار الفواتير حصرياً عبر الكاشير.",
    accentLabel: "كتالوج قسم الصيانة",
    navItems: [
      {
        id: "catalog",
        label: "كتالوج الصيانة",
        description: "استعراض جميع منتجات وقطع غيار الصيانة المسجلة بالنظام",
        icon: Package,
      },
      {
        id: "search",
        label: "البحث عن منتج صيانة",
        description: "البحث في منتجات الصيانة بالاسم أو الباركود أو العلامة التجارية",
        icon: PackageSearch,
      },
      {
        id: "details",
        label: "تفاصيل المنتج",
        description: "فحص بيانات وسعر ومواصفات الصنف المحدد",
        icon: FileSearch,
      },
      {
        id: "availability",
        label: "توفر منتجات الصيانة",
        description: "متابعة حالة توفر أصناف الصيانة والكميات المتاحة",
        icon: CheckCircle2,
      },
    ],
  },

  phone_seller: {
    role: "phone_seller",
    titleAr: "مساحة عمل قسم الموبايلات ومنتجات Apple",
    badgeAr: "مسؤول قسم الموبايلات",
    departmentAr: "استعراض وفحص الهواتف وأجهزة Apple (توجيه البيع للكاشير)",
    summaryAr:
      "مساحة مخصصة لاستعراض كتالوج الهواتف الذكية ومنتجات Apple وفحص تفاصيلها وتوفرها لمساعدة العملاء، بينما تتم عملية البيع النهائية وإصدار الفاتورة حصرياً عبر الكاشير.",
    accentLabel: "كتالوج الهواتف وأجهزة Apple",
    navItems: [
      {
        id: "catalog",
        label: "كتالوج الهواتف",
        description: "استعراض جميع الهواتف وأجهزة Apple المسجلة في قسم الموبايلات",
        icon: Smartphone,
      },
      {
        id: "search",
        label: "البحث عن هاتف",
        description: "البحث السريع في الهواتف بالاسم أو الماركة أو الباركود",
        icon: PackageSearch,
      },
      {
        id: "details",
        label: "تفاصيل المنتج",
        description: "عرض البيانات الكاملة والسعر للهاتف المختار لإرشاد العميل",
        icon: FileSearch,
      },
      {
        id: "available",
        label: "الهواتف المتاحة",
        description: "عرض الهواتف المتوفرة حالياً في الرصيد فقط",
        icon: CheckCircle2,
      },
    ],
  },

  general: {
    role: "general",
    titleAr: "مساحة الحساب الشخصي للموظف",
    badgeAr: "موظف عام (General)",
    departmentAr: "إدارة الملف الشخصي وإعدادات الحساب",
    summaryAr:
      "مساحة مخصصة لعرض بيانات ملفك الشخصي، تحديث معلومات حسابك، وتغيير كلمة المرور الخاصة بك بأمان.",
    accentLabel: "الحساب الشخصي",
    navItems: [
      {
        id: "profile",
        label: "الملف الشخصي",
        description: "عرض بيانات الحساب الوظيفي المسجلة في النظام",
        icon: User,
      },
      {
        id: "change-password",
        label: "تغيير كلمة المرور",
        description: "تحديث كلمة المرور الخاصة بحسابك",
        icon: KeyRound,
      },
      {
        id: "account-settings",
        label: "إعدادات الحساب الشخصي",
        description: "تحديث الاسم وبيانات الحساب الشخصي",
        icon: Settings,
      },
    ],
  },
};
