import {
  MONTHS,
  MONTHS_SHORT,
  buildMonth,
  buildWeeks,
  dateKey,
  daysInMonth,
} from "./calendar";
import type {
  AttendanceMap,
  CalendarDay,
  DayMark,
  DeductionMap,
  Deductions,
  Employee,
  InvoiceRates,
  InvoiceTotals,
  OtHours,
  PayrollRates,
  Period,
  PayslipRow,
  RangeMode,
  WeekId,
  WeekSlice,
} from "./types";

/* ═══════════════════════════════════════════════════════════════════════
 * Shift-mark helpers
 *
 * Tap cycle used by the attendance grid / cards:
 *   ∅ → D → N → D+N → ∅
 * ═════════════════════════════════════════════════════════════════════ */

export function nextMark(current: DayMark | undefined): DayMark | null {
  if (!current || (!current.D && !current.N)) return { D: true, N: false };
  if (current.D && !current.N) return { D: false, N: true };
  if (!current.D && current.N) return { D: true, N: true };
  return null; // D+N → off
}

export const MARK_KINDS = ["OFF", "D", "N", "BOTH"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export function markKind(m: DayMark | undefined): MarkKind {
  if (!m || (!m.D && !m.N)) return "OFF";
  if (m.D && m.N) return "BOTH";
  return m.D ? "D" : "N";
}

export function kindToMark(kind: MarkKind): DayMark | null {
  switch (kind) {
    case "D":
      return { D: true, N: false };
    case "N":
      return { D: false, N: true };
    case "BOTH":
      return { D: true, N: true };
    default:
      return null;
  }
}

export function isMarked(m: DayMark | undefined): boolean {
  return !!m && (m.D || m.N);
}

/** Number of billable shifts on a date — a D+N day counts as two. */
export function shiftCount(m: DayMark | undefined): number {
  if (!m) return 0;
  return (m.D ? 1 : 0) + (m.N ? 1 : 0);
}

export const EMPTY_DEDUCTION: Deductions = { meal: 0, boarding: 0, advance: 0 };

export function deductionOf(map: DeductionMap, id: string): Deductions {
  return map[id] ?? EMPTY_DEDUCTION;
}

export function deductionTotal(d: Deductions): number {
  return (d.meal || 0) + (d.boarding || 0) + (d.advance || 0);
}

/* ═══════════════════════════════════════════════════════════════════════
 * Range resolution — month / preset week / custom day range
 * ═════════════════════════════════════════════════════════════════════ */

export interface RangeState {
  mode: RangeMode;
  weekId: WeekId;
  fromDay: number;
  toDay: number;
}

export const DEFAULT_RANGE: RangeState = {
  mode: "month",
  weekId: "w1",
  fromDay: 1,
  toDay: 7,
};

export function resolveWeekSlice(
  range: RangeState,
  total: number,
): WeekSlice | null {
  if (range.mode === "month") return null;
  if (range.weekId === "custom") {
    let start = clamp(range.fromDay || 1, 1, total);
    let end = clamp(range.toDay || total, 1, total);
    if (start > end) [start, end] = [end, start];
    return { id: "custom", label: `Custom ${start}-${end}`, start, end };
  }
  const preset = buildWeeks(total).find((w) => w.id === range.weekId);
  return preset ?? { id: "w1", label: "Week 1 (1-7)", start: 1, end: Math.min(7, total) };
}

export function rangeLabel(
  period: Period,
  slice: WeekSlice | null,
  range: RangeState,
): string {
  const month = `${MONTHS[period.m]} ${period.y}`;
  if (!slice) return month;
  const short = MONTHS_SHORT[period.m];
  if (range.weekId === "custom") return `Custom: ${short} ${slice.start}-${slice.end}, ${period.y}`;
  return `${slice.label}: ${short} ${slice.start}-${slice.end}, ${period.y}`;
}

export function filterDays(days: CalendarDay[], slice: WeekSlice | null): CalendarDay[] {
  if (!slice) return days;
  return days.filter((d) => d.d >= slice.start && d.d <= slice.end);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/* ═══════════════════════════════════════════════════════════════════════
 * Per-employee payslip maths
 *
 * Faithful port of the source `useMemo` blocks:
 *   • a D or N mark on a date makes that date a *distinct working day*
 *   • each of D and N is billed as its own shift against the date's class
 *   • female staff earn an extra allowance for every N shift
 *   • bonus triggers on `bonusDays` distinct dates (never on a week range)
 * ═════════════════════════════════════════════════════════════════════ */

export interface PayslipOptions {
  period: Period;
  days: CalendarDay[];
  attendance: AttendanceMap;
  payrollRates: PayrollRates;
  deductions: DeductionMap;
  bonusDays: number;
  bonusAmount: number;
  isWeek: boolean;
  periodLabel: string;
}

export function computePayslips(
  employees: Employee[],
  o: PayslipOptions,
): PayslipRow[] {
  return employees.map((emp) => {
    let weekday = 0;
    let saturday = 0;
    let sunday = 0; // sunday + poya are billed together
    let femaleN = 0;
    const distinct = new Set<string>();

    const empAtt = o.attendance[emp.id];

    for (const day of o.days) {
      const mark = empAtt?.[day.key];
      if (!mark || (!mark.D && !mark.N)) continue;

      distinct.add(day.key);

      const t = day.info.type;
      if (mark.D) {
        if (t === "weekday") weekday++;
        else if (t === "saturday") saturday++;
        else sunday++;
      }
      if (mark.N) {
        if (t === "weekday") weekday++;
        else if (t === "saturday") saturday++;
        else sunday++;
        if (emp.isFemale) femaleN++;
      }
    }

    const workingDays = distinct.size;
    // Bonus is a monthly incentive — explicitly N/A for week-wise ranges.
    const bonusEligible = o.isWeek ? false : workingDays >= o.bonusDays;
    const bonus = bonusEligible ? o.bonusAmount : 0;

    const gross =
      weekday * o.payrollRates.weekday +
      saturday * o.payrollRates.saturday +
      sunday * o.payrollRates.sunday +
      femaleN * o.payrollRates.female +
      bonus;

    const ded = deductionOf(o.deductions, emp.id);
    const totalDed = deductionTotal(ded);

    return {
      emp,
      weekday,
      saturday,
      sunday,
      femaleN,
      workingDays,
      bonusEligible,
      bonus,
      gross,
      totalDed,
      net: gross - totalDed,
      ded,
      periodLabel: o.periodLabel,
      isWeek: o.isWeek,
    };
  });
}

/** Month-wise payslips — the canonical set used for the invoice roll-up. */
export function computeMonthPayslips(
  employees: Employee[],
  attendance: AttendanceMap,
  period: Period,
  payrollRates: PayrollRates,
  deductions: DeductionMap,
  poyaDays: string[],
  bonusDays: number,
  bonusAmount: number,
): PayslipRow[] {
  const days = buildMonth(period, poyaDays);
  return computePayslips(employees, {
    period,
    days,
    attendance,
    payrollRates,
    deductions,
    bonusDays,
    bonusAmount,
    isWeek: false,
    periodLabel: `${MONTHS[period.m]} ${period.y}`,
  });
}

/* ═══════════════════════════════════════════════════════════════════════
 * Client invoice roll-up
 *
 *   qty(weekdayOT)  = weekday shifts  × otHours.weekday  (3)
 *   qty(saturdayOT) = saturday shifts × otHours.saturday (3)
 *   qty(sundayOT)   = sunday/poya     × otHours.sunday   (12)
 * ═════════════════════════════════════════════════════════════════════ */

export function computeInvoiceTotals(
  rows: PayslipRow[],
  rates: InvoiceRates,
  ot: OtHours,
): InvoiceTotals {
  let weekday = 0;
  let saturday = 0;
  let sunday = 0;
  let female = 0;
  let bonusCount = 0;

  for (const r of rows) {
    weekday += r.weekday;
    saturday += r.saturday;
    sunday += r.sunday;
    female += r.femaleN;
    if (r.bonusEligible) bonusCount++;
  }

  const weekdayOT = weekday * ot.weekday;
  const saturdayOT = saturday * ot.saturday;
  const sundayOT = sunday * ot.sunday;

  const total =
    weekday * rates.weekday +
    saturday * rates.saturday +
    weekdayOT * rates.weekdayOT +
    saturdayOT * rates.saturdayOT +
    sundayOT * rates.sunday +
    female * rates.female +
    bonusCount * rates.bonus;

  return {
    weekday,
    saturday,
    sunday,
    female,
    bonusCount,
    weekdayOT,
    saturdayOT,
    sundayOT,
    total,
  };
}

export interface InvoiceLine {
  no: number;
  desc: string;
  qty: number;
  rate: number;
  amount: number;
  /** highlight row (used for the "NEW" female-night allowance line) */
  highlight?: boolean;
}

export function invoiceLines(t: InvoiceTotals, rates: InvoiceRates, ot: OtHours): InvoiceLine[] {
  return [
    { no: 1, desc: "Week days Shift", qty: t.weekday, rate: rates.weekday, amount: t.weekday * rates.weekday },
    { no: 2, desc: "Saturday Shift", qty: t.saturday, rate: rates.saturday, amount: t.saturday * rates.saturday },
    {
      no: 3,
      desc: `Weekday N/Day OT (${ot.weekday}h)`,
      qty: t.weekdayOT,
      rate: rates.weekdayOT,
      amount: t.weekdayOT * rates.weekdayOT,
    },
    {
      no: 4,
      desc: `Saturday OT (${ot.saturday}h)`,
      qty: t.saturdayOT,
      rate: rates.saturdayOT,
      amount: t.saturdayOT * rates.saturdayOT,
    },
    {
      no: 5,
      desc: `Sunday / Poya OT (${ot.sunday}h)`,
      qty: t.sundayOT,
      rate: rates.sunday,
      amount: t.sundayOT * rates.sunday,
    },
    {
      no: 6,
      desc: "Female Night Allowance",
      qty: t.female,
      rate: rates.female,
      amount: t.female * rates.female,
      highlight: true,
    },
    {
      no: 7,
      desc: `Attendance Bonus (${21}+ days)`,
      qty: t.bonusCount,
      rate: rates.bonus,
      amount: t.bonusCount * rates.bonus,
    },
  ];
}

/** Rebuilds line 7's description with the live bonus threshold. */
export function invoiceLinesFor(
  t: InvoiceTotals,
  rates: InvoiceRates,
  ot: OtHours,
  bonusDays: number,
): InvoiceLine[] {
  const lines = invoiceLines(t, rates, ot);
  const bonus = lines.find((l) => l.no === 7);
  if (bonus) bonus.desc = `Attendance Bonus (${bonusDays}+ days)`;
  return lines;
}

/* ═══════════════════════════════════════════════════════════════════════
 * Attendance analytics
 * ═════════════════════════════════════════════════════════════════════ */

export interface MonthStats {
  totalDays: number;
  weekdays: number;
  saturdays: number;
  sundays: number; // sunday + poya
  poyas: number;
  totalShifts: number;
  markedCells: number;
  /** employeeId → shifts in the month */
  perEmployee: Record<string, number>;
}

export function monthStats(
  period: Period,
  poyaDays: string[],
  attendance: AttendanceMap,
  employees: Employee[],
): MonthStats {
  const days = buildMonth(period, poyaDays);
  const perEmployee: Record<string, number> = {};
  let weekdays = 0;
  let saturdays = 0;
  let sundays = 0;
  let poyas = 0;
  let markedCells = 0;

  for (const d of days) {
    if (d.info.type === "weekday") weekdays++;
    else if (d.info.type === "saturday") saturdays++;
    else if (d.info.type === "poya") poyas++;
    else sundays++;
  }

  let totalShifts = 0;
  for (const emp of employees) {
    let n = 0;
    const att = attendance[emp.id];
    if (att) {
      for (const d of days) {
        const c = shiftCount(att[d.key]);
        n += c;
        if (c) markedCells++;
      }
    }
    perEmployee[emp.id] = n;
    totalShifts += n;
  }

  return {
    totalDays: daysInMonth(period.y, period.m),
    weekdays,
    saturdays,
    sundays,
    poyas,
    totalShifts,
    markedCells,
    perEmployee,
  };
}

/** How many staff are marked (D or N) on one date — the "Today" header stat. */
export function presentOn(
  dateKeyStr: string,
  attendance: AttendanceMap,
  employees: Employee[],
): number {
  let n = 0;
  for (const e of employees) if (isMarked(attendance[e.id]?.[dateKeyStr])) n++;
  return n;
}

export function nightShiftsOn(
  dateKeyStr: string,
  attendance: AttendanceMap,
  employees: Employee[],
): number {
  let n = 0;
  for (const e of employees) if (attendance[e.id]?.[dateKeyStr]?.N) n++;
  return n;
}

/** Count of employees crossing the bonus threshold this month. */
export function bonusEligibleCount(rows: PayslipRow[]): number {
  return rows.filter((r) => r.bonusEligible).length;
}

/** Shortfall to the bonus threshold, per employee — powers the progress rings. */
export function bonusProgress(row: PayslipRow, bonusDays: number): number {
  if (bonusDays <= 0) return 1;
  return clamp(row.workingDays / bonusDays, 0, 1);
}

export function nextBonusGap(row: PayslipRow, bonusDays: number): number {
  return Math.max(0, bonusDays - row.workingDays);
}

/* ═══════════════════════════════════════════════════════════════════════
 * Attendance mutation primitives (pure — return a new map)
 * ═════════════════════════════════════════════════════════════════════ */

export function setMark(
  attendance: AttendanceMap,
  empId: string,
  key: string,
  mark: DayMark | null,
): AttendanceMap {
  const next: AttendanceMap = { ...attendance, [empId]: { ...(attendance[empId] ?? {}) } };
  if (mark) next[empId][key] = mark;
  else delete next[empId][key];
  return next;
}

export function setMarks(
  attendance: AttendanceMap,
  empIds: string[],
  keys: string[],
  mark: DayMark | null,
): AttendanceMap {
  const next: AttendanceMap = { ...attendance };
  for (const id of empIds) {
    const cur = { ...(next[id] ?? {}) };
    for (const k of keys) {
      if (mark) cur[k] = mark;
      else delete cur[k];
    }
    next[id] = cur;
  }
  return next;
}

/** Preserve an existing night flag while forcing day on/off. */
export function mergeDay(
  attendance: AttendanceMap,
  empIds: string[],
  keys: string[],
  day: boolean,
): AttendanceMap {
  const next: AttendanceMap = { ...attendance };
  for (const id of empIds) {
    const cur = { ...(next[id] ?? {}) };
    for (const k of keys) {
      const existing = cur[k];
      const N = existing?.N ?? false;
      if (day || N) cur[k] = { D: day, N };
      else delete cur[k];
    }
    next[id] = cur;
  }
  return next;
}

export function clearEmployees(attendance: AttendanceMap, empIds: string[]): AttendanceMap {
  const next: AttendanceMap = { ...attendance };
  for (const id of empIds) next[id] = {};
  return next;
}

export function countRecords(attendance: AttendanceMap): number {
  let n = 0;
  for (const k of Object.keys(attendance)) n += Object.keys(attendance[k] ?? {}).length;
  return n;
}

export function dropEmployee(
  attendance: AttendanceMap,
  deductions: DeductionMap,
  empId: string,
): { attendance: AttendanceMap; deductions: DeductionMap } {
  const a: AttendanceMap = { ...attendance };
  const d: DeductionMap = { ...deductions };
  delete a[empId];
  delete d[empId];
  return { attendance: a, deductions: d };
}

export function makeEmployeeId(): string {
  return `e${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
}

export function seedAttendance(
  employees: Employee[],
  period: Period,
  poyaDays: string[],
): AttendanceMap {
  const map: AttendanceMap = {};
  const days = buildMonth(period, poyaDays);
  for (const emp of employees) {
    map[emp.id] = {};
    for (const day of days) {
      // mirrors the demo generator shipped in the source artefact
      if (day.d % 7 === 0 || day.d % 9 === 0) continue;
      const isWorkday = day.info.type === "weekday" || day.info.type === "saturday";
      const D = isWorkday ? Math.random() > 0.15 : Math.random() > 0.75;
      const N = emp.isFemale ? Math.random() > 0.7 : Math.random() > 0.85;
      if (D || N) map[emp.id][day.key] = { D, N };
    }
  }
  return map;
}

export function emptyAttendance(employees: Employee[]): AttendanceMap {
  const map: AttendanceMap = {};
  for (const e of employees) map[e.id] = {};
  return map;
}

export function defaultDeductions(employees: Employee[]): DeductionMap {
  const map: DeductionMap = {};
  for (const e of employees) map[e.id] = { ...EMPTY_DEDUCTION };
  return map;
}

export { buildMonth, buildWeeks, dateKey, daysInMonth };
