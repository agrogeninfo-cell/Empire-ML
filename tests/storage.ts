/**
 * Empire ML — persistence & legacy-migration harness
 *
 * The vault is the one part of this app where a silent failure costs the user
 * real payroll data, so it gets its own suite: round-tripping, the backup
 * fallback, migration of the ORIGINAL artefact's storage keys, corrupt-JSON
 * recovery and shape normalisation.
 *
 * jsdom globals are installed by tests/run-storage.mjs before this is imported.
 */
import {
  KEY_AUTO_BACKUP,
  KEY_BACKUP,
  KEY_MAIN,
  KEY_META,
  autoBackupDue,
  autoBackupEnabled,
  hydrateAppData,
  loadAppData,
  markAutoBackup,
  readBackup,
  readMeta,
  saveAppData,
  setAutoBackupEnabled,
  storageAvailable,
  usedBytes,
  wipeStorage,
} from "../src/lib/storage";
import {
  DEFAULT_INVOICE_RATES,
  DEFAULT_PAYROLL_RATES,
  DEMO_EMPLOYEES,
  POYA_DAYS,
  blankAppData,
  demoAppData,
} from "../src/data/defaults";
import { countRecords } from "../src/lib/payroll";
import type { AppData } from "../src/lib/types";

/* ───────────────────────── tiny harness ───────────────────────── */

let pass = 0;
const failures: string[] = [];

function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) pass++;
  else failures.push(`${label}\n     expected ${b}\n     actual   ${a}`);
}

function check(cond: boolean, label: string) {
  if (cond) pass++;
  else failures.push(label);
}

function section(name: string) {
  console.log(`\n  ${name}`);
}

/** Start every case from a genuinely empty vault. */
function clearAll() {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
}

/* ═════════════════════════════════════════════════════════════
 * 1 · Environment & round-trip
 * ═════════════════════════════════════════════════════════════ */

section("1 · Environment & round-trip");

check(storageAvailable(), "localStorage is available");

clearAll();
eq(loadAppData().source, "fresh", "an empty vault boots as 'fresh'");

const blank = loadAppData().data;
eq(blank.royal.employees.length, 0, "a fresh vault has no staff");
eq(Object.keys(blank.estate.records).length, 0, "a fresh vault has no estate records");
eq(blank.royal.payrollRates, DEFAULT_PAYROLL_RATES, "fresh vault carries the default payroll rates");
eq(blank.royal.invoiceRates, DEFAULT_INVOICE_RATES, "fresh vault carries the default invoice rates");
eq(blank.royal.poyaDays.length, POYA_DAYS.length, "fresh vault carries all 13 Poya dates");

const demo = demoAppData();
const saved = saveAppData(demo);
check(saved.ok, "saveAppData reports success");
eq(saved.meta.employeeCount, 6, "meta records the employee count");
eq(saved.meta.recordCount, countRecords(demo.royal.attendance), "meta records the attendance count");
eq(saved.meta.estateRecordCount, Object.keys(demo.estate.records).length, "meta records estate days");
check(Number(saved.meta.dataSizeKB) > 0, "meta records a non-zero payload size");

const reloaded = loadAppData();
eq(reloaded.source, "main", "a saved vault loads from the main key");
eq(reloaded.data.royal.employees.map((e) => e.name), DEMO_EMPLOYEES.map((e) => e.name), "staff survive the round trip");
eq(
  countRecords(reloaded.data.royal.attendance),
  countRecords(demo.royal.attendance),
  "every attendance record survives the round trip",
);
eq(reloaded.data.royal.payrollRates, demo.royal.payrollRates, "payroll rates survive");
eq(reloaded.data.royal.invoiceRates, demo.royal.invoiceRates, "invoice rates survive");
eq(reloaded.data.estate.rates, demo.estate.rates, "estate rates survive");
eq(
  Object.keys(reloaded.data.estate.records).length,
  Object.keys(demo.estate.records).length,
  "estate day records survive",
);
check(!!reloaded.data.savedAt, "savedAt is stamped on write");

check(!!window.localStorage.getItem(KEY_MAIN), "the main key was written");
check(!!window.localStorage.getItem(KEY_BACKUP), "the backup key mirrors every save");
check(!!window.localStorage.getItem(KEY_META), "metadata was written");
check(
  window.localStorage.getItem(KEY_MAIN) === window.localStorage.getItem(KEY_BACKUP),
  "main and backup hold identical payloads",
);
check(usedBytes() > 0, "usedBytes reports real consumption");

/* ═════════════════════════════════════════════════════════════
 * 2 · Backup fallback
 * ═════════════════════════════════════════════════════════════ */

section("2 · Backup fallback");

clearAll();
saveAppData(demoAppData());
window.localStorage.removeItem(KEY_MAIN);
const restored = loadAppData();
eq(restored.source, "backup_restored", "losing MAIN falls back to the backup key");
eq(restored.data.royal.employees.length, 6, "the backup restores the full roster");

check(!!readBackup(), "readBackup returns the mirrored document");
check(!!readMeta(), "readMeta returns the last write's metadata");

/* ═════════════════════════════════════════════════════════════
 * 3 · Legacy migration — the ORIGINAL artefact's own keys
 * ═════════════════════════════════════════════════════════════ */

section("3 · Legacy migration (whole document)");

clearAll();
// Exactly what royal_x5f_hires_final_bonus.html wrote under `rh_final_data`.
const legacyDoc = {
  employees: [
    { id: "e1", name: "Kamal Perera", nic: "199012345678", rate: 2200, isFemale: false },
    { id: "e2", name: "Nimali Fernando", nic: "199578901234", rate: 2200, isFemale: true },
  ],
  attendance: {
    e1: { "2026-10-01": { D: true, N: false }, "2026-10-02": { D: true, N: true } },
    e2: { "2026-10-01": { D: false, N: true } },
  },
  deductions: { e1: { meal: 1200, boarding: 2000, advance: 0 } },
  invoiceRates: { weekday: 1525, saturday: 1875, weekdayOT: 225, saturdayOT: 225, sunday: 300, female: 100, bonus: 5500 },
  payrollRates: { weekday: 2200, saturday: 2550, sunday: 3600, female: 100 },
  toCompany: "Legacy Client Ltd",
  invoiceNo: "RH-INV-2025-099",
  invoiceDate: "2026-09-30",
  period: { y: 2026, m: 9 },
  version: 2,
};
window.localStorage.setItem("rh_final_data", JSON.stringify(legacyDoc));

const migrated = loadAppData();
eq(migrated.source, "legacy_migrated", "a legacy rh_final_data document is detected");
eq(migrated.data.royal.employees.length, 2, "legacy staff migrate");
eq(migrated.data.royal.employees[0].name, "Kamal Perera", "legacy names migrate intact");
eq(migrated.data.royal.employees[1].isFemale, true, "legacy gender flags migrate");
eq(countRecords(migrated.data.royal.attendance), 3, "legacy attendance records migrate");
eq(migrated.data.royal.attendance.e1["2026-10-02"], { D: true, N: true }, "legacy D+N marks survive");
eq(migrated.data.royal.deductions.e1, { meal: 1200, boarding: 2000, advance: 0 }, "legacy deductions migrate");
eq(migrated.data.royal.toCompany, "Legacy Client Ltd", "legacy invoice client migrates");
eq(migrated.data.royal.invoiceNo, "RH-INV-2025-099", "legacy invoice number migrates");
eq(migrated.data.royal.period, { y: 2026, m: 9 }, "legacy period migrates");
eq(migrated.data.royal.poyaDays.length, POYA_DAYS.length, "Poya calendar is filled in for legacy data");
eq(migrated.data.royal.bonusDays, 21, "legacy data gains the bonus threshold it never stored");
eq(migrated.data.royal.otHours, { weekday: 3, saturday: 3, sunday: 12 }, "legacy data gains the OT hours it never stored");

section("3b · Legacy migration (scattered keys)");

clearAll();
// The older code path stored each slice under its own key.
window.localStorage.setItem("rh_employees", JSON.stringify(legacyDoc.employees));
window.localStorage.setItem("rh_attendance", JSON.stringify(legacyDoc.attendance));
window.localStorage.setItem("deductions", JSON.stringify(legacyDoc.deductions));
window.localStorage.setItem("invoiceRates", JSON.stringify(legacyDoc.invoiceRates));
window.localStorage.setItem("payrollRates", JSON.stringify(legacyDoc.payrollRates));

const scattered = loadAppData();
eq(scattered.source, "legacy_migrated", "scattered legacy keys are detected");
eq(scattered.data.royal.employees.length, 2, "scattered staff migrate");
eq(countRecords(scattered.data.royal.attendance), 3, "scattered attendance migrates");
eq(scattered.data.royal.invoiceRates.bonus, 5500, "scattered invoice rates migrate");
eq(scattered.data.royal.payrollRates.sunday, 3600, "scattered payroll rates migrate");

section("3c · Legacy backup key");

clearAll();
window.localStorage.setItem("rh_final_backup_data", JSON.stringify(legacyDoc));
eq(loadAppData().source, "legacy_migrated", "the legacy BACKUP key is also migrated");
eq(loadAppData().data.royal.employees.length, 2, "legacy backup staff migrate");

/* ═════════════════════════════════════════════════════════════
 * 4 · Hostile input
 * ═════════════════════════════════════════════════════════════ */

section("4 · Hostile input");

clearAll();
window.localStorage.setItem(KEY_MAIN, "{not valid json at all");
let threw = false;
let recovered: ReturnType<typeof loadAppData> | null = null;
try {
  recovered = loadAppData();
} catch {
  threw = true;
}
check(!threw, "corrupt JSON in MAIN does not throw");
check(!!recovered, "corrupt JSON still yields a usable vault");
eq(recovered?.data.royal.employees.length, 0, "corrupt MAIN degrades to an empty roster");

clearAll();
eq(hydrateAppData(null).royal.employees.length, 0, "hydrateAppData(null) is safe");
eq(hydrateAppData("nonsense").royal.employees.length, 0, "hydrateAppData(string) is safe");
eq(hydrateAppData(42).estate.records, {}, "hydrateAppData(number) is safe");
eq(hydrateAppData([]).royal.poyaDays.length, POYA_DAYS.length, "hydrateAppData(array) is safe");
eq(hydrateAppData({ royal: { employees: "not an array" } }).royal.employees.length, 0, "bad employees shape is rejected");

section("4b · Shape normalisation");

clearAll();
const messy = {
  royal: {
    employees: [
      { id: "e1", name: "Stringy Rates", nic: "123", rate: "2200", isFemale: "yes" },
      { name: "No ID" }, // missing id → rejected
      null, // junk entry → rejected
      { id: "e2", name: "Valid", nic: "456", rate: 2200, isFemale: true },
    ],
    attendance: {
      e1: {
        "2026-10-01": { D: true, N: false },
        "2026-10-02": { D: "yes", N: 1 }, // non-boolean → dropped
        "2026-10-03": { D: false, N: false }, // empty mark → dropped
        "2026-10-04": null,
        "2026-10-05": { N: true }, // partial mark → kept
      },
    },
    deductions: { e1: { meal: "1200", boarding: null, advance: 50 } },
    payrollRates: { weekday: "2400", saturday: 2550, bogus: 999 },
    poyaDays: ["2026-10-25", 12345, null, "2026-11-24"],
    period: { y: "2026", m: 9 }, // string year → rejected, falls back to default
  },
  estate: {
    records: {
      "2026-10-01": { date: "2026-10-01", maleCount: "4.5", femaleCount: 3, junk: true },
      "bad": { noDateField: true }, // missing date → rejected
    },
    rates: { maleDay: "3100" },
  },
};
const norm = hydrateAppData(messy);

eq(norm.royal.employees.map((e) => e.id), ["e1", "e2"], "employees without an id are rejected");
eq(norm.royal.employees[0].isFemale, false, "a non-boolean isFemale normalises to false");
eq(norm.royal.employees[1].isFemale, true, "a real boolean isFemale is preserved");
eq(
  Object.keys(norm.royal.attendance.e1).sort(),
  ["2026-10-01", "2026-10-05"],
  "non-boolean and empty marks are dropped",
);
eq(norm.royal.deductions.e1, { meal: 1200, boarding: 0, advance: 50 }, "numeric strings coerce, nulls become 0");
eq(norm.royal.payrollRates.weekday, 2400, "rate strings coerce to numbers");
eq(norm.royal.payrollRates.sunday, DEFAULT_PAYROLL_RATES.sunday, "missing rates fall back to defaults");
check(
  !("bogus" in norm.royal.payrollRates),
  "unknown rate keys are not smuggled into state",
);
eq(norm.royal.poyaDays, ["2026-10-25", "2026-11-24"], "non-string Poya entries are filtered out");
eq(norm.royal.period.y, blankAppData().royal.period.y, "an invalid period falls back rather than corrupting the calendar");
eq(Object.keys(norm.estate.records), ["2026-10-01"], "estate records without a date are rejected");
eq(norm.estate.records["2026-10-01"].maleCount, 0, "non-numeric estate counts become 0");
eq(norm.estate.rates.maleDay, 3100, "estate rate strings coerce");
eq(norm.estate.rates.femaleDay, 2500, "absent estate rates fall back to defaults");
eq(norm.activeModule, "royal", "an unrecognised activeModule defaults to royal");

/* ═════════════════════════════════════════════════════════════
 * 5 · Auto-backup & reset
 * ═════════════════════════════════════════════════════════════ */

section("5 · Auto-backup & reset");

clearAll();
eq(autoBackupEnabled(), true, "weekly auto-backup defaults to on");
setAutoBackupEnabled(false);
eq(autoBackupEnabled(), false, "disabling auto-backup persists");
eq(window.localStorage.getItem(KEY_AUTO_BACKUP), "false", "the flag is written as a plain string too");
setAutoBackupEnabled(true);
eq(autoBackupEnabled(), true, "re-enabling auto-backup persists");

check(autoBackupDue(), "a backup is due when none has ever run");
markAutoBackup();
check(!autoBackupDue(), "a backup is not due immediately after one runs");

clearAll();
window.localStorage.setItem("rh_employees", JSON.stringify(legacyDoc.employees));
saveAppData(demoAppData());
window.localStorage.setItem("millennium_records", JSON.stringify({ "2026-10-01": { date: "2026-10-01", maleCount: 4 } }));

wipeStorage();
check(!window.localStorage.getItem(KEY_MAIN), "wipe removes the main key");
check(!window.localStorage.getItem(KEY_BACKUP), "wipe removes the backup key");
check(!window.localStorage.getItem(KEY_META), "wipe removes the metadata key");
check(!window.localStorage.getItem("rh_employees"), "wipe also removes inherited legacy keys");
check(!window.localStorage.getItem("millennium_records"), "wipe also removes legacy estate keys");
eq(loadAppData().source, "fresh", "after a wipe the app boots fresh");

/* ═════════════════════════════════════════════════════════════
 * 6 · Legacy estate data
 * ═════════════════════════════════════════════════════════════ */

section("6 · Legacy estate data");

clearAll();
window.localStorage.setItem(
  "millennium_records",
  JSON.stringify({
    records: {
      "2025-08-24": {
        date: "2025-08-24",
        maleCount: 4.5,
        femaleCount: 6,
        maleOt: 2,
        femaleOt: 1.5,
        lateHours: 0.5,
        inTime: "07:00",
        outTime: "19:00",
      },
    },
    rates: { maleDay: 3200, femaleDay: 2600, otRate: 250, lateRate: 175 },
    companyName: "Old Estate Name",
  }),
);
const estateMigrated = loadAppData();
eq(estateMigrated.source, "legacy_migrated", "legacy estate data is detected");
eq(Object.keys(estateMigrated.data.estate.records).length, 1, "legacy estate records migrate");
eq(estateMigrated.data.estate.rates.maleDay, 3200, "legacy estate rates migrate");
eq(estateMigrated.data.estate.companyName, "Old Estate Name", "legacy estate identity migrates");

/* ───────────────────────── report ───────────────────────── */

console.log(`\n${"═".repeat(58)}`);
if (failures.length === 0) {
  console.log(`  ✅ ${pass} persistence assertions passed — the vault round-trips and migrates`);
} else {
  console.log(`  ❌ ${failures.length} of ${pass + failures.length} persistence assertions FAILED\n`);
  failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log(`${"═".repeat(58)}\n`);

// The runner exits; do not process.exit() here or cleanup is skipped.
process.exitCode = failures.length === 0 ? 0 : 1;

export type { AppData };
