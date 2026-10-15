import { useMemo } from "react";
import {
  estateNextPeriod,
  estatePeriodDays,
  estatePeriodFor,
  estatePeriodLabel,
  estatePreviousPeriod,
  startOfLocalDay,
  todayKey,
} from "@/lib/calendar";
import {
  cardFills,
  dayAmount,
  deltaDirection,
  deltaPercent,
  periodTotals,
  recordsInPeriod,
  type EstateCsvKind,
} from "@/lib/estate";
import type { EstateDayRecord, EstateState } from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════
 * useEstate — everything the Millennium module derives from the vault
 * ═════════════════════════════════════════════════════════════════════ */

export interface EstateDerived {
  anchorKey: string;
  anchor: Date;
  period: ReturnType<typeof estatePeriodFor>;
  previous: ReturnType<typeof estatePeriodFor>;
  next: ReturnType<typeof estatePeriodFor>;
  periodText: string;
  previousText: string;
  days: number;

  rows: EstateDayRecord[];
  previousRows: EstateDayRecord[];
  totals: ReturnType<typeof periodTotals>;
  previousTotals: ReturnType<typeof periodTotals>;
  fills: ReturnType<typeof cardFills>;

  todayKey: string;
  todayRecord: EstateDayRecord | undefined;
  yesterdayRecord: EstateDayRecord | undefined;

  deltaMale: string;
  deltaFemale: string;
  deltaOt: string;
  deltaGrand: string;
  dirMale: "up" | "down" | "flat";
  dirFemale: "up" | "down" | "flat";
  dirOt: "up" | "down" | "flat";
  dirGrand: "up" | "down" | "flat";

  periodDelta: string;
  periodDeltaDir: "up" | "down" | "flat";

  recordCount: number;
}

export function useEstate(state: EstateState): EstateDerived {
  const anchorKey = state.periodAnchor || todayKey();
  const anchor = useMemo(
    () => startOfLocalDay(new Date(`${anchorKey}T00:00:00`)),
    [anchorKey],
  );

  const period = useMemo(() => estatePeriodFor(anchor), [anchor]);
  const previous = useMemo(() => estatePreviousPeriod(period), [period]);
  const next = useMemo(() => estateNextPeriod(period), [period]);

  const rows = useMemo(() => recordsInPeriod(state.records, period), [state.records, period]);
  const previousRows = useMemo(
    () => recordsInPeriod(state.records, previous),
    [state.records, previous],
  );

  const totals = useMemo(
    () => periodTotals(state.records, period, state.rates),
    [state.records, period, state.rates],
  );
  const previousTotals = useMemo(
    () => periodTotals(state.records, previous, state.rates),
    [state.records, previous, state.rates],
  );

  const fills = useMemo(() => cardFills(totals), [totals]);

  const tKey = todayKey();
  const yKey = useMemo(() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(
      y.getDate(),
    ).padStart(2, "0")}`;
  }, []);

  const todayRecord = state.records[tKey];
  const yesterdayRecord = state.records[yKey];

  const td = todayRecord ? dayAmount(todayRecord, state.rates) : 0;
  const yd = yesterdayRecord ? dayAmount(yesterdayRecord, state.rates) : 0;

  return {
    anchorKey,
    anchor,
    period,
    previous,
    next,
    periodText: estatePeriodLabel(period),
    previousText: estatePeriodLabel(previous),
    days: estatePeriodDays(period),

    rows,
    previousRows,
    totals,
    previousTotals,
    fills,

    todayKey: tKey,
    todayRecord,
    yesterdayRecord,

    deltaMale: deltaPercent(todayRecord?.maleCount, yesterdayRecord?.maleCount),
    deltaFemale: deltaPercent(todayRecord?.femaleCount, yesterdayRecord?.femaleCount),
    deltaOt: deltaPercent(
      (todayRecord?.maleOt ?? 0) + (todayRecord?.femaleOt ?? 0),
      (yesterdayRecord?.maleOt ?? 0) + (yesterdayRecord?.femaleOt ?? 0),
    ),
    deltaGrand: deltaPercent(td, yd),
    dirMale: deltaDirection(todayRecord?.maleCount, yesterdayRecord?.maleCount),
    dirFemale: deltaDirection(todayRecord?.femaleCount, yesterdayRecord?.femaleCount),
    dirOt: deltaDirection(
      (todayRecord?.maleOt ?? 0) + (todayRecord?.femaleOt ?? 0),
      (yesterdayRecord?.maleOt ?? 0) + (yesterdayRecord?.femaleOt ?? 0),
    ),
    dirGrand: deltaDirection(td, yd),

    periodDelta: deltaPercent(totals.grand, previousTotals.grand),
    periodDeltaDir: deltaDirection(totals.grand, previousTotals.grand),

    recordCount: Object.keys(state.records).length,
  };
}

export const CSV_KINDS: { id: EstateCsvKind; label: string; header: string }[] = [
  { id: "male", label: "Male", header: "Year,Month,Day,Male Shifts,Male OT,Male Amount" },
  { id: "female", label: "Female", header: "Year,Month,Day,Female Shifts,Female OT,Female Amount" },
  { id: "combined", label: "Combined", header: "Year,Month,Day,Male,Female,MaleOT,FemaleOT,Late,In,Out,Grand" },
];
