/**
 * Empire ML — calculation fidelity harness
 *
 * Every assertion here re-derives the expected value from the ORIGINAL
 * minified artefacts (transcribed inline as `legacy*` functions) and checks
 * that the rebuilt engine agrees. Run with `npm run verify`.
 */
import {
  POYA_DAYS_2026,
  buildMonth,
  buildWeeks,
  classifyDay,
  dateKey,
  daysInMonth,
  estatePeriodDays,
  estatePeriodFor,
  estatePeriodLabel,
  estatePreviousPeriod,
  money,
  ordinal,
} from "../src/lib/calendar";
import {
  computeInvoiceTotals,
  computeMonthPayslips,
  computePayslips,
  countRecords,
  dropEmployee,
  markKind,
  mergeDay,
  nextMark,
  resolveWeekSlice,
  setMark,
  setMarks,
  DEFAULT_RANGE,
} from "../src/lib/payroll";
import {
  ESTATE_CSV_FILE_HEADERS,
  ESTATE_CSV_HEADERS,
  cardFills,
  dayAmount,
  deltaPercent,
  estateCsv,
  femaleAmount,
  halfStep,
  maleAmount,
  periodTotals,
  recordsInPeriod,
  seedEstateRecords,
} from "../src/lib/estate";
import {
  DEFAULT_BONUS_AMOUNT,
  DEFAULT_BONUS_DAYS,
  DEFAULT_ESTATE_RATES,
  DEFAULT_INVOICE_RATES,
  DEFAULT_OT_HOURS,
  DEFAULT_PAYROLL_RATES,
  DEMO_EMPLOYEES,
} from "../src/data/defaults";
import type {
  AttendanceMap,
  DayMark,
  Employee,
  EstateDayRecord,
  EstateRecords,
} from "../src/lib/types";

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

/* ─────────────────────────────────────────────────────────────────
 * LEGACY TRANSCRIPTIONS — copied semantics from the minified sources
 * ───────────────────────────────────────────────────────────────── */

/** royal artefact: `JA(y,m,d)` */
const legacyKey = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** royal artefact: `MF(date,y,m,d)` */
function legacyDayInfo(date: Date, y: number, m: number, d: number) {
  const key = legacyKey(y, m, d);
  if ((POYA_DAYS_2026 as readonly string[]).includes(key)) return "poya";
  const dow = date.getDay();
  if (dow === 0) return "sunday";
  if (dow === 6) return "saturday";
  return "weekday";
}

/** royal artefact: per-employee `pe` useMemo */
function legacyPayslip(
  emp: Employee,
  attendance: AttendanceMap,
  period: { y: number; m: number },
  rates = DEFAULT_PAYROLL_RATES,
  ded = { meal: 0, boarding: 0, advance: 0 },
) {
  const total = daysInMonth(period.y, period.m);
  let U = 0, S = 0, g = 0, B = 0;
  const z = new Set<string>();
  for (let d = 1; d <= total; d++) {
    const key = legacyKey(period.y, period.m, d);
    const mark = attendance[emp.id]?.[key];
    if (!mark) continue;
    const type = legacyDayInfo(new Date(period.y, period.m, d), period.y, period.m, d);
    if (mark.D || mark.N) z.add(key);
    if (mark.D) {
      if (type === "weekday") U++;
      else if (type === "saturday") S++;
      else g++;
    }
    if (mark.N) {
      if (type === "weekday") U++;
      else if (type === "saturday") S++;
      else g++;
      if (emp.isFemale) B++;
    }
  }
  const N = z.size;
  const J = N >= 21;
  const V = J ? 5500 : 0;
  const D = U * rates.weekday + S * rates.saturday + g * rates.sunday + B * rates.female + V;
  const oe = ded.meal + ded.boarding + ded.advance;
  return { weekday: U, saturday: S, sunday: g, femaleN: B, workingDays: N, bonusEligible: J, bonus: V, gross: D, totalDed: oe, net: D - oe };
}

/** royal artefact: invoice `M` useMemo */
function legacyInvoice(rows: ReturnType<typeof legacyPayslip>[], rates = DEFAULT_INVOICE_RATES) {
  let u = 0, U = 0, S = 0, g = 0, B = 0;
  rows.forEach((r) => {
    u += r.weekday; U += r.saturday; S += r.sunday; g += r.femaleN;
    if (r.bonusEligible) B++;
  });
  const z = u * 3, N = U * 3, J = S * 12;
  const V = u * rates.weekday + U * rates.saturday + z * rates.weekdayOT + N * rates.saturdayOT + J * rates.sunday + g * rates.female + B * rates.bonus;
  return { weekday: u, saturday: U, sunday: S, female: g, bonusCount: B, weekdayOT: z, saturdayOT: N, sundayOT: J, total: V };
}

/** millennium artefact: `Hl(date)` — the 24–24 window */
function legacyPeriod(date: Date) {
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  let start: Date, end: Date;
  if (d >= 24) { start = new Date(y, m, 24); end = new Date(y, m + 1, 23); }
  else { start = new Date(y, m - 1, 24); end = new Date(y, m, 23); }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** millennium artefact: `O0(start,end)` */
const legacyDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000) + 1;

/** millennium artefact: `$n(record, rates)` */
function legacyDayAmount(r: EstateDayRecord, rates = DEFAULT_ESTATE_RATES) {
  const shifts = r.maleCount * rates.maleDay + r.femaleCount * rates.femaleDay;
  const ot = (r.maleOt + r.femaleOt) * rates.otRate;
  const late = r.lateHours * rates.lateRate;
  return shifts + ot - late;
}

/** millennium artefact: `L(current, previous)` */
function legacyDelta(y?: number, I?: number) {
  if (y === undefined || y === null) return "0%";
  if (!I) return y > 0 ? "+100%" : "0%";
  const fe = ((y - I) / I) * 100;
  return `${fe >= 0 ? "+" : ""}${fe.toFixed(0)}%`;
}

/* ───────────────────────── fixtures ───────────────────────── */

const OCT_2026 = { y: 2026, m: 9 };
const POYA: string[] = [...POYA_DAYS_2026];

function handBuiltAttendance(): { employees: Employee[]; attendance: AttendanceMap } {
  // Oct 2026: 1 Oct = Thursday. Poya falls on 25 Oct (a Sunday).
  const employees: Employee[] = [
    { id: "m1", name: "Male One", nic: "199000000001", rate: 2200, isFemale: false },
    { id: "f1", name: "Female One", nic: "199000000002", rate: 2200, isFemale: true },
  ];
  const attendance: AttendanceMap = { m1: {}, f1: {} };

  // male: 20 plain weekdays D
  let weekdays = 0;
  for (let d = 1; d <= 31 && weekdays < 20; d++) {
    const key = dateKey(2026, 9, d);
    if (legacyDayInfo(new Date(2026, 9, d), 2026, 9, d) === "weekday") {
      attendance.m1[key] = { D: true, N: false };
      weekdays++;
    }
  }
  // female: 21 distinct dates, mixing D, N and one D+N (Poya 25 Oct)
  let picked = 0;
  for (let d = 1; d <= 31 && picked < 21; d++) {
    const key = dateKey(2026, 9, d);
    const type = legacyDayInfo(new Date(2026, 9, d), 2026, 9, d);
    if (type === "poya") {
      attendance.f1[key] = { D: true, N: true };
      picked++;
    } else if (type === "saturday") {
      attendance.f1[key] = { D: false, N: true };
      picked++;
    } else if (picked % 2 === 0) {
      attendance.f1[key] = { D: false, N: true };
      picked++;
    } else {
      attendance.f1[key] = { D: true, N: false };
      picked++;
    }
  }
  return { employees, attendance };
}

/* ═════════════════════════════════════════════════════════════
 * 1 · Calendar & day classification
 * ═════════════════════════════════════════════════════════════ */

section("1 · Calendar & day classification");

eq(dateKey(2026, 9, 5), "2026-10-05", "dateKey(y,m,d) pads month and day");
eq(dateKey(new Date(2026, 0, 3)), "2026-01-03", "dateKey(Date) matches");
eq(POYA.length, 13, "13 Poya dates extracted for 2026");
eq(daysInMonth(2026, 9), 31, "October 2026 has 31 days");
eq(daysInMonth(2026, 1), 28, "February 2026 has 28 days");
eq(daysInMonth(2024, 1), 29, "leap-year February 2024 has 29 days");

// classification must agree with the legacy transcription for a whole year
let classMismatch = 0;
for (let m = 0; m < 12; m++) {
  for (let d = 1; d <= daysInMonth(2026, m); d++) {
    const date = new Date(2026, m, d);
    const key = dateKey(2026, m, d);
    if (classifyDay(date, key, POYA).type !== legacyDayInfo(date, 2026, m, d)) classMismatch++;
  }
}
eq(classMismatch, 0, "classifyDay matches legacy getDayInfo across all of 2026");

eq(classifyDay(new Date(2026, 9, 25), "2026-10-25", POYA).type, "poya", "Poya beats Sunday");
eq(classifyDay(new Date(2026, 9, 24), "2026-10-24", POYA).type, "saturday", "24 Oct 2026 is Saturday");
eq(classifyDay(new Date(2026, 9, 26), "2026-10-26", POYA).type, "weekday", "26 Oct 2026 is a weekday");
eq(classifyDay(new Date(2026, 9, 4), "2026-10-04", POYA).type, "sunday", "4 Oct 2026 is Sunday");

const octDays = buildMonth(OCT_2026, POYA);
eq(octDays.length, 31, "buildMonth returns every day");
eq(octDays[0].key, "2026-10-01", "first day key");
eq(octDays[30].d, 31, "last day number");

section("Week slicing");
const weeks31 = buildWeeks(31);
eq(weeks31.length, 5, "31-day month yields 5 weeks");
eq(weeks31[4], { id: "w5", label: "Week 5 (29-31)", start: 29, end: 31 }, "week 5 clamps to month end");
eq(buildWeeks(28).length, 4, "28-day month yields 4 weeks");
eq(buildWeeks(28).map((w) => w.label), ["Week 1 (1-7)", "Week 2 (8-14)", "Week 3 (15-21)", "Week 4 (22-28)"], "week labels match source");
eq(resolveWeekSlice({ ...DEFAULT_RANGE, mode: "week", weekId: "w3" }, 31), { id: "w3", label: "Week 3 (15-21)", start: 15, end: 21 }, "resolveWeekSlice finds preset");
eq(resolveWeekSlice({ ...DEFAULT_RANGE, mode: "week", weekId: "custom", fromDay: 18, toDay: 4 }, 31), { id: "custom", label: "Custom 4-18", start: 4, end: 18 }, "custom range swaps when reversed");
eq(resolveWeekSlice(DEFAULT_RANGE, 31), null, "month mode has no slice");

/* ═════════════════════════════════════════════════════════════
 * 2 · Royal Hires payslip maths
 * ═════════════════════════════════════════════════════════════ */

section("2 · Payslip maths");

const fixture = handBuiltAttendance();
const deductions: Record<string, { meal: number; boarding: number; advance: number }> = {
  m1: { meal: 1200, boarding: 2000, advance: 0 },
  f1: { meal: 0, boarding: 0, advance: 500 },
};

const mine = computeMonthPayslips(
  fixture.employees,
  fixture.attendance,
  OCT_2026,
  DEFAULT_PAYROLL_RATES,
  deductions,
  POYA,
  DEFAULT_BONUS_DAYS,
  DEFAULT_BONUS_AMOUNT,
);
const legacy = fixture.employees.map((e) => ({
  ...legacyPayslip(e, fixture.attendance, OCT_2026, DEFAULT_PAYROLL_RATES, deductions[e.id]),
}));

for (let i = 0; i < mine.length; i++) {
  const m = mine[i], l = legacy[i];
  eq(m.weekday, l.weekday, `[${i}] weekday shifts`);
  eq(m.saturday, l.saturday, `[${i}] saturday shifts`);
  eq(m.sunday, l.sunday, `[${i}] sunday/poya shifts`);
  eq(m.femaleN, l.femaleN, `[${i}] female night shifts`);
  eq(m.workingDays, l.workingDays, `[${i}] distinct working days`);
  eq(m.bonusEligible, l.bonusEligible, `[${i}] bonus eligibility`);
  eq(m.bonus, l.bonus, `[${i}] bonus amount`);
  near(m.gross, l.gross, `[${i}] gross`);
  near(m.totalDed, l.totalDed, `[i=${i}] total deductions`);
  near(m.net, l.net, `[${i}] net`);
}

// the male fixture lands exactly on 20 weekdays → no bonus
eq(mine[0].workingDays, 20, "male fixture: 20 distinct working days");
eq(mine[0].bonusEligible, false, "male fixture: 20 days does not qualify");
eq(mine[0].bonus, 0, "male fixture: bonus is 0");
near(mine[0].gross, 20 * 2200, "male fixture: gross = 20 × 2200");
near(mine[0].net, 20 * 2200 - 3200, "male fixture: net after 1200 meal + 2000 boarding");

// the female fixture crosses the threshold and picks up the night allowance
eq(mine[1].workingDays, 21, "female fixture: 21 distinct working days");
eq(mine[1].bonusEligible, true, "female fixture: qualifies for bonus");
eq(mine[1].bonus, 5500, "female fixture: bonus = 5500");
truthy(mine[1].femaleN > 0, "female fixture: night allowance accrues");

section("D+N double-counts shifts but is one working day");
const dn: AttendanceMap = { x: {} };
// 2026-10-05 is a Monday (weekday)
dn.x["2026-10-05"] = { D: true, N: true };
dn.x["2026-10-06"] = { D: true, N: false };
const dnEmp: Employee = { id: "x", name: "Both Shifts", nic: "1", rate: 2200, isFemale: true };
const dnRow = computeMonthPayslips([dnEmp], dn, OCT_2026, DEFAULT_PAYROLL_RATES, {}, POYA, 21, 5500)[0];
eq(dnRow.weekday, 3, "D+N weekday counts as 2 shifts, plus one D = 3");
eq(dnRow.workingDays, 2, "but only 2 distinct working days");
eq(dnRow.femaleN, 1, "one female night allowance from the D+N day");
near(dnRow.gross, 3 * 2200 + 1 * 100, "gross = 3 weekdays × 2200 + 1 female night × 100");

section("Sunday & Poya bill at the top rate");
const sun: AttendanceMap = { x: {} };
sun.x["2026-10-04"] = { D: true, N: false }; // Sunday
sun.x["2026-10-25"] = { D: true, N: false }; // Poya
const sunRow = computeMonthPayslips([dnEmp], sun, OCT_2026, DEFAULT_PAYROLL_RATES, {}, POYA, 21, 5500)[0];
eq(sunRow.sunday, 2, "Sunday and Poya both land in the sunday bucket");
eq(sunRow.weekday, 0, "no weekday shifts");
near(sunRow.gross, 2 * 3600, "gross = 2 × 3600");

section("Week ranges never pay the bonus");
const weekSlice = resolveWeekSlice({ ...DEFAULT_RANGE, mode: "week", weekId: "w1" }, 31)!;
const weekRows = computePayslips(fixture.employees, {
  period: OCT_2026,
  days: octDays.filter((d) => d.d >= weekSlice.start && d.d <= weekSlice.end),
  attendance: fixture.attendance,
  payrollRates: DEFAULT_PAYROLL_RATES,
  deductions,
  bonusDays: 21,
  bonusAmount: 5500,
  isWeek: true,
  periodLabel: "Week 1",
});
eq(weekRows.every((r) => !r.bonusEligible), true, "week-wise: bonusEligible is false for all");
eq(weekRows.every((r) => r.bonus === 0), true, "week-wise: bonus amount is 0");
eq(weekRows[0].periodLabel, "Week 1", "week-wise payslips carry the range label");

/* ═════════════════════════════════════════════════════════════
 * 3 · Client invoice roll-up
 * ═════════════════════════════════════════════════════════════ */

section("3 · Invoice roll-up");

const myInv = computeInvoiceTotals(mine, DEFAULT_INVOICE_RATES, DEFAULT_OT_HOURS);
const legInv = legacyInvoice(legacy);
eq(myInv.weekday, legInv.weekday, "invoice weekday qty");
eq(myInv.saturday, legInv.saturday, "invoice saturday qty");
eq(myInv.sunday, legInv.sunday, "invoice sunday qty");
eq(myInv.female, legInv.female, "invoice female night qty");
eq(myInv.bonusCount, legInv.bonusCount, "invoice bonus count");
eq(myInv.weekdayOT, legInv.weekdayOT, "weekday OT hours = weekday × 3");
eq(myInv.saturdayOT, legInv.saturdayOT, "saturday OT hours = saturday × 3");
eq(myInv.sundayOT, legInv.sundayOT, "sunday OT hours = sunday × 12");
near(myInv.total, legInv.total, "invoice grand total");

eq(myInv.weekdayOT, myInv.weekday * 3, "OT derivation: weekday × 3");
eq(myInv.saturdayOT, myInv.saturday * 3, "OT derivation: saturday × 3");
eq(myInv.sundayOT, myInv.sunday * 12, "OT derivation: sunday × 12");

// hand-computed total from the seven invoice lines
const manualTotal =
  myInv.weekday * 1525 +
  myInv.saturday * 1875 +
  myInv.weekdayOT * 225 +
  myInv.saturdayOT * 225 +
  myInv.sundayOT * 300 +
  myInv.female * 100 +
  myInv.bonusCount * 5500;
near(myInv.total, manualTotal, "total equals the sum of the seven invoice lines");

/* ═════════════════════════════════════════════════════════════
 * 4 · Attendance mutations
 * ═════════════════════════════════════════════════════════════ */

section("4 · Attendance mutations");

eq(markKind(undefined), "OFF", "no mark → OFF");
eq(markKind({ D: false, N: false }), "OFF", "empty mark → OFF");
eq(markKind({ D: true, N: false }), "D", "D only");
eq(markKind({ D: false, N: true }), "N", "N only");
eq(markKind({ D: true, N: true }), "BOTH", "D+N");

// the tap cycle ∅ → D → N → D+N → ∅
let cur: DayMark | null | undefined = undefined;
const cycle: string[] = [];
for (let i = 0; i < 4; i++) {
  cur = nextMark(cur ?? undefined);
  cycle.push(markKind(cur ?? undefined));
}
eq(cycle, ["D", "N", "BOTH", "OFF"], "tap cycle ∅ → D → N → D+N → ∅");

let att: AttendanceMap = { a: {}, b: {} };
att = setMark(att, "a", "2026-10-05", { D: true, N: false });
eq(att.a["2026-10-05"], { D: true, N: false }, "setMark writes a day");
att = setMark(att, "a", "2026-10-05", null);
eq(att.a["2026-10-05"], undefined, "setMark(null) removes the day");

att = setMarks(att, ["a", "b"], ["2026-10-06", "2026-10-07"], { D: true, N: true });
eq(countRecords(att), 4, "setMarks wrote 2 employees × 2 days");

att = setMarks(att, ["a"], ["2026-10-06"], null);
eq(countRecords(att), 3, "setMarks(null) removes cells");

// mergeDay keeps an existing night flag
let merged: AttendanceMap = { a: { "2026-10-05": { D: false, N: true } } };
merged = mergeDay(merged, ["a"], ["2026-10-05"], true);
eq(merged.a["2026-10-05"], { D: true, N: true }, "mergeDay(day=true) upgrades N → D+N");
merged = mergeDay(merged, ["a"], ["2026-10-05"], false);
eq(merged.a["2026-10-05"], { D: false, N: true }, "mergeDay(day=false) keeps the night flag");

const dropped = dropEmployee({ a: {}, b: {} }, { a: { meal: 1, boarding: 2, advance: 3 }, b: { meal: 0, boarding: 0, advance: 0 } }, "a");
eq(Object.keys(dropped.attendance), ["b"], "dropEmployee removes attendance");
eq(Object.keys(dropped.deductions), ["b"], "dropEmployee removes deductions");

/* ═════════════════════════════════════════════════════════════
 * 5 · Estate 24–24 window
 * ═════════════════════════════════════════════════════════════ */

section("5 · Estate 24–24 window");

const boundaries = [1, 12, 23, 24, 25, 30, 31];
let periodMismatch = 0;
let legacyOffByOne = 0;
for (const d of boundaries) {
  const probe = new Date(2026, 9, d);
  const mineP = estatePeriodFor(probe);
  const legP = legacyPeriod(probe);
  if (mineP.start.getTime() !== legP.start.getTime()) periodMismatch++;
  if (mineP.end.getTime() !== legP.end.getTime()) periodMismatch++;
  // Legacy O0() measured against an end of 23:59:59.999, so Math.round()
  // inflated the count by exactly one. Documented, deliberate deviation.
  if (legacyDays(legP.start, legP.end) === estatePeriodDays(mineP) + 1) legacyOffByOne++;
}
eq(periodMismatch, 0, "24–24 window boundaries match legacy Hl()");
eq(legacyOffByOne, boundaries.length, "our day count is legacy O0() minus its off-by-one");

// True inclusive date counts, verified by enumeration
const countDates = (from: Date, to: Date) => {
  let n = 0;
  const c = new Date(from);
  c.setHours(0, 0, 0, 0);
  const last = new Date(to);
  last.setHours(0, 0, 0, 0);
  while (c <= last) { n++; c.setDate(c.getDate() + 1); }
  return n;
};
for (const d of boundaries) {
  const probe = new Date(2026, 9, d);
  const w = estatePeriodFor(probe);
  eq(estatePeriodDays(w), countDates(w.start, w.end), `estatePeriodDays enumerates correctly for anchor day ${d}`);
}

eq(estatePeriodLabel(estatePeriodFor(new Date(2026, 9, 25))), "24 Oct – 23 Nov 2026", "anchor 25 Oct → 24 Oct – 23 Nov 2026");
eq(estatePeriodLabel(estatePeriodFor(new Date(2026, 9, 10))), "24 Sep – 23 Oct 2026", "anchor 10 Oct → 24 Sep – 23 Oct 2026");
eq(estatePeriodDays(estatePeriodFor(new Date(2026, 9, 25))), 31, "24 Oct → 23 Nov spans 31 dates");
eq(estatePeriodDays(estatePeriodFor(new Date(2026, 9, 10))), 30, "24 Sep → 23 Oct spans 30 dates");
eq(estatePeriodLabel(estatePeriodFor(new Date(2025, 7, 24))), "24 Aug – 23 Sep 2025", "label is locale-independent: 24 Aug – 23 Sep 2025");

const prev = estatePreviousPeriod(estatePeriodFor(new Date(2026, 9, 25)));
eq(estatePeriodLabel(prev), "24 Sep – 23 Oct 2026", "previous window steps back exactly one 24–24 cycle");

/* ═════════════════════════════════════════════════════════════
 * 6 · Estate maths & CSV
 * ═════════════════════════════════════════════════════════════ */

section("6 · Estate maths");

const rec = (over: Partial<EstateDayRecord> = {}): EstateDayRecord => ({
  date: "2025-08-24", maleCount: 4.5, femaleCount: 6, maleOt: 2, femaleOt: 1.5,
  lateHours: 0.5, inTime: "07:00", outTime: "19:00", ...over,
});

near(dayAmount(rec(), DEFAULT_ESTATE_RATES), legacyDayAmount(rec()), "dayAmount matches legacy $n()");
near(dayAmount(rec(), DEFAULT_ESTATE_RATES), 4.5 * 3000 + 6 * 2500 + 3.5 * 225 - 0.5 * 150, "dayAmount = 13500 + 15000 + 787.5 − 75");
near(maleAmount(rec(), DEFAULT_ESTATE_RATES), 4.5 * 3000 + 2 * 225, "maleAmount = male shifts + male OT");
near(femaleAmount(rec(), DEFAULT_ESTATE_RATES), 6 * 2500 + 1.5 * 225, "femaleAmount = female shifts + female OT");
near(
  maleAmount(rec(), DEFAULT_ESTATE_RATES) +
    femaleAmount(rec(), DEFAULT_ESTATE_RATES) -
    rec().lateHours * DEFAULT_ESTATE_RATES.lateRate,
  dayAmount(rec(), DEFAULT_ESTATE_RATES),
  "male + female amounts less the late penalty reconcile to dayAmount",
);

eq(halfStep(4.37), 4.5, "halfStep rounds to the nearest 0.5");
eq(halfStep(4.24), 4, "halfStep rounds down below .25");

const records: EstateRecords = {};
const p = legacyPeriod(new Date(2025, 7, 24));
for (const d of [1, 5, 12, 20]) {
  const date = new Date(p.start);
  date.setDate(date.getDate() + d);
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  records[key] = rec({ date: key, maleCount: 4 + d * 0.5 });
}
// a record deliberately outside the window must be ignored
records["2020-01-01"] = rec({ date: "2020-01-01" });

const inPeriod = recordsInPeriod(records, estatePeriodFor(new Date(2025, 7, 24)));
eq(inPeriod.length, 4, "recordsInPeriod ignores dates outside the window");
truthy(inPeriod.every((r, i) => i === 0 || r.date > inPeriod[i - 1].date), "recordsInPeriod sorts ascending");

const myTotals = periodTotals(records, estatePeriodFor(new Date(2025, 7, 24)), DEFAULT_ESTATE_RATES);
const legTotals = inPeriod.reduce(
  (acc, r) => ({
    m: acc.m + r.maleCount, f: acc.f + r.femaleCount,
    mOt: acc.mOt + r.maleOt, fOt: acc.fOt + r.femaleOt,
    late: acc.late + r.lateHours, grand: acc.grand + legacyDayAmount(r),
  }),
  { m: 0, f: 0, mOt: 0, fOt: 0, late: 0, grand: 0 },
);
near(myTotals.m, legTotals.m, "period male total");
near(myTotals.f, legTotals.f, "period female total");
near(myTotals.mOt, legTotals.mOt, "period male OT total");
near(myTotals.fOt, legTotals.fOt, "period female OT total");
near(myTotals.late, legTotals.late, "period late total");
near(myTotals.grand, legTotals.grand, "period grand total");
eq(myTotals.count, 4, "period logged-day count");

section("Card fill denominators");
const fills = cardFills(myTotals);
near(fills.male, Math.min(100, Math.max(4, (myTotals.m / (myTotals.days * 6)) * 100)), "male fill uses days × 6");
near(fills.female, Math.min(100, Math.max(4, (myTotals.f / (myTotals.days * 6)) * 100)), "female fill uses days × 6");
near(fills.ot, Math.min(100, Math.max(4, ((myTotals.mOt + myTotals.fOt) / (myTotals.days * 8)) * 100)), "OT fill uses days × 8");
near(fills.grand, Math.min(100, Math.max(4, (myTotals.count / myTotals.days) * 100)), "grand fill uses logged / days");

section("Delta percentages");
for (const [c, pv] of [[12, 10], [8, 10], [0, 0], [5, 0], [0, 5], [10, 10]] as [number, number][]) {
  eq(deltaPercent(c, pv), legacyDelta(c, pv), `deltaPercent(${c}, ${pv})`);
}
eq(deltaPercent(undefined, 10), "0%", "deltaPercent(undefined, …) → 0%");

section("CSV formats");
const rows = inPeriod;
const maleCsv = estateCsv(rows, DEFAULT_ESTATE_RATES, "male");
eq(maleCsv.split("\n")[0], "Year,Month,Day,Male Shifts,Male OT,Male Amount", "male CSV header matches source");
const first = rows[0];
eq(
  maleCsv.split("\n")[1],
  `${first.date.slice(0, 4)},${first.date.slice(5, 7)},${first.date.slice(8)},${first.maleCount},${first.maleOt},${maleAmount(first, DEFAULT_ESTATE_RATES)}`,
  "male CSV row is comma format 2025,08,25,…",
);
eq(femaleCsvHeader(rows), "Year,Month,Day,Female Shifts,Female OT,Female Amount", "female CSV header matches source");
eq(
  estateCsv(rows, DEFAULT_ESTATE_RATES, "combined").split("\n")[0],
  "Year,Month,Day,Male,Female,MaleOT,FemaleOT,LateHours,In,Out,Grand Total",
  "combined CSV header matches source",
);
function femaleCsvHeader(rs: EstateDayRecord[]) {
  return estateCsv(rs, DEFAULT_ESTATE_RATES, "female").split("\n")[0];
}

// Regression guard: the source artefact kept a long header for the file it
// WROTE and a shortened one it only DISPLAYED. Downloads must use the long
// (canonical) form — an earlier build wired the display copy into exports and
// silently shipped "Late,In,Out,Grand" instead.
for (const kind of ["male", "female", "combined"] as const) {
  eq(
    estateCsv(rows, DEFAULT_ESTATE_RATES, kind).split("\n")[0],
    ESTATE_CSV_FILE_HEADERS[kind].join(","),
    `${kind} export writes the canonical file header`,
  );
}
eq(
  ESTATE_CSV_FILE_HEADERS.combined.slice(-4),
  ["LateHours", "In", "Out", "Grand Total"],
  "canonical combined header keeps LateHours and Grand Total",
);
truthy(
  ESTATE_CSV_HEADERS.combined.endsWith("Late,In,Out,Grand"),
  "display header stays the shortened artefact copy",
);
truthy(
  ESTATE_CSV_HEADERS.combined !== ESTATE_CSV_FILE_HEADERS.combined.join(","),
  "display and file headers are deliberately different",
);

section("Demo seed is deterministic");
const demoPeriod = { start: new Date(2025, 7, 24), end: new Date(2025, 8, 23) };
demoPeriod.start.setHours(0, 0, 0, 0);
demoPeriod.end.setHours(23, 59, 59, 999);
const seedA = seedEstateRecords(demoPeriod);
const seedB = seedEstateRecords(demoPeriod);
eq(Object.keys(seedA).length, 31, "demo seeds all 31 days");
eq(seedA, seedB, "demo seed is reproducible");
truthy(
  Object.values(seedA).every((r) => halfStep(r.maleCount) === r.maleCount),
  "demo counts respect 0.5 steps",
);

/* ═════════════════════════════════════════════════════════════
 * 7 · Defaults lifted from the artefacts
 * ═════════════════════════════════════════════════════════════ */

section("7 · Extracted defaults");

eq(DEFAULT_PAYROLL_RATES, { weekday: 2200, saturday: 2550, sunday: 3600, female: 100 }, "payroll rates");
eq(DEFAULT_INVOICE_RATES, { weekday: 1525, saturday: 1875, weekdayOT: 225, saturdayOT: 225, sunday: 300, female: 100, bonus: 5500 }, "invoice rates");
eq(DEFAULT_OT_HOURS, { weekday: 3, saturday: 3, sunday: 12 }, "OT hours per shift");
eq([DEFAULT_BONUS_DAYS, DEFAULT_BONUS_AMOUNT], [21, 5500], "bonus rule");
eq(DEFAULT_ESTATE_RATES, { maleDay: 3000, femaleDay: 2500, maleNight: 2925, femaleNight: 2425, otRate: 225, lateRate: 150 }, "estate rates");
eq(DEMO_EMPLOYEES.length, 6, "demo roster size");
eq(DEMO_EMPLOYEES.map((e) => e.name), ["Kamal Perera", "Nimali Fernando", "Sunil Silva", "Kumari Jayasuriya", "Ruwan Mendis", "Dilani Rathnayake"], "demo roster names");
eq(DEMO_EMPLOYEES.map((e) => e.nic), ["199012345678", "199578901234", "198812345678", "199212345123", "199012398765", "199345678901"], "demo roster NICs");
eq(DEMO_EMPLOYEES.filter((e) => e.isFemale).length, 3, "three of six demo staff are female");

/* ═════════════════════════════════════════════════════════════
 * 8 · Formatting helpers
 * ═════════════════════════════════════════════════════════════ */

section("8 · Formatting");

eq(money(1234567), "1,234,567", "money groups with commas");
eq(money(1500.5), "1,500.5", "money keeps meaningful decimals");
eq(ordinal(1), "1st", "ordinal 1st");
eq(ordinal(2), "2nd", "ordinal 2nd");
eq(ordinal(3), "3rd", "ordinal 3rd");
eq(ordinal(11), "11th", "ordinal 11th");
eq(ordinal(21), "21st", "ordinal 21st");
eq(ordinal(25), "25th", "ordinal 25th");

/* ═════════════════════════════════════════════════════════════
 * 9 · End-to-end: demo roster → invoice
 * ═════════════════════════════════════════════════════════════ */

section("9 · End-to-end smoke");

const demoRows = computeMonthPayslips(
  DEMO_EMPLOYEES,
  { e1: { "2026-10-01": { D: true, N: false } }, e2: { "2026-10-01": { D: true, N: true } } },
  OCT_2026,
  DEFAULT_PAYROLL_RATES,
  {},
  POYA,
  21,
  5500,
);
const demoInvoice = computeInvoiceTotals(demoRows, DEFAULT_INVOICE_RATES, DEFAULT_OT_HOURS);
eq(demoInvoice.weekday, 3, "e1 day + e2 day&night on a Thursday = 3 weekday shifts");
eq(demoInvoice.weekdayOT, 9, "9 billable weekday OT hours");
eq(demoInvoice.female, 1, "e2 is female and worked the night → one allowance");
near(demoInvoice.total, 3 * 1525 + 9 * 225 + 1 * 100, "invoice total = shifts + OT + female night allowance");
eq(demoInvoice.bonusCount, 0, "nobody reaches 21 days");

/* ───────────────────────── report ───────────────────────── */

console.log(`\n${"═".repeat(58)}`);
if (failures.length === 0) {
  console.log(`  ✅ ${pass} assertions passed — calculations match the source artefacts`);
} else {
  console.log(`  ❌ ${failures.length} of ${pass + failures.length} assertions FAILED\n`);
  failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log(`${"═".repeat(58)}\n`);
// The runner deletes the bundle and exits — do not process.exit() here.
process.exitCode = failures.length === 0 ? 0 : 1;
