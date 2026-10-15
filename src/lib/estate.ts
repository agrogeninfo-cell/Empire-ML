import {
  estatePeriodDays,
  estatePeriodKeys,
  startOfLocalDay,
} from "./calendar";
import type { EstateDayRecord, EstatePeriod, EstateRates, EstateRecords } from "./types";

/* ═══════════════════════════════════════════════════════════════════════
 * Millennium Estate — daily labour billing
 *
 * One record per calendar date; saving a date overwrites the previous
 * entry for that date. Counts accept 0.5 steps (half shifts).
 *
 *   dayAmount = (M × maleDay + F × femaleDay)
 *             + (maleOT + femaleOT) × otRate
 *             − lateHours × lateRate
 * ═════════════════════════════════════════════════════════════════════ */

export function emptyRecord(date: string, inTime = "07:00", outTime = "19:00"): EstateDayRecord {
  return {
    date,
    maleCount: 0,
    femaleCount: 0,
    maleOt: 0,
    femaleOt: 0,
    lateHours: 0,
    inTime,
    outTime,
  };
}

export function dayAmount(r: EstateDayRecord, rates: EstateRates): number {
  const shifts = (r.maleCount || 0) * rates.maleDay + (r.femaleCount || 0) * rates.femaleDay;
  const ot = ((r.maleOt || 0) + (r.femaleOt || 0)) * rates.otRate;
  const late = (r.lateHours || 0) * rates.lateRate;
  return shifts + ot - late;
}

export function maleAmount(r: EstateDayRecord, rates: EstateRates): number {
  return (r.maleCount || 0) * rates.maleDay + (r.maleOt || 0) * rates.otRate;
}

export function femaleAmount(r: EstateDayRecord, rates: EstateRates): number {
  return (r.femaleCount || 0) * rates.femaleDay + (r.femaleOt || 0) * rates.otRate;
}

export interface PeriodTotals {
  m: number;
  f: number;
  mOt: number;
  fOt: number;
  late: number;
  grand: number;
  /** number of dates that actually hold a record */
  count: number;
  /** calendar days in the 24–24 window */
  days: number;
}

export function recordsInPeriod(
  records: EstateRecords,
  period: EstatePeriod,
): EstateDayRecord[] {
  const keys = estatePeriodKeys(period);
  const out: EstateDayRecord[] = [];
  for (const k of keys) {
    const r = records[k];
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function periodTotals(
  records: EstateRecords,
  period: EstatePeriod,
  rates: EstateRates,
): PeriodTotals {
  const rows = recordsInPeriod(records, period);
  const t: PeriodTotals = {
    m: 0,
    f: 0,
    mOt: 0,
    fOt: 0,
    late: 0,
    grand: 0,
    count: rows.length,
    days: estatePeriodDays(period),
  };
  for (const r of rows) {
    t.m += r.maleCount || 0;
    t.f += r.femaleCount || 0;
    t.mOt += r.maleOt || 0;
    t.fOt += r.femaleOt || 0;
    t.late += r.lateHours || 0;
    t.grand += dayAmount(r, rates);
  }
  return t;
}

/** Total headcount deployed across the window. */
export function totalShifts(t: PeriodTotals): number {
  return t.m + t.f;
}

export function averagePerLoggedDay(t: PeriodTotals): number {
  return t.count ? t.grand / t.count : 0;
}

/** Cost of the late-hours penalty alone, for the window. */
export function latePenalty(records: EstateRecords, period: EstatePeriod, rates: EstateRates): number {
  let late = 0;
  for (const r of recordsInPeriod(records, period)) late += r.lateHours || 0;
  return late * rates.lateRate;
}

export function otValue(records: EstateRecords, period: EstatePeriod, rates: EstateRates): number {
  let ot = 0;
  for (const r of recordsInPeriod(records, period)) ot += (r.maleOt || 0) + (r.femaleOt || 0);
  return ot * rates.otRate;
}

/* ═══════════════════════════════════════════════════════════════════════
 * Comparison — today vs yesterday, this window vs previous window
 * ═════════════════════════════════════════════════════════════════════ */

/** `+12%` / `−8%` / `0%`, matching the source artefact's edge handling. */
export function deltaPercent(current: number | undefined, previous: number | undefined): string {
  if (current === undefined || current === null || Number.isNaN(current)) return "0%";
  if (!previous) return current > 0 ? "+100%" : "0%";
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

export function deltaDirection(current: number | undefined, previous: number | undefined): "up" | "down" | "flat" {
  const c = current ?? 0;
  const p = previous ?? 0;
  if (c > p) return "up";
  if (c < p) return "down";
  return "flat";
}

/* ═══════════════════════════════════════════════════════════════════════
 * Card progress fills — same denominators as the source artefact
 *   shifts  → 6 per day    OT → 8 hours per day    grand → logged/days
 * ═════════════════════════════════════════════════════════════════════ */

export const SHIFT_CAPACITY_PER_DAY = 6;
export const OT_CAPACITY_PER_DAY = 8;

export function clampPercent(n: number): number {
  return Math.min(100, Math.max(4, Number.isFinite(n) ? n : 4));
}

export function cardFills(t: PeriodTotals) {
  return {
    male: clampPercent((t.m / (t.days * SHIFT_CAPACITY_PER_DAY)) * 100),
    female: clampPercent((t.f / (t.days * SHIFT_CAPACITY_PER_DAY)) * 100),
    ot: clampPercent(((t.mOt + t.fOt) / (t.days * OT_CAPACITY_PER_DAY)) * 100),
    grand: clampPercent((t.count / Math.max(1, t.days)) * 100),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * CSV export — `2025,08,24,4.5,1,13800` comma format
 * ═════════════════════════════════════════════════════════════════════ */

export type EstateCsvKind = "male" | "female" | "combined";

export function estateCsv(
  rows: EstateDayRecord[],
  rates: EstateRates,
  kind: EstateCsvKind,
): string {
  const lines: string[] = [];

  if (kind === "male") {
    lines.push("Year,Month,Day,Male Shifts,Male OT,Male Amount");
    for (const r of rows) {
      const [y, m, d] = r.date.split("-");
      lines.push(`${y},${m},${d},${r.maleCount},${r.maleOt},${maleAmount(r, rates)}`);
    }
  } else if (kind === "female") {
    lines.push("Year,Month,Day,Female Shifts,Female OT,Female Amount");
    for (const r of rows) {
      const [y, m, d] = r.date.split("-");
      lines.push(`${y},${m},${d},${r.femaleCount},${r.femaleOt},${femaleAmount(r, rates)}`);
    }
  } else {
    lines.push("Year,Month,Day,Male,Female,MaleOT,FemaleOT,LateHours,In,Out,Grand Total");
    for (const r of rows) {
      const [y, m, d] = r.date.split("-");
      lines.push(
        `${y},${m},${d},${r.maleCount},${r.femaleCount},${r.maleOt},${r.femaleOt},${r.lateHours},${r.inTime},${r.outTime},${dayAmount(r, rates)}`,
      );
    }
  }

  return lines.join("\n");
}

export const ESTATE_CSV_HEADERS: Record<EstateCsvKind, string> = {
  male: "Year,Month,Day,Male Shifts,Male OT,Male Amount",
  female: "Year,Month,Day,Female Shifts,Female OT,Female Amount",
  combined: "Year,Month,Day,Male,Female,MaleOT,FemaleOT,Late,In,Out,Grand",
};

/* ═══════════════════════════════════════════════════════════════════════
 * Formula copy shown in Settings
 * ═════════════════════════════════════════════════════════════════════ */

export function formulaText(rates: EstateRates): string {
  return `(M × ${rates.maleDay} + F × ${rates.femaleDay}) + OT × ${rates.otRate} − Late × ${rates.lateRate}`;
}

export function halfStep(v: number): number {
  return Math.round(v * 2) / 2;
}

export function parseHalf(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? halfStep(n) : 0;
}

export function recordExists(records: EstateRecords, date: string): boolean {
  return !!records[date];
}

export function saveRecord(
  records: EstateRecords,
  rec: EstateDayRecord,
): EstateRecords {
  return { ...records, [rec.date]: { ...rec, date: rec.date } };
}

export function deleteRecord(records: EstateRecords, date: string): EstateRecords {
  const next = { ...records };
  delete next[date];
  return next;
}

/** Deterministic sample window used by "Load demo data" — 24 Aug → 23 Sep 2025. */
export function demoPeriod(): EstatePeriod {
  const start = new Date(2025, 7, 24);
  const end = new Date(2025, 8, 23);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function seedEstateRecords(period: EstatePeriod, seed = 20250824): EstateRecords {
  const out: EstateRecords = {};
  let s = seed;
  const rnd = () => {
    // mulberry32 — stable across reloads so the demo always looks the same
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (const key of estatePeriodKeys(period)) {
    const date = startOfLocalDay(new Date(`${key}T00:00:00`));
    const isSunday = date.getDay() === 0;
    const male = isSunday ? 2 : 4 + rnd() * 2;
    const female = isSunday ? 3 : 5 + rnd() * 2;
    out[key] = {
      date: key,
      maleCount: halfStep(male),
      femaleCount: halfStep(female),
      maleOt: halfStep(rnd() * 4),
      femaleOt: halfStep(rnd() * 3),
      lateHours: rnd() > 0.7 ? halfStep(rnd() * 3) : 0,
      inTime: "07:00",
      outTime: rnd() > 0.5 ? "19:00" : "18:30",
    };
  }
  return out;
}
