import { downloadBlob } from "./storage";
import { fileNameSafe } from "./calendar";

export { fileNameSafe };

/* ═══════════════════════════════════════════════════════════════════════
 * Document export — CSV is dependency-free; XLSX / PDF / PNG lazily pull
 * their libraries so the initial bundle stays small.
 * ═════════════════════════════════════════════════════════════════════ */

export type Cell = string | number | boolean | null | undefined;
export type Sheet = Cell[][];

/* ── CSV ─────────────────────────────────────────────────────────────── */

function csvEscape(v: Cell): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function sheetToCsv(sheet: Sheet): string {
  return sheet.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function downloadCsv(sheet: Sheet, filename: string): void {
  // BOM keeps Excel happy with UTF-8
  downloadBlob(`\uFEFF${sheetToCsv(sheet)}`, ensureExt(filename, "csv"), "text/csv;charset=utf-8");
}

export function downloadText(text: string, filename: string, type = "text/csv;charset=utf-8"): void {
  downloadBlob(text, filename, type);
}

/** Append `.ext` unless the name already carries it (case-insensitively). */
export function ensureExt(name: string, ext: string): string {
  return name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`;
}

/* ── XLSX ────────────────────────────────────────────────────────────── */

export interface XlsxSheet {
  name: string;
  rows: Sheet;
}

/** Excel caps a sheet name at 31 characters — longer names throw. */
export const XLSX_SHEET_NAME_MAX = 31;

const XLSX_MIN_WIDTH = 10;
const XLSX_MAX_WIDTH = 48;

/**
 * Column widths (in characters) sized to the widest cell in each column.
 * Pure so the export suite can assert the shape without opening a workbook.
 */
export function xlsxColumnWidths(rows: Sheet): number[] {
  const width: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = cell === null || cell === undefined ? 0 : String(cell).length;
      width[i] = Math.max(width[i] ?? XLSX_MIN_WIDTH, Math.min(XLSX_MAX_WIDTH, len + 3));
    });
  }
  return width.map((w) => Math.max(9, w));
}

/**
 * Unwrap a CJS default export. Bundlers and Node disagree about how much of
 * `xlsx` they surface as named exports, so always read the module object.
 */
function interop<T>(mod: T & { default?: T }): T {
  return mod.default ?? mod;
}

export async function downloadXlsx(
  sheets: XlsxSheet[],
  filename: string,
): Promise<{ ok: boolean; fellBackToCsv: boolean }> {
  try {
    const XLSX = interop(await import("xlsx"));
    const book = XLSX.utils.book_new();
    for (const s of sheets) {
      const ws = XLSX.utils.aoa_to_sheet(s.rows);
      ws["!cols"] = xlsxColumnWidths(s.rows).map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(book, ws, s.name.slice(0, XLSX_SHEET_NAME_MAX));
    }
    XLSX.writeFile(book, ensureExt(filename, "xlsx"));
    return { ok: true, fellBackToCsv: false };
  } catch (err) {
    console.warn("[export] xlsx unavailable, falling back to CSV", err);
    downloadCsv(sheets[0]?.rows ?? [], filename);
    return { ok: true, fellBackToCsv: true };
  }
}

/* ── PNG / PDF (rasterised from a live DOM node) ─────────────────────── */

async function loadHtml2Canvas() {
  const mod = await import("html2canvas");
  return (mod.default ?? mod) as typeof import("html2canvas").default;
}

/** A4 portrait, in millimetres — the unit jsPDF is constructed with. */
export const A4_MM = { w: 210, h: 297 } as const;

/**
 * Slice a tall raster across A4 pages: one image y-offset (mm) per page.
 *
 * The source artefact looped `while (remaining >= 0)`, which emitted an extra,
 * completely blank page whenever the image height landed on an exact multiple
 * of the usable page height. Ceil-ing the page count removes it; every other
 * case produces the same offsets as the original (`-i * usableH`).
 */
export function planPdfPages(imgHeightMm: number, usableHeightMm: number): number[] {
  if (!(imgHeightMm > 0) || !(usableHeightMm > 0)) return [0];
  const pages = Math.max(1, Math.ceil(imgHeightMm / usableHeightMm - 1e-9));
  return Array.from({ length: pages }, (_, i) => -i * usableHeightMm);
}

export async function nodeToCanvas(node: HTMLElement, scale = 2): Promise<HTMLCanvasElement> {
  const html2canvas = await loadHtml2Canvas();
  return html2canvas(node, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  });
}

export async function downloadPng(
  node: HTMLElement,
  filename: string,
  scale = 2,
): Promise<void> {
  const canvas = await nodeToCanvas(node, scale);
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.download = ensureExt(filename, "png");
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadPdf(
  node: HTMLElement,
  filename: string,
  opts: { marginMm?: number } = {},
): Promise<void> {
  const canvas = await nodeToCanvas(node, 2);
  const { jsPDF } = await import("jspdf");

  const pdf = new jsPDF("p", "mm", "a4");
  const margin = opts.marginMm ?? 0;
  const usableH = A4_MM.h - margin * 2;
  const imgW = A4_MM.w - margin * 2;
  const imgH = (canvas.height * imgW) / canvas.width;
  const img = canvas.toDataURL("image/png");

  for (const offset of planPdfPages(imgH, usableH)) {
    if (offset !== 0) pdf.addPage();
    pdf.addImage(img, "PNG", margin, margin + offset, imgW, imgH);
  }

  pdf.save(ensureExt(filename, "pdf"));
}

/* ── Generic download helper for backup JSON ─────────────────────────── */

export function backupFileName(prefix: string, suffix = ""): string {
  const d = new Date().toISOString().slice(0, 10);
  return fileNameSafe(`${prefix}${suffix ? `-${suffix}` : ""}-${d}`);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
