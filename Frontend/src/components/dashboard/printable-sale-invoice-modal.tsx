"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  Phone,
  Printer,
  ReceiptText,
  User,
  X,
} from "lucide-react";
import type {
  PaymentMethod,
  StoreSaleRecord,
} from "@/src/services/dashboard.service";
import { buildPdfBlobFromCanvases } from "@/src/utils/pdf-builder";

const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  cash: "نقدي (Cash)",
  wallet: "محفظة إلكترونية (Wallet)",
  instapay: "إنستا باي (InstaPay)",
  visa: "بطاقة بنكية (Visa)",
};

const PAYMENT_STATUS_LABELS: Readonly<
  Record<StoreSaleRecord["paymentStatus"], string>
> = {
  paid: "مدفوعة بالكامل",
  partially_paid: "مدفوعة جزئياً",
  unpaid: "غير مدفوعة",
};

function formatCurrency(value: number): string {
  return `${Number(value || 0).toLocaleString("ar-EG")} ج.م`;
}

function formatInvoiceDate(dateStr?: string): string {
  const date = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Renders the Sale Invoice onto a high-resolution A4 canvas and packs it into a
 * genuine `application/pdf` Blob so Chrome/Brave never inject Date or URL headers/footers.
 */
export async function generateSaleInvoicePdfBlob(
  sale: StoreSaleRecord,
): Promise<Blob | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const logoImg = await loadImageElement(
    `${window.location.origin}/images/elsory-logo.png`,
  );

  const width = 1240;
  const minHeight = 1754;
  const extraRowsHeight = Math.max(0, (sale.items.length - 5) * 85);
  const height = minHeight + extraRowsHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // White page background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const margin = 64;
  const cardW = width - margin * 2;

  // Header Banner (#111111)
  const headerH = 190;
  drawRoundedRect(ctx, margin, margin, cardW, headerH, 24);
  ctx.fillStyle = "#111111";
  ctx.fill();

  // Blue accent line under header
  ctx.fillStyle = "#2563EB";
  ctx.fillRect(margin + 12, margin + headerH - 5, cardW - 24, 5);

  // Logo Box on the Right (RTL start)
  const logoBoxSize = 116;
  const logoBoxX = width - margin - 36 - logoBoxSize;
  const logoBoxY = margin + (headerH - logoBoxSize) / 2;
  drawRoundedRect(ctx, logoBoxX, logoBoxY, logoBoxSize, logoBoxSize, 20);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  if (logoImg) {
    const pad = 12;
    const maxW = logoBoxSize - pad * 2;
    const maxH = logoBoxSize - pad * 2;
    const scale = Math.min(maxW / logoImg.width, maxH / logoImg.height);
    const drawW = logoImg.width * scale;
    const drawH = logoImg.height * scale;
    ctx.drawImage(
      logoImg,
      logoBoxX + (logoBoxSize - drawW) / 2,
      logoBoxY + (logoBoxSize - drawH) / 2,
      drawW,
      drawH,
    );
  }

  // Brand Titles (Right of Logo Box in RTL -> to the left of logoBoxX)
  const titleRightX = logoBoxX - 24;
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 32px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
  ctx.fillText("ELSORY STORE | السوري ستور", titleRightX, margin + 68);

  ctx.fillStyle = "#d1d5db";
  ctx.font = "500 20px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
  ctx.fillText(
    "للهواتف الذكية ومنتجات Apple والإكسسوارات الأصلية",
    titleRightX,
    margin + 104,
  );

  ctx.fillStyle = "#93c5fd";
  ctx.font = "700 18px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
  ctx.fillText("• فاتورة مبيعات معتمدة", titleRightX, margin + 142);

  // Invoice Meta Box on Left side of Header
  const metaBoxW = 360;
  const metaBoxH = 126;
  const metaBoxX = margin + 32;
  const metaBoxY = margin + (headerH - metaBoxH) / 2;
  drawRoundedRect(ctx, metaBoxX, metaBoxY, metaBoxW, metaBoxH, 16);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const metaTextRight = metaBoxX + metaBoxW - 20;
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#9ca3af";
  ctx.font = "600 17px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
  ctx.fillText("رقم الفاتورة", metaTextRight, metaBoxY + 34);

  ctx.direction = "ltr";
  ctx.textAlign = "right";
  ctx.fillStyle = "#60a5fa";
  ctx.font = "700 22px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(sale.invoiceNumber, metaTextRight, metaBoxY + 68, metaBoxW - 36);

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "500 17px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
  ctx.fillText(
    formatInvoiceDate(sale.saleDate),
    metaTextRight,
    metaBoxY + 104,
    metaBoxW - 36,
  );

  // Info Cards Row (Customer Name, Phone, Cashier Name, Payment Status)
  let cursorY = margin + headerH + 32;
  const infoGap = 16;
  const infoCardW = (cardW - infoGap * 3) / 4;
  const infoCardH = 104;

  const infoItems = [
    {
      label: "اسم العميل",
      value: sale.customerName?.trim() || "عميل نقدي (مبيعات الفرع)",
      isLtr: false,
      accent: false,
    },
    {
      label: "رقم هاتف العميل",
      value: sale.customerPhone?.trim() || "—",
      isLtr: true,
      accent: false,
    },
    {
      label: "اسم الكاشير",
      value: sale.cashierName?.trim() || "—",
      isLtr: false,
      accent: false,
    },
    {
      label: "حالة السداد",
      value:
        PAYMENT_STATUS_LABELS[sale.paymentStatus] ?? sale.paymentStatus,
      isLtr: false,
      accent: true,
    },
  ];

  infoItems.forEach((info, idx) => {
    const cardX = width - margin - infoCardW * (idx + 1) - infoGap * idx;
    drawRoundedRect(ctx, cardX, cursorY, infoCardW, infoCardH, 16);
    ctx.fillStyle = "#f8fafc";
    ctx.fill();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const textRight = cardX + infoCardW - 22;
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    ctx.font = "600 18px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
    ctx.fillText(info.label, textRight, cursorY + 38);

    ctx.direction = info.isLtr ? "ltr" : "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = info.accent ? "#2563EB" : "#0f172a";
    ctx.font = "700 22px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
    ctx.fillText(info.value, textRight, cursorY + 76, infoCardW - 44);
  });

  cursorY += infoCardH + 36;

  // Section Title: Items Table
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#111111";
  ctx.font = "700 22px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
  ctx.fillText(
    `تفاصيل الأصناف المباعة (${sale.items.length})`,
    width - margin,
    cursorY,
  );

  cursorY += 18;

  // Table Header
  const tableHeaderH = 54;
  drawRoundedRect(ctx, margin, cursorY, cardW, tableHeaderH, 12);
  ctx.fillStyle = "#111111";
  ctx.fill();

  const colRightIndex = width - margin - 24;
  const colRightProduct = width - margin - 85;
  const colRightQty = margin + 520;
  const colRightPrice = margin + 390;
  const colRightDiscount = margin + 235;
  const colLeftTotal = margin + 24;

  ctx.direction = "rtl";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 18px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("#", colRightIndex, cursorY + 34);
  ctx.fillText("الصنف والبيان", colRightProduct, cursorY + 34);
  ctx.fillText("الكمية", colRightQty, cursorY + 34);
  ctx.fillText("سعر الوحدة", colRightPrice, cursorY + 34);
  ctx.fillText("الخصم", colRightDiscount, cursorY + 34);
  ctx.textAlign = "left";
  ctx.fillText("الإجمالي الصافي", colLeftTotal, cursorY + 34);

  cursorY += tableHeaderH;

  // Table Rows
  sale.items.forEach((item, idx) => {
    const rowH = item.imei ? 94 : 76;
    ctx.fillStyle = idx % 2 === 1 ? "#f8fafc" : "#ffffff";
    ctx.fillRect(margin, cursorY, cardW, rowH);

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, cursorY + rowH);
    ctx.lineTo(margin + cardW, cursorY + rowH);
    ctx.stroke();

    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    ctx.font = "700 18px ui-monospace, monospace";
    ctx.fillText(String(idx + 1), colRightIndex, cursorY + 34);

    // Product Name + Brand/Model
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 20px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
    const prodTitle = item.isGift
      ? `${item.productName} (هدية مجانية)`
      : item.productName;
    ctx.fillText(prodTitle, colRightProduct, cursorY + 32, 460);

    const subMeta = [
      item.brand,
      item.model,
      item.productType === "phone"
        ? "هاتف محمول"
        : item.productType === "maintenance"
          ? "صيانة"
          : "إكسسوار",
    ]
      .filter(Boolean)
      .join(" • ");
    ctx.fillStyle = "#64748b";
    ctx.font = "500 16px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
    ctx.fillText(subMeta, colRightProduct, cursorY + 58, 460);

    if (item.imei) {
      ctx.direction = "ltr";
      ctx.textAlign = "right";
      ctx.fillStyle = "#2563EB";
      ctx.font = "700 15px ui-monospace, monospace";
      ctx.fillText(`IMEI: ${item.imei}`, colRightProduct, cursorY + 80);
    }

    // Qty, Unit Price, Discount, Line Total
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 19px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
    ctx.fillText(String(item.quantity), colRightQty, cursorY + 42);

    ctx.font = "600 18px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
    ctx.fillText(formatCurrency(item.unitPrice), colRightPrice, cursorY + 42);

    ctx.fillStyle = "#64748b";
    ctx.fillText(
      item.discountAmount > 0 ? formatCurrency(item.discountAmount) : "—",
      colRightDiscount,
      cursorY + 42,
    );

    ctx.textAlign = "left";
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 20px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
    ctx.fillText(
      item.isGift ? "0 ج.م (هدية)" : formatCurrency(item.lineTotal),
      colLeftTotal,
      cursorY + 42,
    );

    cursorY += rowH;
  });

  cursorY += 36;

  // Bottom Grid: Payment Methods (Right) & Financial Totals (Left)
  const boxGap = 24;
  const halfW = (cardW - boxGap) / 2;
  const bottomBoxH = 260;

  // Right Box: Payment Methods
  const rightBoxX = width - margin - halfW;
  drawRoundedRect(ctx, rightBoxX, cursorY, halfW, bottomBoxH, 18);
  ctx.fillStyle = "#f8fafc";
  ctx.fill();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 20px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
  ctx.fillText(
    `تفاصيل وطرق الدفع (${sale.payments.length})`,
    rightBoxX + halfW - 24,
    cursorY + 40,
  );

  let payY = cursorY + 64;
  if (sale.payments.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "600 18px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
    ctx.fillText("لم يتم تسجيل دفعات", rightBoxX + halfW - 24, payY + 28);
  } else {
    sale.payments.forEach((p, index) => {
      drawRoundedRect(ctx, rightBoxX + 20, payY, halfW - 40, 54, 12);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#e2e8f0";
      ctx.stroke();

      const methodTitle =
        sale.payments.length > 1
          ? `الدفعة ${index + 1} (${PAYMENT_METHOD_LABELS[p.method] ?? p.method})`
          : (PAYMENT_METHOD_LABELS[p.method] ?? p.method);

      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.fillStyle = "#334155";
      ctx.font = "600 18px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
      ctx.fillText(methodTitle, rightBoxX + halfW - 36, payY + 34);

      ctx.textAlign = "left";
      ctx.fillStyle = "#2563EB";
      ctx.font = "700 19px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
      ctx.fillText(formatCurrency(p.amount), rightBoxX + 36, payY + 34);

      payY += 66;
    });
  }

  // Left Box: Totals Summary
  const leftBoxX = margin;
  drawRoundedRect(ctx, leftBoxX, cursorY, halfW, bottomBoxH, 18);
  ctx.fillStyle = "#f8fafc";
  ctx.fill();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const drawTotalRow = (
    label: string,
    val: string,
    yPos: number,
    isBold = false,
    valColor = "#0f172a",
  ) => {
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = isBold ? "#0f172a" : "#475569";
    ctx.font = `${isBold ? "700 22px" : "600 18px"} 'IBM Plex Sans Arabic', Tahoma, sans-serif`;
    ctx.fillText(label, leftBoxX + halfW - 24, yPos);

    ctx.textAlign = "left";
    ctx.fillStyle = valColor;
    ctx.font = `${isBold ? "700 24px" : "700 19px"} 'IBM Plex Sans Arabic', Tahoma, sans-serif`;
    ctx.fillText(val, leftBoxX + 24, yPos);
  };

  drawTotalRow(
    "الإجمالي قبل الخصم",
    formatCurrency(sale.totalAmount),
    cursorY + 44,
  );
  drawTotalRow(
    "إجمالي الخصومات",
    formatCurrency(sale.discountAmount),
    cursorY + 84,
  );

  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftBoxX + 24, cursorY + 106);
  ctx.lineTo(leftBoxX + halfW - 24, cursorY + 106);
  ctx.stroke();

  drawTotalRow(
    "الصافي المطلوب",
    formatCurrency(sale.finalAmount),
    cursorY + 144,
    true,
    "#2563EB",
  );
  drawTotalRow(
    "إجمالي المدفوع",
    formatCurrency(sale.paidAmount),
    cursorY + 188,
    false,
    "#15803d",
  );

  if (sale.remainingAmount > 0) {
    drawTotalRow(
      "المبلغ المتبقي",
      formatCurrency(sale.remainingAmount),
      cursorY + 228,
      false,
      "#dc2626",
    );
  }

  cursorY += bottomBoxH + 54;

  // Footer
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(margin, cursorY);
  ctx.lineTo(width - margin, cursorY);
  ctx.stroke();

  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 20px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
  ctx.fillText(
    "شكراً لتسوقكم من ELSORY STORE — السوري ستور",
    width / 2,
    cursorY + 38,
  );

  ctx.fillStyle = "#64748b";
  ctx.font = "500 17px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
  ctx.fillText(
    "يرجى الاحتفاظ بهذه الفاتورة لضمان حقوق الضمان والاستبدال وفقاً لسياسة المتجر المعتمدة.",
    width / 2,
    cursorY + 70,
  );

  const widthPt = 595.28;
  const heightPt = (height / width) * widthPt;

  return buildPdfBlobFromCanvases([{ canvas, widthPt, heightPt }]);
}

export function printSaleInvoicePdf(sale: StoreSaleRecord): void {
  // Handled by PrintableSaleInvoiceModal which generates and prints the native PDF
  void sale;
}

interface PrintableSaleInvoiceModalProps {
  sale: StoreSaleRecord | null;
  onClose: () => void;
}

export function PrintableSaleInvoiceModal({
  sale,
  onClose,
}: PrintableSaleInvoiceModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfIframeRef = useRef<HTMLIFrameElement | null>(null);
  const hasAutoPrintedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!sale) return;

    let isCancelled = false;
    let currentUrl: string | null = null;
    hasAutoPrintedRef.current = false;

    void (async () => {
      const blob = await generateSaleInvoicePdfBlob(sale);
      if (isCancelled || !blob) return;
      currentUrl = URL.createObjectURL(blob);
      setPdfUrl(currentUrl);
    })();

    return () => {
      isCancelled = true;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [sale]);

  if (!sale) return null;

  const handleTriggerPdfPrint = () => {
    try {
      pdfIframeRef.current?.contentWindow?.focus();
      pdfIframeRef.current?.contentWindow?.print();
    } catch {
      if (pdfUrl) {
        window.open(pdfUrl, "_blank", "noopener,noreferrer");
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`فاتورة مبيعات رقم ${sale.invoiceNumber}`}
    >
      <div className="relative my-8 w-full max-w-3xl overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl">
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/15 text-success">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                معاينة الفاتورة الرسمية القابلة للطباعة (PDF)
              </h3>
              <p className="text-xs text-muted">
                ملف PDF حقيقي بدون تاريخ أو رابط المتصفح
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {pdfUrl ? (
              <a
                href={pdfUrl}
                download={`invoice-${sale.invoiceNumber}.pdf`}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 text-xs font-bold text-foreground hover:border-[#2563EB] hover:text-[#2563EB]"
              >
                <Download className="h-4 w-4" />
                <span>تحميل PDF</span>
              </a>
            ) : null}

            <button
              type="button"
              onClick={handleTriggerPdfPrint}
              disabled={!pdfUrl}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white shadow-xs transition-opacity hover:opacity-95 disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              <span>طباعة الفاتورة</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 text-xs font-semibold text-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
              <span>إغلاق</span>
            </button>
          </div>
        </div>

        {/* Hidden Native PDF Iframe for Header-Free Printing */}
        {pdfUrl ? (
          <iframe
            ref={pdfIframeRef}
            src={pdfUrl}
            title={`Invoice PDF ${sale.invoiceNumber}`}
            onLoad={() => {
              if (!hasAutoPrintedRef.current) {
                hasAutoPrintedRef.current = true;
                setTimeout(() => {
                  try {
                    pdfIframeRef.current?.contentWindow?.focus();
                    pdfIframeRef.current?.contentWindow?.print();
                  } catch {
                    // Ignore
                  }
                }, 300);
              }
            }}
            className="fixed right-0 bottom-0 h-0 w-0 border-0 opacity-0 pointer-events-none"
            aria-hidden="true"
          />
        ) : null}

        {/* Printable Invoice Preview Card (Matches Brand Identity) */}
        <div className="max-h-[80vh] overflow-y-auto p-6 sm:p-8 space-y-6 bg-background">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
            {/* Brand Header Banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#2563EB] bg-[#111111] px-6 py-5 text-white">
              <div className="flex items-center gap-4">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white p-1.5 shadow-sm">
                  <Image
                    src="/images/elsory-logo.png"
                    alt="ELSORY STORE Logo"
                    fill
                    sizes="64px"
                    className="object-contain p-1"
                  />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                    ELSORY STORE | السوري ستور
                  </h2>
                  <p className="text-xs text-neutral-300 mt-0.5">
                    للهواتف الذكية ومنتجات Apple والإكسسوارات الأصلية
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#2563EB]/50 bg-[#2563EB]/20 px-3 py-0.5 text-[11px] font-semibold text-blue-300">
                    <ReceiptText className="h-3 w-3" />
                    فاتورة مبيعات معتمدة
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-right">
                <span className="block text-[11px] text-neutral-400">
                  رقم الفاتورة
                </span>
                <span
                  dir="ltr"
                  className="block text-right font-mono text-sm sm:text-base font-bold text-blue-400"
                >
                  {sale.invoiceNumber}
                </span>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-300">
                  <Calendar className="h-3 w-3 text-neutral-400" />
                  <span>{formatInvoiceDate(sale.saleDate)}</span>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">
              {/* Customer, Cashier & Payment Status Row */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-background/60 p-3.5">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <User className="h-3.5 w-3.5 text-[#2563EB]" />
                    اسم العميل
                  </span>
                  <strong className="mt-1 block text-xs sm:text-sm font-bold text-foreground">
                    {sale.customerName?.trim() || "عميل نقدي (مبيعات الفرع)"}
                  </strong>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-3.5">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <Phone className="h-3.5 w-3.5 text-[#2563EB]" />
                    رقم هاتف العميل
                  </span>
                  <strong
                    dir="ltr"
                    className="mt-1 block text-right font-mono text-xs sm:text-sm font-bold text-foreground"
                  >
                    {sale.customerPhone?.trim() || "—"}
                  </strong>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-3.5">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <User className="h-3.5 w-3.5 text-[#2563EB]" />
                    اسم الكاشير
                  </span>
                  <strong className="mt-1 block text-xs sm:text-sm font-bold text-foreground">
                    {sale.cashierName?.trim() || "—"}
                  </strong>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-3.5">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <CreditCard className="h-3.5 w-3.5 text-[#2563EB]" />
                    حالة السداد
                  </span>
                  <span className="mt-1 inline-flex rounded-full bg-[#2563EB]/10 px-2.5 py-0.5 text-xs font-bold text-[#2563EB]">
                    {PAYMENT_STATUS_LABELS[sale.paymentStatus] ??
                      sale.paymentStatus}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-foreground">
                  الأصناف المباعة ({sale.items.length})
                </h4>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#111111] text-white">
                      <tr>
                        <th className="px-3 py-2.5 text-center font-bold">#</th>
                        <th className="px-3 py-2.5 font-bold">الصنف والبيان</th>
                        <th className="px-3 py-2.5 text-center font-bold">
                          الكمية
                        </th>
                        <th className="px-3 py-2.5 text-center font-bold">
                          سعر الوحدة
                        </th>
                        <th className="px-3 py-2.5 text-center font-bold">
                          الخصم
                        </th>
                        <th className="px-3 py-2.5 text-left font-bold">
                          الإجمالي الصافي
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-background">
                      {sale.items.map((item, idx) => (
                        <tr key={`${item.productName}-${idx}`}>
                          <td className="px-3 py-3 text-center font-mono text-muted">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-foreground">
                                {item.productName}
                              </span>
                              {item.isGift ? (
                                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">
                                  هدية مجانية
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted">
                              {[item.brand, item.model]
                                .filter(Boolean)
                                .join(" - ")}{" "}
                              •{" "}
                              {item.productType === "phone"
                                ? "هاتف محمول"
                                : item.productType === "maintenance"
                                  ? "صيانة"
                                  : "إكسسوار"}
                            </div>
                            {item.imei ? (
                              <div
                                dir="ltr"
                                className="mt-1 inline-block rounded-md border border-[#2563EB]/30 bg-[#2563EB]/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#2563EB]"
                              >
                                IMEI: {item.imei}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-center font-semibold text-foreground">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-3 text-center text-foreground">
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td className="px-3 py-3 text-center text-muted">
                            {item.discountAmount > 0
                              ? formatCurrency(item.discountAmount)
                              : "—"}
                          </td>
                          <td className="px-3 py-3 text-left font-bold text-foreground">
                            {item.isGift
                              ? "0 ج.م (هدية)"
                              : formatCurrency(item.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment Methods & Financial Summary */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Payment Methods Breakdown */}
                <div className="rounded-xl border border-border bg-background/60 p-4 space-y-2.5">
                  <h5 className="text-xs font-bold text-foreground">
                    تفاصيل وطرق الدفع ({sale.payments.length})
                  </h5>
                  {sale.payments.length === 0 ? (
                    <p className="text-xs text-muted">لم يتم تسجيل دفعات</p>
                  ) : (
                    <div className="space-y-2">
                      {sale.payments.map((payment, index) => (
                        <div
                          key={`${payment.method}-${index}`}
                          className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-xs"
                        >
                          <span className="font-semibold text-foreground">
                            {sale.payments.length > 1
                              ? `الدفعة ${index + 1} (${PAYMENT_METHOD_LABELS[payment.method] ?? payment.method})`
                              : (PAYMENT_METHOD_LABELS[payment.method] ??
                                payment.method)}
                          </span>
                          <strong className="font-bold text-[#2563EB]">
                            {formatCurrency(payment.amount)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Totals Box */}
                <div className="rounded-xl border border-border bg-background/60 p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-muted">
                    <span>الإجمالي قبل الخصم</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(sale.totalAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted">
                    <span>إجمالي الخصومات</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(sale.discountAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2.5 text-sm font-bold text-foreground">
                    <span>الصافي المطلوب</span>
                    <span className="text-base text-[#2563EB]">
                      {formatCurrency(sale.finalAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-muted">
                    <span>إجمالي المدفوع</span>
                    <strong className="text-success">
                      {formatCurrency(sale.paidAmount)}
                    </strong>
                  </div>
                  {sale.remainingAmount > 0 ? (
                    <div className="flex items-center justify-between text-muted">
                      <span>المبلغ المتبقي</span>
                      <strong className="text-danger">
                        {formatCurrency(sale.remainingAmount)}
                      </strong>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-dashed border-border pt-4 text-center text-xs text-muted">
                <p className="font-bold text-foreground">
                  شكراً لتسوقكم من ELSORY STORE — السوري ستور
                </p>
                <p className="mt-0.5 text-[11px]">
                  يرجى الاحتفاظ بهذه الفاتورة لضمان حقوق الضمان والاستبدال وفقاً
                  لسياسة المتجر المعتمدة.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
