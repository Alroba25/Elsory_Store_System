"use client";

import { useState } from "react";
import { Award, CheckCircle2, ShieldCheck } from "lucide-react";
import type { AuthUser } from "@/src/components/providers/auth-provider";
import { ROLE_CONFIGURATIONS } from "@/src/components/dashboard/dashboard-config";
import { DashboardLayout } from "@/src/components/dashboard/dashboard-layout";
import { OwnerAnalyticsWorkspace } from "@/src/components/dashboard/owner-analytics-workspace";
import {
  OwnerWarehouseWorkspace,
  type WarehouseSectionId,
} from "@/src/components/dashboard/owner-warehouse-workspace";
import { OwnerEmployeesSection } from "@/src/components/dashboard/owner/owner-employees-section";
import { OwnerOverviewSection } from "@/src/components/dashboard/owner/owner-overview-section";
import { OwnerProductsSection } from "@/src/components/dashboard/owner/owner-products-section";
import { OwnerPurchasesSection } from "@/src/components/dashboard/owner/owner-purchases-section";
import { OwnerReturnsSection } from "@/src/components/dashboard/owner/owner-returns-section";
import { OwnerSalesSection } from "@/src/components/dashboard/owner/owner-sales-section";
import { OwnerShiftsSection } from "@/src/components/dashboard/owner/owner-shifts-section";
import { OwnerSuppliersSection } from "@/src/components/dashboard/owner/owner-suppliers-section";

interface OwnerDashboardProps {
  user: AuthUser;
}

export function OwnerDashboard({ user }: OwnerDashboardProps) {
  const roleConfig = ROLE_CONFIGURATIONS.owner;
  const [activeSectionId, setActiveSectionId] = useState<string>("overview");

  return (
    <DashboardLayout
      user={user}
      roleConfig={roleConfig}
      activeSectionId={activeSectionId}
      onSelectSection={setActiveSectionId}
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
                <Award className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
                <span>موزع معتمد لمنتجات Apple</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#A6A6A6]">
                <CheckCircle2
                  className="h-4 w-4 text-[#2563EB]"
                  aria-hidden="true"
                />
                <span>
                  البيع يتم حصرياً عبر الكاشير • الرقابة والإدارة للمالك
                </span>
              </div>
            </div>
          </div>
        </section>

        {activeSectionId === "overview" ? (
          <OwnerOverviewSection onSelectSection={setActiveSectionId} />
        ) : null}

        {activeSectionId === "sales" ? <OwnerSalesSection /> : null}

        {activeSectionId === "products" ? <OwnerProductsSection /> : null}

        {activeSectionId === "suppliers" ? <OwnerSuppliersSection /> : null}

        {activeSectionId === "purchases" ? <OwnerPurchasesSection /> : null}

        {activeSectionId === "returns" ? <OwnerReturnsSection /> : null}

        {activeSectionId === "shifts" ? <OwnerShiftsSection /> : null}

        {activeSectionId === "employees" ? (
          <OwnerEmployeesSection user={user} />
        ) : null}

        {activeSectionId === "reports" ? (
          <OwnerAnalyticsWorkspace initialSectionTab="overview" />
        ) : null}

        {activeSectionId === "transfers" ||
        activeSectionId === "inventory-audit" ||
        activeSectionId === "unallocated" ||
        activeSectionId === "stock-movements" ? (
          <OwnerWarehouseWorkspace
            section={activeSectionId as WarehouseSectionId}
          />
        ) : null}
      </div>
    </DashboardLayout>
  );
}
