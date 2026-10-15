/* ─────────────────────────────────────────────────────────────────────────
 * Empire ML — shared domain types
 * Extracted 1:1 from the two source artefacts:
 *   • millennium-scroll-reveal.html      → Estate (Millennium Teas) module
 *   • royal_x5f_hires_final_bonus.html   → Payroll (Royal Hires) module
 * ────────────────────────────────────────────────────────────────────── */

export type ModuleId = "royal" | "estate";

/* ═══ ROYAL HIRES · Payroll ══════════════════════════════════════════════ */

export interface Employee {
  id: string;
  name: string;
  nic: string;
  /** Legacy per-shift rate kept on the record; payroll maths uses PayrollRates */
  rate: number;
  isFemale: boolean;
}

/** A single day's mark for one employee. `D` = day shift, `N` = night shift. */
export interface DayMark {
  D: boolean;
  N: boolean;
}

/** employeeId → "YYYY-MM-DD" → DayMark */
export type AttendanceMap = Record<string, Record<string, DayMark>>;

export interface Deductions {
  meal: number;
  boarding: number;
  advance: number;
}

/** employeeId → Deductions */
export type DeductionMap = Record<string, Deductions>;

export type DayType = "weekday" | "saturday" | "sunday" | "poya";

export interface DayInfo {
  type: DayType;
  label: string;
  /** tailwind classes used by the compact chips */
  tone: "poya" | "sunday" | "saturday" | "weekday";
}

export interface CalendarDay {
  d: number;
  date: Date;
  key: string; // YYYY-MM-DD
  info: DayInfo;
  dow: string; // Sun..Sat
}

/** Rates the company pays each employee. */
export interface PayrollRates {
  weekday: number;
  saturday: number;
  sunday: number;
  /** female night-shift allowance, per N shift */
  female: number;
}

/** Rates billed to the client company. */
export interface InvoiceRates {
  weekday: number;
  saturday: number;
  weekdayOT: number;
  saturdayOT: number;
  sunday: number;
  female: number;
  bonus: number;
}

/** Number of billable OT hours auto-derived from a single shift. */
export interface OtHours {
  weekday: number;
  saturday: number;
  sunday: number;
}

export interface Period {
  y: number;
  /** 0-based month */
  m: number;
}

export type RangeMode = "month" | "week";
export type WeekId = "w1" | "w2" | "w3" | "w4" | "w5" | "custom";

export interface WeekSlice {
  id?: WeekId;
  label: string;
  start: number;
  end: number;
}

export interface PayslipRow {
  emp: Employee;
  weekday: number;
  saturday: number;
  sunday: number;
  femaleN: number;
  workingDays: number;
  bonusEligible: boolean;
  bonus: number;
  gross: number;
  totalDed: number;
  net: number;
  ded: Deductions;
  periodLabel: string;
  isWeek?: boolean;
}

export interface InvoiceTotals {
  weekday: number;
  saturday: number;
  sunday: number;
  female: number;
  bonusCount: number;
  weekdayOT: number;
  saturdayOT: number;
  sundayOT: number;
  total: number;
}

/* ═══ MILLENNIUM ESTATE ══════════════════════════════════════════════════ */

export interface EstateRates {
  maleDay: number;
  femaleDay: number;
  maleNight: number;
  femaleNight: number;
  otRate: number;
  lateRate: number;
}

/** One record per calendar date — saving overwrites the previous entry. */
export interface EstateDayRecord {
  date: string; // YYYY-MM-DD
  maleCount: number;
  femaleCount: number;
  maleOt: number;
  femaleOt: number;
  lateHours: number;
  inTime: string;
  outTime: string;
}

export type EstateRecords = Record<string, EstateDayRecord>;

/** "24–24" billing window: 24th of one month → 23rd of the next. */
export interface EstatePeriod {
  start: Date;
  end: Date;
}

/* ═══ Persistence ════════════════════════════════════════════════════════ */

export interface RoyalState {
  employees: Employee[];
  attendance: AttendanceMap;
  deductions: DeductionMap;
  invoiceRates: InvoiceRates;
  payrollRates: PayrollRates;
  otHours: OtHours;
  /** distinct working dates needed to qualify for the attendance bonus */
  bonusDays: number;
  /** amount paid to the employee when they qualify */
  bonusAmount: number;
  poyaDays: string[];
  toCompany: string;
  invoiceNo: string;
  invoiceDate: string;
  period: Period;
}

export interface EstateState {
  records: EstateRecords;
  rates: EstateRates;
  companyName: string;
  estateLabel: string;
  periodAnchor: string; // YYYY-MM-DD inside the active 24–24 window
}

export interface AppData {
  version: number;
  royal: RoyalState;
  estate: EstateState;
  activeModule: ModuleId;
  savedAt?: string;
}

export type DataSource = "fresh" | "main" | "backup_restored" | "legacy_migrated" | "demo";
