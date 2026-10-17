/**
 * Empire ML — render smoke test
 *
 * Mounts the real <App /> in jsdom and drives it the way a user would:
 * load demo data, cycle a shift cell, walk every tab, open a payslip,
 * switch modules and fire a CSV export. This is the only test that would
 * catch a React runtime failure (hook order, null deref, bad portal).
 *
 * jsdom globals are installed by tests/run-render.mjs BEFORE this module is
 * imported, so nothing here may touch `document` at module scope.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StrictMode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "../src/App";
import { MONTHS, MONTHS_SHORT, buildMonth, estatePeriodFor, money, rupeesDot } from "../src/lib/calendar";
import { computeInvoiceTotals, computeMonthPayslips } from "../src/lib/payroll";
import { periodTotals } from "../src/lib/estate";
import { hydrateAppData } from "../src/lib/storage";
import { DEFAULT_ESTATE_RATES, DEFAULT_INVOICE_RATES } from "../src/data/defaults";
import type { AppData } from "../src/lib/types";

/* ───────────────────────── tiny harness ───────────────────────── */

let pass = 0;
const failures: string[] = [];

function eqNum(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) < 1e-9) pass++;
  else failures.push(`${label}\n     expected ${expected}\n     actual   ${actual}`);
}

function check(cond: boolean, label: string) {
  if (cond) pass++;
  else failures.push(label);
}

/** Case-insensitive: the UI mixes "TOTAL", "Total" and uppercase-via-CSS. */
function has(text: string, label?: string) {
  const hay = (document.body.textContent ?? "").toLowerCase();
  const found = hay.includes(text.toLowerCase());
  check(found, label ?? `expected the page to contain "${text}"`);
  return found;
}

function lacks(text: string, label?: string) {
  const hay = (document.body.textContent ?? "").toLowerCase();
  const absent = !hay.includes(text.toLowerCase());
  check(absent, label ?? `expected the page NOT to contain "${text}"`);
  return absent;
}

/** Find a form control by its visible <label> text, following htmlFor/id. */
function inputByLabel(text: string): HTMLInputElement | null {
  const labels = Array.from(document.querySelectorAll("label"));
  for (const l of labels) {
    if ((l.textContent ?? "").trim().toLowerCase() !== text.toLowerCase()) continue;
    const forId = l.getAttribute("for");
    if (forId) {
      const el = document.getElementById(forId);
      if (el instanceof HTMLInputElement) return el;
    }
    const nested = l.parentElement?.querySelector("input");
    if (nested) return nested;
  }
  return null;
}

/** React-controlled inputs ignore `.value =`; use the native setter + input event. */
async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick(30);
  });
}

/** Read the persisted vault, waiting out the debounced autosave. */
async function readVault(): Promise<{
  royal?: { employees?: { name: string }[]; attendance?: Record<string, Record<string, unknown>> };
  estate?: { records?: Record<string, { maleCount?: number }> };
  activeModule?: string;
} | null> {
  await settle(1100); // autosave is debounced ~700ms
  const raw = window.localStorage.getItem("empire_ml:data");
  return raw ? (JSON.parse(raw) as never) : null;
}

/**
 * AnimatePresence mode="wait" mounts the incoming view only after the exiting
 * one finishes, so waits must exceed the exit duration (0.2–0.3s).
 */
const SETTLE_TAB = 260;
const SETTLE_SWAP = 520;

function section(name: string) {
  console.log(`\n  ${name}`);
}

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));

async function settle(ms = 30) {
  await act(async () => {
    await tick(ms);
  });
}

/** First element whose own text content matches, searching deepest-first. */
function findByText(text: string, exact = false): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>("*"));
  // deepest matches first so we click the button, not its wrapper
  const needle = text.toLowerCase();
  const matches = all.filter((el) => {
    const t = (el.textContent ?? "").trim().toLowerCase();
    return exact ? t === needle : t.includes(needle);
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const da = depth(a);
    const db = depth(b);
    return db - da;
  });
  return matches[0];
}

function depth(el: Element): number {
  let n = 0;
  let p: Element | null = el;
  while (p && p.parentElement) {
    n++;
    p = p.parentElement;
  }
  return n;
}

async function click(el: Element | null, label: string) {
  if (!el) {
    failures.push(`could not click — element not found for "${label}"`);
    return false;
  }
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await tick(20);
  });
  return true;
}

async function clickText(text: string, exact = false) {
  return click(findByText(text, exact), text);
}

/**
 * Click a button inside the open dialog.
 *
 * Scoped deliberately: short labels like "Back" and "Cancel" are substrings of
 * unrelated copy on the page ("Restore last backup"), so an unscoped fuzzy
 * search clicks the wrong element.
 */
async function clickInDialog(text: string) {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) {
    failures.push(`no open dialog to click "${text}" in`);
    return false;
  }
  const needle = text.toLowerCase();
  const btn = Array.from(dialog.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim().toLowerCase() === needle,
  );
  return click(btn ?? null, `dialog button "${text}"`);
}

/**
 * Click a <button> whose label contains `needle`.
 *
 * Restricted to buttons on purpose: neighbouring badges and helper spans reuse
 * the same words ("Exists · will overwrite" sits right beside the Overwrite
 * button) and are deeper in the tree, so an unscoped search clicks the span.
 * Among matching buttons the shortest label wins as the most specific.
 */
async function clickButton(needle: string) {
  const want = needle.toLowerCase();
  const candidates = Array.from(document.querySelectorAll("button"))
    .filter((b) => !b.hasAttribute("disabled"))
    .filter((b) => (b.textContent ?? "").toLowerCase().includes(want))
    .sort((a, b) => (a.textContent ?? "").length - (b.textContent ?? "").length);
  return click(candidates[0] ?? null, `button "${needle}"`);
}

/** Click a control in the segmented view switcher by its exact label. */
async function clickSegment(label: string) {
  const needle = label.toLowerCase();
  const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (b) => (b.textContent ?? "").trim().toLowerCase() === needle,
  );
  return click(btn ?? null, `segment "${label}"`);
}

/** Click the tab labelled `text` inside a navigation landmark. */
async function clickTab(text: string) {
  const navs = Array.from(document.querySelectorAll<HTMLElement>('nav[aria-label="Primary"]'));
  for (const nav of navs) {
    const btn = Array.from(nav.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").trim().toLowerCase().includes(text.toLowerCase()),
    );
    if (btn) {
      await click(btn, `tab ${text}`);
      return true;
    }
  }
  return clickText(text);
}

/* ───────────────────── dialog, chip and select helpers ───────────────────── */

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

/** Icon-only dialog controls are reachable by aria-label. */
async function clickDialogAria(label: string) {
  const btn = dialog()?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? null;
  return click(btn, `dialog control "${label}"`);
}

/** Find a <select> by its visible label, scoped to the open dialog. */
function selectInDialog(label: string): HTMLSelectElement | null {
  const scope = dialog();
  if (!scope) return null;
  for (const l of Array.from(scope.querySelectorAll("label"))) {
    if ((l.textContent ?? "").trim().toLowerCase() !== label.toLowerCase()) continue;
    const forId = l.getAttribute("for");
    const el = forId ? document.getElementById(forId) : l.parentElement?.querySelector("select");
    if (el instanceof HTMLSelectElement) return el;
  }
  return null;
}

/** React-controlled <select>: native setter + change event. */
async function chooseOption(sel: HTMLSelectElement, value: string | number) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(sel, String(value));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await tick(30);
  });
}

/**
 * The roster's filter chips.
 *
 * Scoped to the "Filter staff" group on purpose: an unscoped text search for
 * "Bonus" matches the module switcher, whose subtitle reads
 * "Payroll · Bonus · Invoice".
 */
function chip(label: string): HTMLButtonElement | null {
  const want = label.toLowerCase();
  const row = document.querySelector<HTMLElement>('[aria-label="Filter staff"]');
  return (
    Array.from(row?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((b) =>
      (b.textContent ?? "").toLowerCase().includes(want),
    ) ?? null
  );
}

async function clickChip(label: string) {
  return click(chip(label), `filter chip "${label}"`);
}

/** The count badge inside a chip ("♀ Female" + <span class="tnum">3</span>). */
function chipCount(label: string): number {
  return Number(chip(label)?.querySelector(".tnum")?.textContent ?? "-1");
}

/** Every staff card exposes a Select/Deselect control carrying the name. */
function visibleStaff(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      'button[aria-label^="Select "], button[aria-label^="Deselect "]',
    ),
  ).map((b) => (b.getAttribute("aria-label") ?? "").replace(/^(Deselect|Select) /, ""));
}

/** Hand a File to the hidden <input type="file"> and fire change. */
async function handFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await tick(60);
  });
}

/** The Royal period bar — the button that summarises the month. */
function royalPeriodBar(): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll("button")).find((b) => {
      const t = b.textContent ?? "";
      return /shifts ·/.test(t) && /\d+ days/.test(t);
    }) ?? null
  );
}

/** Read the whole vault as a typed AppData, waiting out the debounced save. */
async function vaultData(): Promise<AppData | null> {
  await settle(1100);
  const raw = window.localStorage.getItem("empire_ml:data");
  return raw ? hydrateAppData(JSON.parse(raw)) : null;
}

/** A settings panel, found by its heading. */
function panelByTitle(title: string): HTMLElement | null {
  const want = title.toLowerCase();
  const heading = Array.from(document.querySelectorAll("h2, h3")).find(
    (h) => (h.textContent ?? "").trim().toLowerCase() === want,
  );
  if (!heading) return null;
  return (heading.closest("section") ??
    heading.parentElement?.parentElement ??
    null) as HTMLElement | null;
}

/** A labelled input inside one panel — the same label repeats across panels. */
function inputInPanel(panelTitle: string, label: string): HTMLInputElement | null {
  const panel = panelByTitle(panelTitle);
  if (!panel) return null;
  for (const l of Array.from(panel.querySelectorAll("label"))) {
    if ((l.textContent ?? "").trim().toLowerCase() !== label.toLowerCase()) continue;
    const forId = l.getAttribute("for");
    const el = forId ? document.getElementById(forId) : l.parentElement?.querySelector("input");
    if (el instanceof HTMLInputElement) return el;
  }
  return null;
}

async function pressKey(key: string, init: { shiftKey?: boolean } = {}) {
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
    await tick(30);
  });
}

/** Independently derived from the DOM — deliberately not the app's own list. */
function dialogFocusables(): HTMLElement[] {
  const d = dialog();
  if (!d) return [];
  return Array.from(
    d.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    ),
  );
}

/** Keeps the final vault read referenced even if the asserts above change. */
function truthyUnusedGuard(v: unknown): void {
  if (!v) failures.push("the vault was unreadable at the end of the run");
  else pass++;
}

function describeActive(): string {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return "nothing";
  return `<${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? ` aria-label="${el.getAttribute("aria-label")}"` : ""}${el.textContent ? ` "${el.textContent.trim().slice(0, 24)}"` : ""}>`;
}

/** Switch the workspace to the other module. */
async function switchModule(to: "Royal Hires" | "Millennium Estate") {
  const from = to === "Royal Hires" ? "Millennium Estate" : "Royal Hires";
  const trigger = Array.from(document.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(from),
  );
  await click(trigger ?? null, `module switcher (→ ${to})`);
  await settle(180);
  await clickText(to);
  await settle(SETTLE_SWAP);
}

/* ───────────────────────── export capture ───────────────────────── */

const captured: { blob: Blob | null; name: string } = { blob: null, name: "" };

/** Read the capture through a call boundary so TS keeps the `Blob | null` type. */
function grabBlob(): Blob | null {
  return captured.blob;
}
function grabName(): string {
  return captured.name;
}

function installExportStubs() {
  const w = window as unknown as {
    scrollTo: () => void;
    print: () => void;
    URL: { createObjectURL: (b: Blob) => string; revokeObjectURL: () => void };
  };
  w.scrollTo = () => {};
  w.print = () => {};
  w.URL.createObjectURL = (b: Blob) => {
    captured.blob = b;
    return "blob:stub";
  };
  w.URL.revokeObjectURL = () => {};
  // jsdom anchors refuse to navigate; swallow the download click
  Object.defineProperty(HTMLAnchorElement.prototype, "click", {
    value: function (this: HTMLAnchorElement) {
      captured.name = this.download || captured.name;
    },
    writable: true,
    configurable: true,
  });
}

/* ═════════════════════════════════════════════════════════════
 * The test itself
 * ═════════════════════════════════════════════════════════════ */

export async function main() {
  installExportStubs();

  const container = document.createElement("div");
  container.id = "root";
  document.body.appendChild(container);

  let root: Root | null = null;

  section("1 · Mount");
  try {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
      await tick(40);
    });
    check(true, "<App /> mounts without throwing");
  } catch (err) {
    failures.push(`mount threw: ${(err as Error).stack ?? err}`);
    report(root, container);
    return;
  }

  await settle(80);

  check((container.textContent ?? "").length > 200, "the shell renders real content");
  has("Empire ML", "brand name is in the top bar");
  has("Royal Hires", "module switcher shows the Payroll workspace");

  section("2 · First run");
  // A blank vault opens the welcome sheet offering demo data.
  const sawWelcome = has("Start your payroll workspace", "welcome sheet appears on a blank vault");
  check(!!findByText("Roster is empty") || sawWelcome, "blank roster is communicated");

  section("3 · Load demo data");
  const clicked = (await clickText("Load demo workspace")) || (await clickText("Load demo data"));
  check(clicked, "found a way to load the demo workspace");
  await settle(120);

  has("Kamal Perera", "demo employee 1 is on the roster");
  has("Nimali Fernando", "demo employee 2 is on the roster");
  has("Dilani Rathnayake", "demo employee 6 is on the roster");
  has("199012345678", "NIC data survived the round trip");

  section("4 · Attendance");
  const cellsBefore = document.querySelectorAll('[aria-pressed]').length;
  check(cellsBefore > 20, `attendance cells rendered (${cellsBefore} pressable controls)`);

  // Tap a shift cell and confirm the tap cycle mutates state.
  const cell = Array.from(document.querySelectorAll<HTMLElement>('button[aria-pressed="false"]')).find(
    (b) => (b.getAttribute("aria-label") ?? "").match(/^(Day \d+: )?OFF$/),
  );
  const netBefore = document.body.textContent ?? "";
  if (cell) {
    const label = cell.getAttribute("aria-label") ?? "";
    await click(cell, `shift cell ${label}`);
    await settle(90);
    const marked = cell.getAttribute("aria-pressed") === "true";
    check(
      marked || (document.body.textContent ?? "") !== netBefore,
      "tapping a shift cell marks it",
    );

    // The toast offers Undo, and the top bar exposes it once history exists.
    has("Undo", "an undo affordance is offered after a mutation");
    const undoBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => (b.getAttribute("title") ?? "") === "Undo the last change",
    );
    check(!!undoBtn, "the top-bar Undo control appears once there is history");
    if (undoBtn) {
      await click(undoBtn, "top-bar undo");
      await settle(120);
      check(
        cell.getAttribute("aria-pressed") === "false" || !marked,
        "Undo reverts the shift mark",
      );
    }
  } else {
    failures.push("no OFF shift cell found to tap");
  }

  has("Tap a cell to cycle", "the tap-to-cycle affordance is explained");

  section("4b · Bulk marking");
  const vaultBefore = await readVault();
  const shiftsBefore = Object.values(vaultBefore?.royal?.attendance ?? {}).reduce(
    (n, days) => n + Object.keys(days ?? {}).length,
    0,
  );
  await clickText("Mark weekdays D");
  await settle(160);
  const vaultAfterBulk = await readVault();
  const shiftsAfter = Object.values(vaultAfterBulk?.royal?.attendance ?? {}).reduce(
    (n, days) => n + Object.keys(days ?? {}).length,
    0,
  );
  check(
    shiftsAfter > shiftsBefore,
    `"Mark weekdays D" bulk-fills the month (${shiftsBefore} → ${shiftsAfter} marked days)`,
  );
  has("staff", "the bulk action reports how many staff it touched");

  section("5 · Today & Grid views");
  await clickSegment("Today");
  await settle(SETTLE_TAB);
  const sawToday = has("Marking date", "Today view exposes its date picker");
  check(sawToday || (document.body.textContent ?? "").includes("Night"), "Today view renders shift actions");

  await clickSegment("Grid");
  await settle(SETTLE_TAB);
  check(
    document.querySelectorAll("table").length > 0,
    "Grid view renders a real table",
  );
  check(
    document.querySelectorAll(".freeze-col").length > 0,
    "Grid view freezes the staff column",
  );

  await clickSegment("Cards");
  await settle(SETTLE_TAB);

  section("6 · Payroll");
  await clickTab("Payroll");
  await settle(SETTLE_TAB);
  has("Payslips", "payroll tab lists payslips");
  has("Net payable", "payroll surfaces net payable");
  has("Gross", "payroll surfaces gross earnings");

  await clickSegment("Week wise");
  await settle(180);
  has("never pay the attendance bonus", "week mode explains bonus suppression");
  await clickSegment("Month wise");
  await settle(180);

  section("7 · Payslip sheet");
  await clickText("View payslip");
  await settle(SETTLE_SWAP);
  const sawSlip = has("Salary Slip");
  check(sawSlip, "payslip sheet opens with an earnings breakdown");
  has("Gross Earnings", "payslip shows gross earnings");
  has("Deductions", "payslip shows deductions");
  has("Net Payable", "payslip shows net payable");

  // deduction editing must flow straight into the document
  const mealInput = inputByLabel("Meal");
  check(!!mealInput, "the Meal deduction input is reachable by its label");
  if (mealInput) {
    await typeInto(mealInput, "1500");
    await settle(80);
    check(mealInput.value === "1500", "editing a deduction sticks");
    has("1,500", "the edited deduction flows into the document total");
  }

  await click(
    document.querySelector('button[aria-label="Close dialog"]'),
    "close payslip",
  );
  await settle(SETTLE_SWAP);

  section("8 · Invoice");
  await clickTab("Invoice");
  await settle(SETTLE_TAB);
  has("Week days Shift", "invoice line 1");
  has("Saturday Shift", "invoice line 2");
  has("Weekday N/Day OT", "invoice line 3 (derived OT)");
  has("Saturday OT", "invoice line 4 (derived OT)");
  has("Sunday / Poya OT", "invoice line 5 (derived OT)");
  has("Female Night Allowance", "invoice line 6");
  has("Attendance Bonus", "invoice line 7");
  has("Total", "invoice total row");
  has("ABC Manufacturing Pvt Ltd", "invoice carries the default client company");
  has("RH-INV-2026-010", "invoice carries the default invoice number");

  await clickSegment("Bonus Sheet");
  await settle(SETTLE_TAB);
  has("Bonus Sheet", "bonus sheet document renders");
  has("Working days", "bonus sheet lists working days");

  await clickSegment("Labour Invoice");
  await settle(SETTLE_TAB);

  section("9 · CSV export through the UI");
  captured.blob = null;
  captured.name = "";
  await clickText("Download as CSV instead");
  await settle(220);
  const invoiceBlob = grabBlob();
  check(invoiceBlob !== null, "clicking export produced a Blob");
  if (invoiceBlob) {
    const blob = invoiceBlob;
    const text = await blob.text();
    const first = text.replace(/^\uFEFF/, "").split("\n")[0];
    check(
      first === '"ROYAL HIRES","Labour Invoice"' || first.includes("ROYAL HIRES"),
      `CSV starts with the invoice header row (got: ${first.slice(0, 60)})`,
    );
    check(text.includes("Week days Shift"), "CSV contains the invoice line items");
    check(text.includes("TOTAL"), "CSV contains the total row");
    check(grabName().endsWith(".csv"), `CSV filename ends in .csv (got ${grabName()})`);
  }

  section("10 · Settings");
  await clickTab("Settings");
  await settle(SETTLE_TAB);
  has("Payroll rates", "settings expose payroll rates");
  has("Invoice rates & billing rules", "settings expose invoice rates");
  has("Poya days", "settings expose the Poya calendar");
  has("Data vault", "settings expose the persistence vault");
  has("empire_ml:data", "settings name the main storage key");
  has("empire_ml:data:backup", "settings name the backup storage key");
  has("Auto backup weekly", "weekly auto-backup is toggleable");
  has("Delete all data & reset", "destructive reset is available");

  // Scroll-reveal is the defining behaviour of millennium-scroll-reveal.html.
  // It was built once and left unwired, so pin it down: panels must carry the
  // `.scroll-rise` class, and with no IntersectionObserver (jsdom) they must
  // fall back to immediately visible rather than staying at opacity 0.
  const risen = document.querySelectorAll(".scroll-rise");
  check(risen.length >= 4, `settings panels use scroll-reveal (${risen.length} found)`);
  check(
    Array.from(risen).every((el) => el.classList.contains("visible")),
    "scroll-reveal falls back to visible when IntersectionObserver is absent",
  );

  section("11 · Two-step destructive reset");
  await clickText("Delete all data & reset");
  await settle(SETTLE_SWAP);
  has("Are you absolutely sure?", "reset asks for confirmation first");
  has("permanently", "step one spells out the consequence");
  await clickInDialog("Yes, continue");
  await settle(SETTLE_SWAP);
  has("DELETE", "step two requires typing DELETE");

  has("to confirm", "reset escalates to a type-to-confirm step");
  const confirmInput = document.querySelector<HTMLInputElement>(
    'input[placeholder="DELETE"]',
  );
  check(!!confirmInput, "the DELETE guard input is present");
  const deleteBtn = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => (b.textContent ?? "").trim() === "Delete everything",
  );
  check(!!deleteBtn && deleteBtn.disabled, "Delete is disabled until DELETE is typed");
  if (confirmInput && deleteBtn) {
    await typeInto(confirmInput, "delete");
    await settle(90);
    check(deleteBtn.disabled, "lowercase 'delete' does NOT unlock the guard");
    await typeInto(confirmInput, "DELETE");
    await settle(90);
    check(!deleteBtn.disabled, "Delete unlocks once DELETE is typed exactly");
  }
  // back out — we do not actually want to wipe the vault mid-test
  await clickInDialog("Back");
  await settle(SETTLE_SWAP);
  await clickInDialog("Cancel");
  await settle(SETTLE_SWAP);
  lacks("Are you absolutely sure?", "reset dialog closes cleanly");

  section("12 · Module switch → Millennium Estate");
  const switcher = Array.from(document.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("Royal Hires"),
  );
  await click(switcher ?? null, "module switcher");
  await settle(180);
  has("Millennium Estate", "module menu offers the estate workspace");
  await clickText("Millennium Estate");
  await settle(SETTLE_SWAP);

  has("Estate Labour Overview", "estate dashboard renders");
  has("24–24", "estate explains the 24–24 window");
  has("Male shifts", "estate dashboard shows male shifts");
  has("Grand total", "estate dashboard shows the grand total");
  has("Days in period", "estate dashboard shows days in period");

  // The demo estate window is 24 Aug – 23 Sep and must report 31 real dates.
  check(
    /\d{2} [A-Z][a-z]{2} – \d{2} [A-Z][a-z]{2} \d{4}/.test(document.body.textContent ?? ""),
    "estate window label reads like '24 Sep – 23 Oct 2026'",
  );
  lacks("Sept", "no ICU-dependent 'Sept' abbreviation leaks into the label");
  has("Live", "the window containing today is flagged Live");

  section("13 · Estate entry form");
  await clickTab("Entry");
  await settle(SETTLE_TAB);
  has("Attendance", "estate entry tab renders");
  has("One record per date", "overwrite semantics are explained");
  has("Male count", "male count field");
  has("Female count", "female count field");
  has("Late hours", "late hours field");
  has("Day amount", "live day-amount preview");

  // The artefact's core rule: one record per date, and saving overwrites.
  const maleInput = document.querySelector<HTMLInputElement>(
    'input[aria-label="Male count"]',
  );
  check(!!maleInput, "the male count field is reachable");
  has("Exists · will overwrite", "a seeded date is flagged as existing, not new");
  if (maleInput) {
    await typeInto(maleInput, "9.5");
    await settle(140);
    check(maleInput.value === "9.5", "the 0.5-step count accepts a half shift");
    has("Overwrite", "the save button reflects that this date already exists");

    await clickButton("Overwrite");
    await settle(200);
    const vault = await readVault();
    const today = new Date();
    const tKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;
    eqNum(
      vault?.estate?.records?.[tKey]?.maleCount ?? -1,
      9.5,
      "overwriting persists to the vault under the same date key",
    );
    check(
      Object.keys(vault?.estate?.records ?? {}).length > 0,
      "the overwrite did not duplicate or drop the record set",
    );
  }

  section("14 · Estate summary & export");
  await clickTab("Summary");
  await settle(SETTLE_TAB);
  has("Summary", "summary tab renders");
  check(document.querySelectorAll("table").length > 0, "summary renders a table");
  has("Window comparison", "summary compares against the previous window");

  await clickTab("Export");
  await settle(SETTLE_TAB);
  has("Export CSV", "export tab renders");
  has("2026,06,25", "comma-format example is shown");
  has("Year,Month,Day,Male Shifts,Male OT,Male Amount", "male CSV header documented");

  captured.blob = null;
  captured.name = "";
  await clickText("Combined CSV");
  await settle(220);
  const estateBlob = grabBlob();
  check(estateBlob !== null, "estate CSV export produced a Blob");
  if (estateBlob) {
    const blob = estateBlob;
    const text = await blob.text();
    const lines = text.replace(/^\uFEFF/, "").split("\n");
    check(
      lines[0] === '"Year","Month","Day","Male","Female","MaleOT","FemaleOT","LateHours","In","Out","Grand Total"',
      `combined CSV header matches the source artefact (got: ${lines[0].slice(0, 80)})`,
    );
    check(lines.length > 2, `combined CSV has data rows (${lines.length - 1} lines)`);
    check(
      /"\d{4}","\d{2}","\d{2}"/.test(lines[1] ?? ""),
      "CSV rows use the Year,Month,Day comma format",
    );
    check(grabName().includes("millennium"), `filename is namespaced (got ${grabName()})`);

    // Regression: the appended TOTAL row once carried 10 cells against an
    // 11-column header, so the grand total slid under "Out". Assert every row
    // matches the header arity and the total lands in the last column.
    const cols = (line: string) => (line.match(/"/g)?.length ?? 0) / 2;
    const headerCols = cols(lines[0]);
    const nonEmpty = lines.filter((l) => l.trim() !== "");
    const ragged = nonEmpty.filter((l) => cols(l) !== headerCols);
    check(
      ragged.length === 0,
      `every CSV row has ${headerCols} columns (ragged: ${ragged.length})`,
    );
    const totalRow = nonEmpty[nonEmpty.length - 1] ?? "";
    check(totalRow.startsWith('"TOTAL"'), "the footer row is the TOTAL row");
    const totalCells = totalRow.split('","').map((c) => c.replace(/"/g, ""));
    check(
      totalCells.length === headerCols,
      `TOTAL row has one cell per column (got ${totalCells.length})`,
    );
    check(
      /^-?[\d,]+(\.\d+)?$/.test(totalCells[totalCells.length - 1] ?? ""),
      `the grand total sits in the final "Grand Total" column (got "${totalCells[totalCells.length - 1]}")`,
    );
    check(
      (totalCells[8] ?? "") === "" && (totalCells[9] ?? "") === "",
      "In/Out stay blank on the TOTAL row",
    );
  }

  section("15 · Estate rates");
  await clickTab("Rates");
  await settle(SETTLE_TAB);
  has("Rate card", "estate settings render the rate card");
  has("Male day", "male day rate is editable");
  has("Late deduction", "late deduction is editable");
  has("Stored, not used by the day formula", "unused night rates are honestly flagged");
  has("Formula", "formula reference is shown");
  check(
    document.querySelectorAll(".scroll-rise").length >= 4,
    "estate settings panels use scroll-reveal too",
  );

  section("16 · Persistence");
  const raw = window.localStorage.getItem("empire_ml:data");
  check(!!raw, "the vault was written to localStorage");
  if (raw) {
    const parsed = JSON.parse(raw) as {
      royal?: { employees?: unknown[] };
      estate?: { records?: Record<string, unknown> };
      activeModule?: string;
    };
    check((parsed.royal?.employees?.length ?? 0) === 6, "6 employees persisted");
    const estateCount = Object.keys(parsed.estate?.records ?? {}).length;
    check(
      estateCount === 30 || estateCount === 31,
      `every date in the 24–24 window was seeded (got ${estateCount})`,
    );
    check(parsed.activeModule === "estate", "active module persisted");
  }
  check(!!window.localStorage.getItem("empire_ml:data:backup"), "the backup key mirrors the vault");
  check(!!window.localStorage.getItem("empire_ml:meta"), "storage metadata was written");

  section("17 · Add staff");
  const switchBack = Array.from(document.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("Millennium Estate"),
  );
  await click(switchBack ?? null, "module switcher (back to payroll)");
  await settle(180);
  await clickText("Royal Hires");
  await settle(SETTLE_SWAP);
  // The workspace restores the tab it was left on (settings), so navigate back.
  await clickTab("Attendance");
  await settle(SETTLE_TAB);
  has("Tap a cell to cycle", "back on the payroll attendance tab");

  const before = await readVault();
  const headcountBefore = before?.royal?.employees?.length ?? 0;

  await clickButton("Add staff");
  await settle(SETTLE_SWAP);
  has("Add staff", "the add-staff sheet opens");

  const nameInput = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Kamal Perera"]');
  const nicInput = document.querySelector<HTMLInputElement>('input[placeholder="199012345678"]');
  check(!!nameInput && !!nicInput, "the add-staff form exposes name and NIC fields");
  if (nameInput && nicInput) {
    await typeInto(nameInput, "Test Worker");
    await typeInto(nicInput, "199187654321");
    await settle(120);
    await clickButton("Add employee");
    await settle(SETTLE_SWAP);
    has("Test Worker", "the new employee appears in the roster immediately");

    const after = await readVault();
    eqNum(
      after?.royal?.employees?.length ?? 0,
      headcountBefore + 1,
      `the roster grew by one and persisted (${headcountBefore} → ${after?.royal?.employees?.length ?? 0})`,
    );
    check(
      (after?.royal?.employees ?? []).some((e) => e.name === "Test Worker"),
      "the new employee is in the vault",
    );
  }

  section("18 · Period sheet");
  // The period bar is the only button that reports shifts and days together.
  const periodBar = royalPeriodBar();
  check(!!periodBar, "the period bar is a button that summarises the month");
  const barShifts = () => {
    const m = (periodBar?.textContent ?? "").match(/(\d+) shifts · (\d+) records/);
    return m ? { shifts: Number(m[1]), records: Number(m[2]) } : { shifts: -1, records: -1 };
  };
  const barMonth = () => (periodBar?.querySelector(".display")?.textContent ?? "").trim();

  const now = new Date();
  const thisMonth = MONTHS[now.getMonth()];
  const thisMonthLabel = `${thisMonth} ${now.getFullYear()}`;
  const thisMonthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  check(barMonth() === thisMonthLabel, `the bar opens on ${thisMonthLabel} (got "${barMonth()}")`);
  const shiftsThisMonth = barShifts().shifts;
  check(shiftsThisMonth > 0, `the demo month is populated (${shiftsThisMonth} shifts)`);

  await click(periodBar ?? null, "period bar");
  await settle(SETTLE_SWAP);
  has("Select Period", "the period sheet opens");
  has("Attendance, payroll and the client invoice all follow this month", "the sheet explains what the period drives");
  has("Day map", "the sheet previews the month day by day");
  has("weekdays", "the day map counts weekdays");
  has("Saturdays", "the day map counts Saturdays");
  has("Sundays", "the day map counts Sundays");
  has("Poya", "the day map counts Poya days");

  const monthHeading = () => {
    const d = dialog();
    const el = d
      ? Array.from(d.querySelectorAll<HTMLElement>(".display")).find((n) =>
          (MONTHS as readonly string[]).includes((n.textContent ?? "").trim()),
        )
      : null;
    return (el?.textContent ?? "").trim();
  };
  const sheetStamp = () => {
    const m = (dialog()?.textContent ?? "").match(/(\d{4}) · (\d+) days/);
    return m ? { y: Number(m[1]), days: Number(m[2]) } : { y: 0, days: 0 };
  };
  const dayCells = () => dialog()?.querySelectorAll("div[title]").length ?? 0;

  check(monthHeading() === thisMonth, `the sheet opens on the current month (${monthHeading()})`);
  eqNum(sheetStamp().days, thisMonthDays, `the sheet reports ${thisMonthDays} days for this month`);
  eqNum(dayCells(), thisMonthDays, "the day map draws exactly one cell per day");

  await clickDialogAria("Previous month");
  await settle(140);
  const lastMonth = MONTHS[(now.getMonth() + 11) % 12];
  check(monthHeading() === lastMonth, `Previous month lands on ${lastMonth} (got ${monthHeading()})`);
  const lastMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  eqNum(sheetStamp().days, lastMonthDays, `${lastMonth} is ${lastMonthDays} days long`);
  eqNum(dayCells(), lastMonthDays, "the day map redraws for the shorter month");

  await clickDialogAria("Next month");
  await settle(140);
  check(monthHeading() === thisMonth, "Next month walks back to where we started");

  const monthSel = selectInDialog("Month");
  const yearSel = selectInDialog("Year");
  check(!!monthSel && !!yearSel, "the sheet exposes month and year pickers");
  if (monthSel && yearSel) {
    await chooseOption(monthSel, 1); // February
    await settle(140);
    check(monthHeading() === "February", "the month picker drives the heading");
    await chooseOption(yearSel, 2028);
    await settle(140);
    eqNum(sheetStamp().days, 29, "February 2028 is a leap year — 29 days");
    eqNum(dayCells(), 29, "the day map draws 29 cells for a leap February");
    await chooseOption(yearSel, 2027);
    await settle(140);
    eqNum(sheetStamp().days, 28, "February 2027 is 28 days");

    await clickInDialog(`Jump to current month (${thisMonth} ${now.getFullYear()})`);
    await settle(160);
    check(monthHeading() === thisMonth, "Jump to current month returns to today's month");
    eqNum(sheetStamp().days, thisMonthDays, "and to today's day count");

    // Walk back one month and commit it — every surface must follow.
    await clickDialogAria("Previous month");
    await settle(140);
    const target = monthHeading();
    const targetYear = sheetStamp().y;
    await clickInDialog(`Apply ${target} ${targetYear}`);
    await settle(SETTLE_SWAP);
    check(!dialog(), "the sheet closes once the period is applied");
    check(
      barMonth() === `${target} ${targetYear}`,
      `the period bar now reads ${target} ${targetYear} (got "${barMonth()}")`,
    );
    eqNum(
      barShifts().shifts,
      0,
      "a month the demo never seeded reports zero shifts — the whole module follows the period",
    );
    const appliedVault = await readVault();
    const appliedPeriod = (appliedVault as unknown as { royal?: { period?: { y: number; m: number } } })
      ?.royal?.period;
    eqNum(appliedPeriod?.m ?? -1, (MONTHS as readonly string[]).indexOf(target), "the applied month persisted to the vault");
    eqNum(appliedPeriod?.y ?? -1, targetYear, "the applied year persisted to the vault");

    // Put the workspace back on the live month.
    await click(periodBar ?? null, "period bar (reopen)");
    await settle(SETTLE_SWAP);
    await clickInDialog(`Jump to current month (${thisMonth} ${now.getFullYear()})`);
    await settle(160);
    await clickInDialog(`Apply ${thisMonth} ${now.getFullYear()}`);
    await settle(SETTLE_SWAP);
    check(barMonth() === thisMonthLabel, "the workspace is back on the current month");
    eqNum(
      barShifts().shifts,
      shiftsThisMonth,
      "and the seeded attendance is visible again",
    );
  }
  if (dialog()) {
    await click(document.querySelector('button[aria-label="Close dialog"]'), "close the period sheet");
    await settle(SETTLE_SWAP);
  }
  check(!dialog(), "no dialog is left open before the roster is filtered");

  section("19 · Search & filter chips");
  const search = document.querySelector<HTMLInputElement>('input[aria-label="Search staff"]');
  check(!!search, "the roster exposes a search field");
  const roster = visibleStaff();
  check(roster.length >= 6, `the unfiltered roster lists everybody (${roster.length} cards)`);

  for (const label of ["All", "Male", "Female", "Bonus"]) {
    const badge = chipCount(label);
    check(badge >= 0, `the "${label}" chip carries a count badge`);
    await clickChip(label);
    // Employee cards exit over 0.32s; count them only once the exit is done,
    // otherwise the leaving cards are still in the DOM and inflate the tally.
    await settle(SETTLE_SWAP);
    const shown = visibleStaff();
    check(
      chip(label)?.getAttribute("aria-pressed") === "true",
      `the "${label}" chip announces itself as the active filter`,
    );
    eqNum(shown.length, badge, `the "${label}" chip's badge matches the roster it filters to`);
    if (label === "Female") {
      check(
        shown.every((n) => ["Nimali Fernando", "Kumari Jayasuriya", "Dilani Rathnayake"].includes(n)),
        "the Female chip shows only the women on the demo roster",
      );
    }
    if (label === "Male") {
      lacks("Nimali Fernando", "the Male chip hides the women");
    }
  }
  await clickChip("All");
  await settle(SETTLE_SWAP);
  eqNum(visibleStaff().length, roster.length, "All brings the whole roster back");

  if (search) {
    await typeInto(search, "kamal");
    await settle(SETTLE_SWAP);
    eqNum(visibleStaff().length, 1, "a name query narrows the roster to one card");
    has("Kamal Perera", "and it is the right card");
    lacks("Nimali Fernando", "everybody else is filtered out");

    await typeInto(search, "199578901234");
    await settle(SETTLE_SWAP);
    has("Nimali Fernando", "the NIC is searchable too");
    lacks("Kamal Perera", "the name query no longer applies");

    await typeInto(search, "zzzz-not-a-person");
    await settle(SETTLE_SWAP);
    has("No employees match that filter", "a dead-end search says so plainly");
    await clickButton("Reset filters");
    await settle(SETTLE_SWAP);
    eqNum(visibleStaff().length, roster.length, "Reset filters restores the full roster");
    check((search.value ?? "") === "", "and clears the search field");
  }

  section("20 · Excel export");
  await clickTab("Invoice");
  await settle(SETTLE_TAB);
  // xlsx detects Node's `fs` and writes to disk instead of downloading, so aim
  // the process at a scratch directory before clicking.
  const realCwd = process.cwd();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "empire-render-"));
  try {
    process.chdir(scratch);
    await clickButton("Excel");
    await settle(900);
    const written = fs.readdirSync(scratch);
    check(
      written.some((f) => f.endsWith(".xlsx")),
      `the Excel button wrote a workbook (${written.join(", ") || "nothing"})`,
    );
    check(
      written.some((f) => /^Labour_Invoice_.+\.xlsx$/.test(f)),
      `the workbook is named after the invoice and period (${written.join(", ")})`,
    );
    has("Excel saved", "the toast confirms the workbook");
  } finally {
    process.chdir(realCwd);
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  section("21 · Backup round trip");
  await clickTab("Settings");
  await settle(SETTLE_TAB);
  const vaultNow = await readVault();
  const headcountNow = vaultNow?.royal?.employees?.length ?? 0;
  check(headcountNow >= 7, `the roster still holds the added staffer (${headcountNow})`);

  captured.blob = null;
  captured.name = "";
  await clickButton("Export backup JSON");
  await settle(240);
  const backupBlob = grabBlob();
  check(backupBlob !== null, "Export backup JSON produced a Blob");
  check(
    /^empire-ml-backup-\d{4}-\d{2}-\d{2}\.json$/.test(grabName()),
    `the backup filename is dated (got ${grabName()})`,
  );
  const backupText = backupBlob ? await backupBlob.text() : "";
  const backupDoc = JSON.parse(backupText || "{}") as {
    exportedAt?: string;
    royal?: { employees?: { name: string }[] };
    estate?: { records?: Record<string, unknown> };
  };
  eqNum(
    backupDoc.royal?.employees?.length ?? 0,
    headcountNow,
    "the backup carries the whole roster",
  );
  check(typeof backupDoc.exportedAt === "string", "the backup is stamped with an export time");
  check(
    Object.keys(backupDoc.estate?.records ?? {}).length > 0,
    "one backup covers both modules — the estate records are in it too",
  );

  // Pick the input that belongs to the Import button — the sheet has only one,
  // but a bare querySelector would silently match any other file input.
  const importButton = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim() === "Import backup JSON",
  );
  const fileInput =
    importButton?.parentElement?.querySelector<HTMLInputElement>('input[type="file"]') ?? null;
  check(!!fileInput, "the import button owns a real file input");
  check(
    (fileInput?.getAttribute("accept") ?? "").includes(".json"),
    "the file input only offers JSON",
  );

  if (fileInput) {
    const renamed = JSON.parse(backupText) as { royal: { employees: { name: string }[] } };
    renamed.royal.employees[0].name = "Imported Worker";
    await handFile(
      fileInput,
      new File([JSON.stringify(renamed)], "backup.json", { type: "application/json" }),
    );
    await settle(360);
    has("Imported", "a successful import reports back through a toast");
    has("staff", "and says how many staff came across");
    const imported = await readVault();
    check(
      (imported?.royal?.employees ?? []).some((e) => e.name === "Imported Worker"),
      "the imported roster replaced the vault",
    );

    await handFile(
      fileInput,
      new File(['{"hello":"world"}'], "other.json", { type: "application/json" }),
    );
    await settle(340);
    has("Not an Empire ML backup", "a foreign JSON file is rejected with a clear message");
    const untouched = await readVault();
    check(
      (untouched?.royal?.employees ?? []).some((e) => e.name === "Imported Worker"),
      "a rejected import leaves the vault untouched",
    );

    const realError = console.error;
    let logged = 0;
    console.error = () => {
      logged++;
    };
    await handFile(fileInput, new File(["{not json"], "broken.json", { type: "application/json" }));
    await settle(340);
    console.error = realError;
    has("Failed to parse backup file", "corrupt JSON is reported, not thrown at the user");
    check(logged > 0, "and the parse failure is logged for diagnosis");

    // The import was undoable, so the roster name goes back.
    const undoImport = Array.from(document.querySelectorAll("button")).find(
      (b) => (b.getAttribute("title") ?? "") === "Undo the last change",
    );
    await click(undoImport ?? null, "undo the import");
    await settle(200);
    const reverted = await readVault();
    check(
      !(reverted?.royal?.employees ?? []).some((e) => e.name === "Imported Worker"),
      "Undo reverts the import",
    );
    check(
      (reverted?.royal?.employees ?? []).some((e) => e.name === "Kamal Perera"),
      "and the original roster is back",
    );

    await clickButton("Restore last backup");
    await settle(300);
    has("Backup restored", "the mirrored backup key can be restored on demand");
  }

  section("22 · Estate 24–24 navigation");
  const toEstate = Array.from(document.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("Royal Hires"),
  );
  await click(toEstate ?? null, "module switcher");
  await settle(180);
  await clickText("Millennium Estate");
  await settle(SETTLE_SWAP);
  // The estate workspace restores the tab it was left on (Rates), so navigate.
  await clickTab("Overview");
  await settle(SETTLE_TAB);
  has("Estate Labour Overview", "the estate dashboard renders");

  /** The 24–24 period bar: the flex row that holds both stepper buttons. */
  const estateBar = () =>
    document
      .querySelector('button[aria-label="Previous 24–24 period"]')
      ?.parentElement as HTMLElement | null;
  const windowLabel = () =>
    (estateBar()?.querySelector(".display")?.textContent ?? "").trim();
  // Read the stats element on its own: in the bar's concatenated text the
  // window year runs straight into the day count ("…2026" + "31 days…").
  const windowStats = () => {
    const t = (estateBar()?.querySelector(".tnum")?.textContent ?? "").trim();
    const m = t.match(/^(\d+) days · (\d+) logged/);
    return m ? { days: Number(m[1]), logged: Number(m[2]) } : { days: -1, logged: -1 };
  };
  // No \b here either — the badge text butts up against the year digits.
  const barIsLive = () => (estateBar()?.textContent ?? "").includes("Live");
  const anchorInVault = async () => {
    const v = (await readVault()) as unknown as { estate?: { periodAnchor?: string } };
    return v?.estate?.periodAnchor ?? "";
  };
  check(!!estateBar(), "the estate period bar is rendered with both steppers");

  const live = windowLabel();
  check(
    /^\d{2} [A-Z][a-z]{2} – \d{2} [A-Z][a-z]{2} \d{4}$/.test(live),
    `the live window reads like a 24–24 range (got "${live}")`,
  );
  check(barIsLive(), "the window holding today is flagged Live");
  const liveLogged = windowStats().logged;
  check(liveLogged > 0, `the seeded window has records (${liveLogged} logged)`);
  const liveDays = windowStats().days;
  check(
    liveDays >= 28 && liveDays <= 31,
    `the live window is 28–31 real calendar dates (got ${liveDays})`,
  );
  check(
    /^\d{4}-\d{2}-\d{2}$/.test(await anchorInVault()),
    `the anchor is a date key (got ${await anchorInVault()})`,
  );

  await click(
    document.querySelector('button[aria-label="Previous 24–24 period"]'),
    "previous 24–24 period",
  );
  await settle(260);
  const previous = windowLabel();
  check(previous !== live, `navigating back moves the window ("${live}" → "${previous}")`);
  check(!barIsLive(), "a window that does not hold today loses the Live badge");
  eqNum(windowStats().logged, 0, "the previous window holds no seeded records");
  const prevDays = windowStats().days;
  check(
    prevDays >= 28 && prevDays <= 31,
    `a 24–24 window is 28–31 real calendar dates (got ${prevDays})`,
  );
  check(
    /^\d{4}-\d{2}-24$/.test(await anchorInVault()),
    `stepping to a window anchors it on the 24th (got ${await anchorInVault()})`,
  );

  await click(
    document.querySelector('button[aria-label="Next 24–24 period"]'),
    "next 24–24 period (back)",
  );
  await settle(260);
  check(windowLabel() === live, "Next walks back into the live window");
  check(barIsLive(), "and the Live badge returns");
  eqNum(windowStats().logged, liveLogged, "with every seeded record intact");

  await click(
    document.querySelector('button[aria-label="Next 24–24 period"]'),
    "next 24–24 period (forward)",
  );
  await settle(260);
  const future = windowLabel();
  check(future !== live && future !== previous, `Next steps into a third window ("${future}")`);
  check(!barIsLive(), "a future window is not Live either");
  eqNum(windowStats().logged, 0, "the future window is empty");

  await clickButton("This month");
  await settle(280);
  check(windowLabel() === live, "This month snaps straight back to the live window");
  check(barIsLive(), "and it is flagged Live again");
  eqNum(windowStats().logged, liveLogged, "the records are still there");

  // Walking the window must never touch the data itself.
  const afterNav = await readVault();
  eqNum(
    Object.keys(afterNav?.estate?.records ?? {}).length,
    liveLogged,
    "navigating periods did not add or drop estate records",
  );

  section("23 · Dialog keyboard & naming");
  await switchModule("Royal Hires");
  await clickTab("Attendance");
  await settle(SETTLE_TAB);

  const trigger = royalPeriodBar();
  check(!!trigger, "the period bar is back to open a dialog from");
  if (trigger) trigger.focus();
  await click(trigger, "period bar (a11y)");
  await settle(SETTLE_SWAP + 120);

  const dlg = dialog();
  check(!!dlg, "the period sheet is a dialog");
  check(dlg?.getAttribute("aria-modal") === "true", "and it is marked modal");
  const namedBy = dlg?.getAttribute("aria-labelledby") ?? "";
  check(!!namedBy, "the dialog points at its own title for an accessible name");
  check(
    (document.getElementById(namedBy)?.textContent ?? "").trim() === "Select Period",
    `and that title is "Select Period" (got "${document.getElementById(namedBy)?.textContent ?? ""}")`,
  );
  check(
    !!dlg && dlg.contains(document.activeElement) && document.activeElement !== document.body,
    `focus moves into the dialog on open (active: ${describeActive()})`,
  );
  check(
    document.body.style.overflow === "hidden",
    "the page behind a modal is scroll-locked",
  );

  const items = dialogFocusables();
  check(items.length >= 5, `the sheet holds a keyboard route (${items.length} focusable controls)`);
  if (items.length >= 2) {
    const first = items[0];
    const last = items[items.length - 1];

    last.focus();
    await pressKey("Tab");
    check(
      document.activeElement === first,
      `Tab from the last control wraps to the first (went to ${describeActive()})`,
    );

    first.focus();
    await pressKey("Tab", { shiftKey: true });
    check(
      document.activeElement === last,
      `Shift+Tab from the first control wraps to the last (went to ${describeActive()})`,
    );
  }

  await pressKey("Escape");
  await settle(SETTLE_SWAP);
  check(!dialog(), "Escape closes the sheet");
  check(
    document.activeElement === trigger,
    `focus returns to the control that opened it (active: ${describeActive()})`,
  );
  check(document.body.style.overflow !== "hidden", "and the scroll lock is released");

  // The destructive flow is a bare sheet, so it has to name itself.
  await clickTab("Settings");
  await settle(SETTLE_TAB);
  await clickText("Delete all data & reset");
  await settle(SETTLE_SWAP + 120);
  check(
    dialog()?.getAttribute("aria-label") === "Are you absolutely sure?",
    `the bare confirm dialog carries an accessible name (got "${dialog()?.getAttribute("aria-label") ?? ""}")`,
  );
  check(
    !!dialog()?.contains(document.activeElement) && document.activeElement !== document.body,
    "focus moves into the destructive dialog too",
  );
  await clickInDialog("Yes, continue");
  await settle(SETTLE_SWAP + 120);
  const guardInput = document.querySelector<HTMLInputElement>('input[placeholder="DELETE"]');
  check(
    !!guardInput && document.activeElement === guardInput,
    `the type-to-confirm guard takes focus (active: ${describeActive()})`,
  );
  await pressKey("Escape");
  await settle(SETTLE_SWAP);
  check(!dialog(), "Escape abandons the destructive flow");
  check(
    !!(await vaultData())?.royal.employees.length,
    "and nothing was deleted",
  );

  section("24 · Rates drive every calculation");
  const invoiceTotalText = () => {
    const row = Array.from(document.querySelectorAll("table tr")).find((r) =>
      /^total/i.test((r.textContent ?? "").trim()),
    );
    return (row?.lastElementChild?.textContent ?? "").trim();
  };
  const totalsFor = (d: AppData) =>
    computeInvoiceTotals(
      computeMonthPayslips(
        d.royal.employees,
        d.royal.attendance,
        d.royal.period,
        d.royal.payrollRates,
        d.royal.deductions,
        d.royal.poyaDays,
        d.royal.bonusDays,
        d.royal.bonusAmount,
      ),
      d.royal.invoiceRates,
      d.royal.otHours,
    );

  await clickTab("Invoice");
  await settle(SETTLE_TAB);
  const dataBefore = await vaultData();
  check(!!dataBefore, "the vault is readable mid-session");
  const totalsBefore = totalsFor(dataBefore!);
  check(
    invoiceTotalText() === rupeesDot(totalsBefore.total),
    `the invoice on screen is the engine's total ("${invoiceTotalText()}" vs "${rupeesDot(totalsBefore.total)}")`,
  );
  check(totalsBefore.weekday > 0, `the demo month bills weekday shifts (${totalsBefore.weekday})`);

  await clickTab("Settings");
  await settle(SETTLE_TAB);
  const billRate = inputInPanel("Invoice rates & billing rules", "Weekday");
  check(!!billRate, "the weekday billing rate is reachable inside its own panel");
  eqNum(
    billRate?.valueAsNumber ?? -1,
    DEFAULT_INVOICE_RATES.weekday,
    "and starts at the rate lifted from the artefact",
  );
  if (billRate) {
    await typeInto(billRate, String(DEFAULT_INVOICE_RATES.weekday + 100));
    await settle(220);
    await clickTab("Invoice");
    await settle(SETTLE_TAB);

    const dataAfter = await vaultData();
    eqNum(
      dataAfter?.royal.invoiceRates.weekday ?? -1,
      DEFAULT_INVOICE_RATES.weekday + 100,
      "the edited rate persisted to the vault",
    );
    const totalsAfter = totalsFor(dataAfter!);
    eqNum(
      totalsAfter.total - totalsBefore.total,
      totalsBefore.weekday * 100,
      "the invoice moved by exactly weekdayShifts × Rs 100",
    );
    check(
      invoiceTotalText() === rupeesDot(totalsAfter.total),
      `and the document on screen moved with it ("${invoiceTotalText()}")`,
    );

    // Put the rate back — later sections compare against the defaults.
    await clickTab("Settings");
    await settle(SETTLE_TAB);
    const restore = inputInPanel("Invoice rates & billing rules", "Weekday");
    if (restore) await typeInto(restore, String(DEFAULT_INVOICE_RATES.weekday));
    await settle(220);
    const dataRestored = await vaultData();
    eqNum(
      dataRestored?.royal.invoiceRates.weekday ?? -1,
      DEFAULT_INVOICE_RATES.weekday,
      "the rate can be set back",
    );
  }

  section("25 · Poya calendar editing");
  const poyaPanel = panelByTitle("Poya days");
  check(!!poyaPanel, "the Poya panel is on the settings tab");
  const poyaField = document.querySelector<HTMLInputElement>('input[aria-label="New Poya date"]');
  check(!!poyaField, "a new Poya day can be entered by date");
  const probeKey = (() => {
    const known = dataBefore?.royal.poyaDays ?? [];
    for (const d of [20, 19, 18, 17]) {
      const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!known.includes(key)) return key;
    }
    return "";
  })();
  check(!!probeKey, `found a date in this month that is not a Poya day yet (${probeKey})`);
  if (poyaField && probeKey && poyaPanel) {
    const poyaBefore = (await vaultData())?.royal.poyaDays.length ?? 0;
    await typeInto(poyaField, probeKey);
    await settle(120);
    const addButton = Array.from(poyaPanel.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === "Add",
    );
    check(!!addButton && !addButton?.hasAttribute("disabled"), "Add unlocks once a date is entered");
    await click(addButton ?? null, "Add Poya day");
    await settle(240);
    const withPoya = await vaultData();
    eqNum(
      withPoya?.royal.poyaDays.length ?? 0,
      poyaBefore + 1,
      "the Poya list grew by one and persisted",
    );
    check(
      (withPoya?.royal.poyaDays ?? []).includes(probeKey),
      `and it holds ${probeKey}`,
    );
    const [py, pm, pd] = probeKey.split("-");
    has(
      `${Number(pd)} ${MONTHS_SHORT[Number(pm) - 1]} ${py}`,
      `the new Poya day is listed on screen as ${Number(pd)} ${MONTHS_SHORT[Number(pm) - 1]} ${py}`,
    );

    // The calendar must reclassify that date everywhere it is drawn.
    await click(royalPeriodBar(), "period bar (day map)");
    await settle(SETTLE_SWAP + 120);
    const cell = dialog()?.querySelector(`div[title^="${probeKey}"]`);
    check(!!cell, `the day map draws ${probeKey}`);
    check(
      (cell?.getAttribute("title") ?? "").includes("POYA"),
      `and classifies it as POYA (title: "${cell?.getAttribute("title") ?? ""}")`,
    );
    await pressKey("Escape");
    await settle(SETTLE_SWAP);

    // Take it back out again.
    await clickTab("Settings");
    await settle(SETTLE_TAB);
    await click(
      document.querySelector(`button[aria-label="Remove Poya day ${probeKey}"]`),
      "Remove Poya day",
    );
    await settle(260);
    const withoutPoya = await vaultData();
    eqNum(
      withoutPoya?.royal.poyaDays.length ?? 0,
      poyaBefore,
      "removing a Poya day shrinks the list back",
    );
    check(
      !(withoutPoya?.royal.poyaDays ?? []).includes(probeKey),
      "and the date is gone from the vault",
    );
  }

  section("26 · Document actions");
  await clickTab("Invoice");
  await settle(SETTLE_TAB);
  let printed = 0;
  (window as unknown as { print: () => void }).print = () => {
    printed++;
  };
  await clickButton("Print");
  await settle(160);
  eqNum(printed, 1, "Print hands the document to the browser's print dialog");

  // jsdom has no 2D canvas, so html2canvas cannot rasterise. What matters is
  // that the failure is reported and the workspace stays usable.
  const realConsoleError = console.error;
  let rasterErrors = 0;
  console.error = () => {
    rasterErrors++;
  };
  await clickButton("PDF");
  await settle(1600);
  console.error = realConsoleError;
  check(rasterErrors > 0, "the rasteriser failure is logged for diagnosis");
  const pdfButton = Array.from(document.querySelectorAll("button")).find((b) =>
    ["PDF", "Working…"].includes((b.textContent ?? "").trim()),
  );
  check(
    !!pdfButton && (pdfButton.textContent ?? "").trim() === "PDF" && !pdfButton.hasAttribute("disabled"),
    `the PDF button recovers instead of sticking on "Working…" (got "${pdfButton?.textContent ?? "missing"}")`,
  );
  has("PDF failed", "a failed PDF is reported, not swallowed");
  await clickButton("PNG");
  await settle(1600);
  has("Image failed", "a failed PNG is reported too");
  check(
    document.querySelectorAll("table").length > 0 && !!royalPeriodBar(),
    "the invoice and the workspace are both still on screen afterwards",
  );

  section("27 · Estate rates, reset and clipboard");
  await switchModule("Millennium Estate");
  await clickTab("Rates");
  await settle(SETTLE_TAB);
  const maleDayField = inputByLabel("Male day");
  check(!!maleDayField, "the male day rate is editable");
  eqNum(
    maleDayField?.valueAsNumber ?? -1,
    DEFAULT_ESTATE_RATES.maleDay,
    "and starts at the artefact's rate",
  );
  if (maleDayField) {
    await typeInto(maleDayField, String(DEFAULT_ESTATE_RATES.maleDay + 200));
    await settle(260);
    const withRate = await vaultData();
    eqNum(
      withRate?.estate.rates.maleDay ?? -1,
      DEFAULT_ESTATE_RATES.maleDay + 200,
      "the edited estate rate persisted",
    );

    await clickTab("Summary");
    await settle(SETTLE_TAB);
    const liveWindow = estatePeriodFor(
      new Date(`${withRate!.estate.periodAnchor}T00:00:00`),
    );
    const grand = periodTotals(withRate!.estate.records, liveWindow, withRate!.estate.rates);
    has(
      `Rs ${money(grand.grand)}`,
      `the summary grand total follows the new rate (expected Rs ${money(grand.grand)})`,
    );
    const grandDefault = periodTotals(
      withRate!.estate.records,
      liveWindow,
      DEFAULT_ESTATE_RATES,
    );
    eqNum(
      grand.grand - grandDefault.grand,
      200 * grand.m,
      "the total rose by exactly Rs 200 × male shifts",
    );

    await clickTab("Entry");
    await settle(SETTLE_TAB);
    has(
      `M × ${DEFAULT_ESTATE_RATES.maleDay + 200}`,
      "the live formula under the entry form quotes the edited rate",
    );

    await clickTab("Rates");
    await settle(SETTLE_TAB);
    await clickButton("Reset defaults");
    await settle(300);
    has("Rates restored to defaults", "the reset says what it did");
    const reset = await vaultData();
    eqNum(
      reset?.estate.rates.maleDay ?? -1,
      DEFAULT_ESTATE_RATES.maleDay,
      "and the rate card is back to the artefact's defaults",
    );
  }

  await clickTab("Export");
  await settle(SETTLE_TAB);
  const clipboardWrites: string[] = [];
  const realClipboard = (navigator as unknown as { clipboard?: unknown }).clipboard;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        clipboardWrites.push(text);
      },
    },
  });
  await clickButton("Copy");
  await settle(320);
  eqNum(clipboardWrites.length, 1, "Copy goes through the async Clipboard API when it exists");
  check(
    clipboardWrites[0]?.startsWith("Year,Month,Day,") ?? false,
    `and it copies the canonical CSV header (got "${(clipboardWrites[0] ?? "").slice(0, 40)}")`,
  );
  has("CSV copied to clipboard", "a successful copy is confirmed");
  has("Copied", "and the button flips to Copied");

  // Now the hostile case: no Clipboard API and execCommand unavailable —
  // exactly what an insecure origin or an older browser gives you.
  await settle(1900); // let the button leave its "Copied" state
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: realClipboard });
  const realExec = document.execCommand;
  (document as unknown as { execCommand?: () => boolean }).execCommand = () => false;
  await clickButton("Copy");
  await settle(320);
  document.execCommand = realExec;
  has("Clipboard blocked by the browser", "a blocked clipboard is reported, not silent");
  eqNum(clipboardWrites.length, 1, "and nothing was written the second time");

  // The printable statement is the estate's document surface.
  printed = 0;
  await clickButton("Print");
  await settle(200);
  eqNum(printed, 1, "the estate statement prints through the browser dialog too");

  // Nothing in the vault should have changed except the rates we reset.
  const finalVault = await vaultData();
  eqNum(
    finalVault?.estate.rates.maleDay ?? -1,
    DEFAULT_ESTATE_RATES.maleDay,
    "the estate rate card ends the run on the defaults",
  );
  check(
    Object.keys(finalVault?.estate.records ?? {}).length > 0,
    "and the estate records survived every rate edit",
  );
  truthyUnusedGuard(finalVault);


/* ════════════════════════════════════════════════════════════════════
 * 28 — Bulk actions must respect the selection
 *
 * With nothing selected the bulk buttons hit every visible card — the
 * convenient default. With a selection they must hit *only* that
 * selection, or clearing one person's month silently erases the roster.
 * ════════════════════════════════════════════════════════════════════ */
section("28 · Bulk actions respect the selection");
await switchModule("Royal Hires");
await clickTab("Attendance");
await settle(SETTLE_TAB);
await clickSegment("Cards");
await settle(SETTLE_SWAP);

const selBefore = await vaultData();
check(!!selBefore, "the vault is readable before the selection test");
const selDays = buildMonth(
  selBefore?.royal.period ?? { y: 2026, m: 10 },
  selBefore?.royal.poyaDays ?? [],
).map((d) => d.key);
eqNum(selDays.length, 31, "October 2026 is a 31-day range");

const chosen = selBefore?.royal.employees[0];
const chosenId = chosen?.id ?? "";
const markedCount = (d: AppData | null, id: string) =>
  d ? selDays.filter((k) => !!d.royal.attendance[id]?.[k]).length : -1;
const marksBefore = markedCount(selBefore, chosenId);
check(marksBefore > 10, `${chosen?.name} starts with a marked month (${marksBefore} days)`);

await click(
  document.querySelector(`button[aria-label="Select ${chosen?.name}"]`),
  `select ${chosen?.name}`,
);
await settle(SETTLE_TAB);
has("1 selected", "the bulk bar reports a one-person selection");

await clickButton("Clear range");
await settle(SETTLE_SWAP);
has(`Cleared ${selDays.length} days · 1 staff`, "the toast scopes the clear to the selection");

const selAfter = await vaultData();
check(!!selAfter, "the vault is readable after the scoped clear");
eqNum(markedCount(selAfter, chosenId), 0, "every day of the selected worker is cleared");

if (selBefore && selAfter) {
  for (const emp of selBefore.royal.employees) {
    if (emp.id === chosenId) continue;
    const untouched = selDays.every(
      (k) =>
        JSON.stringify(selBefore.royal.attendance[emp.id]?.[k] ?? null) ===
        JSON.stringify(selAfter.royal.attendance[emp.id]?.[k] ?? null),
    );
    check(untouched, `${emp.name} is untouched by a one-person bulk action`);
  }
}

await click(document.querySelector('button[title="Undo the last change"]'), "top-bar Undo");
await settle(SETTLE_SWAP);
const selUndone = await vaultData();
eqNum(markedCount(selUndone, chosenId), marksBefore, "Undo brings every cleared day back");

await clickButton("Select all visible");
await settle(SETTLE_TAB);
has(
  `${selBefore?.royal.employees.length ?? 0} selected`,
  "Select all visible selects the whole unfiltered roster",
);
await clickButton("Clear selection");
await settle(SETTLE_TAB);
has(
  `Bulk actions hit all ${selBefore?.royal.employees.length ?? 0} visible`,
  "and clearing the selection restores the all-visible default",
);

/* ════════════════════════════════════════════════════════════════════
 * 29 — A reload must boot from the vault
 *
 * Everything above happens inside one React tree. What matters for a
 * local-first app is the fresh page load: the saved data, the module and
 * tab you left, and no welcome sheet.
 * ════════════════════════════════════════════════════════════════════ */
section("29 · A reload boots from the vault");
const uiPrefs = JSON.parse(
  window.localStorage.getItem("empire_ml:ui") ?? "{}",
) as Record<string, string>;
check(
  uiPrefs["royal.tab"] === "attendance",
  `view state is kept outside the data vault (${uiPrefs["royal.tab"]})`,
);
check(
  !(window.localStorage.getItem("empire_ml:data") ?? "").includes("royal.tab"),
  "so a data reset cannot lose somebody's favourite view",
);

const preReload = await vaultData();
check(!!preReload, "the vault holds data just before the reload");

act(() => root?.unmount());
await settle(SETTLE_TAB);
await act(async () => {
  root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await tick(40);
});
await settle(800);

lacks("Start your payroll workspace", "a vault with data never shows the welcome sheet");
lacks("Legacy data migrated", "an ordinary boot does not claim to have migrated anything");
check(!!royalPeriodBar(), "the module you left open is the one that comes back");

const postReload = await vaultData();
eqNum(
  postReload?.royal.employees.length ?? -1,
  preReload?.royal.employees.length ?? -2,
  "the roster survives the reload",
);
const savedNames = new Set(postReload?.royal.employees.map((e) => e.name) ?? []);
const onScreen = visibleStaff();
check(
  onScreen.length === savedNames.size && onScreen.every((n) => savedNames.has(n)),
  "and every saved worker is on screen, in the tab you left",
);
eqNum(
  markedCount(postReload, chosenId),
  marksBefore,
  "the month's marks survive the reload too",
);

/* ════════════════════════════════════════════════════════════════════
 * 30 — The original artefact's storage migrates on boot
 *
 * Someone who has been running the single-file Royal Hires artefact has
 * `rh_final_data` in localStorage and nothing else. Opening this app must
 * pick that up, say so, and keep it in the new vault from the first edit.
 * ════════════════════════════════════════════════════════════════════ */
section("30 · Legacy artefact data migrates into the new vault");
const legacyDoc = {
  employees: [
    { id: "e1", name: "Sunil Bandara", nic: "198812345678", rate: 3400, isFemale: false },
    { id: "e2", name: "Kanthi Silva", nic: "199087654321", rate: 2900, isFemale: true },
  ],
  attendance: { e1: { "2026-10-01": { D: true, N: false } } },
};
window.localStorage.clear();
window.localStorage.setItem("rh_final_data", JSON.stringify(legacyDoc));

act(() => root?.unmount());
await settle(SETTLE_TAB);
await act(async () => {
  root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await tick(40);
});
await settle(900);

has("Legacy data migrated into the new vault", "boot reports the migration");
has("Sunil Bandara", "legacy worker 1 is on the roster");
has("Kanthi Silva", "legacy worker 2 is on the roster");
lacks("Kamal Perera", "this is the migrated vault, not a merge with the demo data");

await clickTab("Attendance");
await settle(SETTLE_TAB);
await clickSegment("Cards");
await settle(SETTLE_SWAP);
const legacyCell = Array.from(
  document.querySelectorAll<HTMLElement>('button[aria-pressed="false"]'),
).find((b) => /^(Day \d+: )?OFF$/.test(b.getAttribute("aria-label") ?? ""));
await click(legacyCell ?? null, "a shift cell in the migrated roster");
await settle(1300);

const migrated = await vaultData();
check(
  migrated?.royal.employees.map((e) => e.name).join("|") === "Sunil Bandara|Kanthi Silva",
  `the first edit writes the migrated roster into the new vault (${migrated?.royal.employees.map((e) => e.name).join("|")})`,
);
check(
  (migrated?.royal.poyaDays.length ?? 0) > 0,
  `and the migrated workspace still knows the Poya calendar (${migrated?.royal.poyaDays.length ?? 0} days)`,
);
check(
  window.localStorage.getItem("rh_final_data") === JSON.stringify(legacyDoc),
  "the legacy key is left alone, so the old artefact still opens with its own data",
);


  report(root, container);
}

function report(root: Root | null, container: HTMLElement) {
  console.log(`\n${"═".repeat(58)}`);
  if (failures.length === 0) {
    console.log(`  ✅ ${pass} render assertions passed — the UI mounts and drives cleanly`);
  } else {
    console.log(`  ❌ ${failures.length} of ${pass + failures.length} render assertions FAILED\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    const txt = (container.textContent ?? "").replace(/\s+/g, " ").slice(0, 700);
    console.log(`\n   last DOM text: ${txt}`);
  }
  console.log(`${"═".repeat(58)}\n`);
  try {
    act(() => root?.unmount());
  } catch {
    /* ignore */
  }
  // The runner tears down jsdom, deletes the bundle and exits.
  process.exitCode = failures.length === 0 ? 0 : 1;
}
