"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import {
  createSupplier,
  DashboardApiError,
  deactivateSupplierById,
  fetchSupplierById,
  fetchSuppliersList,
  updateSupplierById,
  updateSupplierStatusById,
  type StoreSupplierRecord,
} from "@/src/services/dashboard.service";

export function OwnerSuppliersSection() {
  const [suppliers, setSuppliers] = useState<StoreSupplierRecord[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState<boolean>(false);
  const [selectedSupplier, setSelectedSupplier] =
    useState<StoreSupplierRecord | null>(null);
  const [supName, setSupName] = useState<string>("");
  const [supEmail, setSupEmail] = useState<string>("");
  const [supPhone, setSupPhone] = useState<string>("");
  const [supAddress, setSupAddress] = useState<string>("");
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(
    null,
  );
  const [isSavingSupplier, setIsSavingSupplier] = useState<boolean>(false);

  const loadSuppliers = useCallback(async () => {
    setIsLoadingSuppliers(true);
    try {
      const items = await fetchSuppliersList();
      setSuppliers(items);
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر جلب قائمة الموردين",
      );
    } finally {
      setIsLoadingSuppliers(false);
    }
  }, []);

  // SUPPLIER HANDLERS
  const handleSaveSupplier = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSavingSupplier) return;

    if (
      supName.trim().length < 3 ||
      !supEmail.trim() ||
      !supPhone.trim() ||
      !supAddress.trim()
    ) {
      toast.error(
        "يرجى إدخال اسم المورد (3 أحرف على الأقل)، البريد، الهاتف، والعنوان",
      );
      return;
    }

    setIsSavingSupplier(true);
    try {
      if (editingSupplierId) {
        const msg = await updateSupplierById(editingSupplierId, {
          name: supName.trim(),
          email: supEmail.trim(),
          phone: supPhone.trim(),
          address: supAddress.trim(),
        });
        toast.success(msg);
      } else {
        const msg = await createSupplier({
          name: supName.trim(),
          email: supEmail.trim(),
          phone: supPhone.trim(),
          address: supAddress.trim(),
        });
        toast.success(msg);
      }
      setEditingSupplierId(null);
      setSupName("");
      setSupEmail("");
      setSupPhone("");
      setSupAddress("");
      await loadSuppliers();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر حفظ بيانات المورد",
      );
    } finally {
      setIsSavingSupplier(false);
    }
  };

  const handleToggleSupplierStatus = async (sup: StoreSupplierRecord) => {
    try {
      const msg = await updateSupplierStatusById(sup.id, !sup.isActive);
      toast.success(msg);
      await loadSuppliers();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر تغيير حالة المورد",
      );
    }
  };

  const handleDeactivateSupplier = async (supplierId: string) => {
    try {
      const msg = await deactivateSupplierById(supplierId);
      toast.success(msg);
      await loadSuppliers();
    } catch (error: unknown) {
      toast.error(
        error instanceof DashboardApiError
          ? error.message
          : "تعذر إيقاف تفعيل المورد",
      );
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadSuppliers();
    };
    void init();
  }, [loadSuppliers]);

  return (
          <div className="space-y-6">
            {/* Add / Edit Supplier Form */}
            <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-foreground">
                    {editingSupplierId
                      ? "تعديل بيانات المورد"
                      : "إضافة مورد جديد"}
                  </h3>
                  <p className="text-xs text-muted">
                    جميع الحقول مطلوبة (الاسم، البريد الإلكتروني، رقم الهاتف،
                    والعنوان)
                  </p>
                </div>
                {editingSupplierId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSupplierId(null);
                      setSupName("");
                      setSupEmail("");
                      setSupPhone("");
                      setSupAddress("");
                    }}
                    className="text-xs font-semibold text-muted hover:text-foreground"
                  >
                    إلغاء التعديل
                  </button>
                ) : null}
              </div>

              <form
                onSubmit={handleSaveSupplier}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
              >
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={50}
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  placeholder="اسم المورد (3-50 حرفاً)"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
                <input
                  type="email"
                  required
                  value={supEmail}
                  onChange={(e) => setSupEmail(e.target.value)}
                  placeholder="email@supplier.com"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
                <input
                  type="text"
                  required
                  value={supPhone}
                  onChange={(e) => setSupPhone(e.target.value)}
                  placeholder="رقم الهاتف (7-15 رقماً)"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
                <input
                  type="text"
                  required
                  value={supAddress}
                  onChange={(e) => setSupAddress(e.target.value)}
                  placeholder="العنوان بالتفصيل"
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
                <button
                  type="submit"
                  disabled={isSavingSupplier}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white disabled:opacity-60"
                >
                  {isSavingSupplier ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  <span>
                    {editingSupplierId ? "حفظ التعديلات" : "إضافة المورد"}
                  </span>
                </button>
              </form>
            </section>

            {/* Suppliers List */}
            <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-2xs space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <h3 className="text-lg font-bold text-foreground">
                  سجل الموردين ({suppliers.length})
                </h3>
                <button
                  type="button"
                  onClick={loadSuppliers}
                  disabled={isLoadingSuppliers}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isLoadingSuppliers ? "animate-spin" : ""}`}
                  />
                  <span>تحديث</span>
                </button>
              </div>

              {selectedSupplier ? (
                <div className="rounded-xl border border-[#2563EB]/40 bg-[#2563EB]/5 p-4 flex items-center justify-between text-xs">
                  <div className="space-y-1">
                    <div className="font-bold text-foreground text-sm">
                      بيانات المورد: {selectedSupplier.name}
                    </div>
                    <div className="flex flex-wrap gap-3 text-muted">
                      <span dir="ltr">{selectedSupplier.email}</span>
                      <span dir="ltr">{selectedSupplier.phone}</span>
                      <span>العنوان: {selectedSupplier.address}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSupplier(null)}
                    className="text-xs font-semibold text-muted hover:text-foreground"
                  >
                    إغلاق
                  </button>
                </div>
              ) : null}

              {isLoadingSuppliers ? (
                <div className="flex min-h-[180px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
                </div>
              ) : suppliers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center">
                  <p className="text-sm font-semibold text-foreground">
                    لا يوجد موردون مسجلون حالياً
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {suppliers.map((sup) => (
                    <div
                      key={sup.id}
                      className="rounded-2xl border border-border bg-background p-5 flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <h4 className="text-base font-bold text-foreground">
                            {sup.name}
                          </h4>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                              sup.isActive
                                ? "bg-success/10 text-success"
                                : "bg-danger/10 text-danger"
                            }`}
                          >
                            {sup.isActive ? "نشط" : "غير نشط"}
                          </span>
                        </div>
                        <p dir="ltr" className="text-xs text-muted text-right">
                          {sup.phone} • {sup.email}
                        </p>
                        <p className="text-xs text-muted">{sup.address}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border text-xs">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const d = await fetchSupplierById(sup.id);
                              setSelectedSupplier(d);
                            } catch {
                              setSelectedSupplier(sup);
                            }
                          }}
                          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-semibold text-foreground"
                        >
                          تفاصيل
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSupplierId(sup.id);
                            setSupName(sup.name);
                            setSupEmail(sup.email);
                            setSupPhone(sup.phone);
                            setSupAddress(sup.address);
                          }}
                          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-semibold text-foreground"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleSupplierStatus(sup)}
                          className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-semibold text-[#2563EB]"
                        >
                          {sup.isActive ? "إيقاف" : "تفعيل"}
                        </button>
                        {sup.isActive ? (
                          <button
                            type="button"
                            onClick={() => void handleDeactivateSupplier(sup.id)}
                            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-semibold text-danger"
                          >
                            حذف/تعطيل
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
  );
}
