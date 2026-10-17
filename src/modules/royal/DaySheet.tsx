import { useEffect, useMemo, useState } from "react";
import { Moon, Sparkles, Sun, SunMoon } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Badge } from "@/components/ui/Metrics";
import { cn } from "@/lib/cn";
import { MONTHS, money } from "@/lib/calendar";
import { markKind } from "@/lib/payroll";
import type { AttendanceMap, CalendarDay, DayMark, Employee, PayrollRates } from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════
 * DaySheet — explicit OFF / DAY / NIGHT / BOTH picker for one employee on
 * one date, showing the rate that mark will attract.
 * ═════════════════════════════════════════════════════════════════════ */

interface Props {
  open: boolean;
  onClose: () => void;
  employee: Employee | null;
  day: CalendarDay | null;
  attendance: AttendanceMap;
  payrollRates: PayrollRates;
  bonusDays: number;
  workingDays: number;
  onApply: (empId: string, key: string, mark: DayMark | null) => void;
}

const OPTIONS = [
  {
    kind: "OFF" as const,
    label: "Off",
    glyph: "—",
    icon: Sparkles,
    on: "border-white/25 bg-white/[0.09] text-ink-50",
    note: "No shift recorded",
  },
  {
    kind: "D" as const,
    label: "Day shift",
    glyph: "☀",
    icon: Sun,
    on: "border-jade-500/60 bg-jade-600/22 text-jade-100",
    note: "One billable shift",
  },
  {
    kind: "N" as const,
    label: "Night shift",
    glyph: "☾",
    icon: Moon,
    on: "border-gold-500/60 bg-gold-500/18 text-gold-100",
    note: "One billable shift",
  },
  {
    kind: "BOTH" as const,
    label: "Day + Night",
    glyph: "◑",
    icon: SunMoon,
    on: "border-gold-500/70 bg-gold-sheen bg-[length:200%_100%] text-ink-950",
    note: "Two billable shifts on one date",
  },
];

export function DaySheet({
  open,
  onClose,
  employee,
  day,
  attendance,
  payrollRates,
  bonusDays,
  workingDays,
  onApply,
}: Props) {
  const [pending, setPending] = useState<"OFF" | "D" | "N" | "BOTH">("OFF");

  useEffect(() => {
    if (open && employee && day) {
      setPending(markKind(attendance[employee.id]?.[day.key]));
    }
  }, [open, employee, day, attendance]);

  const rateFor = useMemo(() => {
    if (!day) return 0;
    const t = day.info.type;
    return t === "weekday"
      ? payrollRates.weekday
      : t === "saturday"
        ? payrollRates.saturday
        : payrollRates.sunday;
  }, [day, payrollRates]);

  if (!employee || !day) return null;

  const shifts = pending === "BOTH" ? 2 : pending === "OFF" ? 0 : 1;
  const femaleExtra = employee.isFemale && (pending === "N" || pending === "BOTH") ? payrollRates.female : 0;
  const nightCount = pending === "N" || pending === "BOTH" ? 1 : 0;
  const willCountAsWorkingDay = shifts > 0;
  const projectedDays = willCountAsWorkingDay && !dayAlreadyCounted(attendance, employee.id, day.key, workingDays)
    ? workingDays + 1
    : workingDays;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow={`${day.dow} · ${day.info.type === "poya" ? "Poya holiday" : day.info.label}`}
      title={employee.name}
      subtitle={`${MONTHS[day.date.getMonth()]} ${day.d}, ${day.date.getFullYear()} · ${day.key}`}
      size="sm"
      footer={
        <div className="flex gap-2 pb-1">
          <button type="button" className="btn-outline h-12 flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-gold h-12 flex-1"
            onClick={() => {
              const mark: DayMark | null =
                pending === "OFF"
                  ? null
                  : pending === "D"
                    ? { D: true, N: false }
                    : pending === "N"
                      ? { D: false, N: true }
                      : { D: true, N: true };
              onApply(employee.id, day.key, mark);
              onClose();
            }}
          >
            Save mark
          </button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div className="grid grid-cols-2 gap-2">
          {OPTIONS.map((o) => {
            const on = pending === o.kind;
            const Icon = o.icon;
            return (
              <button
                key={o.kind}
                type="button"
                onClick={() => setPending(o.kind)}
                aria-pressed={on}
                className={cn(
                  "flex h-[74px] flex-col items-center justify-center gap-1 rounded-2xl border transition active:scale-[0.97]",
                  on
                    ? o.on
                    : "border-white/[0.08] bg-ink-900/60 text-ink-400 hover:border-white/18 hover:text-ink-200",
                )}
              >
                <span className="flex items-center gap-1.5 text-[13.5px] font-bold">
                  <Icon className="h-4 w-4" />
                  {o.label}
                </span>
                <span className={cn("text-[10px]", on ? "opacity-75" : "opacity-55")}>{o.note}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-ink-900/60 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-400">
              Day class
            </span>
            <Badge
              tone={
                day.info.type === "weekday"
                  ? "neutral"
                  : day.info.type === "saturday"
                    ? "sky"
                    : "danger"
              }
            >
              {day.info.type === "poya" ? "Poya" : day.info.label}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-400">
              Rate per shift
            </span>
            <span className="tnum text-[13px] font-bold text-ink-50">Rs {money(rateFor)}</span>
          </div>
          {femaleExtra > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-400">
                Female night ×{nightCount}
              </span>
              <span className="tnum text-[13px] font-bold text-gold-300">
                + Rs {money(femaleExtra * nightCount)}
              </span>
            </div>
          )}
          <div className="rule-gold" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-400">
              This mark earns
            </span>
            <span className="tnum text-[15px] font-extrabold text-jade-300">
              Rs {money(rateFor * shifts + femaleExtra * nightCount)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-400">
              Working days → bonus
            </span>
            <span className="tnum text-[12px] font-bold text-ink-100">
              {projectedDays} / {bonusDays}
            </span>
          </div>
          {projectedDays >= bonusDays && (
            <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-gold-500/25 bg-gold-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-gold-200">
              <Sparkles className="h-3 w-3" />
              Bonus threshold reached
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** A date is already counted if the employee has any mark on it. */
function dayAlreadyCounted(
  attendance: AttendanceMap,
  empId: string,
  key: string,
  _workingDays: number,
): boolean {
  const m = attendance[empId]?.[key];
  return !!m && (m.D || m.N);
}

export default DaySheet;
