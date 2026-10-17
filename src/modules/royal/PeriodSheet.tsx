import { useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { SelectField } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Metrics";
import { cn } from "@/lib/cn";
import {
  MONTHS,
  buildMonth,
  currentPeriod,
  daysInMonth,
  shiftPeriod,
} from "@/lib/calendar";
import type { CalendarDay, Period } from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════
 * PeriodSheet — month/year picker with a live mini-calendar that flags
 * Poya days, Saturdays and Sundays before you commit.
 * ═════════════════════════════════════════════════════════════════════ */

const YEAR_SPAN = 6;

interface Props {
  open: boolean;
  onClose: () => void;
  period: Period;
  poyaDays: string[];
  onApply: (p: Period) => void;
  /** per-day shift counts for the preview */
  dayLoad?: (day: CalendarDay) => number;
}

export function PeriodSheet({ open, onClose, period, poyaDays, onApply, dayLoad }: Props) {
  const today = useMemo(() => currentPeriod(), []);
  const years = useMemo(() => {
    const base = today.y;
    return Array.from({ length: YEAR_SPAN * 2 + 1 }, (_, i) => base - YEAR_SPAN + i).sort(
      (a, b) => b - a,
    );
  }, [today.y]);

  const preview = useMemo(() => buildMonth(period, poyaDays), [period, poyaDays]);
  const total = daysInMonth(period.y, period.m);

  const counts = useMemo(() => {
    let weekday = 0;
    let saturday = 0;
    let sunday = 0;
    let poya = 0;
    for (const d of preview) {
      if (d.info.type === "weekday") weekday++;
      else if (d.info.type === "saturday") saturday++;
      else if (d.info.type === "sunday") sunday++;
      else poya++;
    }
    return { weekday, saturday, sunday, poya };
  }, [preview]);

  const step = (delta: number) => onApply(shiftPeriod(period, delta));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow="Billing period"
      title="Select Period"
      subtitle="Attendance, payroll and the client invoice all follow this month."
      size="md"
      footer={
        <div className="flex gap-2 pb-1">
          <button type="button" className="btn-outline h-12 flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-gold h-12 flex-1"
            onClick={() => {
              onApply(period);
              onClose();
            }}
          >
            Apply {MONTHS[period.m]} {period.y}
          </button>
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        {/* stepper */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous month"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-ink-900 text-ink-200 transition hover:border-gold-500/40 hover:text-gold-300 active:scale-92"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 text-center">
            <div className="display text-[22px] leading-none text-ink-50">
              {MONTHS[period.m]}
            </div>
            <div className="tnum mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              {period.y} · {total} days
            </div>
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next month"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-ink-900 text-ink-200 transition hover:border-gold-500/40 hover:text-gold-300 active:scale-92"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Year"
            value={period.y}
            onChange={(v) => onApply({ ...period, y: Number(v) })}
            options={years.map((y) => ({ value: y, label: String(y) }))}
          />
          <SelectField
            label="Month"
            value={period.m}
            onChange={(v) => onApply({ ...period, m: Number(v) })}
            options={MONTHS.map((m, i) => ({ value: i, label: m }))}
          />
        </div>

        <button
          type="button"
          onClick={() => onApply(currentPeriod())}
          className="btn-outline h-10 w-full text-[12px]"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Jump to current month ({MONTHS[today.m]} {today.y})
        </button>

        <div className="rule-gold" />

        {/* mini calendar */}
        <div>
          <div className="eyebrow mb-2.5">Day map</div>
          <div className="grid grid-cols-7 gap-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div
                key={i}
                className="pb-1 text-center text-[9px] font-bold uppercase tracking-wider text-ink-500"
              >
                {d}
              </div>
            ))}
            {preview.map((d) => {
              const load = dayLoad?.(d) ?? 0;
              const tone =
                d.info.type === "poya"
                  ? "border-danger/45 bg-danger/14 text-danger-soft"
                  : d.info.type === "sunday"
                    ? "border-danger/32 bg-danger/8 text-danger-soft/90"
                    : d.info.type === "saturday"
                      ? "border-sky2/35 bg-sky2/12 text-[#a5cbff]"
                      : "border-white/[0.07] bg-ink-900/70 text-ink-200";
              return (
                <div
                  key={d.key}
                  className={cn(
                    "relative grid aspect-square place-items-center rounded-lg border text-[11px] font-bold",
                    tone,
                  )}
                  title={`${d.key} • ${d.info.label}${load ? ` • ${load} shifts` : ""}`}
                >
                  {d.d}
                  {load > 0 && (
                    <span className="absolute bottom-[3px] h-[3px] w-[3px] rounded-full bg-jade-400" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge tone="neutral">{counts.weekday} weekdays</Badge>
          <Badge tone="sky">{counts.saturday} Saturdays</Badge>
          <Badge tone="danger">{counts.sunday} Sundays</Badge>
          <Badge tone="gold">{counts.poya} Poya</Badge>
        </div>
      </div>
    </Sheet>
  );
}

export default PeriodSheet;
