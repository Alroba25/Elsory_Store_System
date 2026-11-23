"use client";

import type {
  InventoryAuditRecord,
  ProductType,
  PurchasesReportData,
  ReturnsReportData,
  SalesReportData,
} from "@/src/services/dashboard.service";
import {
  buildPdfBlobFromCanvases,
  type PdfCanvasPage,
} from "@/src/utils/pdf-builder";

const PAGE_W = 1240;
const PAGE_H = 1754;
const A4_W_PT = 595.28;
const A4_H_PT = 841.89;
const MARGIN = 60;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FONT_FAMILY = "'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif";
const MONO_FONT = "ui-monospace, SFMono-Regular, Menlo, monospace";

const PRODUCT_TYPE_AR: Readonly<Record<ProductType, string>> = {
  phone: "هواتف",
  accessory: "إكسسوارات",
  maintenance: "صيانة",
};

const PRODUCT_TYPE_SINGLE_AR: Readonly<Record<ProductType, string>> = {
  phone: "هاتف",
  accessory: "إكسسوار",
  maintenance: "صيانة",
};

function fmtEgp(val: number): string {
  return `${Number(val || 0).toLocaleString("ar-EG")} ج.م`;
}

function fmtNum(val: number): string {
  return Number(val || 0).toLocaleString("ar-EG");
}

function fmtDateTimeAr(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleString("ar-EG");
  return d.toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtShortDate(ymd: string): string {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("ar-EG", { month: "short", day: "numeric" });
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
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function createBlankPage(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  return { canvas, ctx };
}

function drawStoreHeader(
  ctx: CanvasRenderingContext2D,
  logoImg: HTMLImageElement | null,
  options: {
    badgeText: string;
    metaLabel: string;
    metaValue: string;
    metaValueLtr?: boolean;
    metaSubtext: string;
    compact?: boolean;
  },
): number {
  const headerH = options.compact ? 124 : 184;

  // Dark rounded banner (#111111) matching invoice
  drawRoundedRect(ctx, MARGIN, MARGIN, CONTENT_W, headerH, 22);
  ctx.fillStyle = "#111111";
  ctx.fill();

  // Blue bottom accent bar (#2563EB)
  ctx.fillStyle = "#2563EB";
  ctx.fillRect(MARGIN + 12, MARGIN + headerH - 5, CONTENT_W - 24, 5);

  // Logo card on the right (RTL start)
  const logoBoxSize = options.compact ? 78 : 112;
  const logoBoxX = PAGE_W - MARGIN - 28 - logoBoxSize;
  const logoBoxY = MARGIN + (headerH - logoBoxSize) / 2;
  drawRoundedRect(ctx, logoBoxX, logoBoxY, logoBoxSize, logoBoxSize, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  if (logoImg) {
    const pad = 10;
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

  // Brand titles
  const titleRightX = logoBoxX - 22;
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${options.compact ? 25 : 31}px ${FONT_FAMILY}`;
  ctx.fillText(
    "ELSORY STORE | السوري ستور",
    titleRightX,
    MARGIN + (options.compact ? 50 : 64),
  );

  if (!options.compact) {
    ctx.fillStyle = "#d1d5db";
    ctx.font = `500 19px ${FONT_FAMILY}`;
    ctx.fillText(
      "للهواتف الذكية ومنتجات Apple والإكسسوارات الأصلية",
      titleRightX,
      MARGIN + 100,
    );
  }

  ctx.fillStyle = "#93c5fd";
  ctx.font = `700 ${options.compact ? 17 : 18}px ${FONT_FAMILY}`;
  ctx.fillText(
    `• ${options.badgeText}`,
    titleRightX,
    MARGIN + (options.compact ? 88 : 138),
  );

  // Meta box on the left
  const metaBoxW = 360;
  const metaBoxH = options.compact ? 84 : 122;
  const metaBoxX = MARGIN + 28;
  const metaBoxY = MARGIN + (headerH - metaBoxH) / 2;
  drawRoundedRect(ctx, metaBoxX, metaBoxY, metaBoxW, metaBoxH, 16);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const metaRight = metaBoxX + metaBoxW - 18;
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#9ca3af";
  ctx.font = `600 15px ${FONT_FAMILY}`;
  ctx.fillText(options.metaLabel, metaRight, metaBoxY + (options.compact ? 26 : 32));

  ctx.direction = options.metaValueLtr ? "ltr" : "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#60a5fa";
  ctx.font = options.metaValueLtr
    ? `700 20px ${MONO_FONT}`
    : `700 20px ${FONT_FAMILY}`;
  ctx.fillText(
    options.metaValue,
    metaRight,
    metaBoxY + (options.compact ? 54 : 66),
    metaBoxW - 32,
  );

  if (!options.compact) {
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#e5e7eb";
    ctx.font = `500 15px ${FONT_FAMILY}`;
    ctx.fillText(options.metaSubtext, metaRight, metaBoxY + 100, metaBoxW - 32);
  }

  return MARGIN + headerH + 26;
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  pageNumber: number,
  totalPages: number,
) {
  const y = PAGE_H - 52;
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y - 18);
  ctx.lineTo(PAGE_W - MARGIN, y - 18);
  ctx.stroke();

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#64748b";
  ctx.font = `600 15px ${FONT_FAMILY}`;
  ctx.fillText(
    "ELSORY STORE — النظام الداخلي لإدارة المتجر والمخزون",
    PAGE_W - MARGIN,
    y + 4,
  );

  ctx.direction = "rtl";
  ctx.textAlign = "left";
  ctx.fillStyle = "#475569";
  ctx.font = `700 15px ${FONT_FAMILY}`;
  ctx.fillText(`صفحة ${pageNumber} من ${totalPages}`, MARGIN, y + 4);
}

function drawSectionHeading(
  ctx: CanvasRenderingContext2D,
  y: number,
  title: string,
  subtitle?: string,
): number {
  ctx.fillStyle = "#2563EB";
  drawRoundedRect(ctx, PAGE_W - MARGIN - 6, y, 6, subtitle ? 44 : 26, 3);
  ctx.fill();

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#0f172a";
  ctx.font = `700 22px ${FONT_FAMILY}`;
  ctx.fillText(title, PAGE_W - MARGIN - 18, y + 21);

  if (subtitle) {
    ctx.fillStyle = "#64748b";
    ctx.font = `500 15px ${FONT_FAMILY}`;
    ctx.fillText(subtitle, PAGE_W - MARGIN - 18, y + 43);
    return y + 60;
  }
  return y + 38;
}

function drawInfoCardRow(
  ctx: CanvasRenderingContext2D,
  y: number,
  items: Array<{
    label: string;
    value: string;
    subtext?: string;
    accentColor?: string;
    isLtr?: boolean;
  }>,
  cardH = 104,
): number {
  const gap = 14;
  const count = items.length;
  const cardW = (CONTENT_W - gap * (count - 1)) / count;

  items.forEach((item, idx) => {
    const x = PAGE_W - MARGIN - cardW * (idx + 1) - gap * idx;
    drawRoundedRect(ctx, x, y, cardW, cardH, 16);
    ctx.fillStyle = "#f8fafc";
    ctx.fill();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const textRight = x + cardW - 18;
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    ctx.font = `600 15px ${FONT_FAMILY}`;
    ctx.fillText(item.label, textRight, y + 30, cardW - 32);

    ctx.direction = item.isLtr ? "ltr" : "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = item.accentColor ?? "#0f172a";
    ctx.font = item.isLtr
      ? `700 20px ${MONO_FONT}`
      : `700 21px ${FONT_FAMILY}`;
    ctx.fillText(item.value, textRight, y + 64, cardW - 32);

    if (item.subtext) {
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.fillStyle = "#64748b";
      ctx.font = `500 13px ${FONT_FAMILY}`;
      ctx.fillText(item.subtext, textRight, y + 89, cardW - 32);
    }
  });

  return y + cardH + 22;
}

function drawDonutChartBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  subtitle: string,
  slices: Array<{ label: string; value: number; color: string }>,
  formatter: (v: number) => string = fmtNum,
) {
  drawRoundedRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const rightX = x + w - 22;
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#0f172a";
  ctx.font = `700 18px ${FONT_FAMILY}`;
  ctx.fillText(title, rightX, y + 34, w - 44);

  ctx.fillStyle = "#64748b";
  ctx.font = `500 14px ${FONT_FAMILY}`;
  ctx.fillText(subtitle, rightX, y + 56, w - 44);

  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const cx = x + 115;
  const cy = y + 178;
  const outerR = 76;
  const innerR = 48;

  if (total <= 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = outerR - innerR;
    ctx.stroke();

    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.fillStyle = "#94a3b8";
    ctx.font = `600 14px ${FONT_FAMILY}`;
    ctx.fillText("لا توجد بيانات", cx, cy + 5);
  } else {
    let startAngle = -Math.PI / 2;
    slices.forEach((slice) => {
      const val = Math.max(0, slice.value);
      if (val <= 0) return;
      const sliceAngle = (val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, (outerR + innerR) / 2, startAngle, startAngle + sliceAngle);
      ctx.strokeStyle = slice.color;
      ctx.lineWidth = outerR - innerR;
      ctx.stroke();
      startAngle += sliceAngle;
    });

    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.fillStyle = "#0f172a";
    ctx.font = `700 18px ${FONT_FAMILY}`;
    ctx.fillText(formatter(total), cx, cy + 4, innerR * 1.8);
    ctx.fillStyle = "#64748b";
    ctx.font = `500 12px ${FONT_FAMILY}`;
    ctx.fillText("الإجمالي", cx, cy + 23);
  }

  // Legend on the right side of the donut
  let ly = y + 102;
  const legendRight = x + w - 24;
  const legendMaxW = w - 235;
  slices.forEach((slice) => {
    const pct = total > 0 ? Math.round((Math.max(0, slice.value) / total) * 100) : 0;

    // Color dot
    ctx.fillStyle = slice.color;
    drawRoundedRect(ctx, legendRight - 12, ly - 10, 12, 12, 4);
    ctx.fill();

    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#1e293b";
    ctx.font = `600 14px ${FONT_FAMILY}`;
    ctx.fillText(slice.label, legendRight - 20, ly, legendMaxW - 80);

    ctx.fillStyle = "#64748b";
    ctx.font = `700 13px ${FONT_FAMILY}`;
    ctx.fillText(
      `${formatter(slice.value)} (${pct}%)`,
      legendRight - 20,
      ly + 20,
      legendMaxW,
    );

    ly += 46;
  });
}

function drawHorizontalBarsBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  subtitle: string,
  items: Array<{ label: string; value: number; color: string }>,
  formatter: (v: number) => string = fmtEgp,
) {
  drawRoundedRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const rightX = x + w - 24;
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#0f172a";
  ctx.font = `700 19px ${FONT_FAMILY}`;
  ctx.fillText(title, rightX, y + 34, w - 48);

  ctx.fillStyle = "#64748b";
  ctx.font = `500 14px ${FONT_FAMILY}`;
  ctx.fillText(subtitle, rightX, y + 56, w - 48);

  const maxAbs = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const rowStartY = y + 84;
  const rowStep = (h - 102) / Math.max(1, items.length);
  const barTrackX = x + 28;
  const barTrackW = w - 56;

  items.forEach((item, idx) => {
    const ry = rowStartY + idx * rowStep;

    // Label on right, value on left
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#1e293b";
    ctx.font = `600 15px ${FONT_FAMILY}`;
    ctx.fillText(item.label, barTrackX + barTrackW, ry + 14);

    ctx.direction = "rtl";
    ctx.textAlign = "left";
    ctx.fillStyle = item.color;
    ctx.font = `700 15px ${FONT_FAMILY}`;
    ctx.fillText(formatter(item.value), barTrackX, ry + 14);

    // Track background
    drawRoundedRect(ctx, barTrackX, ry + 24, barTrackW, 14, 7);
    ctx.fillStyle = "#f1f5f9";
    ctx.fill();

    // Filled bar (growing from right to left for RTL)
    const ratio = Math.min(1, Math.abs(item.value) / maxAbs);
    const fillW = Math.max(ratio > 0 ? 12 : 0, barTrackW * ratio);
    if (fillW > 0) {
      drawRoundedRect(
        ctx,
        barTrackX + barTrackW - fillW,
        ry + 24,
        fillW,
        14,
        7,
      );
      ctx.fillStyle = item.color;
      ctx.fill();
    }
  });
}

function drawGroupedBarChartBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  subtitle: string,
  groups: Array<{ label: string; valueA: number; valueB: number }>,
  legendA: { label: string; color: string },
  legendB: { label: string; color: string },
) {
  drawRoundedRect(ctx, x, y, w, h, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const rightX = x + w - 24;
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#0f172a";
  ctx.font = `700 19px ${FONT_FAMILY}`;
  ctx.fillText(title, rightX, y + 34, w - 280);

  ctx.fillStyle = "#64748b";
  ctx.font = `500 14px ${FONT_FAMILY}`;
  ctx.fillText(subtitle, rightX, y + 56, w - 280);

  // Legend top-left
  ctx.fillStyle = legendA.color;
  drawRoundedRect(ctx, x + 24, y + 24, 14, 14, 4);
  ctx.fill();
  ctx.direction = "rtl";
  ctx.textAlign = "left";
  ctx.fillStyle = "#334155";
  ctx.font = `600 14px ${FONT_FAMILY}`;
  ctx.fillText(legendA.label, x + 46, y + 36);

  ctx.fillStyle = legendB.color;
  drawRoundedRect(ctx, x + 24, y + 48, 14, 14, 4);
  ctx.fill();
  ctx.fillStyle = "#334155";
  ctx.fillText(legendB.label, x + 46, y + 60);

  const chartX = x + 44;
  const chartY = y + 88;
  const chartW = w - 88;
  const chartH = h - 144;
  const maxVal = Math.max(
    1,
    ...groups.flatMap((g) => [Math.max(0, g.valueA), Math.max(0, g.valueB)]),
  );

  // Horizontal grid lines
  for (let i = 0; i <= 4; i += 1) {
    const gy = chartY + (chartH * i) / 4;
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(chartX, gy);
    ctx.lineTo(chartX + chartW, gy);
    ctx.stroke();
  }

  const slotW = chartW / Math.max(1, groups.length);
  const barW = Math.min(34, Math.max(10, slotW * 0.28));

  groups.forEach((g, idx) => {
    const centerX = chartX + slotW * idx + slotW / 2;
    const hA = (Math.max(0, g.valueA) / maxVal) * chartH;
    const hB = (Math.max(0, g.valueB) / maxVal) * chartH;

    if (hA > 0) {
      drawRoundedRect(
        ctx,
        centerX - barW - 3,
        chartY + chartH - hA,
        barW,
        hA,
        6,
      );
      ctx.fillStyle = legendA.color;
      ctx.fill();
    }
    if (hB > 0) {
      drawRoundedRect(ctx, centerX + 3, chartY + chartH - hB, barW, hB, 6);
      ctx.fillStyle = legendB.color;
      ctx.fill();
    }

    // Group label
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.fillStyle = "#475569";
    ctx.font = `600 13px ${FONT_FAMILY}`;
    ctx.fillText(g.label, centerX, chartY + chartH + 26, slotW - 6);
  });
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ============================================================================
 * 1. INVENTORY AUDIT PDF REPORT (Store-Branded + Chart + Items Table)
 * ============================================================================ */

export async function downloadInventoryAuditPdf(
  audit: InventoryAuditRecord,
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const logoImg = await loadImageElement(
    `${window.location.origin}/images/elsory-logo.png`,
  );

  const pages: Array<{
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  }> = [];

  const locationLabel =
    audit.location === "store" ? "المحل (Store)" : "المخزن (Warehouse)";

  // --- PAGE 1 ---
  const p1 = createBlankPage();
  pages.push(p1);
  let y = drawStoreHeader(p1.ctx, logoImg, {
    badgeText: "تقرير جرد المخزون المعتمد",
    metaLabel: "رقم الجرد",
    metaValue: audit.auditNumber,
    metaValueLtr: true,
    metaSubtext: fmtDateTimeAr(audit.createdAt),
  });

  // 4 Info Cards
  y = drawInfoCardRow(p1.ctx, y, [
    { label: "موقع الجرد", value: locationLabel, accentColor: "#2563EB" },
    { label: "القائم بالجرد", value: audit.auditedByName || "المالك" },
    {
      label: "حالة التسوية",
      value: audit.adjustmentsApplied ? "تسوية مطبّقة" : "مراجعة فقط",
      accentColor: audit.adjustmentsApplied ? "#10b981" : "#d97706",
    },
    {
      label: "إجمالي الأصناف",
      value: `${fmtNum(audit.items.length)} صنف`,
    },
  ]);

  // 3 Category Summary Cards
  const cats: ProductType[] = ["phone", "accessory", "maintenance"];
  y = drawSectionHeading(
    p1.ctx,
    y,
    "ملخص الجرد حسب الفئة",
    "مقارنة الأرصدة المسجلة بالنظام مقابل الجرد الفعلي وقيمتها المالية",
  );

  const catGap = 16;
  const catW = (CONTENT_W - catGap * 2) / 3;
  const catH = 148;
  cats.forEach((cat, idx) => {
    const c = audit.summaryByCategory[cat];
    const x = PAGE_W - MARGIN - catW * (idx + 1) - catGap * idx;
    drawRoundedRect(p1.ctx, x, y, catW, catH, 16);
    p1.ctx.fillStyle = "#f8fafc";
    p1.ctx.fill();
    p1.ctx.strokeStyle = "#e2e8f0";
    p1.ctx.lineWidth = 1.5;
    p1.ctx.stroke();

    const rx = x + catW - 18;
    p1.ctx.direction = "rtl";
    p1.ctx.textAlign = "right";
    p1.ctx.fillStyle = "#0f172a";
    p1.ctx.font = `700 19px ${FONT_FAMILY}`;
    p1.ctx.fillText(
      `${PRODUCT_TYPE_AR[cat]} (${fmtNum(c.itemsCount)})`,
      rx,
      y + 32,
    );

    p1.ctx.fillStyle = "#475569";
    p1.ctx.font = `600 15px ${FONT_FAMILY}`;
    p1.ctx.fillText(
      `المسجل: ${fmtNum(c.systemQty)}  •  الفعلي: ${fmtNum(c.actualQty)}`,
      rx,
      y + 64,
    );

    const diffColor =
      c.difference < 0 ? "#ef4444" : c.difference > 0 ? "#2563EB" : "#10b981";
    p1.ctx.fillStyle = diffColor;
    p1.ctx.font = `700 16px ${FONT_FAMILY}`;
    p1.ctx.fillText(
      `الفرق: ${c.difference > 0 ? `+${fmtNum(c.difference)}` : fmtNum(c.difference)}`,
      rx,
      y + 92,
    );

    p1.ctx.fillStyle = "#64748b";
    p1.ctx.font = `500 14px ${FONT_FAMILY}`;
    p1.ctx.fillText(
      `البيع: ${fmtEgp(c.retailValue)} • التكلفة: ${fmtEgp(c.knownCostValue)}`,
      rx,
      y + 124,
      catW - 32,
    );
  });
  y += catH + 24;

  // Grouped Bar Chart: System vs Actual across categories
  drawGroupedBarChartBox(
    p1.ctx,
    MARGIN,
    y,
    CONTENT_W,
    290,
    "الرسم البياني لمطابقة الجرد حسب الفئة",
    "مقارنة الكمية المسجلة بالنظام مقابل الكمية الفعلية",
    cats.map((cat) => ({
      label: PRODUCT_TYPE_AR[cat],
      valueA: audit.summaryByCategory[cat].systemQty,
      valueB: audit.summaryByCategory[cat].actualQty,
    })),
    { label: "الرصيد المسجل (النظام)", color: "#64748b" },
    { label: "الرصيد الفعلي (الجرد)", color: "#2563EB" },
  );
  y += 314;

  // Items Table (paginated across pages as needed)
  let activePage = p1;

  const drawAuditTableHeader = (ctx: CanvasRenderingContext2D, topY: number) => {
    drawRoundedRect(ctx, MARGIN, topY, CONTENT_W, 46, 12);
    ctx.fillStyle = "#111111";
    ctx.fill();

    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 15px ${FONT_FAMILY}`;
    ctx.fillText("#", PAGE_W - MARGIN - 16, topY + 29);
    ctx.fillText("الصنف", PAGE_W - MARGIN - 56, topY + 29);
    ctx.fillText("النوع", PAGE_W - MARGIN - 455, topY + 29);
    ctx.fillText("المسجل", PAGE_W - MARGIN - 565, topY + 29);
    ctx.fillText("الفعلي", PAGE_W - MARGIN - 660, topY + 29);
    ctx.fillText("الفرق", PAGE_W - MARGIN - 755, topY + 29);
    ctx.fillText("سعر البيع", PAGE_W - MARGIN - 855, topY + 29);
    ctx.fillText("قيمة الفعلي", PAGE_W - MARGIN - 985, topY + 29);
    return topY + 54;
  };

  y = drawSectionHeading(
    activePage.ctx,
    y,
    "تفاصيل الأصناف المجرودة",
    "قائمة كاملة بكل صنف والكمية المسجلة والفعلية والفرق",
  );
  y = drawAuditTableHeader(activePage.ctx, y);

  const rowH = 54;
  audit.items.forEach((item, idx) => {
    if (y + rowH > PAGE_H - 110) {
      const nextPage = createBlankPage();
      pages.push(nextPage);
      activePage = nextPage;
      y = drawStoreHeader(activePage.ctx, logoImg, {
        badgeText: "تابع تقرير جرد المخزون المعتمد",
        metaLabel: "رقم الجرد",
        metaValue: audit.auditNumber,
        metaValueLtr: true,
        metaSubtext: locationLabel,
        compact: true,
      });
      y = drawAuditTableHeader(activePage.ctx, y);
    }

    const ctx = activePage.ctx;
    if (idx % 2 === 1) {
      drawRoundedRect(ctx, MARGIN, y, CONTENT_W, rowH - 4, 8);
      ctx.fillStyle = "#f8fafc";
      ctx.fill();
    }

    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    ctx.font = `600 14px ${FONT_FAMILY}`;
    ctx.fillText(String(idx + 1), PAGE_W - MARGIN - 16, y + 32);

    ctx.fillStyle = "#0f172a";
    ctx.font = `700 15px ${FONT_FAMILY}`;
    ctx.fillText(item.productName, PAGE_W - MARGIN - 56, y + 24, 385);
    if (item.imei) {
      ctx.direction = "ltr";
      ctx.textAlign = "right";
      ctx.fillStyle = "#2563EB";
      ctx.font = `600 12px ${MONO_FONT}`;
      ctx.fillText(`IMEI: ${item.imei}`, PAGE_W - MARGIN - 56, y + 43, 385);
    }

    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#475569";
    ctx.font = `600 14px ${FONT_FAMILY}`;
    ctx.fillText(
      PRODUCT_TYPE_SINGLE_AR[item.productType],
      PAGE_W - MARGIN - 455,
      y + 32,
    );
    ctx.fillText(fmtNum(item.systemQuantity), PAGE_W - MARGIN - 565, y + 32);
    ctx.fillStyle = "#0f172a";
    ctx.font = `700 14px ${FONT_FAMILY}`;
    ctx.fillText(fmtNum(item.actualQuantity), PAGE_W - MARGIN - 660, y + 32);

    ctx.fillStyle =
      item.difference < 0
        ? "#ef4444"
        : item.difference > 0
          ? "#2563EB"
          : "#10b981";
    ctx.fillText(
      item.difference > 0
        ? `+${fmtNum(item.difference)}`
        : fmtNum(item.difference),
      PAGE_W - MARGIN - 755,
      y + 32,
    );

    ctx.fillStyle = "#334155";
    ctx.font = `600 14px ${FONT_FAMILY}`;
    ctx.fillText(
      fmtEgp(item.unitSellingPrice),
      PAGE_W - MARGIN - 855,
      y + 32,
      120,
    );
    ctx.fillStyle = "#0f172a";
    ctx.font = `700 14px ${FONT_FAMILY}`;
    ctx.fillText(
      fmtEgp(item.totalSellingValue),
      PAGE_W - MARGIN - 985,
      y + 32,
      125,
    );

    y += rowH;
  });

  // Final Totals Box
  const totalSys = cats.reduce(
    (s, c) => s + audit.summaryByCategory[c].systemQty,
    0,
  );
  const totalAct = cats.reduce(
    (s, c) => s + audit.summaryByCategory[c].actualQty,
    0,
  );
  const totalDiff = totalAct - totalSys;
  const totalRetail = cats.reduce(
    (s, c) => s + audit.summaryByCategory[c].retailValue,
    0,
  );
  const totalCost = cats.reduce(
    (s, c) => s + audit.summaryByCategory[c].knownCostValue,
    0,
  );

  if (y + 150 > PAGE_H - 90) {
    const nextPage = createBlankPage();
    pages.push(nextPage);
    activePage = nextPage;
    y = drawStoreHeader(activePage.ctx, logoImg, {
      badgeText: "ملخص نهائي — جرد المخزون",
      metaLabel: "رقم الجرد",
      metaValue: audit.auditNumber,
      metaValueLtr: true,
      metaSubtext: locationLabel,
      compact: true,
    });
  } else {
    y += 16;
  }

  drawRoundedRect(activePage.ctx, MARGIN, y, CONTENT_W, 118, 18);
  activePage.ctx.fillStyle = "#0f172a";
  activePage.ctx.fill();

  const summaryCols = [
    { label: "إجمالي المسجل", value: fmtNum(totalSys), color: "#e2e8f0" },
    { label: "إجمالي الفعلي", value: fmtNum(totalAct), color: "#ffffff" },
    {
      label: "صافي الفرق",
      value: totalDiff > 0 ? `+${fmtNum(totalDiff)}` : fmtNum(totalDiff),
      color:
        totalDiff < 0 ? "#f87171" : totalDiff > 0 ? "#60a5fa" : "#34d399",
    },
    { label: "إجمالي قيمة البيع", value: fmtEgp(totalRetail), color: "#93c5fd" },
    { label: "التكلفة المعروفة", value: fmtEgp(totalCost), color: "#cbd5e1" },
  ];
  const colW = CONTENT_W / summaryCols.length;
  summaryCols.forEach((col, idx) => {
    const rx = PAGE_W - MARGIN - colW * idx - 22;
    activePage.ctx.direction = "rtl";
    activePage.ctx.textAlign = "right";
    activePage.ctx.fillStyle = "#94a3b8";
    activePage.ctx.font = `600 14px ${FONT_FAMILY}`;
    activePage.ctx.fillText(col.label, rx, y + 40);

    activePage.ctx.fillStyle = col.color;
    activePage.ctx.font = `700 20px ${FONT_FAMILY}`;
    activePage.ctx.fillText(col.value, rx, y + 80, colW - 28);
  });

  if (audit.notes?.trim()) {
    y += 136;
    if (y + 50 < PAGE_H - 80) {
      activePage.ctx.direction = "rtl";
      activePage.ctx.textAlign = "right";
      activePage.ctx.fillStyle = "#475569";
      activePage.ctx.font = `600 15px ${FONT_FAMILY}`;
      activePage.ctx.fillText(
        `ملاحظات الجرد: ${audit.notes.trim()}`,
        PAGE_W - MARGIN,
        y + 20,
        CONTENT_W,
      );
    }
  }

  // Stamp page footers
  pages.forEach((p, idx) => drawFooter(p.ctx, idx + 1, pages.length));

  const pdfPages: PdfCanvasPage[] = pages.map((p) => ({
    canvas: p.canvas,
    widthPt: A4_W_PT,
    heightPt: A4_H_PT,
  }));

  const blob = buildPdfBlobFromCanvases(pdfPages);
  triggerBlobDownload(blob, `elsory-audit-${audit.auditNumber}.pdf`);
}

/* ============================================================================
 * 2. ANALYTICS & FINANCIAL REPORTS PDF (Store-Branded + All Charts + Tables)
 * ============================================================================ */

export async function downloadAnalyticsReportPdf(params: {
  salesReport: SalesReportData;
  purchasesReport: PurchasesReportData;
  returnsReport: ReturnsReportData;
  fromDate: string;
  toDate: string;
}): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const { salesReport, purchasesReport, returnsReport, fromDate, toDate } =
    params;

  const logoImg = await loadImageElement(
    `${window.location.origin}/images/elsory-logo.png`,
  );

  const pages: Array<{
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  }> = [];

  const periodText = `${fromDate}  ←  ${toDate}`;

  // =========================================================================
  // PAGE 1: Executive KPIs + Financial Bar Chart + Payment & Status Donuts
  // =========================================================================
  const p1 = createBlankPage();
  pages.push(p1);
  let y = drawStoreHeader(p1.ctx, logoImg, {
    badgeText: "التقرير المالي والتحليلي الشامل",
    metaLabel: "فترة التقرير",
    metaValue: periodText,
    metaValueLtr: true,
    metaSubtext: `تاريخ الإصدار: ${fmtDateTimeAr()}`,
  });

  // 5 Executive KPI Cards
  y = drawInfoCardRow(
    p1.ctx,
    y,
    [
      {
        label: "صافي المبيعات",
        value: fmtEgp(salesReport.sales.netSales),
        subtext: `${fmtNum(salesReport.sales.totalInvoices)} فاتورة بيع`,
        accentColor: "#0f172a",
      },
      {
        label: "إجمالي المشتريات",
        value: fmtEgp(purchasesReport.report.totalPurchases),
        subtext: `${fmtNum(purchasesReport.report.totalInvoices)} فاتورة شراء`,
        accentColor: "#0f172a",
      },
      {
        label: "قيمة المرتجعات",
        value: fmtEgp(returnsReport.report.totalRefundAmount),
        subtext: `${fmtNum(returnsReport.report.totalReturns)} عملية`,
        accentColor: "#ef4444",
      },
      {
        label: "بعد المرتجعات",
        value: fmtEgp(salesReport.netSalesAfterReturns),
        subtext: "صافي المبيعات الفعلي",
        accentColor: "#2563EB",
      },
      {
        label: "صافي التدفق النقدي",
        value: fmtEgp(salesReport.netCashFlow),
        subtext: "المحصّل - المسترد",
        accentColor: "#10b981",
      },
    ],
    112,
  );

  // Horizontal Financial Comparison Chart
  drawHorizontalBarsBox(
    p1.ctx,
    MARGIN,
    y,
    CONTENT_W,
    430,
    "ملخص الحركة المالية للمحل خلال الفترة",
    "مقارنة المبيعات والتحصيل والمشتريات والمرتجعات وصافي التدفق النقدي",
    [
      {
        label: "إجمالي المبيعات (قبل الخصم)",
        value: salesReport.sales.grossSales,
        color: "#0f172a",
      },
      {
        label: "صافي المبيعات (بعد الخصم)",
        value: salesReport.sales.netSales,
        color: "#2563EB",
      },
      {
        label: "المبالغ المحصّلة فعلياً",
        value: salesReport.sales.collectedAmount,
        color: "#10b981",
      },
      {
        label: "إجمالي فواتير المشتريات",
        value: purchasesReport.report.totalPurchases,
        color: "#7c3aed",
      },
      {
        label: "قيمة المرتجعات",
        value: returnsReport.report.totalRefundAmount,
        color: "#ef4444",
      },
      {
        label: "صافي التدفق النقدي للمبيعات",
        value: salesReport.netCashFlow,
        color: "#0ea5e9",
      },
    ],
    fmtEgp,
  );
  y += 452;

  // Side-by-side Donut Charts
  const halfGap = 20;
  const halfW = (CONTENT_W - halfGap) / 2;
  const donutH = 310;

  // Right Donut: Payment Statuses
  drawDonutChartBox(
    p1.ctx,
    PAGE_W - MARGIN - halfW,
    y,
    halfW,
    donutH,
    "حالات سداد فواتير البيع",
    "توزيع الفواتير حسب حالة التحصيل",
    [
      {
        label: "مدفوعة بالكامل",
        value: salesReport.paymentStatistics.fullyPaidInvoices,
        color: "#10b981",
      },
      {
        label: "مدفوعة جزئياً",
        value: salesReport.paymentStatistics.partiallyPaidInvoices,
        color: "#f59e0b",
      },
      {
        label: "غير مدفوعة",
        value: salesReport.paymentStatistics.unpaidInvoices,
        color: "#ef4444",
      },
      {
        label: "فواتير هدايا",
        value: salesReport.paymentStatistics.giftInvoices,
        color: "#2563EB",
      },
    ],
    fmtNum,
  );

  // Left Donut: Payment Methods Breakdown
  const pm = salesReport.paymentMethods;
  drawDonutChartBox(
    p1.ctx,
    MARGIN,
    y,
    halfW,
    donutH,
    "توزيع التحصيل حسب وسيلة الدفع",
    "إجمالي المحصّل بكل وسيلة دفع خلال الفترة",
    [
      {
        label: "نقدي (Cash)",
        value: pm?.cash.collected ?? 0,
        color: "#10b981",
      },
      {
        label: "بطاقة (Visa)",
        value: pm?.visa.collected ?? 0,
        color: "#2563EB",
      },
      {
        label: "إنستا باي (InstaPay)",
        value: pm?.instapay.collected ?? 0,
        color: "#7c3aed",
      },
      {
        label: "محفظة (Wallet)",
        value: pm?.wallet.collected ?? 0,
        color: "#f59e0b",
      },
    ],
    fmtEgp,
  );

  // =========================================================================
  // PAGE 2: Timeline Chart + Purchases/Returns Donuts + Breakdown Cards
  // =========================================================================
  const p2 = createBlankPage();
  pages.push(p2);
  let y2 = drawStoreHeader(p2.ctx, logoImg, {
    badgeText: "تحليلات الأداء اليومي والمشتريات والمرتجعات",
    metaLabel: "فترة التقرير",
    metaValue: periodText,
    metaValueLtr: true,
    metaSubtext: "",
    compact: true,
  });

  // Daily Sales vs Cash Flow Bar Chart (last 12 timeline points)
  const timelineSlice = salesReport.timeline.slice(-12);
  drawGroupedBarChartBox(
    p2.ctx,
    MARGIN,
    y2,
    CONTENT_W,
    330,
    "تطور المبيعات والتدفق النقدي اليومي",
    timelineSlice.length > 0
      ? `عرض آخر ${fmtNum(timelineSlice.length)} يوم مسجّل خلال الفترة`
      : "لا توجد حركة يومية مسجلة في هذه الفترة",
    timelineSlice.length > 0
      ? timelineSlice.map((pt) => ({
          label: fmtShortDate(pt.date),
          valueA: pt.netSales,
          valueB: pt.netCashFlow,
        }))
      : [{ label: "—", valueA: 0, valueB: 0 }],
    { label: "صافي المبيعات", color: "#2563EB" },
    { label: "صافي التدفق النقدي", color: "#10b981" },
  );
  y2 += 352;

  // Purchases Status Donut (Right) & Returns by Type Donut (Left)
  drawDonutChartBox(
    p2.ctx,
    PAGE_W - MARGIN - halfW,
    y2,
    halfW,
    donutH,
    "حالات فواتير المشتريات",
    `إجمالي ${fmtNum(purchasesReport.report.totalInvoices)} فاتورة شراء`,
    [
      {
        label: "مكتملة",
        value: purchasesReport.report.completed,
        color: "#10b981",
      },
      {
        label: "مسودة / قيد الاستلام",
        value: purchasesReport.report.draft,
        color: "#f59e0b",
      },
      {
        label: "ملغاة",
        value: purchasesReport.report.cancelled,
        color: "#ef4444",
      },
    ],
    fmtNum,
  );

  drawDonutChartBox(
    p2.ctx,
    MARGIN,
    y2,
    halfW,
    donutH,
    "توزيع المرتجعات حسب نوع المنتج",
    `إجمالي ${fmtNum(returnsReport.report.totalReturnItems)} قطعة مرتجعة`,
    [
      {
        label: "هواتف مرتجعة",
        value: returnsReport.report.phonesReturned,
        color: "#2563EB",
      },
      {
        label: "إكسسوارات وصيانة مرتجعة",
        value: returnsReport.report.accessoriesReturned,
        color: "#ef4444",
      },
    ],
    fmtNum,
  );
  y2 += donutH + 28;

  // Detailed Financial Breakdown Cards (3 sections side by side)
  y2 = drawSectionHeading(
    p2.ctx,
    y2,
    "ملخص تفصيلي للمؤشرات المالية",
    "تفاصيل المبيعات والمشتريات والمرتجعات خلال الفترة المحددة",
  );

  const boxGap = 16;
  const boxW = (CONTENT_W - boxGap * 2) / 3;
  const boxH = 310;
  const summaryBoxes = [
    {
      title: "تفاصيل المبيعات",
      color: "#2563EB",
      rows: [
        ["عدد الفواتير", fmtNum(salesReport.sales.totalInvoices)],
        ["قبل الخصم", fmtEgp(salesReport.sales.grossSales)],
        ["إجمالي الخصومات", fmtEgp(salesReport.sales.totalDiscounts)],
        ["صافي المبيعات", fmtEgp(salesReport.sales.netSales)],
        ["المحصّل فعلياً", fmtEgp(salesReport.sales.collectedAmount)],
        ["المتبقي للتحصيل", fmtEgp(salesReport.sales.currentOutstandingAmount)],
      ],
    },
    {
      title: "تفاصيل المشتريات",
      color: "#7c3aed",
      rows: [
        ["عدد الفواتير", fmtNum(purchasesReport.report.totalInvoices)],
        ["إجمالي المشتريات", fmtEgp(purchasesReport.report.totalPurchases)],
        ["المدفوع للموردين", fmtEgp(purchasesReport.report.totalPaid)],
        ["المتبقي للموردين", fmtEgp(purchasesReport.report.totalRemaining)],
        ["مدفوعة بالكامل", fmtNum(purchasesReport.report.fullyPaid)],
        ["مدفوعة جزئياً / غير مدفوعة", fmtNum(purchasesReport.report.partiallyPaid + purchasesReport.report.unpaid)],
      ],
    },
    {
      title: "تفاصيل المرتجعات",
      color: "#ef4444",
      rows: [
        ["عدد عمليات الإرجاع", fmtNum(returnsReport.report.totalReturns)],
        ["إجمالي القطع", fmtNum(returnsReport.report.totalReturnItems)],
        ["قيمة البضاعة المرتجعة", fmtEgp(returnsReport.report.totalReturnedMerchandiseAmount)],
        ["إجمالي المسترد فعلياً", fmtEgp(returnsReport.report.actualRefundedAmount)],
        ["مستردات معلّقة", fmtEgp(returnsReport.report.pendingRefundAmount)],
        ["هواتف / أخرى", `${fmtNum(returnsReport.report.phonesReturned)} / ${fmtNum(returnsReport.report.accessoriesReturned)}`],
      ],
    },
  ];

  summaryBoxes.forEach((box, idx) => {
    const x = PAGE_W - MARGIN - boxW * (idx + 1) - boxGap * idx;
    drawRoundedRect(p2.ctx, x, y2, boxW, boxH, 16);
    p2.ctx.fillStyle = "#f8fafc";
    p2.ctx.fill();
    p2.ctx.strokeStyle = "#e2e8f0";
    p2.ctx.lineWidth = 1.5;
    p2.ctx.stroke();

    // Top color bar
    drawRoundedRect(p2.ctx, x, y2, boxW, 8, 8);
    p2.ctx.fillStyle = box.color;
    p2.ctx.fill();

    const rx = x + boxW - 18;
    const lx = x + 18;
    p2.ctx.direction = "rtl";
    p2.ctx.textAlign = "right";
    p2.ctx.fillStyle = "#0f172a";
    p2.ctx.font = `700 18px ${FONT_FAMILY}`;
    p2.ctx.fillText(box.title, rx, y2 + 40);

    let ry = y2 + 78;
    box.rows.forEach(([k, v]) => {
      p2.ctx.direction = "rtl";
      p2.ctx.textAlign = "right";
      p2.ctx.fillStyle = "#64748b";
      p2.ctx.font = `500 14px ${FONT_FAMILY}`;
      p2.ctx.fillText(k, rx, ry);

      p2.ctx.direction = "rtl";
      p2.ctx.textAlign = "left";
      p2.ctx.fillStyle = "#0f172a";
      p2.ctx.font = `700 14px ${FONT_FAMILY}`;
      p2.ctx.fillText(v, lx, ry);

      ry += 38;
    });
  });

  // =========================================================================
  // PAGE 3+ (if timeline has rows): Daily Financial Table
  // =========================================================================
  if (salesReport.timeline.length > 0) {
    let activePage = createBlankPage();
    pages.push(activePage);
    let y3 = drawStoreHeader(activePage.ctx, logoImg, {
      badgeText: "الجدول اليومي لحركة المبيعات والتدفق النقدي",
      metaLabel: "فترة التقرير",
      metaValue: periodText,
      metaValueLtr: true,
      metaSubtext: "",
      compact: true,
    });

    const drawTimelineHeader = (ctx: CanvasRenderingContext2D, topY: number) => {
      drawRoundedRect(ctx, MARGIN, topY, CONTENT_W, 46, 12);
      ctx.fillStyle = "#111111";
      ctx.fill();
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 15px ${FONT_FAMILY}`;
      ctx.fillText("التاريخ", PAGE_W - MARGIN - 20, topY + 29);
      ctx.fillText("الفواتير", PAGE_W - MARGIN - 185, topY + 29);
      ctx.fillText("صافي المبيعات", PAGE_W - MARGIN - 295, topY + 29);
      ctx.fillText("المحصّل", PAGE_W - MARGIN - 495, topY + 29);
      ctx.fillText("المرتجعات", PAGE_W - MARGIN - 695, topY + 29);
      ctx.fillText("صافي التدفق", PAGE_W - MARGIN - 895, topY + 29);
      return topY + 54;
    };

    y3 = drawTimelineHeader(activePage.ctx, y3);
    const tRowH = 44;

    salesReport.timeline.forEach((pt, idx) => {
      if (y3 + tRowH > PAGE_H - 95) {
        activePage = createBlankPage();
        pages.push(activePage);
        y3 = drawStoreHeader(activePage.ctx, logoImg, {
          badgeText: "تابع الجدول اليومي للمبيعات",
          metaLabel: "فترة التقرير",
          metaValue: periodText,
          metaValueLtr: true,
          metaSubtext: "",
          compact: true,
        });
        y3 = drawTimelineHeader(activePage.ctx, y3);
      }

      const ctx = activePage.ctx;
      if (idx % 2 === 1) {
        drawRoundedRect(ctx, MARGIN, y3, CONTENT_W, tRowH - 4, 8);
        ctx.fillStyle = "#f8fafc";
        ctx.fill();
      }

      ctx.direction = "ltr";
      ctx.textAlign = "right";
      ctx.fillStyle = "#0f172a";
      ctx.font = `600 14px ${MONO_FONT}`;
      ctx.fillText(pt.date, PAGE_W - MARGIN - 20, y3 + 27);

      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.fillStyle = "#475569";
      ctx.font = `600 14px ${FONT_FAMILY}`;
      ctx.fillText(fmtNum(pt.invoicesCount), PAGE_W - MARGIN - 185, y3 + 27);

      ctx.fillStyle = "#0f172a";
      ctx.font = `700 14px ${FONT_FAMILY}`;
      ctx.fillText(fmtEgp(pt.netSales), PAGE_W - MARGIN - 295, y3 + 27, 180);
      ctx.fillText(
        fmtEgp(pt.collectedAmount),
        PAGE_W - MARGIN - 495,
        y3 + 27,
        180,
      );

      ctx.fillStyle = pt.returnedAmount > 0 ? "#ef4444" : "#64748b";
      ctx.fillText(
        fmtEgp(pt.returnedAmount),
        PAGE_W - MARGIN - 695,
        y3 + 27,
        180,
      );

      ctx.fillStyle = pt.netCashFlow >= 0 ? "#10b981" : "#ef4444";
      ctx.fillText(
        fmtEgp(pt.netCashFlow),
        PAGE_W - MARGIN - 895,
        y3 + 27,
        180,
      );

      y3 += tRowH;
    });
  }

  // Stamp footers on all pages
  pages.forEach((p, idx) => drawFooter(p.ctx, idx + 1, pages.length));

  const pdfPages: PdfCanvasPage[] = pages.map((p) => ({
    canvas: p.canvas,
    widthPt: A4_W_PT,
    heightPt: A4_H_PT,
  }));

  const blob = buildPdfBlobFromCanvases(pdfPages);
  triggerBlobDownload(blob, `elsory-financial-report-${fromDate}-to-${toDate}.pdf`);
}
