import { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { initials, money } from "@/lib/calendar";
import type { AttendanceMap, CalendarDay, Employee, PayslipRow } from "@/lib/types";
import { DAY_TONE, ShiftCell } from "./ShiftCell";

/* ═══════════════════════════════════════════════════════════════════════
 * AttendanceGrid — "power user" matrix with a frozen name column and a
 * frozen day header. Horizontal + vertical scroll stay in sync by simply
 * being the same scroll container.
 * ═════════════════════════════════════════════════════════════════════ */

interface Props {
  employees: Employee[];
  days: CalendarDay[];
  attendance: AttendanceMap;
  rows: PayslipRow[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onCycle: (empId: string, key: string) => void;
  flashKey?: string | null;
  todayKey?: string | null;
}

export const AttendanceGrid = memo(function AttendanceGrid({
  employees,
  days,
  attendance,
  rows,
  selected,
  onToggleSelect,
  onCycle,
  flashKey,
  todayKey,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Jump the frozen header to "today" when the month changes.
  useEffect(() => {
    if (!todayKey || !scrollRef.current) return;
    const idx = days.findIndex((d) => d.key === todayKey);
    if (idx < 0) return;
    const target = Math.max(0, idx * 42 - 160);
    scrollRef.current.scrollTo({ left: target, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey]);

  const rowFor = (id: string) => rows.find((r) => r.emp.id === id);

  return (
    <div className="overflow-hidden rounded-[22px] border border-white/[0.075] bg-ink-850/85 shadow-lift backdrop-blur-xl">
      <div ref={scrollRef} className="grid-scroll scrollbar-thin max-h-[62dvh]">
        <table className="w-max border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr>
              <th
                scope="col"
                className={cn(
                  "freeze-col freeze-head freeze-corner sticky left-0 top-0 z-40 min-w-[178px] border-b border-r border-white/[0.08] bg-ink-900 px-3 py-2 text-left",
                )}
              >
                <span className="eyebrow">Staff</span>
              </th>
              {days.map((d) => (
                <th
                  key={d.key}
                  scope="col"
                  className={cn(
                    "freeze-head sticky top-0 z-30 border-b border-white/[0.06] bg-ink-900 px-0 py-1 text-center",
                    todayKey === d.key && "bg-gold-500/[0.12]",
                  )}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      className={cn(
                        "text-[8px] font-bold uppercase leading-none",
                        DAY_TONE[d.info.tone],
                      )}
                    >
                      {d.info.type === "poya" ? "Poya" : d.dow[0]}
                    </span>
                    <span
                      className={cn(
                        "tnum text-[11px] font-bold leading-none",
                        todayKey === d.key ? "text-gold-300" : "text-ink-200",
                      )}
                    >
                      {d.d}
                    </span>
                  </div>
                </th>
              ))}
              <th
                scope="col"
                className="freeze-head sticky top-0 z-30 border-b border-l border-white/[0.08] bg-ink-900 px-3 py-2 text-right"
              >
                <span className="eyebrow">Days</span>
              </th>
              <th
                scope="col"
                className="freeze-head sticky top-0 z-30 border-b border-white/[0.08] bg-ink-900 px-3 py-2 text-right"
              >
                <span className="eyebrow">Net</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {employees.map((emp, i) => {
              const marks = attendance[emp.id] ?? {};
              const row = rowFor(emp.id);
              const isSel = selected.has(emp.id);
              return (
                <tr key={emp.id} className={cn(i % 2 === 1 && "[&>td]:bg-white/[0.014]")}>
                  <td
                    className={cn(
                      "freeze-col sticky left-0 z-20 min-w-[178px] border-b border-r border-white/[0.06] bg-ink-850 px-2.5 py-2",
                      isSel && "bg-gold-500/[0.09]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleSelect(emp.id)}
                      className="flex w-full items-center gap-2 text-left"
                      aria-pressed={isSel}
                    >
                      <span
                        className={cn(
                          "grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[10px] font-bold transition",
                          isSel
                            ? "border-gold-500/55 bg-gold-sheen bg-[length:200%_100%] text-ink-950"
                            : "border-white/[0.09] bg-white/[0.04] text-ink-200",
                        )}
                      >
                        {initials(emp.name) || "?"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1">
                          <span className="truncate text-[12.5px] font-semibold text-ink-50">
                            {emp.name}
                          </span>
                          {emp.isFemale && (
                            <span className="shrink-0 text-[9px] font-bold text-gold-400">♀</span>
                          )}
                        </span>
                        <span className="tnum block truncate font-mono text-[9.5px] text-ink-500">
                          {emp.nic || "no NIC"}
                        </span>
                      </span>
                    </button>
                  </td>

                  {days.map((d) => (
                    <td
                      key={d.key}
                      className={cn(
                        "border-b border-white/[0.045] px-0 py-1 text-center",
                        todayKey === d.key && "bg-gold-500/[0.06]",
                      )}
                    >
                      <div className="flex justify-center">
                        <ShiftCell
                          mark={marks[d.key]}
                          size="xs"
                          className="h-7 w-[34px] rounded-[6px]"
                          highlight={flashKey === `${emp.id}-${d.key}`}
                          onClick={() => onCycle(emp.id, d.key)}
                        />
                      </div>
                    </td>
                  ))}

                  <td className="tnum border-b border-l border-white/[0.06] px-3 py-2 text-right text-[12px] font-bold text-ink-100">
                    {row?.workingDays ?? 0}
                  </td>
                  <td className="tnum border-b border-white/[0.06] px-3 py-2 text-right text-[12px] font-bold text-gold-300">
                    {money(row?.net ?? 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default AttendanceGrid;
