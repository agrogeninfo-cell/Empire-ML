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

function ensureExt(name: string, ext: string): string {
  return name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`;
}

/* ── XLSX ────────────────────────────────────────────────────────────── */

export interface XlsxSheet {
  name: string;
  rows: Sheet;
}

export async function downloadXlsx(
  sheets: XlsxSheet[],
  filename: string,
): Promise<{ ok: boolean; fellBackToCsv: boolean }> {
  try {
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    for (const s of sheets) {
      const ws = XLSX.utils.aoa_to_sheet(s.rows);
      // sensible column widths
      const width: number[] = [];
      for (const row of s.rows) {
        row.forEach((cell, i) => {
          const len = cell === null || cell === undefined ? 0 : String(cell).length;
          width[i] = Math.max(width[i] ?? 10, Math.min(48, len + 3));
        });
      }
      ws["!cols"] = width.map((w) => ({ wch: Math.max(9, w) }));
      XLSX.utils.book_append_sheet(book, ws, s.name.slice(0, 31));
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
  const pageW = 210;
  const pageH = 297;
  const margin = opts.marginMm ?? 0;
  const usableH = pageH - margin * 2;

  const imgW = pageW - margin * 2;
  const imgH = (canvas.height * imgW) / canvas.width;
  const img = canvas.toDataURL("image/png");

  let remaining = imgH;
  let offset = 0;

  pdf.addImage(img, "PNG", margin, margin + offset, imgW, imgH);
  remaining -= usableH;

  while (remaining >= 0) {
    offset -= usableH;
    pdf.addPage();
    pdf.addImage(img, "PNG", margin, margin + offset, imgW, imgH);
    remaining -= usableH;
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
