import { Coins, Info, RotateCcw, Sparkles, Timer, Wallet } from "lucide-react";
import { NumberField, TextField } from "@/components/ui/Field";
import { Badge, Row, SectionHead } from "@/components/ui/Metrics";
import { Reveal } from "@/components/ui/Reveal";
import { money, num } from "@/lib/calendar";
import { ESTATE_NOTES, DEFAULT_ESTATE_RATES } from "@/data/defaults";
import { formulaText } from "@/lib/estate";
import type { EstateRates, EstateState } from "@/lib/types";
import type { EstateDerived } from "./useEstate";

/* ═══════════════════════════════════════════════════════════════════════
 * EstateSettings — editable rates, formula reference, identity
 * ═════════════════════════════════════════════════════════════════════ */

interface Props {
  estate: EstateState;
  derived: EstateDerived;
  notify: (msg: string, tone?: "success" | "error" | "info" | "warn") => void;
  onLoadDemo: () => void;
  onRate: (k: keyof EstateRates, v: number) => void;
  onCompany: (v: string) => void;
  onLabel: (v: string) => void;
  onReset: () => void;
}

const RATE_FIELDS: {
  key: keyof EstateRates;
  label: string;
  hint: string;
  used: boolean;
}[] = [
  { key: "maleDay", label: "Male day", hint: "Per male shift", used: true },
  { key: "femaleDay", label: "Female day", hint: "Per female shift", used: true },
  { key: "maleNight", label: "Male night", hint: "Reference rate", used: false },
  { key: "femaleNight", label: "Female night", hint: "Reference rate", used: false },
  { key: "otRate", label: "OT rate", hint: "Per OT hour", used: true },
  { key: "lateRate", label: "Late deduction", hint: "Deducted per late hour", used: true },
];

export function EstateSettings({
  estate,
  derived,
  notify,
  onLoadDemo,
  onRate,
  onCompany,
  onLabel,
  onReset,
}: Props) {
  const t = derived.totals;

  return (
    <div className="space-y-4">
      <SectionHead
        eyebrow="Configuration"
        title="Settings · Rates"
        sub="Editable rates feed every calculation, table and CSV instantly. Saved to the same local vault as the Payroll module."
      />

      {/* identity */}
      <Reveal as="section" className="surface p-4">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-jade-500/25 bg-jade-600/10 text-jade-300">
            <Sparkles className="h-4 w-4" />
          </span>
          <h3 className="text-[14px] font-bold text-ink-50">Statement identity</h3>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextField
            label="Company name"
            value={estate.companyName}
            onChange={(e) => onCompany(e.target.value)}
            placeholder="Millennium Teas"
          />
          <TextField
            label="Letterhead line"
            value={estate.estateLabel}
            onChange={(e) => onLabel(e.target.value)}
            placeholder="Labour Invoice • Estate 24–24"
          />
        </div>
      </Reveal>

      {/* rates */}
      <Reveal as="section" className="surface p-4" delay={60}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-gold-500/25 bg-gold-500/10 text-gold-300">
              <Coins className="h-4 w-4" />
            </span>
            <h3 className="text-[14px] font-bold text-ink-50">Rate card</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              onReset();
              notify("Rates restored to defaults", "success");
            }}
            className="btn-outline h-9 px-3 text-[11.5px]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset defaults
          </button>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {RATE_FIELDS.map((f) => (
            <div key={f.key} className={f.used ? undefined : "opacity-70"}>
              <NumberField
                label={f.label}
                hint={f.hint}
                prefix="Rs."
                min={0}
                step={25}
                value={estate.rates[f.key]}
                onChange={(e) => onRate(f.key, Number(e.target.value) || 0)}
              />
              {!f.used && (
                <p className="mt-1 flex items-center gap-1 text-[9.5px] leading-snug text-ink-500">
                  <Info className="h-2.5 w-2.5 shrink-0" />
                  Stored, not used by the day formula
                </p>
              )}
            </div>
          ))}
        </div>
      </Reveal>

      {/* formula */}
      <Reveal as="section" className="surface overflow-hidden" delay={120}>
        <header className="flex items-center gap-2 px-4 pb-3 pt-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-jade-500/25 bg-jade-600/10 text-jade-300">
            <Timer className="h-4 w-4" />
          </span>
          <h3 className="text-[14px] font-bold text-ink-50">Formula</h3>
        </header>
        <div className="border-t border-white/[0.06] px-4 py-4">
          <div className="tnum rounded-xl border border-jade-500/22 bg-jade-600/8 px-3.5 py-3 font-mono text-[12.5px] font-semibold leading-relaxed text-jade-100">
            {formulaText(estate.rates)}
          </div>

          <div className="mt-3 divide-y divide-white/[0.05] rounded-xl border border-white/[0.06] bg-ink-900/50">
            <Row
              label="Male shifts × rate"
              value={`${num(t.m)} × ${money(estate.rates.maleDay)} = ${money(t.m * estate.rates.maleDay)}`}
            />
            <Row
              label="Female shifts × rate"
              value={`${num(t.f)} × ${money(estate.rates.femaleDay)} = ${money(t.f * estate.rates.femaleDay)}`}
            />
            <Row
              label="OT hours × rate"
              value={`${num(t.mOt + t.fOt)} × ${money(estate.rates.otRate)} = ${money((t.mOt + t.fOt) * estate.rates.otRate)}`}
              tone="jade"
            />
            <Row
              label="Late hours × deduction"
              value={`${num(t.late)} × ${money(estate.rates.lateRate)} = −${money(t.late * estate.rates.lateRate)}`}
              tone="danger"
            />
            <Row label="Grand total" value={`Rs ${money(t.grand)}`} tone="gold" strong />
          </div>

          <ul className="mt-3.5 space-y-1.5">
            {ESTATE_NOTES.map((n) => (
              <li key={n} className="flex gap-2 text-[11px] leading-relaxed text-ink-400">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-jade-500/70" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      {/* window reference */}
      <Reveal as="section" className="surface overflow-hidden" delay={180}>
        <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-ink-200">
              <Wallet className="h-4 w-4" />
            </span>
            <h3 className="text-[14px] font-bold text-ink-50">24–24 window</h3>
          </div>
          <Badge tone="jade">{derived.days} days</Badge>
        </header>
        <div className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
          <Row label="Current" value={derived.periodText} />
          <Row label="Previous" value={derived.previousText} />
          <Row label="Logged records (all time)" value={String(derived.recordCount)} />
          <Row label="Logged in window" value={String(t.count)} />
        </div>
      </Reveal>

      <Reveal className="surface-flat p-4" delay={240}>
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-bold text-ink-50">Just exploring?</h4>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">
              Load the demo workspace — six staff with a full month of attendance for Payroll, plus
              a populated 24 Aug → 23 Sep estate window for this module.
            </p>
            <button type="button" className="btn-gold mt-3 h-10 px-4 text-[12px]" onClick={onLoadDemo}>
              <Sparkles className="h-3.5 w-3.5" />
              Load demo data
            </button>
          </div>
        </div>
      </Reveal>

      <p className="px-1 text-[10.5px] leading-relaxed text-ink-500">
        Defaults restored:{" "}
        <span className="font-mono text-ink-400">
          {Object.entries(DEFAULT_ESTATE_RATES)
            .map(([k, v]) => `${k}=${v}`)
            .join(" · ")}
        </span>
      </p>
    </div>
  );
}

export default EstateSettings;
