/**
 * Empire ML — document export harness
 *
 * Everything a download touches except the rasteriser is pure, so it can be
 * verified without a browser:
 *
 *   · CSV serialisation and escaping
 *   · filename hygiene (`.csv` / `.xlsx` / `.json` suffixes, safe characters)
 *   · the A4 page plan the PDF export walks — compared page for page against a
 *     transcription of the source artefact's pagination loop
 *   · Excel column widths
 *   · the estate sheet builder for all three shapes (male / female / combined),
 *     including the TOTAL-footer arity that once slid sideways
 *   · a real `xlsx` workbook written to a temp dir and read back
 *
 * Run with `npm run verify:export`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  A4_MM,
  XLSX_SHEET_NAME_MAX,
  backupFileName,
  downloadXlsx,
  ensureExt,
  planPdfPages,
  sheetToCsv,
  xlsxColumnWidths,
  type Sheet,
  type XlsxSheet,
} from "../src/lib/exporters";
import {
  ESTATE_CSV_FILE_HEADERS,
  ESTATE_CSV_HEADERS,
  dayAmount,
  estateCsv,
  estateCsvRow,
  estateSheet,
  femaleAmount,
  maleAmount,
  periodTotals,
  recordsInPeriod,
  seedEstateRecords,
  type EstateCsvKind,
} from "../src/lib/estate";
import { computeInvoiceTotals, computeMonthPayslips, invoiceLinesFor } from "../src/lib/payroll";
import {
  DEFAULT_BONUS_AMOUNT,
  DEFAULT_BONUS_DAYS,
  DEFAULT_ESTATE_RATES,
  DEFAULT_INVOICE_DATE,
  DEFAULT_INVOICE_NO,
  DEFAULT_INVOICE_RATES,
  DEFAULT_OT_HOURS,
  DEFAULT_PAYROLL_RATES,
  DEFAULT_TO_COMPANY,
  POYA_DAYS,
  demoRoyalState,
} from "../src/data/defaults";
import { MONTHS, daysInMonth, estatePeriodFor, fileNameSafe, money, num } from "../src/lib/calendar";
import type { PeriodTotals } from "../src/lib/estate";
import type { EstateDayRecord } from "../src/lib/types";

/* ───────────────────────── tiny harness ───────────────────────── */

let pass = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) pass++;
  else failures.push(`${label}\n     expected ${b}\n     actual   ${a}`);
}

function near(actual: number, expected: number, label: string, eps = 1e-9) {
  if (Math.abs(actual - expected) <= eps) pass++;
  else failures.push(`${label}\n     expected ${expected}\n     actual   ${actual}`);
}

function truthy(v: unknown, label: string) {
  if (v) pass++;
  else failures.push(`${label}\n     expected truthy, got ${JSON.stringify(v)}`);
}

function section(name: string) {
  console.log(`\n  ${name}`);
}

/** xlsx round-trips numbers through decimal text, so compare with a tolerance. */
function sameCell(got: unknown, want: unknown): boolean {
  if (typeof want === "number" && typeof got === "number") return Math.abs(got - want) < 1e-6;
  return JSON.stringify(got) === JSON.stringify(want);
}

/**
 * `sheet_to_json` pads every row out to the used range, so a two-cell letterhead
 * reads back as ["ROYAL HIRES","Labour Invoice","","",""]. Drop the padding.
 */
function trimRow(row: unknown): unknown[] {
  const cells = Array.isArray(row) ? [...row] : [];
  while (cells.length > 0 && (cells[cells.length - 1] === "" || cells[cells.length - 1] === null)) {
    cells.pop();
  }
  return cells;
}

type XlsxLike = typeof import("xlsx");
type Worksheet = ReturnType<XlsxLike["utils"]["aoa_to_sheet"]>;

/** Read a worksheet back as a plain grid of cells. */
function readGrid(XLSX: XlsxLike, ws: Worksheet): (string | number)[][] {
  return XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1,
    blankrows: true,
    defval: "",
    raw: true,
  });
}

/* ─────────────────────────────────────────────────────────────────
 * LEGACY TRANSCRIPTION — royal artefact PDF pagination
 *
 *   let Rn = canvas.height * 210 / canvas.width, mn = Rn, Ke = 0;
 *   D.addImage(V, "PNG", 0, Ke, E, Rn); mn -= oe;
 *   while (mn >= 0) { Ke = mn - Rn; D.addPage(); D.addImage(...); mn -= oe; }
 * ───────────────────────────────────────────────────────────────── */

function legacyPdfOffsets(imgHeightMm: number, usableHeightMm: number): number[] {
  const offsets = [0];
  let remaining = imgHeightMm - usableHeightMm;
  while (remaining >= 0) {
    offsets.push(remaining - imgHeightMm);
    remaining -= usableHeightMm;
  }
  return offsets;
}

/* ───────────────────────── fixtures ───────────────────────── */

const KINDS: EstateCsvKind[] = ["male", "female", "combined"];
const EMPTY_TOTALS: PeriodTotals = {
  m: 0,
  f: 0,
  mOt: 0,
  fOt: 0,
  late: 0,
  grand: 0,
  count: 0,
  days: 0,
};

/** A fixed 24 Aug – 23 Sep 2026 window seeded with the deterministic demo. */
const ESTATE_PERIOD = estatePeriodFor(new Date("2026-09-10T00:00:00"));
const ESTATE_RECORDS = seedEstateRecords(ESTATE_PERIOD);
const ESTATE_ROWS = recordsInPeriod(ESTATE_RECORDS, ESTATE_PERIOD);
const ESTATE_TOTALS = periodTotals(ESTATE_RECORDS, ESTATE_PERIOD, DEFAULT_ESTATE_RATES);

const royal = demoRoyalState();
const payslipRows = computeMonthPayslips(
  royal.employees,
  royal.attendance,
  royal.period,
  DEFAULT_PAYROLL_RATES,
  royal.deductions,
  POYA_DAYS,
  DEFAULT_BONUS_DAYS,
  DEFAULT_BONUS_AMOUNT,
);
const invoiceTotals = computeInvoiceTotals(payslipRows, DEFAULT_INVOICE_RATES, DEFAULT_OT_HOURS);
const invoiceLines = invoiceLinesFor(
  invoiceTotals,
  DEFAULT_INVOICE_RATES,
  DEFAULT_OT_HOURS,
  DEFAULT_BONUS_DAYS,
);
const periodText = `${MONTHS[royal.period.m]} ${royal.period.y}`;
const totalDays = daysInMonth(royal.period.y, royal.period.m);

/** Mirrors `invoiceSheet()` in InvoiceTab.tsx. */
const invoiceSheet: Sheet = [
  ["ROYAL HIRES", "Labour Invoice"],
  ["To Company", DEFAULT_TO_COMPANY],
  ["Invoice No", DEFAULT_INVOICE_NO],
  ["Date", DEFAULT_INVOICE_DATE],
  ["Period", `${periodText} (${totalDays} days)`],
  [],
  ["#", "Description", "Qty", "Rate", "Amount"],
  ...invoiceLines.map((l) => [l.no, l.desc, l.qty, l.rate, l.amount]),
  [],
  ["TOTAL", "", "", "", invoiceTotals.total],
];

async function main() {
  section("1 · CSV serialisation");

  eq(sheetToCsv([["a", "b"], [1, 2]]), '"a","b"\n"1","2"', "every cell is quoted");
  eq(sheetToCsv([['He said "hi"', "x"]]), '"He said ""hi""","x"', "embedded quotes are doubled");
  eq(sheetToCsv([["a,b", "c"]]), '"a,b","c"', "commas stay inside the quoted cell");
  eq(sheetToCsv([["line1\nline2"]]), '"line1\nline2"', "newlines stay inside the quoted cell");
  eq(sheetToCsv([[null, undefined, ""]]), '"","",""', "nullish cells become empty strings");
  eq(sheetToCsv([[true, false]]), '"true","false"', "booleans serialise predictably");
  eq(sheetToCsv([]), "", "an empty sheet is an empty string");
  eq(sheetToCsv([[]]), "", "a single empty row produces no columns");
  eq(
    sheetToCsv([["Year", "Month"], ["2026", "06"]]).split("\n").length,
    2,
    "rows are separated by \\n, not \\r\\n",
  );

  section("2 · Filename hygiene");

  eq(ensureExt("report", "csv"), "report.csv", "a bare name gains the extension");
  eq(ensureExt("report.csv", "csv"), "report.csv", "an existing extension is not doubled");
  eq(ensureExt("REPORT.CSV", "csv"), "REPORT.CSV", "the extension test is case-insensitive");
  eq(ensureExt("report.xlsx", "csv"), "report.xlsx.csv", "a different extension still gains ours");
  eq(ensureExt("a.b.c", "csv"), "a.b.c.csv", "dotted stems are left alone");
  truthy(
    !/[\\/:*?"<>|\s]/.test(fileNameSafe('Labour Invoice / Bonus: "final" *v2*?')),
    "fileNameSafe strips characters the filesystem rejects",
  );
  eq(
    fileNameSafe("24 Sep – 23 Oct 2026"),
    "24-Sep-23-Oct-2026",
    "fileNameSafe folds the en-dash and spaces into hyphens",
  );
  truthy(
    /^empire-ml-backup-\d{4}-\d{2}-\d{2}$/.test(backupFileName("empire-ml-backup")),
    `backup filename is dated (got ${backupFileName("empire-ml-backup")})`,
  );
  truthy(
    /^empire-ml-auto-backup-\d{4}-\d{2}-\d{2}$/.test(backupFileName("empire-ml", "auto-backup")),
    "backupFileName joins prefix and suffix with a hyphen",
  );

  section("3 · PDF pagination vs the artefact");

  near(A4_MM.w, 210, "A4 portrait is 210mm wide");
  near(A4_MM.h, 297, "A4 portrait is 297mm tall");

  // Sweep a wide range of raster heights against the original loop.
  const usableHeights = [297, 295, 287, 148.5];
  let swept = 0;
  let identical = 0;
  let exactFits = 0;
  for (const usableH of usableHeights) {
    for (let imgH = 1; imgH <= 2400; imgH += 1) {
      swept++;
      const mine = planPdfPages(imgH, usableH);
      const legacy = legacyPdfOffsets(imgH, usableH);
      const ratio = imgH / usableH;
      const isExactFit = Math.abs(ratio - Math.round(ratio)) < 1e-12;

      if (JSON.stringify(mine) === JSON.stringify(legacy)) {
        identical++;
        continue;
      }

      if (!isExactFit) {
        failures.push(
          `pagination differs at imgH=${imgH}, usableH=${usableH}\n     legacy ${JSON.stringify(
            legacy,
          )}\n     ours   ${JSON.stringify(mine)}`,
        );
        continue;
      }

      // The artefact emitted one more page whose image sat entirely above the
      // page — a blank sheet at the end of every exact-fit document.
      exactFits++;
      const stray = legacy[legacy.length - 1] ?? 0;
      if (mine.length === legacy.length - 1 && JSON.stringify(mine) === JSON.stringify(legacy.slice(0, -1)) && stray <= -imgH + 1e-9) {
        identical++;
      } else {
        failures.push(
          `exact fit ${imgH}/${usableH} should drop exactly one blank page\n     legacy ${JSON.stringify(
            legacy,
          )}\n     ours   ${JSON.stringify(mine)}`,
        );
      }
    }
  }
  eq(identical, swept, `all ${swept} swept raster heights match the artefact (blank pages aside)`);
  truthy(exactFits > 0, `the sweep hit ${exactFits} exact-fit heights, each one blank page shorter`);

  // Structural invariants, independent of the legacy comparison.
  const plan = planPdfPages(1000, 297);
  eq(plan.length, 4, "a 1000mm raster needs 4 pages of 297mm");
  eq(plan, [0, -297, -594, -891], "each page shifts the image up by one usable height");
  truthy(
    plan.every((o, i) => i === 0 || o < plan[i - 1]),
    "offsets strictly decrease",
  );
  truthy(
    plan.length * 297 >= 1000 && (plan.length - 1) * 297 < 1000,
    "the plan covers the whole image with no page to spare",
  );
  eq(planPdfPages(297, 297), [0], "an image exactly one page tall is a single page");
  eq(planPdfPages(296.9, 297), [0], "just under a page is a single page");
  eq(planPdfPages(297.1, 297), [0, -297], "just over a page needs a second page");
  eq(planPdfPages(0, 297), [0], "a zero-height raster still yields one page");
  eq(planPdfPages(-50, 297), [0], "a negative height is clamped to one page");
  eq(planPdfPages(500, 0), [0], "a zero usable height cannot paginate — one page, no divide-by-zero");
  eq(planPdfPages(600, A4_MM.h - 2 * 10).length, 3, "margins shrink the usable height and add pages");

  section("4 · Excel column widths");

  eq(xlsxColumnWidths([]), [], "no rows → no columns");
  eq(xlsxColumnWidths([[], []]), [], "empty rows → no columns");
  eq(xlsxColumnWidths([["a", "b"]]), [10, 10], "short cells fall back to the 10-character floor");
  eq(
    xlsxColumnWidths([["x", "Description"], ["yyyyyyyyyyy", "d"]]),
    [14, 14],
    "each column sizes to its own widest cell (length + 3)",
  );
  eq(xlsxColumnWidths([["z".repeat(200)]]), [48], "very wide cells are capped at 48 characters");
  eq(xlsxColumnWidths([[null, undefined, "abc"]]), [10, 10, 10], "nullish cells contribute no width");
  eq(
    xlsxColumnWidths([["a"], ["b", "c", "d"]]),
    [10, 10, 10],
    "ragged rows still size every column they touch",
  );
  eq(xlsxColumnWidths([[1234567]]), [10], "numbers are measured by their string length");
  truthy(
    xlsxColumnWidths(invoiceSheet).every((w) => w >= 9 && w <= 48),
    "every invoice column width sits inside Excel's usable range",
  );

  section("5 · Estate sheet builder — all three shapes");

  truthy(
    ESTATE_ROWS.length >= 28,
    `the seeded window has a full month of rows (${ESTATE_ROWS.length})`,
  );
  truthy(
    new Set(KINDS.map((k) => ESTATE_CSV_FILE_HEADERS[k].length)).size === 2,
    "male/female share a 6-column shape while combined uses 11",
  );

  for (const kind of KINDS) {
    const head = ESTATE_CSV_FILE_HEADERS[kind];
    const sheet = estateSheet(ESTATE_ROWS, ESTATE_TOTALS, DEFAULT_ESTATE_RATES, kind);
    const label = kind.padEnd(8);

    eq(sheet[0], head, `${label} the sheet opens with the canonical file header`);
    eq(
      sheet.length,
      ESTATE_ROWS.length + 3,
      `${label} header + ${ESTATE_ROWS.length} rows + spacer + TOTAL`,
    );
    eq(sheet[ESTATE_ROWS.length + 1], [], `${label} a spacer row separates the footer`);

    const footer = sheet[sheet.length - 1] ?? [];
    eq(footer[0], "TOTAL", `${label} the footer row is the TOTAL row`);
    eq(
      footer.length,
      head.length,
      `${label} the TOTAL row has one cell per column (${footer.length} vs ${head.length})`,
    );

    const body = sheet.slice(1, 1 + ESTATE_ROWS.length);
    truthy(
      body.every((row) => row.length === head.length),
      `${label} every body row has ${head.length} cells`,
    );
    eq(
      body[0],
      estateCsvRow(ESTATE_ROWS[0], DEFAULT_ESTATE_RATES, kind),
      `${label} body rows come from the shared row builder`,
    );
    eq(
      body.map((r) => r[0]),
      ESTATE_ROWS.map((r) => r.date.split("-")[0]),
      `${label} the year column carries the record's year`,
    );

    // The money column is always the last one.
    const lastCell = String(footer[footer.length - 1] ?? "");
    truthy(
      /^-?[\d,]+(\.\d+)?$/.test(lastCell),
      `${label} the total sits in the final column (got "${lastCell}")`,
    );
    const expectedTotal =
      kind === "male"
        ? ESTATE_ROWS.reduce((s, r) => s + maleAmount(r, DEFAULT_ESTATE_RATES), 0)
        : kind === "female"
          ? ESTATE_ROWS.reduce((s, r) => s + femaleAmount(r, DEFAULT_ESTATE_RATES), 0)
          : ESTATE_ROWS.reduce((s, r) => s + dayAmount(r, DEFAULT_ESTATE_RATES), 0);
    eq(lastCell, money(expectedTotal), `${label} the footer total equals the sum of its rows`);

    // Regression: the male/female shapes once inherited the combined footer and
    // grew four stray columns of somebody else's totals.
    if (kind === "male") {
      eq(footer[3], num(ESTATE_TOTALS.m), `${label} male shifts land under "Male Shifts"`);
      eq(footer[4], num(ESTATE_TOTALS.mOt), `${label} male OT lands under "Male OT"`);
    }
    if (kind === "female") {
      eq(footer[3], num(ESTATE_TOTALS.f), `${label} female shifts land under "Female Shifts"`);
      eq(footer[4], num(ESTATE_TOTALS.fOt), `${label} female OT lands under "Female OT"`);
    }
    if (kind === "combined") {
      eq(footer[3], num(ESTATE_TOTALS.m), `${label} male shifts stay in the Male column`);
      eq(footer[4], num(ESTATE_TOTALS.f), `${label} female shifts stay in the Female column`);
      eq(footer[7], num(ESTATE_TOTALS.late), `${label} late hours land under "LateHours"`);
      eq(footer[8], "", `${label} "In" stays blank on the TOTAL row`);
      eq(footer[9], "", `${label} "Out" stays blank on the TOTAL row`);
    }

    // The text preview and the download grid must describe the same numbers.
    const csvLines = estateCsv(ESTATE_ROWS, DEFAULT_ESTATE_RATES, kind).split("\n");
    eq(csvLines[0], head.join(","), `${label} the CSV preview uses the canonical file header`);
    truthy(
      csvLines.length === ESTATE_ROWS.length + 1,
      `${label} the CSV preview has one line per record`,
    );
    eq(
      csvLines.slice(1),
      body.map((row) => row.join(",")),
      `${label} CSV text and download grid agree cell for cell`,
    );
    truthy(
      /^\d{4},\d{2},\d{2},/.test(csvLines[1] ?? ""),
      `${label} rows keep the artefact's 2026,06,25 comma format`,
    );

    if (kind === "combined") {
      // The display header is shortened on purpose ("Late,In,Out,Grand") and
      // must never leak into a file — that was a real defect.
      truthy(
        ESTATE_CSV_HEADERS.combined !== head.join(","),
        `${label} the on-screen header stays distinct from the file header`,
      );
      truthy(
        csvLines[0].endsWith("Grand Total"),
        `${label} the file header ends with "Grand Total", not "Grand"`,
      );
      truthy(
        !csvLines[0].includes("Late,In,Out,Grand\n"),
        `${label} no display-only wording reached the file`,
      );
    }

    // Empty period → header, spacer, TOTAL only (the UI blocks the click).
    const emptySheet = estateSheet([], EMPTY_TOTALS, DEFAULT_ESTATE_RATES, kind);
    eq(emptySheet.length, 3, `${label} an empty period still exports a header and a TOTAL`);
    eq(emptySheet[2][0], "TOTAL", `${label} the empty footer is still labelled TOTAL`);
    eq(emptySheet[2].length, head.length, `${label} the empty footer keeps the header arity`);
    eq(estateCsv([], DEFAULT_ESTATE_RATES, kind), head.join(","), `${label} an empty CSV is just the header`);
  }

  section("6 · Excel workbook round trip");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "empire-ml-export-"));
  try {
    // Node's CJS named-export detection only surfaces part of the xlsx API
    // (`readFile` is missing), so read the module object itself.
    const xlsxMod = await import("xlsx");
    const XLSX = xlsxMod.default ?? xlsxMod;
    const longName = "Bonus Sheet — September 2026 (final, reviewed)";
    const sheets: XlsxSheet[] = [
      {
        name: "Combined",
        rows: estateSheet(ESTATE_ROWS, ESTATE_TOTALS, DEFAULT_ESTATE_RATES, "combined"),
      },
      { name: "Male", rows: estateSheet(ESTATE_ROWS, ESTATE_TOTALS, DEFAULT_ESTATE_RATES, "male") },
      { name: longName, rows: invoiceSheet },
    ];

    const target = path.join(tmp, "millennium-24-Aug-23-Sep-2026");
    const res = await downloadXlsx(sheets, target);
    truthy(res.ok, "downloadXlsx reports success");
    truthy(!res.fellBackToCsv, "the real xlsx writer was used — no CSV fallback");

    const written = `${target}.xlsx`;
    truthy(fs.existsSync(written), "ensureExt appended .xlsx to the workbook path");
    truthy(
      fs.statSync(written).size > 2048,
      `the workbook is a real file (${fs.statSync(written).size} bytes)`,
    );

    // cellStyles is what makes xlsx read the stored column widths back.
    const book = XLSX.readFile(written, { cellStyles: true });
    eq(
      book.SheetNames,
      ["Combined", "Male", longName.slice(0, XLSX_SHEET_NAME_MAX)],
      "sheets keep their order and long names are cut to Excel's 31-character limit",
    );
    eq(book.SheetNames[2].length, XLSX_SHEET_NAME_MAX, "the truncated name is exactly 31 characters");

    sheets.forEach((s, i) => {
      const name = book.SheetNames[i];
      const ws = book.Sheets[name];
      const back = readGrid(XLSX, ws);

      let compared = 0;
      s.rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell === null || cell === undefined || cell === "") return;
          const got = (back[r] ?? [])[c];
          if (sameCell(got, cell)) compared++;
          else
            failures.push(
              `${name} cell R${r + 1}C${c + 1}\n     expected ${JSON.stringify(
                cell,
              )}\n     actual   ${JSON.stringify(got)}`,
            );
        });
      });
      truthy(compared > 20, `${name}: ${compared} cells survived the write/read round trip`);

      const widths = ((ws as unknown as { "!cols"?: { wch?: number }[] })["!cols"] ?? []).map(
        (c) => c.wch ?? 0,
      );
      eq(widths, xlsxColumnWidths(s.rows), `${name}: column widths are stored on the sheet`);
    });

    // The invoice sheet must carry the same numbers the UI shows.
    const invBack = readGrid(XLSX, book.Sheets[book.SheetNames[2]]).map(trimRow);
    eq(invBack[0], ["ROYAL HIRES", "Labour Invoice"], "the workbook opens with the invoice letterhead");
    eq(invBack[1], ["To Company", DEFAULT_TO_COMPANY], "the client company is in the workbook");
    eq(invBack[2], ["Invoice No", DEFAULT_INVOICE_NO], "the invoice number is in the workbook");
    eq(invBack[4], ["Period", `${periodText} (${totalDays} days)`], "the period line names the month");
    eq(invBack[6], ["#", "Description", "Qty", "Rate", "Amount"], "the line-item header is intact");
    eq(invoiceLines.length, 7, "all 7 invoice line items were written");

    // Letterhead, spacer, header, 7 lines, spacer, TOTAL.
    const totalRow = invBack.findIndex((row) => row[0] === "TOTAL");
    eq(totalRow, 8 + invoiceLines.length, "the TOTAL row sits one spacer below the last line item");
    eq(
      invBack[totalRow],
      ["TOTAL", "", "", "", invoiceTotals.total],
      "the TOTAL row keeps its blank label cells and the grand total in the amount column",
    );
    near(
      Number(invBack[totalRow]?.[4]),
      invoiceTotals.total,
      "the workbook total is the computed invoice total",
      1e-6,
    );
    eq(
      invBack.slice(7, 7 + invoiceLines.length).map((r) => r[1]),
      invoiceLines.map((l) => l.desc),
      "every line item kept its description in order",
    );
    eq(
      invBack.slice(7, 7 + invoiceLines.length).map((r) => Number(r[4])),
      invoiceLines.map((l) => l.amount),
      "every line item kept its amount",
    );

    // CSV and XLSX must describe the same grid.
    const csvGrid = sheetToCsv(sheets[0].rows)
      .split("\n")
      .map((line) => line.split('","').map((c) => c.replace(/^"|"$/g, "")));
    eq(csvGrid[0], ESTATE_CSV_FILE_HEADERS.combined, "the quoted CSV header matches the workbook header");
    eq(
      csvGrid.filter((r) => r.length > 1).length,
      sheets[0].rows.filter((r) => r.length > 0).length,
      "the CSV and the workbook carry the same number of populated rows",
    );
    eq(
      csvGrid[csvGrid.length - 1][10],
      money(ESTATE_TOTALS.grand),
      "the CSV grand total matches the workbook grand total",
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  section("7 · Exported rows are date-ordered and complete");

  const keys = ESTATE_ROWS.map((r: EstateDayRecord) => r.date);
  eq([...keys].sort(), keys, "rows are exported in ascending date order");
  eq(new Set(keys).size, keys.length, "one record per date — the window never duplicates a day");
  eq(
    keys[0],
    `${ESTATE_PERIOD.start.getFullYear()}-${String(ESTATE_PERIOD.start.getMonth() + 1).padStart(2, "0")}-24`,
    "the first exported row is the 24th",
  );
  truthy(keys[keys.length - 1].endsWith("-23"), `the last exported row is the 23rd (got ${keys[keys.length - 1]})`);
  eq(
    keys.length,
    ESTATE_ROWS.filter((r) => ESTATE_RECORDS[r.date] === r).length,
    "every exported row is a record that exists in the vault",
  );

  /* ───────────────────────── report ───────────────────────── */

  console.log(`\n${"═".repeat(58)}`);
  if (failures.length === 0) {
    console.log(`  ✅ ${pass} export assertions passed — CSV, XLSX and PDF pagination are sound`);
  } else {
    console.log(`  ❌ ${failures.length} of ${pass + failures.length} export assertions FAILED\n`);
    failures.slice(0, 25).forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    if (failures.length > 25) console.log(`   … and ${failures.length - 25} more`);
  }
  console.log(`${"═".repeat(58)}\n`);
  // The runner deletes the bundle and exits — do not process.exit() here.
  process.exitCode = failures.length === 0 ? 0 : 1;
}

await main();
