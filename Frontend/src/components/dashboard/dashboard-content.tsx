"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, LogOut, ShieldAlert } from "lucide-react";
import { useAuth } from "@/src/components/providers/auth-provider";
import { ThemeToggle } from "@/src/components/auth/theme-toggle";
import { isSupportedRole } from "@/src/components/dashboard/dashboard-config";
import { AccessoriesDashboard } from "@/src/components/dashboard/accessories-dashboard";
import { CashierDashboard } from "@/src/components/dashboard/cashier-dashboard";
import { GeneralDashboard } from "@/src/components/dashboard/general-dashboard";
import { MaintenanceDashboard } from "@/src/components/dashboard/maintenance-dashboard";
import { OwnerDashboard } from "@/src/components/dashboard/owner-dashboard";
import { PhoneDashboard } from "@/src/components/dashboard/phone-dashboard";

export function DashboardContent() {
  const { user, isLoading, logout, clearUser } = useAuth();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-foreground p-6">
        <Loader2
          className="h-7 w-7 animate-spin text-[#2563EB]"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-muted">
          جاري تحميل لوحة التحكم...
        </p>
      </div>
    );
  }

  const userRole = user?.role;

  if (!user || !isSupportedRole(userRole)) {
    const handleSafeLogout = async () => {
      try {
        await logout();
      } catch {
        clearUser();
      } finally {
        router.replace("/login");
      }
    };

    return (
      <div className="min-h-screen w-full bg-background text-foreground flex flex-col justify-between p-6 sm:p-10">
        <header className="mx-auto flex w-full max-w-4xl items-center justify-between">
          <div className="inline-flex items-center gap-3">
            <div className="inline-flex items-center justify-center rounded-xl bg-[#F5F5F5] p-2 shadow-2xs ring-1 ring-black/5 dark:ring-white/15">
              <Image
                src="/images/elsory-logo.png"
                alt="شعار ELSORY STORE"
                width={513}
                height={468}
                className="h-9 w-auto object-contain select-none"
              />
            </div>
            <span className="text-sm font-bold tracking-wide text-foreground">
              ELSORY STORE
            </span>
          </div>
          <ThemeToggle />
        </header>

        <main className="mx-auto my-auto w-full max-w-md">
          <div
            role="alert"
            className="rounded-2xl border border-border bg-surface p-8 text-center shadow-lg space-y-5"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger border border-danger/20">
              <ShieldAlert className="h-7 w-7" aria-hidden="true" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-foreground">
                غير مصرح بالوصول إلى لوحة التحكم
              </h1>
              <p className="text-xs sm:text-sm leading-relaxed text-muted">
                لم يتم العثور على صلاحية وظيفية مدعومة مرتبطة بهذا الحساب. يرجى
                مراجعة إدارة ELSORY STORE للتأكد من تفعيل الدور الوظيفي الصحيح.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleSafeLogout}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#242424] dark:bg-[#F5F5F5] px-5 text-xs sm:text-sm font-semibold text-[#FFFFFF] dark:text-[#111111] transition-colors hover:bg-[#111111] dark:hover:bg-white"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>تسجيل الدخول بحساب آخر</span>
              </button>

              <Link
                href="/"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 text-xs sm:text-sm font-medium text-foreground transition-colors hover:bg-surface-secondary"
              >
                <span>العودة إلى الصفحة الرئيسية</span>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </main>

        <footer className="mx-auto w-full max-w-4xl text-center text-xs text-muted">
          © ELSORY STORE — السوري ستور
        </footer>
      </div>
    );
  }

  switch (userRole) {
    case "owner":
      return <OwnerDashboard user={user} />;
    case "cashier":
      return <CashierDashboard user={user} />;
    case "accessories_seller":
      return <AccessoriesDashboard user={user} />;
    case "maintenance_seller":
      return <MaintenanceDashboard user={user} />;
    case "phone_seller":
      return <PhoneDashboard user={user} />;
    case "general":
      return <GeneralDashboard user={user} />;
  }
}
