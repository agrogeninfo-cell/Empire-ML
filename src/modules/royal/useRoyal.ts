import { useMemo } from "react";
import {
  MONTHS,
  MONTHS_SHORT,
  buildMonth,
  buildWeeks,
  daysInMonth,
} from "@/lib/calendar";
import {
  DEFAULT_RANGE,
  computeInvoiceTotals,
  computeMonthPayslips,
  computePayslips,
  countRecords,
  filterDays,
  monthStats,
  rangeLabel,
  resolveWeekSlice,
  type RangeState,
} from "@/lib/payroll";
import type {
  CalendarDay,
  Employee,
  InvoiceTotals,
  PayslipRow,
  RoyalState,
  WeekSlice,
} from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════
 * useRoyal — every derived value the Payroll module needs, memoised once
 * so tabs never disagree with each other.
 * ═════════════════════════════════════════════════════════════════════ */

export interface RoyalDerived {
  period: RoyalState["period"];
  periodText: string;
  totalDays: number;
  days: CalendarDay[];
  weeks: WeekSlice[];

  range: RangeState;
  slice: WeekSlice | null;
  rangeDays: CalendarDay[];
  rangeText: string;
  isWeek: boolean;

  /** month-wise payslips — drives the client invoice */
  monthRows: PayslipRow[];
  /** payslips for the active range — drives the Payroll tab */
  rows: PayslipRow[];
  invoice: InvoiceTotals;

  stats: ReturnType<typeof monthStats>;
  recordCount: number;

  bonusEligible: number;
  bonusTotal: number;
  netTotal: number;
  grossTotal: number;
  deductionTotal: number;

  totalShifts: number;
  headcount: number;
}

export function useRoyal(state: RoyalState, range: RangeState): RoyalDerived {
  const {
    period,
    employees,
    attendance,
    deductions,
    payrollRates,
    invoiceRates,
    otHours,
    bonusDays,
    bonusAmount,
    poyaDays,
  } = state;

  const totalDays = useMemo(() => daysInMonth(period.y, period.m), [period]);
  const days = useMemo(() => buildMonth(period, poyaDays), [period, poyaDays]);
  const weeks = useMemo(() => buildWeeks(totalDays), [totalDays]);

  const slice = useMemo(() => resolveWeekSlice(range, totalDays), [range, totalDays]);
  const rangeDays = useMemo(() => filterDays(days, slice), [days, slice]);
  const rangeText = useMemo(() => rangeLabel(period, slice, range), [period, slice, range]);
  const isWeek = range.mode === "week";

  const monthRows = useMemo(
    () =>
      computeMonthPayslips(
        employees,
        attendance,
        period,
        payrollRates,
        deductions,
        poyaDays,
        bonusDays,
        bonusAmount,
      ),
    [employees, attendance, period, payrollRates, deductions, poyaDays, bonusDays, bonusAmount],
  );

  const rows = useMemo(
    () =>
      computePayslips(employees, {
        period,
        days: rangeDays,
        attendance,
        payrollRates,
        deductions,
        bonusDays,
        bonusAmount,
        isWeek,
        periodLabel: isWeek
          ? rangeText
          : `${MONTHS[period.m]} ${period.y}`,
      }),
    [
      employees,
      period,
      rangeDays,
      attendance,
      payrollRates,
      deductions,
      bonusDays,
      bonusAmount,
      isWeek,
      rangeText,
    ],
  );

  const invoice = useMemo(
    () => computeInvoiceTotals(monthRows, invoiceRates, otHours),
    [monthRows, invoiceRates, otHours],
  );

  const stats = useMemo(
    () => monthStats(period, poyaDays, attendance, employees),
    [period, poyaDays, attendance, employees],
  );

  const recordCount = useMemo(() => countRecords(attendance), [attendance]);

  const totals = useMemo(() => {
    let bonusEligible = 0;
    let bonusTotal = 0;
    let netTotal = 0;
    let grossTotal = 0;
    let deductionTotal = 0;
    let totalShifts = 0;
    for (const r of rows) {
      if (r.bonusEligible) {
        bonusEligible++;
        bonusTotal += r.bonus;
      }
      netTotal += r.net;
      grossTotal += r.gross;
      deductionTotal += r.totalDed;
      totalShifts += r.weekday + r.saturday + r.sunday;
    }
    return { bonusEligible, bonusTotal, netTotal, grossTotal, deductionTotal, totalShifts };
  }, [rows]);

  return {
    period,
    periodText: `${MONTHS[period.m]} ${period.y}`,
    totalDays,
    days,
    weeks,
    range,
    slice,
    rangeDays,
    rangeText,
    isWeek,
    monthRows,
    rows,
    invoice,
    stats,
    recordCount,
    headcount: employees.length,
    ...totals,
  };
}

export function useRoyalMonth(state: RoyalState): RoyalDerived {
  return useRoyal(state, DEFAULT_RANGE);
}

export { MONTHS_SHORT, DEFAULT_RANGE };

/** Stable identity for a filtered employee list. */
export function filterEmployees(
  employees: Employee[],
  query: string,
  filter: "all" | "male" | "female" | "bonus",
  bonusIds: Set<string>,
): Employee[] {
  const q = query.trim().toLowerCase();
  let list = employees;
  if (q) {
    list = list.filter(
      (e) => e.name.toLowerCase().includes(q) || String(e.nic).includes(q),
    );
  }
  if (filter === "male") list = list.filter((e) => !e.isFemale);
  if (filter === "female") list = list.filter((e) => e.isFemale);
  if (filter === "bonus") list = list.filter((e) => bonusIds.has(e.id));
  return list;
}
