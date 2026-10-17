import { useMemo, useState } from "react";
import { Table2 } from "lucide-react";
import { Segmented } from "@/components/ui/Segmented";
import { Badge, EmptyState, MetricCard, Row, SectionHead } from "@/components/ui/Metrics";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { money, num } from "@/lib/calendar";
import { averagePerLoggedDay, dayAmount } from "@/lib/estate";
import type { EstateState } from "@/lib/types";
import type { EstateDerived } from "./useEstate";
import type { EstateTab } from "./EstateModule";

/* ═══════════════════════════════════════════════════════════════════════
 * EstateSummary — male / female / combined table with a totals footer
 * ═════════════════════════════════════════════════════════════════════ */

type Lens = "male" | "female" | "combined";

interface Props {
  estate: EstateState;
  derived: EstateDerived;
  onTab: (t: EstateTab) => void;
}

export function EstateSummary({ estate, derived, onTab }: Props) {
  const [lens, setLens] = useState<Lens>("combined");
  const t = derived.totals;

  const avg = useMemo(() => averagePerLoggedDay(t), [t]);
  const showMale = lens === "male" || lens === "combined";
  const showFemale = lens === "female" || lens === "combined";

  return (
    <div className="space-y-4">
      <SectionHead
        eyebrow={derived.periodText}
        title="Summary"
        sub={`${t.count} logged days of ${derived.days} in the window`}
        right={
          <div className="hidden text-right sm:block">
            <div className="eyebrow">Average / logged day</div>
            <div className="tnum mt-1 text-[20px] font-extrabold leading-none text-gold-300">
              Rs {money(avg)}
            </div>
          </div>
        }
      />

      <Segmented<Lens>
        ariaLabel="Summary lens"
        value={lens}
        onChange={setLens}
        tone="jade"
        options={[
          { value: "male", label: "Male" },
          { value: "female", label: "Female" },
          { value: "combined", label: "Combined" },
        ]}
      />

      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          label="Male total"
          value={`${num(t.m)}`}
          tone="jade"
          sub={`× Rs ${money(estate.rates.maleDay)}`}
          delay={0}
        />
        <MetricCard
          label="Female total"
          value={`${num(t.f)}`}
          tone="gold"
          sub={`× Rs ${money(estate.rates.femaleDay)}`}
          delay={70}
        />
        <MetricCard
          label="Grand total"
          value={`Rs ${money(t.grand)}`}
          tone="gold"
          sub={`${num(t.mOt + t.fOt)}h OT · −${num(t.late)}h late`}
          delay={140}
        />
      </div>

      {/* table */}
      <Reveal className="surface overflow-hidden">
        <div className="grid-scroll scrollbar-thin max-h-[58dvh]">
          <table className="w-full min-w-[540px] border-collapse text-[12px]">
            <thead>
              <tr className="bg-jade-sheen text-white">
                <th className="sticky top-0 z-10 px-3 py-3 text-left text-[9.5px] font-bold uppercase tracking-[0.12em]">
                  Date
                </th>
                {showMale && (
                  <th className="sticky top-0 z-10 bg-jade-sheen px-2 py-3 text-right text-[9.5px] font-bold uppercase tracking-[0.12em]">
                    Male
                  </th>
                )}
                {showFemale && (
                  <th className="sticky top-0 z-10 bg-jade-sheen px-2 py-3 text-right text-[9.5px] font-bold uppercase tracking-[0.12em]">
                    Female
                  </th>
                )}
                <th className="sticky top-0 z-10 bg-jade-sheen px-2 py-3 text-right text-[9.5px] font-bold uppercase tracking-[0.12em]">
                  OT
                </th>
                <th className="sticky top-0 z-10 bg-jade-sheen px-2 py-3 text-right text-[9.5px] font-bold uppercase tracking-[0.12em]">
                  Late
                </th>
                <th className="sticky top-0 z-10 bg-jade-sheen px-3 py-3 text-right text-[9.5px] font-bold uppercase tracking-[0.12em]">
                  Grand
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {derived.rows.map((r, i) => (
                <tr
                  key={r.date}
                  className={cn(
                    "transition hover:bg-white/[0.03]",
                    i % 2 === 1 && "bg-white/[0.014]",
                  )}
                >
                  <td className="px-3 py-2.5 font-semibold text-ink-100">
                    <span className="tnum">{r.date.slice(5).replace("-", "/")}</span>
                    <span className="ml-1.5 text-[10.5px] font-normal text-ink-500">
                      {r.inTime}
                    </span>
                  </td>
                  {showMale && (
                    <td className="tnum px-2 py-2.5 text-right text-ink-200">
                      {num(r.maleCount)}
                      {lens === "combined" && (
                        <span className="text-ink-500">+{num(r.maleOt)}</span>
                      )}
                    </td>
                  )}
                  {showFemale && (
                    <td className="tnum px-2 py-2.5 text-right text-ink-200">
                      {num(r.femaleCount)}
                      {lens === "combined" && (
                        <span className="text-ink-500">+{num(r.femaleOt)}</span>
                      )}
                    </td>
                  )}
                  <td className="tnum px-2 py-2.5 text-right text-ink-200">
                    {num(r.maleOt + r.femaleOt)}
                  </td>
                  <td className={cn("tnum px-2 py-2.5 text-right", r.lateHours ? "text-danger-soft" : "text-ink-500")}>
                    {r.lateHours ? num(r.lateHours) : "—"}
                  </td>
                  <td className="tnum px-3 py-2.5 text-right font-bold text-gold-300">
                    {money(dayAmount(r, estate.rates))}
                  </td>
                </tr>
              ))}
              {derived.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-[12.5px] text-ink-400">
                    No data for this period
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-white/[0.06] text-ink-50">
                <td className="px-3 py-3 text-[11px] font-extrabold uppercase tracking-[0.1em]">
                  Total · {t.count}d
                </td>
                {showMale && <td className="tnum px-2 py-3 text-right font-bold">{num(t.m)}</td>}
                {showFemale && <td className="tnum px-2 py-3 text-right font-bold">{num(t.f)}</td>}
                <td className="tnum px-2 py-3 text-right font-bold">{num(t.mOt + t.fOt)}</td>
                <td className="tnum px-2 py-3 text-right font-bold text-danger-soft">
                  {num(t.late)}
                </td>
                <td className="tnum px-3 py-3 text-right text-[13.5px] font-extrabold text-gold-300">
                  {money(t.grand)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Reveal>

      {/* comparison against previous window */}
      <Reveal className="surface overflow-hidden" delay={80}>
        <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
          <div className="flex items-center gap-2">
            <Table2 className="h-4 w-4 text-jade-300" />
            <h3 className="text-[14px] font-bold text-ink-50">Window comparison</h3>
          </div>
          <Badge tone="neutral">{derived.previousText}</Badge>
        </header>
        <div className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
          <Row
            label="Male shifts"
            value={`${num(derived.previousTotals.m)} → ${num(t.m)}`}
          />
          <Row
            label="Female shifts"
            value={`${num(derived.previousTotals.f)} → ${num(t.f)}`}
          />
          <Row label="OT hours" value={`${num(derived.previousTotals.mOt + derived.previousTotals.fOt)} → ${num(t.mOt + t.fOt)}`} />
          <Row label="Late hours" value={`${num(derived.previousTotals.late)} → ${num(t.late)}`} tone="danger" />
          <Row
            label="Grand total"
            value={`Rs ${money(derived.previousTotals.grand)} → Rs ${money(t.grand)}`}
            tone="jade"
            strong
          />
        </div>
      </Reveal>

      {derived.rows.length === 0 && (
        <EmptyState
          icon={<Table2 className="h-6 w-6" />}
          title="Nothing logged in this window"
          body="Head to the Entry tab to record a day, or load the demo dataset from Rates to explore a fully populated period."
          action={
            <button type="button" className="btn-jade h-11 px-5 text-[12px]" onClick={() => onTab("attendance")}>
              Open entry form
            </button>
          }
        />
      )}
    </div>
  );
}

export default EstateSummary;
