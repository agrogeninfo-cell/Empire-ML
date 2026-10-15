import { memo } from "react";
import { motion } from "framer-motion";
import { Moon, Sparkles, Sun, SunMoon } from "lucide-react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/calendar";
import { markKind } from "@/lib/payroll";
import type { AttendanceMap, CalendarDay, Employee } from "@/lib/types";
import { KIND_STYLE } from "./ShiftCell";

/* ═══════════════════════════════════════════════════════════════════════
 * TodayView — one date, every staff member, big touch targets.
 * Mirrors the "⚡ Today" mode of the source artefact.
 * ═════════════════════════════════════════════════════════════════════ */

interface Props {
  day: CalendarDay;
  employees: Employee[];
  attendance: AttendanceMap;
  onSet: (empId: string, kind: "D" | "N" | "BOTH" | "OFF") => void;
  onCycle: (empId: string, key: string) => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
}

const ACTIONS = [
  { kind: "D", label: "Day", icon: Sun, on: "bg-jade-600 text-white border-jade-500/60" },
  { kind: "N", label: "Night", icon: Moon, on: "bg-ink-950 text-gold-400 border-gold-500/60" },
  { kind: "BOTH", label: "Both", icon: SunMoon, on: "bg-gold-sheen bg-[length:200%_100%] text-ink-950 border-gold-500/70" },
  { kind: "OFF", label: "Off", icon: Sparkles, on: "bg-ink-700 text-ink-100 border-white/20" },
] as const;

export const TodayView = memo(function TodayView({
  day,
  employees,
  attendance,
  onSet,
  onCycle,
  selected,
  onToggleSelect,
}: Props) {
  return (
    <div className="space-y-2.5">
      {employees.map((emp, i) => {
        const mark = attendance[emp.id]?.[day.key];
        const kind = markKind(mark);
        const isSel = selected.has(emp.id);

        return (
          <motion.div
            key={emp.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i * 0.035, 0.28), ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "rounded-2xl border bg-ink-850/85 p-3 backdrop-blur-xl transition-colors",
              isSel ? "border-gold-500/50" : "border-white/[0.075]",
            )}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onToggleSelect(emp.id)}
                aria-pressed={isSel}
                aria-label={isSel ? `Deselect ${emp.name}` : `Select ${emp.name}`}
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-[12px] font-bold transition",
                  isSel
                    ? "border-gold-500/55 bg-gold-sheen bg-[length:200%_100%] text-ink-950"
                    : "border-white/[0.09] bg-white/[0.045] text-ink-100",
                )}
              >
                {initials(emp.name) || "?"}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="truncate text-[13.5px] font-bold text-ink-50">{emp.name}</h4>
                  {emp.isFemale && (
                    <span className="shrink-0 rounded-full border border-gold-500/28 bg-gold-500/12 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-gold-200">
                      ♀ Female
                    </span>
                  )}
                </div>
                <p className="tnum mt-0.5 truncate font-mono text-[10px] text-ink-500">
                  {emp.nic || "no NIC"}
                </p>
              </div>

              {/* tap the pill to cycle */}
              <button
                type="button"
                onClick={() => onCycle(emp.id, day.key)}
                className={cn(
                  "shrink-0 rounded-xl border px-2.5 py-2 text-[11px] font-bold transition active:scale-95",
                  KIND_STYLE[kind].wrap,
                  KIND_STYLE[kind].text,
                )}
                aria-label={`Cycle shift for ${emp.name}, currently ${kind}`}
              >
                {kind === "OFF" ? "—" : kind === "BOTH" ? "D+N" : kind === "D" ? "☀ D" : "☾ N"}
              </button>
            </div>

            <div className="mt-2.5 grid grid-cols-4 gap-1.5">
              {ACTIONS.map((a) => {
                const on = kind === a.kind;
                const Icon = a.icon;
                return (
                  <button
                    key={a.kind}
                    type="button"
                    onClick={() => onSet(emp.id, a.kind)}
                    className={cn(
                      "flex h-10 items-center justify-center gap-1.5 rounded-xl border text-[11px] font-bold transition active:scale-95",
                      on
                        ? a.on
                        : "border-white/[0.07] bg-ink-900/70 text-ink-400 hover:border-white/16 hover:text-ink-200",
                    )}
                    aria-pressed={on}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {a.label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
});

export default TodayView;
