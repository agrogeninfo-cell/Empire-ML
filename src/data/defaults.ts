import { POYA_DAYS_2026, currentPeriod, dateKey, estatePeriodFor } from "@/lib/calendar";
import {
  defaultDeductions,
  emptyAttendance,
  seedAttendance,
} from "@/lib/payroll";
import { seedEstateRecords } from "@/lib/estate";
import type {
  AppData,
  Employee,
  EstateRates,
  EstateState,
  InvoiceRates,
  OtHours,
  PayrollRates,
  RoyalState,
} from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════
 * Every default value lifted verbatim from the two source artefacts.
 * ═════════════════════════════════════════════════════════════════════ */

export const DEFAULT_PAYROLL_RATES: PayrollRates = {
  weekday: 2200,
  saturday: 2550,
  sunday: 3600,
  female: 100,
};

export const DEFAULT_INVOICE_RATES: InvoiceRates = {
  weekday: 1525,
  saturday: 1875,
  weekdayOT: 225,
  saturdayOT: 225,
  sunday: 300,
  female: 100,
  bonus: 5500,
};

/** Billable OT hours auto-derived per shift. */
export const DEFAULT_OT_HOURS: OtHours = {
  weekday: 3,
  saturday: 3,
  sunday: 12,
};

export const DEFAULT_BONUS_DAYS = 21;
export const DEFAULT_BONUS_AMOUNT = 5500;

export const DEFAULT_DEDUCTION = { meal: 1200, boarding: 2000, advance: 0 };

export const DEFAULT_TO_COMPANY = "ABC Manufacturing Pvt Ltd";
export const DEFAULT_INVOICE_NO = "RH-INV-2026-010";
export const DEFAULT_INVOICE_DATE = "2026-10-31";

export const DEMO_EMPLOYEES: Employee[] = [
  { id: "e1", name: "Kamal Perera", nic: "199012345678", rate: 2200, isFemale: false },
  { id: "e2", name: "Nimali Fernando", nic: "199578901234", rate: 2200, isFemale: true },
  { id: "e3", name: "Sunil Silva", nic: "198812345678", rate: 2200, isFemale: false },
  { id: "e4", name: "Kumari Jayasuriya", nic: "199212345123", rate: 2200, isFemale: true },
  { id: "e5", name: "Ruwan Mendis", nic: "199012398765", rate: 2200, isFemale: false },
  { id: "e6", name: "Dilani Rathnayake", nic: "199345678901", rate: 2200, isFemale: true },
];

export const DEFAULT_ESTATE_RATES: EstateRates = {
  maleDay: 3000,
  femaleDay: 2500,
  maleNight: 2925,
  femaleNight: 2425,
  otRate: 225,
  lateRate: 150,
};

export const DEFAULT_ESTATE_COMPANY = "Millennium Teas";
export const DEFAULT_ESTATE_LABEL = "Labour Invoice • Estate 24–24";

export const POYA_DAYS: string[] = [...POYA_DAYS_2026];

/* ═══════════════════════════════════════════════════════════════════════
 * State factories
 * ═════════════════════════════════════════════════════════════════════ */

export function blankRoyalState(): RoyalState {
  const employees: Employee[] = [];
  return {
    employees,
    attendance: emptyAttendance(employees),
    deductions: defaultDeductions(employees),
    invoiceRates: { ...DEFAULT_INVOICE_RATES },
    payrollRates: { ...DEFAULT_PAYROLL_RATES },
    otHours: { ...DEFAULT_OT_HOURS },
    bonusDays: DEFAULT_BONUS_DAYS,
    bonusAmount: DEFAULT_BONUS_AMOUNT,
    poyaDays: [...POYA_DAYS],
    toCompany: DEFAULT_TO_COMPANY,
    invoiceNo: DEFAULT_INVOICE_NO,
    invoiceDate: DEFAULT_INVOICE_DATE,
    period: currentPeriod(),
  };
}

export function demoRoyalState(): RoyalState {
  const employees = DEMO_EMPLOYEES.map((e) => ({ ...e }));
  const period = currentPeriod();
  const deductions = defaultDeductions(employees);
  for (const e of employees) deductions[e.id] = { ...DEFAULT_DEDUCTION };
  return {
    employees,
    attendance: seedAttendance(employees, period, POYA_DAYS),
    deductions,
    invoiceRates: { ...DEFAULT_INVOICE_RATES },
    payrollRates: { ...DEFAULT_PAYROLL_RATES },
    otHours: { ...DEFAULT_OT_HOURS },
    bonusDays: DEFAULT_BONUS_DAYS,
    bonusAmount: DEFAULT_BONUS_AMOUNT,
    poyaDays: [...POYA_DAYS],
    toCompany: DEFAULT_TO_COMPANY,
    invoiceNo: DEFAULT_INVOICE_NO,
    invoiceDate: DEFAULT_INVOICE_DATE,
    period,
  };
}

export function blankEstateState(): EstateState {
  return {
    records: {},
    rates: { ...DEFAULT_ESTATE_RATES },
    companyName: DEFAULT_ESTATE_COMPANY,
    estateLabel: DEFAULT_ESTATE_LABEL,
    periodAnchor: dateKey(new Date()),
  };
}

export function demoEstateState(): EstateState {
  const anchor = dateKey(new Date());
  const period = estatePeriodFor(new Date(`${anchor}T00:00:00`));
  return {
    records: seedEstateRecords(period),
    rates: { ...DEFAULT_ESTATE_RATES },
    companyName: DEFAULT_ESTATE_COMPANY,
    estateLabel: DEFAULT_ESTATE_LABEL,
    periodAnchor: anchor,
  };
}

export function blankAppData(): AppData {
  return {
    version: 3,
    royal: blankRoyalState(),
    estate: blankEstateState(),
    activeModule: "royal",
  };
}

export function demoAppData(): AppData {
  return {
    version: 3,
    royal: demoRoyalState(),
    estate: demoEstateState(),
    activeModule: "royal",
    savedAt: new Date().toISOString(),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * Copy for the UI
 * ═════════════════════════════════════════════════════════════════════ */

export const ROYAL_NOTES = [
  "Sunday / Poya = 3600 rate (payroll) • 12h OT billing • Blue/Red badge in attendance grid",
  "Attendance bonus pays once per employee when they cross the distinct-working-day threshold",
  "Female night allowance is counted per N shift for female staff only",
  "Invoice OT quantities are derived automatically — weekday & Saturday shifts × 3h, Sunday/Poya × 12h",
];

export const ESTATE_NOTES = [
  "24–24 logic: if the day is ≥ 24 the window runs 24th this month → 23rd next, otherwise 24th previous → 23rd this month",
  "One record per date — saving overwrites the previous entry for that date",
  "Counts accept 0.5 steps so half shifts bill correctly",
  "Late hours are a deduction, everything else is additive",
];
