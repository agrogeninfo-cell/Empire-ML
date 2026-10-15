import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Save,
  Trash2,
} from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/Field";
import { Badge, Row, SectionHead } from "@/components/ui/Metrics";
import { cn } from "@/lib/cn";
import { money, num } from "@/lib/calendar";
import { dayAmount, emptyRecord, formulaText, halfStep } from "@/lib/estate";
import type { EstateDayRecord, EstateState } from "@/lib/types";
import type { EstateDerived } from "./useEstate";

/* ═══════════════════════════════════════════════════════════════════════
 * EstateAttendance — one record per date; saving overwrites the previous.
 * Counts accept 0.5 steps so half shifts bill correctly.
 * ═════════════════════════════════════════════════════════════════════ */

interface Props {
  estate: EstateState;
  derived: EstateDerived;
  onSave: (rec: EstateDayRecord) => void;
  onDelete: (date: string) => void;
  onAnchor: (key: string) => void;
  notify: (msg: string, tone?: "success" | "error" | "info" | "warn") => void;
}

export function EstateAttendance({ estate, derived, onSave, onDelete, onAnchor, notify }: Props) {
  const [date, setDate] = useState(derived.todayKey);
  const [form, setForm] = useState<EstateDayRecord>(
    () => estate.records[derived.todayKey] ?? emptyRecord(derived.todayKey),
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exists = !!estate.records[date];

  useEffect(() => {
    setForm(estate.records[date] ?? emptyRecord(date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const outside = useMemo(
    () => date < keyOf(derived.period.start) || date > keyOf(derived.period.end),
    [date, derived.period],
  );

  const preview = dayAmount(form, estate.rates);

  const set = <K extends keyof EstateDayRecord>(k: K, v: EstateDayRecord[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const bump = (k: "maleCount" | "femaleCount" | "maleOt" | "femaleOt" | "lateHours", delta: number) =>
    setForm((f) => ({ ...f, [k]: halfStep(Math.max(0, Number(f[k] || 0) + delta)) }));

  const save = () => {
    const rec: EstateDayRecord = { ...form, date };
    if (!rec.inTime) rec.inTime = "07:00";
    if (!rec.outTime) rec.outTime = "19:00";
    const wasExisting = !!estate.records[date];
    onSave(rec);
    notify(
      wasExisting ? `Saved • ${date} overwrote the previous entry` : `Saved • ${date} added`,
      "success",
    );
    if (outside) onAnchor(date);
  };

  return (
    <div className="space-y-4">
      <SectionHead
        eyebrow="Daily entry"
        title="Attendance"
        sub="One record per date — saving overwrites the previous entry. Counts accept 0.5 steps so half shifts bill correctly."
      />

      {outside && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-gold-500/28 bg-gold-500/[0.08] px-3.5 py-3">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
          <p className="text-[11.5px] leading-relaxed text-gold-100/85">
            <b className="font-bold">{date}</b> sits outside the current 24–24 window (
            {derived.periodText}). Saving moves the window to include it.
          </p>
        </div>
      )}

      <div className="surface p-4">
        {/* date row */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDate(date, -1, setDate)}
            aria-label="Previous day"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-ink-900 text-ink-200 transition hover:border-jade-500/45 hover:text-jade-200 active:scale-92"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex-1">
            <TextField
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Record date"
              className="!text-center !text-[15px] !font-bold"
            />
          </div>

          <button
            type="button"
            onClick={() => shiftDate(date, 1, setDate)}
            aria-label="Next day"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-ink-900 text-ink-200 transition hover:border-jade-500/45 hover:text-jade-200 active:scale-92"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Badge tone={exists ? "gold" : "jade"} dot>
            {exists ? "Exists · will overwrite" : "New record"}
          </Badge>
          <Badge tone="neutral">{weekdayName(date)}</Badge>
          <button
            type="button"
            onClick={() => setDate(derived.todayKey)}
            className="btn-ghost h-7 px-2.5 text-[11px]"
          >
            Jump to today
          </button>
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="btn-ghost h-7 px-2.5 text-[11px]"
          >
            Pick from period
          </button>
        </div>

        <div className="rule-gold my-4" />

        {/* counts */}
        <div className="grid grid-cols-2 gap-3">
          <CountBlock
            label="Male count"
            value={Number(form.maleCount)}
            onStep={(v) => set("maleCount", halfStep(v))}
            onBump={(delta) => bump("maleCount", delta)}
            tone="jade"
            rate={estate.rates.maleDay}
          />
          <CountBlock
            label="Female count"
            value={Number(form.femaleCount)}
            onStep={(v) => set("femaleCount", halfStep(v))}
            onBump={(delta) => bump("femaleCount", delta)}
            tone="gold"
            rate={estate.rates.femaleDay}
          />
          <CountBlock
            label="Male OT hours"
            value={Number(form.maleOt)}
            onStep={(v) => set("maleOt", halfStep(v))}
            onBump={(delta) => bump("maleOt", delta)}
            tone="sky"
            rate={estate.rates.otRate}
          />
          <CountBlock
            label="Female OT hours"
            value={Number(form.femaleOt)}
            onStep={(v) => set("femaleOt", halfStep(v))}
            onBump={(delta) => bump("femaleOt", delta)}
            tone="sky"
            rate={estate.rates.otRate}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <CountBlock
            label="Late hours"
            value={Number(form.lateHours)}
            onStep={(v) => set("lateHours", halfStep(v))}
            onBump={(delta) => bump("lateHours", delta)}
            tone="danger"
            rate={-estate.rates.lateRate}
            compact
          />
          <TextField
            label="In time"
            type="time"
            value={form.inTime}
            onChange={(e) => set("inTime", e.target.value)}
            className="!py-2.5"
          />
          <TextField
            label="Out time"
            type="time"
            value={form.outTime}
            onChange={(e) => set("outTime", e.target.value)}
            className="!py-2.5"
          />
        </div>

        {/* live preview */}
        <motion.div
          key={preview}
          initial={{ scale: 0.985, opacity: 0.7 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.24 }}
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-jade-500/25 bg-jade-900/40 px-4 py-3.5"
        >
          <div className="min-w-0">
            <div className="eyebrow">Day amount</div>
            <div className="tnum mt-1 truncate font-mono text-[10.5px] text-jade-200/70">
              {formulaText(estate.rates)}
            </div>
          </div>
          <div className="tnum shrink-0 text-[24px] font-extrabold leading-none text-jade-100">
            Rs {money(preview)}
          </div>
        </motion.div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setForm(emptyRecord(date));
              notify("Form reset", "info");
            }}
            className="btn-outline h-12 flex-1"
          >
            Clear form
          </button>
          {exists && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="btn-outline h-12 border-danger/28 px-4 text-danger-soft hover:border-danger/55 hover:bg-danger/10 hover:text-danger-soft"
              aria-label="Delete this record"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={save} className="btn-jade h-12 flex-[2]">
            <Save className="h-4 w-4" />
            {exists ? "Overwrite" : "Save record"}
          </button>
        </div>
      </div>

      {/* ── period picker ──────────────────────────────────────────── */}
      <Sheet
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        eyebrow="24–24 window"
        title={derived.periodText}
        subtitle={`${derived.days} days · ${derived.totals.count} already logged`}
        size="md"
      >
        <div className="grid grid-cols-5 gap-1.5 pt-1 sm:grid-cols-7">
          {periodKeys(derived).map((k) => {
            const has = !!estate.records[k];
            const on = k === date;
            const day = Number(k.slice(8));
            const isSun = new Date(`${k}T00:00:00`).getDay() === 0;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setDate(k);
                  setCalendarOpen(false);
                }}
                className={cn(
                  "tnum relative grid aspect-square place-items-center rounded-xl border text-[12.5px] font-bold transition active:scale-92",
                  on
                    ? "border-jade-500 bg-jade-sheen text-white shadow-jade"
                    : has
                      ? "border-jade-500/35 bg-jade-600/14 text-jade-100"
                      : isSun
                        ? "border-danger/25 bg-danger/8 text-danger-soft/85"
                        : "border-white/[0.08] bg-ink-900/70 text-ink-300 hover:border-white/20",
                )}
                title={`${k}${has ? " • logged" : ""}`}
              >
                {day}
                {has && !on && (
                  <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-jade-300" />
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Badge tone="jade">Logged</Badge>
          <Badge tone="danger">Sunday</Badge>
          <Badge tone="neutral">Empty</Badge>
        </div>
      </Sheet>

      {/* ── delete confirm ─────────────────────────────────────────── */}
      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        eyebrow="Destructive"
        title="Delete this record?"
        size="sm"
        footer={
          <div className="flex gap-2 pb-1">
            <button
              type="button"
              className="btn-outline h-12 flex-1"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger h-12 flex-1"
              onClick={() => {
                onDelete(date);
                setConfirmDelete(false);
                setForm(emptyRecord(date));
                notify(`Deleted ${date}`, "warn");
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        }
      >
        <div className="space-y-1 pt-1">
          <Row label="Date" value={date} />
          <Row label="Male / female" value={`${num(form.maleCount)} / ${num(form.femaleCount)}`} />
          <Row label="Amount that disappears" value={`Rs ${money(preview)}`} tone="danger" />
          <p className="pt-2 text-[11.5px] leading-relaxed text-ink-400">
            You can undo this from the toast that appears.
          </p>
        </div>
      </Sheet>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Bits
 * ═════════════════════════════════════════════════════════════════════ */

function CountBlock({
  label,
  value,
  onStep,
  onBump,
  tone,
  rate,
  compact,
}: {
  label: string;
  value: number;
  onStep: (v: number) => void;
  onBump: (delta: number) => void;
  tone: "jade" | "gold" | "sky" | "danger";
  rate: number;
  compact?: boolean;
}) {
  const tones: Record<string, string> = {
    jade: "text-jade-300",
    gold: "text-gold-300",
    sky: "text-[#8ec1ff]",
    danger: "text-danger-soft",
  };
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-ink-900/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="field-label !mb-0">{label}</span>
        {!compact && (
          <span className={cn("tnum shrink-0 text-[10px] font-semibold", tones[tone])}>
            {rate < 0 ? "−" : ""}Rs {money(Math.abs(rate))}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onBump(-0.5)}
          aria-label={`Decrease ${label} by 0.5`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-ink-800 text-ink-200 transition hover:border-gold-500/40 hover:text-gold-200 active:scale-90"
        >
          −
        </button>
        <input
          type="number"
          step="0.5"
          min="0"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onStep(parseFloat(e.target.value) || 0)}
          className="tnum h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-950/70 px-2 text-center text-[16px] font-bold text-ink-50 outline-none transition focus:border-gold-500/55 focus:ring-4 focus:ring-gold-500/10"
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => onBump(0.5)}
          aria-label={`Increase ${label} by 0.5`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-ink-800 text-ink-200 transition hover:border-gold-500/40 hover:text-gold-200 active:scale-90"
        >
          +
        </button>
      </div>
    </div>
  );
}

function shiftDate(key: string, delta: number, apply: (k: string) => void) {
  if (!key) return;
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + delta);
  apply(keyOf(d));
}

export function keyOf(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")}`;
}

function weekdayName(key: string): string {
  if (!key) return "—";
  const d = new Date(`${key}T00:00:00`);
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
}

function periodKeys(d: EstateDerived): string[] {
  const out: string[] = [];
  const cur = new Date(d.period.start);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(d.period.end);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    out.push(keyOf(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
