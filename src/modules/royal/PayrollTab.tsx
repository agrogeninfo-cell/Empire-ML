import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  FileText,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Segmented } from "@/components/ui/Segmented";
import { Stepper } from "@/components/ui/Field";
import { Badge, MetricCard, ProgressRing, Row } from "@/components/ui/Metrics";
import { cn } from "@/lib/cn";
import { initials, money } from "@/lib/calendar";
import type { PayslipRow, RangeMode, WeekId, WeekSlice } from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════
 * PayrollTab — month / week / custom-range earnings per employee
 * ═════════════════════════════════════════════════════════════════════ */

interface Props {
  rows: PayslipRow[];
  mode: RangeMode;
  onMode: (m: RangeMode) => void;
  weekId: WeekId;
  onWeekId: (w: WeekId) => void;
  weeks: WeekSlice[];
  fromDay: number;
  toDay: number;
  onFromDay: (n: number) => void;
  onToDay: (n: number) => void;
  totalDays: number;
  bonusDays: number;
  bonusAmount: number;
  rangeText: string;
  grossTotal: number;
  deductionTotal: number;
  netTotal: number;
  bonusEligible: number;
  payrollRates: { weekday: number; saturday: number; sunday: number; female: number };
  onOpenPayslip: (empId: string) => void;
  isWeek: boolean;
}

export function PayrollTab({
  rows,
  mode,
  onMode,
  weekId,
  onWeekId,
  weeks,
  fromDay,
  toDay,
  onFromDay,
  onToDay,
  totalDays,
  bonusDays,
  bonusAmount,
  rangeText,
  grossTotal,
  deductionTotal,
  netTotal,
  bonusEligible,
  payrollRates,
  onOpenPayslip,
  isWeek,
}: Props) {
  const [sort, setSort] = useState<"name" | "net" | "days">("net");

  const sorted = useMemo(() => {
    const list = [...rows];
    if (sort === "net") list.sort((a, b) => b.net - a.net);
    else if (sort === "days") list.sort((a, b) => b.workingDays - a.workingDays);
    else list.sort((a, b) => a.emp.name.localeCompare(b.emp.name));
    return list;
  }, [rows, sort]);

  return (
    <div className="space-y-4">
      {/* ── range controls ─────────────────────────────────────────── */}
      <div className="surface-flat space-y-3 p-3">
        <Segmented<RangeMode>
          ariaLabel="Payroll range"
          value={mode}
          onChange={onMode}
          tone="jade"
          options={[
            { value: "month", label: "Month wise", icon: <CalendarRange /> },
            { value: "week", label: "Week wise", icon: <ArrowUpRight /> },
          ]}
        />

        <AnimatePresence initial={false}>
          {mode === "week" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pt-0.5">
                {weeks.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onWeekId(w.id as WeekId)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-2 text-[11.5px] font-semibold transition active:scale-95",
                      weekId === w.id
                        ? "border-jade-500/50 bg-jade-600/20 text-jade-100"
                        : "border-white/[0.09] bg-ink-900 text-ink-300 hover:border-white/20 hover:text-ink-100",
                    )}
                  >
                    {w.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onWeekId("custom")}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-2 text-[11.5px] font-semibold transition active:scale-95",
                    weekId === "custom"
                      ? "border-gold-500/50 bg-gold-500/16 text-gold-200"
                      : "border-white/[0.09] bg-ink-900 text-ink-300 hover:border-white/20 hover:text-ink-100",
                  )}
                >
                  Custom range
                </button>
              </div>

              {weekId === "custom" && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Stepper
                    label="From day"
                    value={fromDay}
                    min={1}
                    max={totalDays}
                    onChange={onFromDay}
                    suffix={`/ ${totalDays}`}
                    size="sm"
                  />
                  <Stepper
                    label="To day"
                    value={toDay}
                    min={1}
                    max={totalDays}
                    onChange={onToDay}
                    suffix={`/ ${totalDays}`}
                    size="sm"
                  />
                </div>
              )}

              <div className="mt-3 flex items-center gap-2 rounded-xl border border-gold-500/22 bg-gold-500/[0.07] px-3 py-2.5">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-gold-400" />
                <p className="text-[11px] leading-snug text-gold-100/85">
                  Week-wise ranges never pay the attendance bonus — it needs {bonusDays} distinct
                  working days across a full month.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── headline metrics ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Gross"
          value={`Rs ${money(grossTotal)}`}
          icon={<Wallet className="h-3.5 w-3.5" />}
          tone="jade"
          sub={`${rows.length} staff · ${rangeText}`}
          delay={0}
        />
        <MetricCard
          label="Deductions"
          value={`Rs ${money(deductionTotal)}`}
          icon={<ArrowDownRight className="h-3.5 w-3.5" />}
          tone="danger"
          sub="Meal + boarding + advance"
          delay={60}
        />
        <MetricCard
          label="Bonus pool"
          value={`Rs ${money(bonusEligible * bonusAmount)}`}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          tone="gold"
          sub={
            isWeek
              ? "N/A for week ranges"
              : `${bonusEligible} of ${rows.length} qualify at ${bonusDays}+ days`
          }
          delay={120}
        />
        <MetricCard
          label="Net payable"
          value={`Rs ${money(netTotal)}`}
          icon={<ArrowUpRight className="h-3.5 w-3.5" />}
          tone="gold"
          sub={`Avg Rs ${money(rows.length ? netTotal / rows.length : 0)} per head`}
          delay={180}
        />
      </div>

      {/* ── rate reference ─────────────────────────────────────────── */}
      <details className="group surface-flat overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[12.5px] font-semibold text-ink-200 transition hover:text-gold-200">
          <span className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-gold-400" />
            Payroll rates in force
          </span>
          <span className="text-ink-500 transition group-open:rotate-180">⌄</span>
        </summary>
        <div className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
          <Row label="Weekday shift" value={`Rs ${money(payrollRates.weekday)}`} />
          <Row label="Saturday shift" value={`Rs ${money(payrollRates.saturday)}`} />
          <Row label="Sunday / Poya shift" value={`Rs ${money(payrollRates.sunday)}`} />
          <Row label="Female night allowance" value={`+ Rs ${money(payrollRates.female)}`} tone="gold" />
          <Row
            label={`Attendance bonus (${bonusDays}+ distinct days)`}
            value={`Rs ${money(bonusAmount)}`}
            tone="jade"
            strong
          />
        </div>
      </details>

      {/* ── toolbar ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div className="eyebrow">Payslips · {sorted.length}</div>
        <div className="flex gap-1">
          {(["net", "days", "name"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wide transition",
                sort === s
                  ? "border-white/18 bg-white/[0.09] text-ink-50"
                  : "border-white/[0.07] text-ink-400 hover:text-ink-200",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── payslip rows ───────────────────────────────────────────── */}
      <div className="space-y-2.5">
        <AnimatePresence initial={false} mode="popLayout">
          {sorted.map((r, i) => (
            <PayslipCard
              key={r.emp.id}
              row={r}
              index={i}
              bonusDays={bonusDays}
              isWeek={isWeek}
              onOpen={() => onOpenPayslip(r.emp.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {sorted.length === 0 && (
        <div className="surface-flat px-4 py-10 text-center text-[13px] text-ink-400">
          No staff on the roster yet — add employees in Settings or on the Attendance tab.
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * PayslipCard
 * ═════════════════════════════════════════════════════════════════════ */

function PayslipCard({
  row,
  index,
  bonusDays,
  isWeek,
  onOpen,
}: {
  row: PayslipRow;
  index: number;
  bonusDays: number;
  isWeek: boolean;
  onOpen: () => void;
}) {
  const { emp } = row;
  const progress = bonusDays > 0 ? Math.min(1, row.workingDays / bonusDays) : 0;
  const gap = Math.max(0, bonusDays - row.workingDays);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.03, 0.24), ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative overflow-hidden rounded-[20px] border bg-ink-850/85 p-3.5 shadow-lift backdrop-blur-xl transition-colors",
        row.bonusEligible ? "border-gold-500/32" : "border-white/[0.075] hover:border-white/[0.14]",
      )}
    >
      {row.bonusEligible && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            backgroundImage:
              "radial-gradient(460px 120px at 100% -18%, rgba(212,175,55,0.2), transparent 66%)",
          }}
        />
      )}

      <div className="relative flex items-start gap-3">
        <ProgressRing
          value={progress}
          size={52}
          stroke={4.5}
          tone={row.bonusEligible ? "gold" : "jade"}
          label={row.workingDays}
          sublabel="days"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="truncate text-[14px] font-bold leading-tight text-ink-50">
              {emp.name}
            </h4>
            {emp.isFemale && (
              <span className="shrink-0 rounded-full border border-gold-500/28 bg-gold-500/12 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-gold-200">
                ♀
              </span>
            )}
          </div>
          <p className="tnum mt-0.5 truncate font-mono text-[10px] text-ink-500">
            {emp.nic || "no NIC"} · ID {initials(emp.name)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ShiftPill label="Weekday" n={row.weekday} tone="neutral" />
            <ShiftPill label="Sat" n={row.saturday} tone="sky" />
            <ShiftPill label="Sun/Poya" n={row.sunday} tone="danger" />
            {emp.isFemale && <ShiftPill label="Fem N" n={row.femaleN} tone="gold" />}
            {row.bonusEligible ? (
              <Badge tone="gold" dot>
                Bonus {money(row.bonus)}
              </Badge>
            ) : isWeek ? (
              <Badge tone="neutral">Bonus N/A</Badge>
            ) : (
              <Badge tone="neutral">{gap} to bonus</Badge>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">
            Net payable
          </div>
          <div className="tnum mt-0.5 text-[19px] font-extrabold leading-none text-gold-300">
            {money(row.net)}
          </div>
          <div className="tnum mt-1.5 space-y-0.5 text-[10px] text-ink-400">
            <div>
              Gross <span className="text-jade-300">{money(row.gross)}</span>
            </div>
            <div>
              Ded <span className="text-danger-soft">−{money(row.totalDed)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-3 flex items-center gap-2">
        <button type="button" onClick={onOpen} className="btn-outline h-10 flex-1 text-[12px]">
          <FileText className="h-3.5 w-3.5" />
          View payslip
        </button>
        <div className="flex-1 rounded-xl border border-white/[0.06] bg-ink-900/60 px-3 py-2 text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink-500">
            Deductions
          </div>
          <div className="tnum text-[11.5px] font-semibold text-ink-200">
            Meal {money(row.ded.meal)} · Board {money(row.ded.boarding)} · Adv {money(row.ded.advance)}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function ShiftPill({
  label,
  n,
  tone,
}: {
  label: string;
  n: number;
  tone: "neutral" | "gold" | "sky" | "danger";
}) {
  const tones: Record<string, string> = {
    neutral: "border-white/[0.09] bg-white/[0.04] text-ink-300",
    gold: "border-gold-500/28 bg-gold-500/10 text-gold-200",
    sky: "border-sky2/28 bg-sky2/10 text-[#a5cbff]",
    danger: "border-danger/26 bg-danger/9 text-danger-soft",
  };
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
        n === 0 && "opacity-45",
        tones[tone],
      )}
    >
      {label} <b className="font-bold">{n}</b>
    </span>
  );
}

export default PayrollTab;
