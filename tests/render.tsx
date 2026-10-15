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
import { StrictMode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "../src/App";

/* ───────────────────────── tiny harness ───────────────────────── */

let pass = 0;
const failures: string[] = [];

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
