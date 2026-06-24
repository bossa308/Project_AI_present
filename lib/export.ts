// Client-side export helpers: CSV download + chart-to-PNG.
// No storage, no server — everything happens in the browser via Blob URLs.

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null>>
): string {
  const head = headers.map(csvCell).join(",");
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  return `${head}\n${body}\n`;
}

/** Download text as a UTF-8 file (BOM included so Excel reads Thai correctly). */
export function downloadText(
  filename: string,
  text: string,
  mime = "text/csv;charset=utf-8"
) {
  triggerDownload(filename, new Blob(["﻿" + text], { type: mime }));
}

const COPIED_STYLE_PROPS = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-opacity",
  "fill-opacity",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
];

/**
 * Rasterize a live <svg> (the Recharts surface) to a canvas.
 * CSS-variable colors (stroke="var(--grid)") don't survive serialization, so we
 * copy each element's *computed* style onto the clone before serializing.
 */
async function renderSvgToCanvas(
  svg: SVGSVGElement,
  background: string,
  scale: number
): Promise<HTMLCanvasElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const orig = svg.querySelectorAll<SVGElement>("*");
  const cloned = clone.querySelectorAll<SVGElement>("*");
  for (let i = 0; i < orig.length; i++) {
    const cs = getComputedStyle(orig[i]);
    for (const prop of COPIED_STYLE_PROPS) {
      const val = cs.getPropertyValue(prop);
      if (val) cloned[i].setAttribute(prop, val);
    }
  }

  const rect = svg.getBoundingClientRect();
  const w = Math.max(1, Math.ceil(rect.width));
  const h = Math.max(1, Math.ceil(rect.height));
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const data = new XMLSerializer().serializeToString(clone);
  const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("svg load failed"));
    img.src = svgUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** Rasterize a chart SVG to a PNG data URL (for embedding in a report). */
export async function svgToPngDataUrl(
  svg: SVGSVGElement,
  background = "#ffffff",
  scale = 2
): Promise<string> {
  const canvas = await renderSvgToCanvas(svg, background, scale);
  return canvas.toDataURL("image/png");
}

/** Rasterize a chart SVG and download it as a PNG file. */
export async function exportSvgToPng(
  svg: SVGSVGElement,
  filename: string,
  background = "#ffffff",
  scale = 2
): Promise<void> {
  const canvas = await renderSvgToCanvas(svg, background, scale);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (blob) triggerDownload(filename, blob);
}
