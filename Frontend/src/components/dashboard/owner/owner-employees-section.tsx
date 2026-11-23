"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import type { AuthUser } from "@/src/components/providers/auth-provider";
import type { StoreUserRole } from "@/src/components/dashboard/dashboard-config";
import {
  DashboardApiError,
  fetchUsersList,
  toggleUserStatusById,
  updateUserRoleById,
  type StoreUserRecord,
} from "@/src/services/dashboard.service";

interface OwnerEmployeesSectionProps {
  user: AuthUser;
}

export function OwnerEmployeesSection({ user }: OwnerEmployeesSectionProps) {
  const [employees, setEmployees] = useState<StoreUserRecord[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState<boolean>(false);
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);

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

  useEffect(() => {
    const init = async () => {
      await loadEmployees();
    };
    void init();
  }, [loadEmployees]);

  return (
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
  );
}
