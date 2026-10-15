import { useCallback, useMemo } from "react";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Coins,
  Landmark,
  ListOrdered,
  Moon,
  Sparkles,
  Sun,
  Timer,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "@/store/AppStore";
import { BottomNav } from "@/components/layout/Nav";
import { useToast } from "@/components/ui/Toast";
import { Badge, MetricCard, SectionHead } from "@/components/ui/Metrics";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { money, num } from "@/lib/calendar";
import { dayAmount, formulaText, latePenalty, otValue } from "@/lib/estate";
import { ESTATE_NOTES, DEFAULT_ESTATE_RATES } from "@/data/defaults";
import { useEstate } from "./useEstate";
import { EstateAttendance } from "./EstateAttendance";
import { EstateSummary } from "./EstateSummary";
import { EstateExport } from "./EstateExport";
import { EstateSettings } from "./EstateSettings";
import { useUiPref } from "@/hooks/useUiPrefs";

/* ═══════════════════════════════════════════════════════════════════════
 * EstateModule — Millennium Teas, 24–24 labour billing
 * Tabs: Dashboard · Attendance · Summary · Export · Settings
 * ═════════════════════════════════════════════════════════════════════ */

export type EstateTab = "dashboard" | "attendance" | "summary" | "export" | "settings";

export const ESTATE_TABS = [
  { id: "dashboard" as const, label: "Overview", icon: <Landmark /> },
  { id: "attendance" as const, label: "Entry", icon: <Users /> },
  { id: "summary" as const, label: "Summary", icon: <ListOrdered /> },
  { id: "export" as const, label: "Export", icon: <Sparkles /> },
  { id: "settings" as const, label: "Rates", icon: <Coins /> },
];

export function EstateModule() {
  const store = useStore();
  const toast = useToast();
  const estate = store.estate;
  const d = useEstate(estate);

  const [tab, setTab] = useUiPref<EstateTab>("estate.tab", "dashboard");

  const notify = useCallback(
    (message: string, tone: "success" | "error" | "info" | "warn" = "info") =>
      toast.push({ message, tone }),
    [toast],
  );

  const setAnchor = useCallback(
    (key: string) => store.updateEstate((e) => ({ ...e, periodAnchor: key })),
    [store],
  );

  const goToPeriod = useCallback(
    (target: Date) => {
      const k = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(
        target.getDate(),
      ).padStart(2, "0")}`;
      setAnchor(k);
    },
    [setAnchor],
  );

  const isLivePeriod = useMemo(() => {
    const t = d.todayKey;
    return t >= keyOf(d.period.start) && t <= keyOf(d.period.end);
  }, [d.todayKey, d.period]);

  const otTotal = useMemo(() => otValue(estate.records, d.period, estate.rates), [
    estate.records,
    d.period,
    estate.rates,
  ]);
  const lateTotal = useMemo(() => latePenalty(estate.records, d.period, estate.rates), [
    estate.records,
    d.period,
    estate.rates,
  ]);

  /* ── render ─────────────────────────────────────────────────────── */

  return (
    <>
      {/* ══ period bar ══════════════════════════════════════════════ */}
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-1 pt-3 md:px-6 lg:px-8">
        <div
          className={cn(
            "relative flex items-center gap-2 overflow-hidden rounded-[20px] border bg-ink-850/85 p-2 shadow-lift backdrop-blur-xl",
            "border-white/[0.08]",
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              backgroundImage:
                "radial-gradient(520px 110px at 100% -30%, rgba(34,179,74,0.18), transparent 66%)",
            }}
          />
          <button
            type="button"
            onClick={() => goToPeriod(d.previous.start)}
            aria-label="Previous 24–24 period"
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-ink-900 text-ink-200 transition hover:border-jade-500/45 hover:text-jade-200 active:scale-92"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="relative min-w-0 flex-1 px-1 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="display truncate text-[18px] leading-none text-ink-50">
                {d.periodText}
              </span>
              {isLivePeriod && (
                <Badge tone="jade" dot>
                  Live
                </Badge>
              )}
            </div>
            <div className="tnum mt-1.5 text-[11px] text-ink-400">
              {d.days} days · {d.totals.count} logged · {estate.companyName}
            </div>
          </div>

          <button
            type="button"
            onClick={() => goToPeriod(d.next.start)}
            aria-label="Next 24–24 period"
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-ink-900 text-ink-200 transition hover:border-jade-500/45 hover:text-jade-200 active:scale-92"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => goToPeriod(new Date())}
            className="btn-ghost h-8 px-3 text-[11px]"
          >
            <CalendarRange className="h-3.5 w-3.5" />
            This month
          </button>
          <span className="text-[10.5px] text-ink-500">
            24–24 window · previous {d.previousText}
          </span>
        </div>
      </div>

      {/* ══ tab body ════════════════════════════════════════════════ */}
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-4 pt-3 md:px-6 lg:px-8">
        {tab === "dashboard" && (
          <div className="space-y-4">
            <SectionHead
              eyebrow={`${estate.companyName} · ${estate.estateLabel}`}
              title="Estate Labour Overview"
              sub="24–24 logic: if the day is ≥ 24 the window runs 24th this month → 23rd next, otherwise 24th previous → 23rd this month. One record per date — saving overwrites."
              right={
                <div className="hidden text-right sm:block">
                  <div className="eyebrow">Days in period</div>
                  <div className="display mt-1 text-[30px] leading-none text-ink-50">{d.days}</div>
                  <div className="mt-1 text-[11px] text-ink-400">{d.totals.count} days logged</div>
                </div>
              }
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                label="Male shifts"
                icon={<Sun className="h-3.5 w-3.5" />}
                value={num(d.totals.m)}
                fill={d.fills.male}
                delta={d.deltaMale}
                deltaDir={d.dirMale}
                tone="jade"
                sub={`× Rs ${money(estate.rates.maleDay)} per shift`}
                delay={0}
              />
              <MetricCard
                label="Female shifts"
                icon={<Moon className="h-3.5 w-3.5" />}
                value={num(d.totals.f)}
                fill={d.fills.female}
                delta={d.deltaFemale}
                deltaDir={d.dirFemale}
                tone="gold"
                sub={`× Rs ${money(estate.rates.femaleDay)} per shift`}
                delay={70}
              />
              <MetricCard
                label="OT hours"
                icon={<Timer className="h-3.5 w-3.5" />}
                value={`${num(d.totals.mOt + d.totals.fOt)}h`}
                fill={d.fills.ot}
                delta={d.deltaOt}
                deltaDir={d.dirOt}
                tone="sky"
                sub={`Rs ${money(otTotal)} billed · late −Rs ${money(lateTotal)}`}
                delay={140}
              />
              <MetricCard
                label="Grand total"
                icon={<Coins className="h-3.5 w-3.5" />}
                value={`Rs ${money(d.totals.grand)}`}
                fill={d.fills.grand}
                delta={d.periodDelta}
                deltaDir={d.periodDeltaDir}
                tone="gold"
                sub={`vs previous window Rs ${money(d.previousTotals.grand)}`}
                delay={210}
              />
            </div>

            {/* formula */}
            <Reveal className="surface-flat p-4">
              <div className="eyebrow mb-2">Calculation in force</div>
              <div className="tnum rounded-xl border border-jade-500/22 bg-jade-600/8 px-3.5 py-3 font-mono text-[12.5px] font-semibold text-jade-100">
                {formulaText(estate.rates)}
              </div>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {ESTATE_NOTES.map((n) => (
                  <li key={n} className="flex gap-2 text-[11px] leading-relaxed text-ink-400">
                    <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-jade-500/70" />
                    {n}
                  </li>
                ))}
              </ul>
            </Reveal>

            {/* recent */}
            <Reveal className="surface overflow-hidden" delay={80}>
              <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
                <div>
                  <div className="eyebrow-gold">Recent entries</div>
                  <h3 className="mt-1 text-[15px] font-bold text-ink-50">{d.periodText}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("summary")}
                  className="btn-outline h-9 px-3 text-[11.5px]"
                >
                  Full summary
                </button>
              </header>

              <div className="max-h-[360px] divide-y divide-white/[0.05] overflow-y-auto scrollbar-thin">
                {d.rows.length === 0 && (
                  <p className="px-4 py-10 text-center text-[13px] text-ink-400">
                    No records in this period yet — open the Entry tab to log your first day.
                  </p>
                )}
                {d.rows
                  .slice(-12)
                  .reverse()
                  .map((r, i) => (
                    <motion.div
                      key={r.date}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.28, delay: i * 0.025 }}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.025]"
                    >
                      <div className="tnum grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-jade-sheen text-[12px] font-extrabold text-white shadow-jade">
                        {r.date.slice(8)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-semibold text-ink-50">
                          {r.date}
                          <span className="ml-1.5 font-normal text-ink-400">
                            · {r.inTime}–{r.outTime}
                          </span>
                        </div>
                        <div className="tnum mt-0.5 truncate text-[11px] text-ink-400">
                          M {num(r.maleCount)} · F {num(r.femaleCount)} · OT{" "}
                          {num(r.maleOt + r.femaleOt)} · Late {num(r.lateHours)}h
                        </div>
                      </div>
                      <div className="tnum shrink-0 text-[13.5px] font-bold text-gold-300">
                        Rs {money(dayAmount(r, estate.rates))}
                      </div>
                    </motion.div>
                  ))}
              </div>
            </Reveal>
          </div>
        )}

        {tab === "attendance" && (
          <EstateAttendance
            estate={estate}
            derived={d}
            onAnchor={setAnchor}
            notify={notify}
            onSave={(rec) =>
              store.updateEstate((e) => ({
                ...e,
                records: { ...e.records, [rec.date]: rec },
              }))
            }
            onDelete={(date) => {
              const snapshot = estate.records;
              store.updateEstate((e) => {
                const next = { ...e.records };
                delete next[date];
                return { ...e, records: next };
              });
              toast.push({
                message: `Deleted ${date}`,
                tone: "warn",
                actionLabel: "Undo",
                onAction: () => store.updateEstate((e) => ({ ...e, records: snapshot })),
              });
            }}
          />
        )}
        {tab === "summary" && <EstateSummary estate={estate} derived={d} onTab={setTab} />}
        {tab === "export" && <EstateExport estate={estate} derived={d} notify={notify} />}
        {tab === "settings" && (
          <EstateSettings
            estate={estate}
            derived={d}
            notify={notify}
            onRate={(k, v) =>
              store.updateEstate((e) => ({ ...e, rates: { ...e.rates, [k]: v } }))
            }
            onCompany={(v) => store.updateEstate((e) => ({ ...e, companyName: v }))}
            onLabel={(v) => store.updateEstate((e) => ({ ...e, estateLabel: v }))}
            onReset={() =>
              store.updateEstate((e) => ({ ...e, rates: { ...DEFAULT_ESTATE_RATES } }))
            }
            onLoadDemo={() => {
              store.loadDemo();
              notify("Demo estate data loaded", "success");
            }}
          />
        )}
      </div>

      <BottomNav
        items={ESTATE_TABS.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))}
        active={tab}
        onChange={(id) => {
          setTab(id as EstateTab);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        tone="jade"
      />
    </>
  );
}

function keyOf(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")}`;
}

export default EstateModule;
