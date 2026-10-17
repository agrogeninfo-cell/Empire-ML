import {
  DEFAULT_INVOICE_RATES,
  DEFAULT_PAYROLL_RATES,
  POYA_DAYS,
  blankAppData,
  blankEstateState,
  blankRoyalState,
} from "@/data/defaults";
import type {
  AppData,
  AttendanceMap,
  DataSource,
  DeductionMap,
  Deductions,
  Employee,
  EstateRecords,
  InvoiceRates,
  PayrollRates,
  Period,
  RoyalState,
} from "./types";

/* ═══════════════════════════════════════════════════════════════════════
 * Bulletproof persistence — dual-key write, mirroring the source artefact
 *
 *   MAIN   empire_ml:data          ← read first
 *   BACKUP empire_ml:data:backup   ← written on every save, read as a
 *                                     fallback when MAIN is missing/corrupt
 *   META   empire_ml:meta          ← lastBackupTime, dataSize, counts
 * ═════════════════════════════════════════════════════════════════════ */

export const KEY_MAIN = "empire_ml:data";
export const KEY_BACKUP = "empire_ml:data:backup";
export const KEY_META = "empire_ml:meta";
export const KEY_AUTO_BACKUP = "empire_ml:auto_backup";
export const KEY_LAST_AUTO_BACKUP = "empire_ml:last_auto_backup";
export const DATA_VERSION = 3;

/** Legacy keys written by the original Royal Hires artefact. */
const LEGACY_MAIN = ["rh_final_data"];
const LEGACY_BACKUP = ["rh_final_backup_data"];
const LEGACY_EMPLOYEES = [
  "rh_employees",
  "rh_emp",
  "royal_hires_employees",
  "employees",
  "rh_final_employees",
  "RH_EMP",
];
const LEGACY_ATTENDANCE = ["rh_attendance", "rh_att", "attendance", "rh_final_attendance"];
const LEGACY_DEDUCTIONS = ["rh_deductions", "deductions", "rh_final_deductions"];
const LEGACY_INVOICE_RATES = ["rh_invoiceRates", "invoiceRates"];
const LEGACY_PAYROLL_RATES = ["rh_payrollRates", "payrollRates"];
const LEGACY_ESTATE = ["millennium_records", "millennium_data", "estate_records"];

export interface StorageMeta {
  lastBackupTime: string | null;
  dataSize: number;
  dataSizeKB: string;
  employeeCount: number;
  recordCount: number;
  estateRecordCount: number;
}

export function safeRead<T>(key: string): T | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function safeWrite(key: string, value: unknown): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function storageAvailable(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const probe = "__empire_ml_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function usedBytes(): number {
  if (!storageAvailable()) return 0;
  let total = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      const v = window.localStorage.getItem(k) ?? "";
      // UTF-16 → 2 bytes per char, matching browser quota accounting
      total += (k.length + v.length) * 2;
    }
  } catch {
    /* ignore */
  }
  return total;
}

/* ═══════════════════════════════════════════════════════════════════════
 * Shape guards — never trust stored JSON blindly
 * ═════════════════════════════════════════════════════════════════════ */

function isEmployee(x: unknown): x is Employee {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.name === "string";
}

function isPeriod(x: unknown): x is Period {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return typeof p.y === "number" && typeof p.m === "number";
}

function normaliseRates<T extends object>(raw: unknown, fallback: T): T {
  const out = { ...fallback } as Record<string, number>;
  if (raw && typeof raw === "object") {
    for (const k of Object.keys(fallback)) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
      else if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) out[k] = Number(v);
    }
  }
  return out as T;
}

function normaliseAttendance(raw: unknown, employees: Employee[]): AttendanceMap {
  const out: AttendanceMap = {};
  for (const e of employees) out[e.id] = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [empId, days] of Object.entries(raw as Record<string, unknown>)) {
    if (!days || typeof days !== "object") continue;
    const bucket: Record<string, { D: boolean; N: boolean }> = out[empId] ?? {};
    for (const [key, mark] of Object.entries(days as Record<string, unknown>)) {
      if (!mark || typeof mark !== "object") continue;
      const m = mark as Record<string, unknown>;
      const D = m.D === true;
      const N = m.N === true;
      if (D || N) bucket[key] = { D, N };
    }
    out[empId] = bucket;
  }
  return out;
}

function normaliseDeductions(raw: unknown, employees: Employee[]): DeductionMap {
  const out: DeductionMap = {};
  for (const e of employees) out[e.id] = { meal: 0, boarding: 0, advance: 0 };
  if (!raw || typeof raw !== "object") return out;
  for (const [empId, d] of Object.entries(raw as Record<string, unknown>)) {
    if (!d || typeof d !== "object") continue;
    out[empId] = normaliseRates<Deductions>(d, { meal: 0, boarding: 0, advance: 0 });
  }
  return out;
}

function normaliseEstateRecords(raw: unknown): EstateRecords {
  const out: EstateRecords = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, r] of Object.entries(raw as Record<string, unknown>)) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    if (typeof rec.date !== "string") continue;
    const n = (k: string) => {
      const v = rec[k];
      return typeof v === "number" && Number.isFinite(v) ? v : 0;
    };
    out[key] = {
      date: rec.date,
      maleCount: n("maleCount"),
      femaleCount: n("femaleCount"),
      maleOt: n("maleOt"),
      femaleOt: n("femaleOt"),
      lateHours: n("lateHours"),
      inTime: typeof rec.inTime === "string" ? rec.inTime : "07:00",
      outTime: typeof rec.outTime === "string" ? rec.outTime : "19:00",
    };
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════
 * Legacy migration — picks up data written by the original artefacts
 * ═════════════════════════════════════════════════════════════════════ */

function firstOf<T>(keys: string[]): T | null {
  for (const k of keys) {
    const v = safeRead<T>(k);
    if (v) return v;
  }
  return null;
}

export function migrateLegacy(): RoyalState | null {
  // 1) a whole-document save from the original app
  const doc = firstOf<Record<string, unknown>>([...LEGACY_MAIN, ...LEGACY_BACKUP]);
  if (doc && Array.isArray(doc.employees) && doc.employees.length) {
    return hydrateRoyal(doc);
  }

  // 2) scattered per-slice keys
  const employees = firstOf<Employee[]>(LEGACY_EMPLOYEES);
  if (!employees || !Array.isArray(employees) || !employees.length) return null;

  const clean = employees.filter(isEmployee).map((e) => ({
    id: String(e.id),
    name: String(e.name ?? "Unnamed"),
    nic: String(e.nic ?? ""),
    rate: typeof e.rate === "number" ? e.rate : DEFAULT_PAYROLL_RATES.weekday,
    isFemale: e.isFemale === true,
  }));

  return {
    employees: clean,
    attendance: normaliseAttendance(firstOf(LEGACY_ATTENDANCE), clean),
    deductions: normaliseDeductions(firstOf(LEGACY_DEDUCTIONS), clean),
    invoiceRates: normaliseRates<InvoiceRates>(
      firstOf(LEGACY_INVOICE_RATES),
      DEFAULT_INVOICE_RATES,
    ),
    payrollRates: normaliseRates<PayrollRates>(
      firstOf(LEGACY_PAYROLL_RATES),
      DEFAULT_PAYROLL_RATES,
    ),
    otHours: blankRoyalState().otHours,
    bonusDays: blankRoyalState().bonusDays,
    bonusAmount: blankRoyalState().bonusAmount,
    poyaDays: [...POYA_DAYS],
    toCompany: blankRoyalState().toCompany,
    invoiceNo: blankRoyalState().invoiceNo,
    invoiceDate: blankRoyalState().invoiceDate,
    period: blankRoyalState().period,
  };
}

function hydrateRoyal(doc: Record<string, unknown>): RoyalState {
  const base = blankRoyalState();
  const employees = (Array.isArray(doc.employees) ? doc.employees : [])
    .filter(isEmployee)
    .map((e) => ({
      id: String(e.id),
      name: String(e.name ?? "Unnamed"),
      nic: String(e.nic ?? ""),
      rate: typeof e.rate === "number" ? e.rate : DEFAULT_PAYROLL_RATES.weekday,
      isFemale: e.isFemale === true,
    }));

  return {
    employees,
    attendance: normaliseAttendance(doc.attendance, employees),
    deductions: normaliseDeductions(doc.deductions, employees),
    invoiceRates: normaliseRates<InvoiceRates>(doc.invoiceRates, DEFAULT_INVOICE_RATES),
    payrollRates: normaliseRates<PayrollRates>(doc.payrollRates, DEFAULT_PAYROLL_RATES),
    otHours: normaliseRates(doc.otHours, base.otHours),
    bonusDays:
      typeof doc.bonusDays === "number" && doc.bonusDays > 0 ? doc.bonusDays : base.bonusDays,
    bonusAmount:
      typeof doc.bonusAmount === "number" && doc.bonusAmount >= 0
        ? doc.bonusAmount
        : base.bonusAmount,
    poyaDays: Array.isArray(doc.poyaDays)
      ? doc.poyaDays.filter((x): x is string => typeof x === "string")
      : [...POYA_DAYS],
    toCompany: typeof doc.toCompany === "string" ? doc.toCompany : base.toCompany,
    invoiceNo: typeof doc.invoiceNo === "string" ? doc.invoiceNo : base.invoiceNo,
    invoiceDate: typeof doc.invoiceDate === "string" ? doc.invoiceDate : base.invoiceDate,
    period: isPeriod(doc.period) ? doc.period : base.period,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * Load
 * ═════════════════════════════════════════════════════════════════════ */

export interface LoadResult {
  data: AppData;
  source: DataSource;
}

/**
 * Public hydrator — validates any unknown JSON blob (backup file, legacy
 * document, clipboard import) into a complete `AppData` tree.
 */
export function hydrateAppData(raw: unknown): AppData {
  if (!raw || typeof raw !== "object") return blankAppData();
  return hydrateApp(raw as Record<string, unknown>);
}

export function loadAppData(): LoadResult {
  const main = safeRead<Record<string, unknown>>(KEY_MAIN);
  if (main) {
    return { data: hydrateApp(main), source: "main" };
  }

  const backup = safeRead<Record<string, unknown>>(KEY_BACKUP);
  if (backup) {
    return { data: hydrateApp(backup), source: "backup_restored" };
  }

  const legacyRoyal = migrateLegacy();
  const legacyEstate = firstOf<Record<string, unknown>>(LEGACY_ESTATE);

  if (legacyRoyal || legacyEstate) {
    const data = blankAppData();
    if (legacyRoyal) data.royal = legacyRoyal;
    if (legacyEstate) {
      data.estate = {
        ...blankEstateState(),
        records: normaliseEstateRecords(legacyEstate.records ?? legacyEstate),
        rates: normaliseRates(legacyEstate.rates, blankEstateState().rates),
        companyName:
          typeof legacyEstate.companyName === "string"
            ? legacyEstate.companyName
            : blankEstateState().companyName,
      };
    }
    return { data, source: "legacy_migrated" };
  }

  return { data: blankAppData(), source: "fresh" };
}

function hydrateApp(doc: Record<string, unknown>): AppData {
  const base = blankAppData();
  const royalDoc = (doc.royal && typeof doc.royal === "object" ? doc.royal : doc) as Record<
    string,
    unknown
  >;
  const estateDoc = (doc.estate && typeof doc.estate === "object"
    ? doc.estate
    : {}) as Record<string, unknown>;

  const hasRoyalEmployees = Array.isArray(royalDoc.employees);

  const royal: RoyalState = hasRoyalEmployees ? hydrateRoyal(royalDoc) : base.royal;

  const estateBase = blankEstateState();
  const estate = {
    records: normaliseEstateRecords(estateDoc.records),
    rates: normaliseRates(estateDoc.rates, estateBase.rates),
    companyName:
      typeof estateDoc.companyName === "string" && estateDoc.companyName
        ? estateDoc.companyName
        : estateBase.companyName,
    estateLabel:
      typeof estateDoc.estateLabel === "string" && estateDoc.estateLabel
        ? estateDoc.estateLabel
        : estateBase.estateLabel,
    periodAnchor:
      typeof estateDoc.periodAnchor === "string" && estateDoc.periodAnchor
        ? estateDoc.periodAnchor
        : estateBase.periodAnchor,
  };

  return {
    version: DATA_VERSION,
    royal,
    estate,
    activeModule: doc.activeModule === "estate" ? "estate" : "royal",
    savedAt: typeof doc.savedAt === "string" ? doc.savedAt : undefined,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * Save
 * ═════════════════════════════════════════════════════════════════════ */

export function saveAppData(data: AppData): { ok: boolean; meta: StorageMeta } {
  const payload: AppData = { ...data, version: DATA_VERSION, savedAt: new Date().toISOString() };
  const json = JSON.stringify(payload);
  const okMain = safeWrite(KEY_MAIN, payload);
  safeWrite(KEY_BACKUP, payload);

  const recordCount = Object.values(payload.royal.attendance).reduce(
    (n, d) => n + Object.keys(d ?? {}).length,
    0,
  );
  const meta: StorageMeta = {
    lastBackupTime: payload.savedAt ?? null,
    dataSize: json.length,
    dataSizeKB: (json.length / 1024).toFixed(1),
    employeeCount: payload.royal.employees.length,
    recordCount,
    estateRecordCount: Object.keys(payload.estate.records).length,
  };
  safeWrite(KEY_META, meta);
  return { ok: okMain, meta };
}

export function readMeta(): StorageMeta | null {
  return safeRead<StorageMeta>(KEY_META);
}

export function readBackup(): AppData | null {
  const raw = safeRead<Record<string, unknown>>(KEY_BACKUP);
  return raw ? hydrateApp(raw) : null;
}

export function autoBackupEnabled(): boolean {
  const raw = safeRead<unknown>(KEY_AUTO_BACKUP);
  if (typeof raw === "boolean") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  try {
    return window.localStorage?.getItem(KEY_AUTO_BACKUP) !== "false";
  } catch {
    return true;
  }
}

export function setAutoBackupEnabled(v: boolean): void {
  try {
    window.localStorage?.setItem(KEY_AUTO_BACKUP, String(v));
  } catch {
    /* ignore */
  }
  safeWrite(KEY_AUTO_BACKUP, v);
}

export const WEEK_MS = 604_800_000;

export function autoBackupDue(): boolean {
  try {
    const last = window.localStorage?.getItem(KEY_LAST_AUTO_BACKUP);
    if (!last) return true;
    return Date.now() - Number(last) > WEEK_MS;
  } catch {
    return true;
  }
}

export function markAutoBackup(): void {
  try {
    window.localStorage?.setItem(KEY_LAST_AUTO_BACKUP, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Hard reset — removes every key this app (or its predecessors) wrote. */
export function wipeStorage(): void {
  const keys = [
    KEY_MAIN,
    KEY_BACKUP,
    KEY_META,
    KEY_AUTO_BACKUP,
    KEY_LAST_AUTO_BACKUP,
    ...LEGACY_MAIN,
    ...LEGACY_BACKUP,
    ...LEGACY_EMPLOYEES,
    ...LEGACY_ATTENDANCE,
    ...LEGACY_DEDUCTIONS,
    ...LEGACY_INVOICE_RATES,
    ...LEGACY_PAYROLL_RATES,
    ...LEGACY_ESTATE,
  ];
  for (const k of keys) {
    try {
      window.localStorage?.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

export function downloadBlob(content: BlobPart, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadJson(data: unknown, filename: string): void {
  downloadBlob(JSON.stringify(data, null, 2), filename, "application/json");
}
