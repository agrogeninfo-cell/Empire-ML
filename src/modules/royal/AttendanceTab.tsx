import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarCheck2,
  CheckSquare,
  Eraser,
  LayoutGrid,
  MoonStar,
  Plus,
  Search,
  Sun,
  UserRoundPlus,
  Users,
  Zap,
} from "lucide-react";
import { Segmented } from "@/components/ui/Segmented";
import { TextField } from "@/components/ui/Field";
import { Badge, EmptyState } from "@/components/ui/Metrics";
import { cn } from "@/lib/cn";
import { MONTHS, ordinal, todayKey } from "@/lib/calendar";
import {
  clearEmployees,
  isMarked,
  mergeDay,
  nextMark,
  setMark,
  setMarks,
} from "@/lib/payroll";
import type {
  AttendanceMap,
  CalendarDay,
  DayMark,
  Employee,
  PayslipRow,
} from "@/lib/types";
import { EmployeeCard } from "./EmployeeCard";
import { AttendanceGrid } from "./AttendanceGrid";
import { TodayView } from "./TodayView";

/* ═══════════════════════════════════════════════════════════════════════
 * AttendanceTab — Cards / Today / Grid
 * ═════════════════════════════════════════════════════════════════════ */

export type AttendanceView = "cards" | "today" | "grid";
export type StaffFilter = "all" | "male" | "female" | "bonus";

interface Props {
  view: AttendanceView;
  onView: (v: AttendanceView) => void;
  employees: Employee[];
  days: CalendarDay[]; // days for the active range
  allDays: CalendarDay[]; // full month
  attendance: AttendanceMap;
  rows: PayslipRow[];
  monthRows: PayslipRow[];
  bonusDays: number;
  periodText: string;
  onAttendance: (next: AttendanceMap, toast?: string, undoable?: boolean) => void;
  onOpenAdd: () => void;
  onOpenDay: (empId: string, key: string) => void;
  onOpenPayslip: (empId: string) => void;
}

const FILTERS: { id: StaffFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "male", label: "♂ Male" },
  { id: "female", label: "♀ Female" },
  { id: "bonus", label: "★ Bonus" },
];

export function AttendanceTab({
  view,
  onView,
  employees,
  days,
  allDays,
  attendance,
  rows,
  monthRows,
  bonusDays,
  periodText,
  onAttendance,
  onOpenAdd,
  onOpenDay,
  onOpenPayslip,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StaffFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState(() => {
    const t = todayKey();
    const i = allDays.findIndex((d) => d.key === t);
    return i >= 0 ? i : Math.min(13, Math.max(0, allDays.length - 1));
  });

  // keep the "today" pointer sane when the month changes
  useEffect(() => {
    const t = todayKey();
    const i = allDays.findIndex((d) => d.key === t);
    setDayIndex(i >= 0 ? i : 0);
  }, [allDays]);

  const bonusIds = useMemo(
    () => new Set(monthRows.filter((r) => r.bonusEligible).map((r) => r.emp.id)),
    [monthRows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = employees;
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || e.nic.includes(q));
    if (filter === "male") list = list.filter((e) => !e.isFemale);
    if (filter === "female") list = list.filter((e) => e.isFemale);
    if (filter === "bonus") list = list.filter((e) => bonusIds.has(e.id));
    return list;
  }, [employees, query, filter, bonusIds]);

  const today: CalendarDay = allDays[dayIndex] ?? allDays[0];
  const presentToday = useMemo(
    () => visible.filter((e) => isMarked(attendance[e.id]?.[today?.key])).length,
    [visible, attendance, today],
  );

  /* ── mutations ────────────────────────────────────────────────────── */

  const targetIds = useMemo(
    () => (selected.size > 0 ? Array.from(selected) : visible.map((e) => e.id)),
    [selected, visible],
  );

  const flashCell = (empId: string, key: string) => {
    const f = `${empId}-${key}`;
    setFlash(f);
    window.setTimeout(() => setFlash((cur) => (cur === f ? null : cur)), 420);
  };

  const cycle = (empId: string, key: string) => {
    const current = attendance[empId]?.[key];
    const next = nextMark(current);
    onAttendance(
      setMark(attendance, empId, key, next),
      undefined,
      true,
    );
    flashCell(empId, key);
  };

  const setKind = (empId: string, key: string, kind: "D" | "N" | "BOTH" | "OFF") => {
    const mark: DayMark | null =
      kind === "OFF"
        ? null
        : kind === "D"
          ? { D: true, N: false }
          : kind === "N"
            ? { D: false, N: true }
            : { D: true, N: true };
    onAttendance(setMark(attendance, empId, key, mark));
    flashCell(empId, key);
  };

  const markWeekdays = () => {
    const keys = allDays.filter((d) => d.info.type === "weekday").map((d) => d.key);
    onAttendance(
      mergeDay(attendance, targetIds, keys, true),
      `Marked ${keys.length} weekdays · ${targetIds.length} staff`,
    );
  };

  const markSaturdays = () => {
    const keys = allDays.filter((d) => d.info.type === "saturday").map((d) => d.key);
    onAttendance(
      mergeDay(attendance, targetIds, keys, true),
      `Marked ${keys.length} Saturdays · ${targetIds.length} staff`,
    );
  };

  const markAllToday = (kind: "D" | "N" | "BOTH") => {
    if (!today) return;
    const mark: DayMark =
      kind === "D" ? { D: true, N: false } : kind === "N" ? { D: false, N: true } : { D: true, N: true };
    onAttendance(
      setMarks(attendance, targetIds, [today.key], mark),
      `Marked ${ordinal(today.d)} ${kind === "BOTH" ? "Day+Night" : kind === "D" ? "Day" : "Night"} · ${targetIds.length} staff`,
    );
  };

  const clearRange = () => {
    if (view === "today") {
      if (!today) return;
      onAttendance(
        setMarks(attendance, targetIds, [today.key], null),
        `Cleared ${ordinal(today.d)} · ${targetIds.length} staff`,
      );
    } else {
      const keys = days.map((d) => d.key);
      onAttendance(
        setMarks(attendance, targetIds, keys, null),
        `Cleared ${keys.length} days · ${targetIds.length} staff`,
      );
    }
  };

  const clearAll = () => {
    onAttendance(
      clearEmployees(attendance, targetIds),
      `Cleared every record for ${targetIds.length} staff`,
    );
  };

  const toggleSelect = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = visible.length > 0 && visible.every((e) => selected.has(e.id));

  /* ── render ───────────────────────────────────────────────────────── */

  return (
    <div className="space-y-3.5 pb-2">
      {/* view switch */}
      <Segmented<AttendanceView>
        ariaLabel="Attendance view"
        value={view}
        onChange={onView}
        tone="gold"
        options={[
          { value: "cards", label: "Cards", icon: <Users />, hint: "Friendly default" },
          { value: "today", label: "Today", icon: <Zap />, hint: "Quick marking for one date" },
          { value: "grid", label: "Grid", icon: <LayoutGrid />, hint: "Power users · frozen panes" },
        ]}
      />

      {/* search + add */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <TextField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or NIC…"
            className="!pl-10"
            aria-label="Search staff"
          />
        </div>
        <button type="button" onClick={onOpenAdd} className="btn-gold h-[46px] shrink-0 px-4">
          <UserRoundPlus className="h-4 w-4" />
          <span className="hidden sm:inline">Add staff</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {/* filters */}
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
        {FILTERS.map((f) => {
          const on = filter === f.id;
          const count =
            f.id === "all"
              ? employees.length
              : f.id === "male"
                ? employees.filter((e) => !e.isFemale).length
                : f.id === "female"
                  ? employees.filter((e) => e.isFemale).length
                  : bonusIds.size;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-2 text-[11.5px] font-semibold transition active:scale-95",
                on
                  ? "border-white bg-white text-ink-950"
                  : "border-white/[0.09] bg-ink-850 text-ink-300 hover:border-white/20 hover:text-ink-100",
              )}
            >
              {f.label}
              <span className={cn("tnum ml-1.5 text-[10px]", on ? "text-ink-950/55" : "text-ink-500")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-xl border border-white/[0.06] bg-ink-900/50 px-3 py-2.5 text-[10.5px] text-ink-300">
        <LegendDot className="bg-jade-600 border-jade-500" label="Day ON" />
        <LegendDot className="bg-ink-950 border-gold-500" label="Night ON" />
        <LegendDot className="split-dn border-gold-500" label="Day + Night" />
        <LegendDot className="bg-ink-800 border-white/10" label="Off" />
        <span className="ml-auto hidden items-center gap-1.5 text-ink-500 sm:flex">
          <Zap className="h-3 w-3" />
          Tap a cell to cycle
        </span>
      </div>

      {/* Today picker */}
      <AnimatePresence initial={false}>
        {view === "today" && today && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="surface-flat p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="eyebrow">Marking date</div>
                <Badge tone={today.info.type === "weekday" ? "neutral" : today.info.type === "saturday" ? "sky" : "danger"}>
                  {today.info.type === "poya" ? "Poya" : today.info.label}
                </Badge>
              </div>

              <div className="mt-2.5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDayIndex((i) => Math.max(0, i - 1))}
                  disabled={dayIndex === 0}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-ink-900 text-ink-200 transition hover:border-gold-500/40 disabled:opacity-30"
                  aria-label="Previous day"
                >
                  ‹
                </button>

                <div className="min-w-0 flex-1">
                  <div className="display truncate text-[20px] leading-none text-ink-50">
                    {MONTHS[allDays[0]?.date.getMonth() ?? 0]} {today.d}
                    <span className="tnum text-[13px] text-ink-400">, {today.date.getFullYear()}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-ink-400">
                    {today.dow} · {presentToday}/{visible.length} present
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDayIndex((i) => Math.min(allDays.length - 1, i + 1))}
                  disabled={dayIndex >= allDays.length - 1}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-ink-900 text-ink-200 transition hover:border-gold-500/40 disabled:opacity-30"
                  aria-label="Next day"
                >
                  ›
                </button>
              </div>

              {/* day scrubber */}
              <div className="no-scrollbar mt-3 flex gap-1 overflow-x-auto pb-1">
                {allDays.map((d, i) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDayIndex(i)}
                    className={cn(
                      "tnum h-8 w-8 shrink-0 rounded-lg border text-[11px] font-bold transition",
                      i === dayIndex
                        ? "border-gold-500 bg-gold-sheen bg-[length:200%_100%] text-ink-950 shadow-gold"
                        : d.info.type === "weekday"
                          ? "border-white/[0.08] bg-ink-900 text-ink-300 hover:border-white/20"
                          : "border-danger/25 bg-danger/8 text-danger-soft/90 hover:border-danger/45",
                    )}
                    title={d.info.label}
                  >
                    {d.d}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* bulk actions */}
      <div className="surface-flat p-2.5">
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <button
            type="button"
            onClick={() =>
              setSelected(allSelected ? new Set() : new Set(visible.map((e) => e.id)))
            }
            className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-300 transition hover:text-gold-300"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {allSelected ? "Clear selection" : "Select all visible"}
          </button>
          <div className="text-[11px] text-ink-400">
            {selected.size > 0 ? (
              <span className="font-bold text-gold-300">{selected.size} selected</span>
            ) : (
              <span>Bulk actions hit all {visible.length} visible</span>
            )}
          </div>
        </div>

        <div className="no-scrollbar -mx-0.5 flex gap-1.5 overflow-x-auto px-0.5">
          <BulkButton icon={<CalendarCheck2 className="h-3.5 w-3.5" />} onClick={markWeekdays}>
            Mark weekdays D
          </BulkButton>
          <BulkButton icon={<CalendarCheck2 className="h-3.5 w-3.5" />} onClick={markSaturdays}>
            Mark Saturdays
          </BulkButton>
          {view === "today" && (
            <>
              <BulkButton icon={<Sun className="h-3.5 w-3.5" />} onClick={() => markAllToday("D")}>
                All day
              </BulkButton>
              <BulkButton icon={<MoonStar className="h-3.5 w-3.5" />} onClick={() => markAllToday("N")}>
                All night
              </BulkButton>
              <BulkButton icon={<Plus className="h-3.5 w-3.5" />} onClick={() => markAllToday("BOTH")}>
                All both
              </BulkButton>
            </>
          )}
          <BulkButton icon={<Eraser className="h-3.5 w-3.5" />} onClick={clearRange}>
            Clear {view === "today" ? "today" : "range"}
          </BulkButton>
          <BulkButton icon={<Eraser className="h-3.5 w-3.5" />} onClick={clearAll} danger>
            Clear {periodText}
          </BulkButton>
        </div>
      </div>

      {/* content */}
      {employees.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No staff yet"
          body="Add your first employee, or load the demo roster from Settings to explore the whole workflow."
          action={
            <button type="button" className="btn-gold h-11 px-5" onClick={onOpenAdd}>
              <UserRoundPlus className="h-4 w-4" />
              Add employee
            </button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="No employees match that filter"
          body="Try a different search term, or switch the filter back to All."
          action={
            <button
              type="button"
              className="btn-outline h-10 px-4"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Reset filters
            </button>
          }
        />
      ) : view === "cards" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((emp) => (
              <EmployeeCard
                key={emp.id}
                emp={emp}
                days={days.length ? days : allDays}
                attendance={attendance}
                row={rows.find((r) => r.emp.id === emp.id)}
                bonusDays={bonusDays}
                selected={selected.has(emp.id)}
                onToggleSelect={() => toggleSelect(emp.id)}
                onCycle={cycle}
                onOpenDay={(id, key) => onOpenDay(id, key)}
                onOpenPayslip={() => onOpenPayslip(emp.id)}
                flashKey={flash}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : view === "today" ? (
        <TodayView
          day={today}
          employees={visible}
          attendance={attendance}
          onSet={(id, kind) => setKind(id, today.key, kind)}
          onCycle={cycle}
          selected={selected}
          onToggleSelect={toggleSelect}
        />
      ) : (
        <AttendanceGrid
          employees={visible}
          days={days.length ? days : allDays}
          attendance={attendance}
          rows={rows}
          selected={selected}
          onToggleSelect={toggleSelect}
          onCycle={cycle}
          flashKey={flash}
          todayKey={todayKey()}
        />
      )}

      {view === "grid" && visible.length > 0 && (
        <p className="px-1 text-[11px] leading-relaxed text-ink-500">
          Frozen name column + frozen header — scroll the matrix in any direction. Totals respect
          the active {days.length !== allDays.length ? "week range" : "month"}.
        </p>
      )}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-3.5 w-3.5 rounded-[5px] border", className)} />
      {label}
    </span>
  );
}

function BulkButton({
  children,
  icon,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[11.5px] font-semibold transition active:scale-95",
        danger
          ? "border-danger/28 bg-danger/10 text-danger-soft hover:border-danger/50 hover:bg-danger/16"
          : "border-white/[0.08] bg-ink-900/80 text-ink-200 hover:border-gold-500/40 hover:text-gold-200",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export default AttendanceTab;
