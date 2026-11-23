"use client";

import { ArrowLeft } from "lucide-react";
import { OwnerAnalyticsWorkspace } from "@/src/components/dashboard/owner-analytics-workspace";
import { OWNER_OVERVIEW_MODULES } from "@/src/components/dashboard/owner/owner-helpers";

interface OwnerOverviewSectionProps {
  onSelectSection: (sectionId: string) => void;
}

export function OwnerOverviewSection({
  onSelectSection,
}: OwnerOverviewSectionProps) {
  const handleSelectSection = onSelectSection;

  return (
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
  );
}
