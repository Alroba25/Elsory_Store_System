"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Printer, ScanBarcode, X } from "lucide-react";
import type { StoreProductItem } from "@/src/services/dashboard.service";
import { encodeCode128Bars } from "@/src/utils/barcode";
import { buildRepeatedCanvasPdfBlob } from "@/src/utils/pdf-builder";

export function Code128BarcodeSvg({
  value,
  height = 48,
}: {
  value: string;
  height?: number;
}) {
  const { bars, totalModules } = encodeCode128Bars(value);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${totalModules} ${height}`}
      className="mx-auto block w-full max-w-55 bg-white"
      style={{ height: `${height}px` }}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Barcode ${value}`}
    >
      <rect x={0} y={0} width={totalModules} height={height} fill="#ffffff" />
      {bars.map((bar, idx) => (
        <rect
          key={`${bar.x}-${idx}`}
          x={bar.x}
          y={0}
          width={bar.width}
          height={height}
          fill="#000000"
        />
      ))}
    </svg>
  );
}

/**
 * Renders a single high-resolution 58mm x 40mm thermal barcode sticker onto an HTMLCanvasElement.
 */
function renderSingleBarcodeStickerCanvas(
  product: StoreProductItem,
  barcodeValue: string,
  index: number,
  total: number,
): HTMLCanvasElement {
  const width = 696; // 58mm at ~300 DPI
  const height = 480; // 40mm at ~300 DPI
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Pure white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Top Header Row: Store Name & Sticker Counter
  ctx.fillStyle = "#000000";
  ctx.direction = "ltr";
  ctx.font = "700 22px 'IBM Plex Sans Arabic', system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("ELSORY STORE", 36, 44);

  ctx.direction = "rtl";
  ctx.font = "700 21px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("السوري ستور", width - 36, 44);
  void index;
  void total;

  // Header divider line
  ctx.fillStyle = "#000000";
  ctx.fillRect(36, 56, width - 72, 2);

  // Product Name
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.font = "700 28px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
  const maxTextWidth = width - 72;
  ctx.fillText(product.name, width / 2, 98, maxTextWidth);

  // Brand & Model
  const brandModel = [product.brand, product.model].filter(Boolean).join(" • ");
  if (brandModel) {
    ctx.fillStyle = "#222222";
    ctx.font = "600 21px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
    ctx.fillText(brandModel, width / 2, 130, maxTextWidth);
  }

  // Code 128 Barcode Bars (crisp integer module width so scanners read it 100% accurately)
  const { bars, totalModules } = encodeCode128Bars(barcodeValue);
  const availableBarcodeWidth = width - 64;
  const modulePx = Math.max(2, Math.floor(availableBarcodeWidth / totalModules));
  const actualBarcodeWidth = totalModules * modulePx;
  const startX = Math.floor((width - actualBarcodeWidth) / 2);
  const barTopY = 152;
  const barHeight = 186;

  ctx.fillStyle = "#000000";
  for (const bar of bars) {
    ctx.fillRect(
      startX + bar.x * modulePx,
      barTopY,
      bar.width * modulePx,
      barHeight,
    );
  }

  // Human-readable barcode digits below bars
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.fillStyle = "#000000";
  ctx.font = "700 26px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(barcodeValue.split("").join(" "), width / 2, barTopY + barHeight + 34);

  // Bottom Divider & Price
  ctx.fillStyle = "#000000";
  ctx.fillRect(36, height - 74, width - 72, 2);

  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.font = "700 26px 'IBM Plex Sans Arabic', Tahoma, sans-serif";
  const priceText = `السعر: ${Number(product.sellingPrice || 0).toLocaleString("ar-EG")} ج.م`;
  ctx.fillText(priceText, width / 2, height - 34, maxTextWidth);

  return canvas;
}

/**
 * Generates a genuine multi-page PDF (`application/pdf`) where each barcode sticker
 * is on its own separate page (58mm x 40mm), with zero browser Date or URL headers/footers.
 */
export function generateProductBarcodesPdfBlob(
  product: StoreProductItem,
  customCount?: number,
): Blob | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  const barcodeValue = product.barcode?.trim();
  if (!barcodeValue) return null;

  const count = Math.max(
    1,
    Math.min(500, customCount ?? Math.max(1, product.quantity)),
  );

  // 58mm x 40mm in PDF points (1mm = 2.83465pt)
  const widthPt = 58 * 2.83465;
  const heightPt = 40 * 2.83465;

  const singleStickerCanvas = renderSingleBarcodeStickerCanvas(
    product,
    barcodeValue,
    0,
    count,
  );

  return buildRepeatedCanvasPdfBlob(
    singleStickerCanvas,
    widthPt,
    heightPt,
    count,
  );
}

export function printProductBarcodesSheet(
  product: StoreProductItem,
  customCount?: number,
): void {
  // Handled by PrintableProductBarcodesModal which opens and prints the generated PDF
  void product;
  void customCount;
}

interface PrintableProductBarcodesModalProps {
  product: StoreProductItem | null;
  onClose: () => void;
}

export function PrintableProductBarcodesModal({
  product,
  onClose,
}: PrintableProductBarcodesModalProps) {
  const defaultCount = product ? Math.max(1, product.quantity) : 1;
  const [customCount, setCustomCount] = useState<number>(defaultCount);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfIframeRef = useRef<HTMLIFrameElement | null>(null);
  const hasAutoPrintedRef = useRef<boolean>(false);

  const effectiveCount = Math.max(
    1,
    Math.min(500, customCount || defaultCount),
  );

  useEffect(() => {
    if (!product || !product.barcode) return;

    let objectUrl: string | null = null;
    const timer = window.setTimeout(() => {
      const blob = generateProductBarcodesPdfBlob(product, effectiveCount);
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [product, effectiveCount]);

  if (!product || !product.barcode) return null;

  const handlePrintPdf = () => {
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
      aria-label={`طباعة باركود المنتج ${product.name}`}
    >
      <div className="relative my-6 w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2563EB]/15 text-[#2563EB]">
              <ScanBarcode className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                ملف PDF ملصقات الباركود — {product.name}
              </h3>
              <p className="text-xs text-muted">
                ملف PDF حقيقي ({effectiveCount} صفحة منفصلة — كل باركود في صفحة
                مستقلة بدون تاريخ أو رابط المتصفح)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs">
              <label
                htmlFor="barcode-copies-count"
                className="font-semibold text-muted"
              >
                عدد الصفحات:
              </label>
              <input
                id="barcode-copies-count"
                type="number"
                min={1}
                max={500}
                value={effectiveCount}
                onChange={(e) =>
                  setCustomCount(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center font-bold text-foreground focus:border-[#2563EB] focus:outline-none"
              />
            </div>

            {pdfUrl ? (
              <a
                href={pdfUrl}
                download={`barcodes-${product.barcode}-${effectiveCount}.pdf`}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 text-xs font-bold text-foreground hover:border-[#2563EB] hover:text-[#2563EB]"
              >
                <Download className="h-4 w-4" />
                <span>تحميل PDF</span>
              </a>
            ) : null}

            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white shadow-xs transition-opacity hover:opacity-95"
            >
              <Printer className="h-4 w-4" />
              <span>طباعة ({effectiveCount}) باركود</span>
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

        {/* Native PDF Viewer Iframe (Guaranteed Zero Browser Date/URL Headers) */}
        <div className="bg-background p-4 sm:p-6 space-y-4">
          {pdfUrl ? (
            <iframe
              ref={pdfIframeRef}
              src={pdfUrl}
              title={`PDF Barcodes ${product.name}`}
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
              className="h-[68vh] w-full rounded-2xl border border-border bg-white shadow-inner"
            />
          ) : (
            <div className="flex h-[50vh] items-center justify-center text-xs font-semibold text-muted">
              جاري تجهيز ملف الـ PDF...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
