import { useState } from "react";
import { motion } from "framer-motion";
import {
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Sparkles,
} from "lucide-react";
import { Badge, SectionHead } from "@/components/ui/Metrics";
import { cn } from "@/lib/cn";
import { MONTHS, fileNameSafe, money, num } from "@/lib/calendar";
import {
  ESTATE_CSV_HEADERS,
  dayAmount,
  estateCsv,
  femaleAmount,
  maleAmount,
  type EstateCsvKind,
} from "@/lib/estate";
import { copyToClipboard, downloadCsv, downloadText } from "@/lib/exporters";
import type { EstateState } from "@/lib/types";
import type { EstateDerived } from "./useEstate";

/* ═══════════════════════════════════════════════════════════════════════
 * EstateExport — CSV (male / female / combined) in the `2026,06,25`
 * comma format, plus a printable period statement.
 * ═════════════════════════════════════════════════════════════════════ */

interface Props {
  estate: EstateState;
  derived: EstateDerived;
  notify: (msg: string, tone?: "success" | "error" | "info" | "warn") => void;
}

const KINDS: { id: EstateCsvKind; glyph: string; blurb: string }[] = [
  { id: "male", glyph: "M", blurb: "One row per date with male shifts, male OT and the male amount" },
  {
    id: "female",
    glyph: "F",
    blurb: "One row per date with female shifts, female OT and the female amount",
  },
  {
    id: "combined",
    glyph: "C",
    blurb: "Every column including in/out times, late hours and the grand total",
  },
];

export function EstateExport({ estate, derived, notify }: Props) {
  const [previewKind, setPreviewKind] = useState<EstateCsvKind>("combined");
  const [copied, setCopied] = useState(false);

  const stem = `millennium-${fileNameSafe(derived.periodText.replace(/\s/g, "-"))}`;

  const csvFor = (kind: EstateCsvKind) => estateCsv(derived.rows, estate.rates, kind);
  const preview = csvFor(previewKind);
  const previewLines = preview.split("\n").slice(0, 9);

  const exportKind = (kind: EstateCsvKind) => {
    if (derived.rows.length === 0) {
      notify("Nothing to export in this period", "warn");
      return;
    }
    downloadCsv(derived.rows.length ? sheetFor(kind) : [], `${stem}-${kind}`);
    notify(`Exported ${kind} CSV • ${derived.rows.length} rows`, "success");
  };

  const sheetFor = (kind: EstateCsvKind): (string | number)[][] => {
    const head = ESTATE_CSV_HEADERS[kind].split(",");
    const body = derived.rows.map((r) => {
      const [y, m, d] = r.date.split("-");
      if (kind === "male")
        return [y, m, d, r.maleCount, r.maleOt, maleAmount(r, estate.rates)];
      if (kind === "female")
        return [y, m, d, r.femaleCount, r.femaleOt, femaleAmount(r, estate.rates)];
      return [
        y,
        m,
        d,
        r.maleCount,
        r.femaleCount,
        r.maleOt,
        r.femaleOt,
        r.lateHours,
        r.inTime,
        r.outTime,
        dayAmount(r, estate.rates),
      ];
    });
    return [head, ...body, [], ["TOTAL", "", "", num(derived.totals.m), num(derived.totals.f), num(derived.totals.mOt + derived.totals.fOt), num(derived.totals.late), "", "", money(derived.totals.grand)]];
  };

  const copyPreview = async () => {
    const ok = await copyToClipboard(preview);
    setCopied(ok);
    notify(ok ? "CSV copied to clipboard" : "Clipboard blocked by the browser", ok ? "success" : "error");
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-4">
      <SectionHead
        eyebrow="Current period"
        title="Export CSV"
        sub={`${derived.periodText} • ${derived.rows.length} records • comma format like 2026,06,25`}
      />

      {/* kind cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {KINDS.map((k, i) => {
          const on = previewKind === k.id;
          return (
            <motion.button
              key={k.id}
              type="button"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.34, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setPreviewKind(k.id)}
              className={cn(
                "group relative overflow-hidden rounded-2xl border p-4 text-left transition active:scale-[0.98]",
                on
                  ? "border-jade-500/50 bg-jade-900/40 shadow-jade"
                  : "border-white/[0.075] bg-ink-850/85 hover:border-white/16",
              )}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{
                  backgroundImage:
                    "radial-gradient(320px 100px at 100% -20%, rgba(34,179,74,0.22), transparent 66%)",
                }}
              />
              <div className="relative flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-xl border text-[13px] font-extrabold",
                    on
                      ? "border-jade-400/60 bg-jade-sheen text-white"
                      : "border-white/[0.09] bg-white/[0.05] text-ink-200",
                  )}
                >
                  {k.glyph}
                </span>
                <Badge tone={on ? "jade" : "neutral"}>{k.id}</Badge>
              </div>
              <div className="relative mt-3 text-[14px] font-bold capitalize text-ink-50">
                {k.id} export
              </div>
              <p className="relative mt-1 text-[11px] leading-relaxed text-ink-400">{k.blurb}</p>
              <div className="relative mt-3 font-mono text-[9.5px] leading-relaxed text-ink-500">
                {ESTATE_CSV_HEADERS[k.id]}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* actions */}
      <div className="surface-flat p-3.5">
        <div className="eyebrow mb-2.5">Download</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            className="btn-jade h-11 text-[12px]"
            onClick={() => exportKind(previewKind)}
          >
            <Download className="h-4 w-4" />
            {previewKind} CSV
          </button>
          <button
            type="button"
            className="btn-outline h-11 text-[12px]"
            onClick={() => {
              downloadText(preview, `${stem}-${previewKind}.csv`, "text/csv;charset=utf-8");
              notify("Raw CSV written", "success");
            }}
          >
            <FileText className="h-4 w-4" />
            Raw text
          </button>
          <button
            type="button"
            className="btn-outline h-11 text-[12px]"
            onClick={copyPreview}
          >
            {copied ? <Sparkles className="h-4 w-4 text-jade-300" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className="btn-outline h-11 text-[12px]"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
          <FileSpreadsheet className="h-3.5 w-3.5 text-jade-300" />
          <span>
            Comma format example:{" "}
            <b className="font-mono text-ink-200">
              2025,08,24,{num(4.5)},{num(1)},{money(13800)}
            </b>
          </span>
        </div>
      </div>

      {/* preview */}
      <div className="surface overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
          <div>
            <div className="eyebrow-gold">Preview</div>
            <h3 className="mt-1 text-[15px] font-bold capitalize text-ink-50">
              {previewKind} · first {Math.max(0, previewLines.length - 1)} rows
            </h3>
          </div>
          <button
            type="button"
            className="btn-outline h-9 px-3 text-[11.5px]"
            onClick={() => exportKind(previewKind)}
          >
            <Download className="h-3.5 w-3.5" />
            Download all
          </button>
        </header>
        <div className="scrollbar-thin overflow-x-auto border-t border-white/[0.06] bg-ink-950/60 p-4">
          {derived.rows.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-ink-500">
              No records in {derived.periodText} — the file would contain a header row only.
            </p>
          ) : (
            <pre className="font-mono text-[11px] leading-relaxed text-jade-100/85">
              {previewLines.map((l, i) => (
                <span
                  key={i}
                  className={cn(
                    "block whitespace-pre",
                    i === 0 && "font-bold text-gold-300",
                    i > 7 && "opacity-45",
                  )}
                >
                  {l}
                </span>
              ))}
              {derived.rows.length > 8 && (
                <span className="block whitespace-pre pt-1 text-ink-500">
                  … {derived.rows.length - 8} more rows
                </span>
              )}
            </pre>
          )}
        </div>
      </div>

      {/* printable statement */}
      <div className="print-area paper mx-auto w-full max-w-[640px] overflow-hidden rounded-[20px] border border-black/10 shadow-[0_24px_70px_-28px_rgba(0,0,0,0.85)]">
        <div className="border-b-2 border-[#0f3d2e] px-6 pb-4 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#0f3d2e] font-serif text-[17px] font-bold text-[#d4af37]">
                  M
                </div>
                <div>
                  <div className="text-[16px] font-extrabold leading-none tracking-tight text-[#0f3d2e]">
                    {estate.companyName}
                  </div>
                  <div className="mt-1 text-[8.5px] font-bold uppercase tracking-[0.2em] text-[#7a9a7a]">
                    {estate.estateLabel}
                  </div>
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="inline-block rounded-md bg-[#0f3d2e] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
                Period Statement
              </div>
              <div className="tnum mt-1.5 text-[10px] text-[#6a8a6a]">{derived.periodText}</div>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="grid grid-cols-4 gap-2">
            {[
              ["Male shifts", num(derived.totals.m)],
              ["Female shifts", num(derived.totals.f)],
              ["OT hours", num(derived.totals.mOt + derived.totals.fOt)],
              ["Late hours", num(derived.totals.late)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg border border-[#dcecdc] bg-[#f4faf4] px-2.5 py-2">
                <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#8aa58a]">
                  {l}
                </div>
                <div className="tnum mt-0.5 text-[13px] font-extrabold text-[#0f3d2e]">{v}</div>
              </div>
            ))}
          </div>

          <table className="mt-4 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#0f3d2e] text-white">
                <th className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider">Date</th>
                <th className="px-2 py-2 text-right text-[9px] font-bold uppercase tracking-wider">Male</th>
                <th className="px-2 py-2 text-right text-[9px] font-bold uppercase tracking-wider">Female</th>
                <th className="px-2 py-2 text-right text-[9px] font-bold uppercase tracking-wider">OT</th>
                <th className="px-2 py-2 text-right text-[9px] font-bold uppercase tracking-wider">Late</th>
                <th className="px-3 py-2 text-right text-[9px] font-bold uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee]">
              {derived.rows.map((r) => (
                <tr key={r.date}>
                  <td className="tnum px-3 py-1.5 text-[#333]">{r.date}</td>
                  <td className="tnum px-2 py-1.5 text-right text-[#333]">{num(r.maleCount)}</td>
                  <td className="tnum px-2 py-1.5 text-right text-[#333]">{num(r.femaleCount)}</td>
                  <td className="tnum px-2 py-1.5 text-right text-[#333]">
                    {num(r.maleOt + r.femaleOt)}
                  </td>
                  <td className="tnum px-2 py-1.5 text-right text-[#a5342c]">
                    {r.lateHours ? num(r.lateHours) : "—"}
                  </td>
                  <td className="tnum px-3 py-1.5 text-right font-bold text-[#111]">
                    {money(dayAmount(r, estate.rates))}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#0f3d2e] text-white">
                <td className="px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.12em]">
                  Total · {derived.totals.count} days
                </td>
                <td className="tnum px-2 py-2.5 text-right font-bold">{num(derived.totals.m)}</td>
                <td className="tnum px-2 py-2.5 text-right font-bold">{num(derived.totals.f)}</td>
                <td className="tnum px-2 py-2.5 text-right font-bold">
                  {num(derived.totals.mOt + derived.totals.fOt)}
                </td>
                <td className="tnum px-2 py-2.5 text-right font-bold">{num(derived.totals.late)}</td>
                <td className="tnum px-3 py-2.5 text-right text-[14px] font-extrabold">
                  {money(derived.totals.grand)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-6 flex items-end justify-between gap-6">
            <p className="max-w-[38ch] text-[9px] leading-relaxed text-[#888]">
              Rates in force — male Rs {money(estate.rates.maleDay)}, female Rs{" "}
              {money(estate.rates.femaleDay)}, OT Rs {money(estate.rates.otRate)}/hr, late −Rs{" "}
              {money(estate.rates.lateRate)}/hr. Window: {derived.periodText}.
            </p>
            <div className="shrink-0 text-right">
              <div className="h-[40px] w-[170px] border-b border-black" />
              <div className="mt-1.5 text-[10px] font-semibold text-[#444]">Authorized Signature</div>
            </div>
          </div>
        </div>
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-ink-500">
        Printed output shows the statement above only — the app chrome is hidden by the print
        stylesheet. Filenames use the{" "}
        <b className="font-mono text-ink-300">
          {MONTHS[derived.period.start.getMonth()]}–{MONTHS[derived.period.end.getMonth()]}
        </b>{" "}
        window label.
      </p>
    </div>
  );
}

export default EstateExport;
