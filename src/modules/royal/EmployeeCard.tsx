import { memo } from "react";
import { motion } from "framer-motion";
import { CalendarDays, ChevronRight, Moon, Sparkles, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { initials, money } from "@/lib/calendar";
import { isMarked, markKind } from "@/lib/payroll";
import type {
  AttendanceMap,
  CalendarDay,
  DayMark,
  Employee,
  PayslipRow,
} from "@/lib/types";
import { DAY_TONE, ShiftCell } from "./ShiftCell";

/* ═══════════════════════════════════════════════════════════════════════
 * EmployeeCard — "Cards" attendance view.
 * A single tap on any day cycles  ∅ → D → N → D+N → ∅.
 * ═════════════════════════════════════════════════════════════════════ */

interface Props {
  emp: Employee;
  days: CalendarDay[];
  attendance: AttendanceMap;
  row?: PayslipRow;
  bonusDays: number;
  selected?: boolean;
  onToggleSelect?: () => void;
  onCycle: (empId: string, key: string) => void;
  onOpenDay?: (empId: string, key: string) => void;
  onOpenPayslip?: () => void;
  flashKey?: string | null;
}

export const EmployeeCard = memo(function EmployeeCard({
  emp,
  days,
  attendance,
  row,
  bonusDays,
  selected,
  onToggleSelect,
  onCycle,
  onOpenDay,
  onOpenPayslip,
  flashKey,
}: Props) {
  const marks = attendance[emp.id] ?? {};
  const markedDays = days.filter((d) => isMarked(marks[d.key])).length;
  const nightCount = days.filter((d) => marks[d.key]?.N).length;
  const progress = bonusDays > 0 ? Math.min(1, (row?.workingDays ?? 0) / bonusDays) : 0;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative overflow-hidden rounded-[22px] border bg-ink-850/85 shadow-lift backdrop-blur-xl transition-colors",
        selected ? "border-gold-500/55" : "border-white/[0.075] hover:border-white/[0.14]",
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(560px 130px at 8% -22%, rgba(212,175,55,0.14), transparent 68%)",
        }}
      />

      {/* ── header ─────────────────────────────────────────────────── */}
      <header className="relative flex items-start gap-3 px-4 pb-3 pt-3.5">
        <button
          type="button"
          onClick={onToggleSelect}
          aria-label={selected ? `Deselect ${emp.name}` : `Select ${emp.name}`}
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-2xl border text-[13px] font-bold transition",
            selected
              ? "border-gold-500/60 bg-gold-sheen bg-[length:200%_100%] text-ink-950 shadow-gold"
              : "border-white/[0.09] bg-white/[0.045] text-ink-100 hover:border-gold-500/35",
          )}
        >
          {initials(emp.name) || "?"}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[14.5px] font-bold leading-tight text-ink-50">
              {emp.name}
            </h3>
            {emp.isFemale && (
              <span className="shrink-0 rounded-full border border-gold-500/30 bg-gold-500/12 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-[0.1em] text-gold-200">
                Female
              </span>
            )}
          </div>
          <p className="tnum mt-1 truncate font-mono text-[10.5px] text-ink-400">
            NIC {emp.nic || "—"} · Rs {money(emp.rate)}/shift
          </p>
        </div>

        {onOpenPayslip && (
          <button
            type="button"
            onClick={onOpenPayslip}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-ink-300 transition hover:border-gold-500/40 hover:text-gold-300 active:scale-92"
            aria-label={`Open payslip for ${emp.name}`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </header>

      {/* ── quick stats ────────────────────────────────────────────── */}
      <div className="relative grid grid-cols-4 gap-px overflow-hidden border-y border-white/[0.06] bg-white/[0.06]">
        <QuickStat
          icon={<CalendarDays className="h-3 w-3" />}
          label="Days"
          value={row?.workingDays ?? markedDays}
        />
        <QuickStat icon={<Sun className="h-3 w-3" />} label="Day" value={row?.weekday ?? 0} />
        <QuickStat icon={<Moon className="h-3 w-3" />} label="Night" value={nightCount} />
        <div className="relative bg-ink-850 px-2.5 py-2">
          <div className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-[0.1em] text-ink-400">
            <Sparkles className={cn("h-3 w-3", row?.bonusEligible ? "text-gold-400" : "")} />
            Bonus
          </div>
          <div
            className={cn(
              "tnum mt-1 text-[13px] font-bold leading-none",
              row?.bonusEligible ? "text-gold-300" : "text-ink-300",
            )}
          >
            {row?.bonusEligible ? `+${money(row.bonus)}` : `${bonusDays - (row?.workingDays ?? 0)} to go`}
          </div>
          <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "h-full rounded-full",
                progress >= 1 ? "bg-gold-sheen bg-[length:200%_100%]" : "bg-jade-600",
              )}
            />
          </div>
        </div>
      </div>

      {/* ── day strip ──────────────────────────────────────────────── */}
      <div className="relative px-4 py-3">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {days.map((d) => {
            const mark: DayMark | undefined = marks[d.key];
            const kind = markKind(mark);
            return (
              <div key={d.key} className="flex shrink-0 flex-col items-center gap-1">
                <span
                  className={cn(
                    "text-[8.5px] font-bold uppercase leading-none",
                    DAY_TONE[d.info.tone],
                  )}
                >
                  {d.info.type === "poya" ? "P" : d.dow[0]}
                </span>
                <ShiftCell
                  mark={mark}
                  day={d.d}
                  size="sm"
                  highlight={flashKey === `${emp.id}-${d.key}`}
                  onClick={() => onCycle(emp.id, d.key)}
                  onDoubleClick={() => onOpenDay?.(emp.id, d.key)}
                />
                <span
                  className={cn(
                    "tnum text-[9px] font-semibold leading-none",
                    kind === "OFF" ? "text-ink-500" : "text-ink-200",
                  )}
                >
                  {d.d}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── footer: net payable ────────────────────────────────────── */}
      {row && (
        <footer className="relative flex items-center justify-between gap-3 border-t border-white/[0.06] bg-ink-900/50 px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">
              Net payable
            </div>
            <div className="tnum truncate text-[15px] font-bold leading-tight text-ink-50">
              Rs {money(row.net)}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[10.5px]">
            <span className="tnum text-jade-300">
              Gross <b className="font-bold">{money(row.gross)}</b>
            </span>
            <span className="tnum text-danger-soft">
              Ded <b className="font-bold">{money(row.totalDed)}</b>
            </span>
          </div>
        </footer>
      )}
    </motion.article>
  );
});

function QuickStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="relative bg-ink-850 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-[0.1em] text-ink-400">
        {icon}
        {label}
      </div>
      <div className="tnum mt-1 text-[13px] font-bold leading-none text-ink-100">{value}</div>
    </div>
  );
}


