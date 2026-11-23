"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react";
import {
  useAuth,
  type AuthUser,
} from "@/src/components/providers/auth-provider";
import type { RoleConfiguration } from "@/src/components/dashboard/dashboard-config";
import {
  changeUserPassword,
  DashboardApiError,
  fetchMyProfile,
  updateMyProfile,
  type StoreUserRecord,
} from "@/src/services/dashboard.service";

export type ProfileTabId = "profile" | "change-password" | "account-settings";

interface UserProfileWorkspaceProps {
  user: AuthUser;
  roleConfig: RoleConfiguration;
  activeTab?: ProfileTabId;
  onTabChange?: (tab: ProfileTabId) => void;
  onBackToDashboard?: () => void;
}

export function UserProfileWorkspace({
  user,
  roleConfig,
  activeTab: controlledTab,
  onTabChange,
  onBackToDashboard,
}: UserProfileWorkspaceProps) {
  const router = useRouter();
  const { refreshUser, clearUser } = useAuth();

  const [internalTab, setInternalTab] = useState<ProfileTabId>("profile");
  const currentTab = controlledTab ?? internalTab;

  const handleSelectTab = (tab: ProfileTabId) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  // Live profile state fetched from GET /profile
  const [profileData, setProfileData] = useState<StoreUserRecord>({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive ?? true,
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(true);

  // Account settings state (PATCH /users/me)
  const [nameInput, setNameInput] = useState<string>(user.name);
  const [emailInput, setEmailInput] = useState<string>(user.email);
  const [isUpdatingAccount, setIsUpdatingAccount] = useState<boolean>(false);

  // Change password state (POST /change-password)
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);

  const fetchAndApplyProfile = useCallback(async () => {
    try {
      const freshProfile = await fetchMyProfile();
      setProfileData(freshProfile);
      setNameInput(freshProfile.name);
      setEmailInput(freshProfile.email);
    } catch (error: unknown) {
      const msg =
        error instanceof DashboardApiError
          ? error.message
          : "تعذر جلب بيانات الملف الشخصي من الخادم";
      toast.error(msg);
    } finally {
      setIsLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    const initProfile = async () => {
      await fetchAndApplyProfile();
    };
    void initProfile();
  }, [fetchAndApplyProfile]);

  const handleRefreshProfile = async () => {
    setIsLoadingProfile(true);
    try {
      await Promise.all([fetchAndApplyProfile(), refreshUser()]);
      toast.success("تم تحديث بيانات الملف الشخصي");
    } catch {
      toast.error("تعذر تحديث بيانات الملف الشخصي");
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleAccountSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isUpdatingAccount) return;

    const trimmedName = nameInput.trim();
    const trimmedEmail = emailInput.trim();

    if (trimmedName.length < 3) {
      toast.error("يجب أن يتكون الاسم من 3 أحرف على الأقل");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("يرجى إدخال بريد إلكتروني صحيح");
      return;
    }

    setIsUpdatingAccount(true);
    try {
      const msg = await updateMyProfile({
        name: trimmedName,
        email: trimmedEmail,
      });
      await Promise.all([fetchAndApplyProfile(), refreshUser()]);
      toast.success(msg);
    } catch (error: unknown) {
      const msg =
        error instanceof DashboardApiError
          ? error.message
          : "تعذر تحديث بيانات الحساب الشخصي";
      toast.error(msg);
    } finally {
      setIsUpdatingAccount(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isChangingPassword) return;

    if (!currentPassword || !newPassword) {
      toast.error("يرجى إدخال كلمة المرور الحالية وكلمة المرور الجديدة");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("يجب أن لا تقل كلمة المرور الجديدة عن 8 أحرف");
      return;
    }

    if (newPassword === currentPassword) {
      toast.error("يجب أن تختلف كلمة المرور الجديدة عن كلمة المرور الحالية");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("كلمة المرور الجديدة وتأكيدها غير متطابقين");
      return;
    }

    setIsChangingPassword(true);
    try {
      const msg = await changeUserPassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(msg);
      clearUser();
      router.replace("/login");
    } catch (error: unknown) {
      const msg =
        error instanceof DashboardApiError
          ? error.message
          : "تعذر تغيير كلمة المرور";
      toast.error(msg);
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Personal Profile Banner */}
      <section className="rounded-3xl border border-border bg-surface p-6 sm:p-8 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1 text-xs font-semibold text-[#2563EB]">
                <User className="h-3.5 w-3.5" aria-hidden="true" />
                <span>الملف الشخصي للمستخدم المسجل</span>
              </div>

              {onBackToDashboard ? (
                <button
                  type="button"
                  onClick={onBackToDashboard}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1 text-xs font-semibold text-foreground transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
                >
                  <span>العودة إلى لوحة التحكم</span>
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {profileData.name}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "profile", label: "الملف الشخصي", icon: User },
              {
                id: "change-password",
                label: "تغيير كلمة المرور",
                icon: KeyRound,
              },
              {
                id: "account-settings",
                label: "إعدادات الحساب الشخصي",
                icon: Settings,
              },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id as ProfileTabId)}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs sm:text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-[#2563EB] text-white shadow-xs"
                      : "border border-border bg-background text-foreground hover:bg-surface-secondary"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* TAB 1: PERSONAL PROFILE (GET /profile) */}
      {currentTab === "profile" ? (
        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <h3 className="text-lg font-bold text-foreground">
                بيانات الملف الشخصي
              </h3>
            </div>

            <button
              type="button"
              onClick={handleRefreshProfile}
              disabled={isLoadingProfile}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface-secondary disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoadingProfile ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>تحديث البيانات</span>
            </button>
          </div>

          {isLoadingProfile ? (
            <div className="flex min-h-45 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-border bg-background p-5 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <User className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
                  <span>الاسم الكامل</span>
                </div>
                <div className="text-base font-bold text-foreground">
                  {profileData.name}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-5 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Mail className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
                  <span>البريد الإلكتروني</span>
                </div>
                <div
                  dir="ltr"
                  className="text-base font-bold text-foreground text-right truncate"
                >
                  {profileData.email}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-5 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <ShieldCheck
                    className="h-4 w-4 text-[#2563EB]"
                    aria-hidden="true"
                  />
                  <span>الدور الوظيفي المسجل</span>
                </div>
                <div className="text-base font-bold text-foreground">
                  {roleConfig.badgeAr}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-5 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <CheckCircle2
                    className="h-4 w-4 text-success"
                    aria-hidden="true"
                  />
                  <span>حالة الحساب</span>
                </div>
                <div className="text-base font-bold text-success">
                  {profileData.isActive === false ? "غير نشط" : "نشط"}
                </div>
              </div>

              {profileData.createdAt ? (
                <div className="rounded-2xl border border-border bg-background p-5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Calendar
                      className="h-4 w-4 text-[#2563EB]"
                      aria-hidden="true"
                    />
                    <span>تاريخ إنشاء الحساب</span>
                  </div>
                  <div className="text-sm font-bold text-foreground">
                    {new Date(profileData.createdAt).toLocaleDateString(
                      "ar-EG",
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      },
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {/* TAB 2: CHANGE PASSWORD (POST /change-password) */}
      {currentTab === "change-password" ? (
        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs max-w-2xl space-y-6">
          <div className="border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB]/10 text-[#2563EB]">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  تغيير كلمة المرور
                </h3>
                <p className="text-xs text-muted">
                  تحديث كلمة المرور الخاصة بحسابك (يتطلب إعادة تسجيل الدخول بعد
                  الحفظ)
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="profile-current-password"
                className="block text-xs sm:text-sm font-semibold text-foreground"
              >
                كلمة المرور الحالية
              </label>
              <input
                id="profile-current-password"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isChangingPassword}
                placeholder="••••••••"
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="profile-new-password"
                className="block text-xs sm:text-sm font-semibold text-foreground"
              >
                كلمة المرور الجديدة (8 أحرف على الأقل)
              </label>
              <input
                id="profile-new-password"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isChangingPassword}
                placeholder="••••••••"
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="profile-confirm-password"
                className="block text-xs sm:text-sm font-semibold text-foreground"
              >
                تأكيد كلمة المرور الجديدة
              </label>
              <input
                id="profile-confirm-password"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isChangingPassword}
                placeholder="••••••••"
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isChangingPassword}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-6 text-xs sm:text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {isChangingPassword ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    <span>جاري التحديث...</span>
                  </>
                ) : (
                  <span>حفظ كلمة المرور الجديدة</span>
                )}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* TAB 3: PERSONAL ACCOUNT SETTINGS (PATCH /users/me) */}
      {currentTab === "account-settings" ? (
        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs max-w-2xl space-y-6">
          <div className="border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563EB]/10 text-[#2563EB]">
                <Settings className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  إعدادات الحساب الشخصي
                </h3>
                <p className="text-xs text-muted">
                  تحديث الاسم أو البريد الإلكتروني المسجل لحسابك
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleAccountSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="profile-account-name"
                className="block text-xs sm:text-sm font-semibold text-foreground"
              >
                الاسم (3 أحرف على الأقل)
              </label>
              <input
                id="profile-account-name"
                type="text"
                required
                minLength={3}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                disabled={isUpdatingAccount}
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="profile-account-email"
                className="block text-xs sm:text-sm font-semibold text-foreground"
              >
                البريد الإلكتروني
              </label>
              <input
                id="profile-account-email"
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                disabled={isUpdatingAccount}
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground focus:border-[#2563EB] focus:outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isUpdatingAccount}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#242424] text-white dark:bg-[#F5F5F5] dark:text-[#111111] px-6 text-xs sm:text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {isUpdatingAccount ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <span>حفظ التعديلات</span>
                )}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
