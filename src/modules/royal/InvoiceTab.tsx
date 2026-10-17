import { useRef, useState } from "react";
import { Camera, FileDown, FileSpreadsheet, Printer, Sparkles, Trophy } from "lucide-react";
import { Segmented } from "@/components/ui/Segmented";
import { NumberField, TextField } from "@/components/ui/Field";
import { Row } from "@/components/ui/Metrics";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { MONTHS, money, rupeesDot } from "@/lib/calendar";
import { invoiceLinesFor } from "@/lib/payroll";
import {
  downloadCsv,
  downloadPdf,
  downloadPng,
  downloadXlsx,
  fileNameSafe,
} from "@/lib/exporters";
import type {
  InvoiceRates,
  InvoiceTotals,
  OtHours,
  PayslipRow,
  Period,
} from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════
 * InvoiceTab — Labour Invoice & Bonus Sheet on white paper, with
 * PDF / PNG / XLSX export.
 * ═════════════════════════════════════════════════════════════════════ */

export type InvoiceDoc = "invoice" | "bonus";

interface Props {
  doc: InvoiceDoc;
  onDoc: (d: InvoiceDoc) => void;

  totals: InvoiceTotals;
  lines: ReturnType<typeof invoiceLinesFor>;
  invoiceRates: InvoiceRates;
  otHours: OtHours;
  bonusDays: number;
  bonusAmount: number;
  monthRows: PayslipRow[];
  period: Period;
  totalDays: number;

  toCompany: string;
  invoiceNo: string;
  invoiceDate: string;
  onToCompany: (v: string) => void;
  onInvoiceNo: (v: string) => void;
  onInvoiceDate: (v: string) => void;
  onRate: (key: keyof InvoiceRates, value: number) => void;

  notify: (msg: string, tone?: "success" | "error" | "info" | "warn") => void;
}

const RATE_FIELDS: { key: keyof InvoiceRates; label: string }[] = [
  { key: "weekday", label: "Weekday" },
  { key: "saturday", label: "Saturday" },
  { key: "weekdayOT", label: "Weekday OT" },
  { key: "saturdayOT", label: "Saturday OT" },
  { key: "sunday", label: "Sunday / Poya OT" },
  { key: "female", label: "Female night" },
  { key: "bonus", label: "Bonus" },
];

export function InvoiceTab({
  doc,
  onDoc,
  totals,
  lines,
  invoiceRates,
  otHours,
  bonusDays,
  bonusAmount,
  monthRows,
  period,
  totalDays,
  toCompany,
  invoiceNo,
  invoiceDate,
  onToCompany,
  onInvoiceNo,
  onInvoiceDate,
  onRate,
  notify,
}: Props) {
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const periodText = `${MONTHS[period.m]} ${period.y}`;
  const eligible = monthRows.filter((r) => r.bonusEligible);
  const bonusPool = eligible.length * bonusAmount;

  const stem =
    doc === "invoice"
      ? `Labour_Invoice_${fileNameSafe(invoiceNo)}_${fileNameSafe(periodText)}`
      : `Bonus_Sheet_${fileNameSafe(periodText)}`;

  /* ── exports ────────────────────────────────────────────────────── */

  const invoiceSheet = (): (string | number)[][] => [
    ["ROYAL HIRES", "Labour Invoice"],
    ["To Company", toCompany],
    ["Invoice No", invoiceNo],
    ["Date", invoiceDate],
    ["Period", `${periodText} (${totalDays} days)`],
    [],
    ["#", "Description", "Qty", "Rate", "Amount"],
    ...lines.map((l) => [l.no, l.desc, l.qty, l.rate, l.amount]),
    [],
    ["TOTAL", "", "", "", totals.total],
  ];

  const bonusSheet = (): (string | number)[][] => [
    [`Bonus Sheet — ${periodText}`],
    [`Period: ${periodText} • Rs.${money(bonusAmount)} if ≥${bonusDays} days`],
    [],
    ["#", "Name", "NIC", "Working Days", "Bonus Eligible", "Bonus Amount"],
    ...monthRows.map((r, i) => [
      i + 1,
      r.emp.name,
      r.emp.nic,
      r.workingDays,
      r.bonusEligible ? "Yes" : "No",
      r.bonusEligible ? bonusAmount : 0,
    ]),
    [],
    ["Total Eligible", eligible.length],
    ["Total Bonus", bonusPool],
  ];

  const sheet = () => (doc === "invoice" ? invoiceSheet() : bonusSheet());

  const exportXlsx = async () => {
    if (busy) return;
    setBusy("xls");
    try {
      const res = await downloadXlsx(
        [{ name: doc === "invoice" ? "Invoice" : "Bonus Sheet", rows: sheet() }],
        stem,
      );
      notify(res.fellBackToCsv ? "Saved as CSV (Excel library unavailable)" : "Excel saved", res.fellBackToCsv ? "warn" : "success");
    } catch {
      notify("Excel export failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    downloadCsv(sheet(), stem);
    notify("CSV saved", "success");
  };

  const exportPdf = async () => {
    if (!paperRef.current || busy) return;
    setBusy("pdf");
    try {
      await downloadPdf(paperRef.current, `${stem}.pdf`);
      notify("PDF saved", "success");
    } catch (e) {
      console.error(e);
      notify("PDF failed — try Print instead", "error");
    } finally {
      setBusy(null);
    }
  };

  const exportPng = async () => {
    if (!paperRef.current || busy) return;
    setBusy("png");
    try {
      await downloadPng(paperRef.current, `${stem}.png`);
      notify("Image saved", "success");
    } catch {
      notify("Image failed", "error");
    } finally {
      setBusy(null);
    }
  };

  /* ── render ─────────────────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      <Segmented<InvoiceDoc>
        ariaLabel="Document"
        value={doc}
        onChange={onDoc}
        tone="gold"
        options={[
          { value: "invoice", label: "Labour Invoice", icon: <FileDown /> },
          { value: "bonus", label: "Bonus Sheet", icon: <Trophy /> },
        ]}
      />

      {/* ── editable document meta ─────────────────────────────────── */}
      <Reveal className="surface-flat space-y-3 p-3.5">
        <div className="eyebrow">Document details</div>
        {doc === "invoice" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="To company"
                value={toCompany}
                onChange={(e) => onToCompany(e.target.value)}
                placeholder="Client company name"
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Invoice no"
                  value={invoiceNo}
                  onChange={(e) => onInvoiceNo(e.target.value)}
                />
                <TextField
                  label="Date"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => onInvoiceDate(e.target.value)}
                />
              </div>
            </div>

            <div className="rule-gold" />

            <div className="eyebrow">Invoice rates (billing)</div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {RATE_FIELDS.map((f) => (
                <NumberField
                  key={f.key}
                  label={f.label}
                  prefix="Rs."
                  min={0}
                  step={25}
                  value={invoiceRates[f.key]}
                  onChange={(e) => onRate(f.key, Number(e.target.value) || 0)}
                  className="!py-2.5 !text-[13px]"
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <NumberField
                label="Weekday OT hrs"
                prefix=""
                min={0}
                step={1}
                value={otHours.weekday}
                disabled
                className="!py-2.5 !text-[13px] opacity-70"
              />
              <NumberField
                label="Saturday OT hrs"
                prefix=""
                min={0}
                step={1}
                value={otHours.saturday}
                disabled
                className="!py-2.5 !text-[13px] opacity-70"
              />
              <NumberField
                label="Sunday OT hrs"
                prefix=""
                min={0}
                step={1}
                value={otHours.sunday}
                disabled
                className="!py-2.5 !text-[13px] opacity-70"
              />
            </div>
            <p className="text-[10.5px] leading-snug text-ink-500">
              OT hours per shift are configured in Settings → Billing rules.
            </p>
          </>
        ) : (
          <div className="space-y-1">
            <Row
              label={`Threshold (distinct working days)`}
              value={`${bonusDays}+ days`}
              tone="gold"
            />
            <Row label="Bonus per qualifying employee" value={rupeesDot(bonusAmount)} tone="gold" />
            <Row label="Qualifying staff" value={`${eligible.length} of ${monthRows.length}`} />
            <Row label="Total bonus pool" value={rupeesDot(bonusPool)} tone="jade" strong />
          </div>
        )}
      </Reveal>

      {/* ── paper ──────────────────────────────────────────────────── */}
      <Reveal delay={60}>
      <div
        ref={paperRef}
        className="print-area paper mx-auto w-full max-w-[640px] overflow-hidden rounded-[20px] border border-black/10 shadow-[0_24px_70px_-28px_rgba(0,0,0,0.85)]"
      >
        {doc === "invoice" ? (
          <InvoicePaper
            toCompany={toCompany}
            invoiceNo={invoiceNo}
            invoiceDate={invoiceDate}
            periodText={periodText}
            totalDays={totalDays}
            lines={lines}
            total={totals.total}
            bonusDays={bonusDays}
          />
        ) : (
          <BonusPaper
            periodText={periodText}
            rows={monthRows}
            bonusDays={bonusDays}
            bonusAmount={bonusAmount}
            total={bonusPool}
          />
        )}
      </div>
      </Reveal>

      {/* ── export bar ─────────────────────────────────────────────── */}
      <Reveal className="surface-flat p-3" delay={120}>
        <div className="eyebrow mb-2.5">Export</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ExportButton icon={<FileDown className="h-4 w-4" />} label="PDF" busy={busy === "pdf"} onClick={exportPdf} primary />
          <ExportButton icon={<Camera className="h-4 w-4" />} label="PNG" busy={busy === "png"} onClick={exportPng} />
          <ExportButton
            icon={<FileSpreadsheet className="h-4 w-4" />}
            label="Excel"
            busy={busy === "xls"}
            onClick={exportXlsx}
          />
          <ExportButton icon={<Printer className="h-4 w-4" />} label="Print" onClick={() => window.print()} />
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="btn-ghost mt-2 h-9 w-full text-[11.5px]"
        >
          Download as CSV instead
        </button>
      </Reveal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Paper documents
 * ═════════════════════════════════════════════════════════════════════ */

function Letterhead({
  right,
  title,
  subtitle,
}: {
  right?: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="relative overflow-hidden border-b-2 border-[#0f3d2e] px-6 pb-4 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#0f3d2e] font-serif text-[18px] font-bold text-[#d4af37]">
              R
            </div>
            <div>
              <div className="text-[17px] font-extrabold leading-none tracking-tight text-[#0f3d2e]">
                ROYAL HIRES
              </div>
              <div className="mt-1 text-[8.5px] font-bold uppercase tracking-[0.24em] text-[#7a9a7a]">
                Manpower Solutions
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="inline-block rounded-md bg-[#0f3d2e] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
            {title}
          </div>
          {subtitle && (
            <div className="tnum mt-1.5 text-[10px] text-[#6a8a6a]">{subtitle}</div>
          )}
        </div>
      </div>
      {right && <div className="mt-4">{right}</div>}
    </div>
  );
}

function InvoicePaper({
  toCompany,
  invoiceNo,
  invoiceDate,
  periodText,
  totalDays,
  lines,
  total,
  bonusDays,
}: {
  toCompany: string;
  invoiceNo: string;
  invoiceDate: string;
  periodText: string;
  totalDays: number;
  lines: ReturnType<typeof invoiceLinesFor>;
  total: number;
  bonusDays: number;
}) {
  return (
    <>
      <Letterhead
        title="Labour Invoice"
        subtitle={`${invoiceNo} · ${invoiceDate}`}
        right={
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8aa58a]">
                Bill to
              </div>
              <div className="mt-1 text-[14px] font-bold text-[#111]">{toCompany}</div>
            </div>
            <div className="sm:text-right">
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8aa58a]">
                Period
              </div>
              <div className="mt-1 text-[13px] font-bold text-[#0f3d2e]">
                {periodText}
                <span className="ml-1.5 text-[11px] font-semibold text-[#6a8a6a]">
                  ({totalDays} days)
                </span>
              </div>
            </div>
          </div>
        }
      />

      <div className="px-6 py-5">
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="bg-[#0f3d2e] text-white">
              <th className="w-8 px-3 py-2 text-left text-[9.5px] font-bold uppercase tracking-wider">#</th>
              <th className="px-3 py-2 text-left text-[9.5px] font-bold uppercase tracking-wider">
                Description
              </th>
              <th className="px-3 py-2 text-right text-[9.5px] font-bold uppercase tracking-wider">Qty</th>
              <th className="px-3 py-2 text-right text-[9.5px] font-bold uppercase tracking-wider">Rate</th>
              <th className="px-3 py-2 text-right text-[9.5px] font-bold uppercase tracking-wider">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eee]">
            {lines.map((l) => (
              <tr key={l.no} className={cn(l.highlight && "bg-[#fff9e6]")}>
                <td className="px-3 py-2 text-[#888]">{l.no}</td>
                <td className="px-3 py-2 font-medium text-[#222]">
                  {l.desc}
                  {l.highlight && (
                    <span className="ml-1.5 rounded bg-[#d4af37] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-black">
                      New
                    </span>
                  )}
                </td>
                <td className="tnum px-3 py-2 text-right text-[#333]">{l.qty}</td>
                <td className="tnum px-3 py-2 text-right text-[#333]">{rupeesDot(l.rate)}</td>
                <td className="tnum px-3 py-2 text-right font-bold text-[#111]">
                  {rupeesDot(l.amount)}
                </td>
              </tr>
            ))}
            <tr className="bg-[#0f3d2e] text-white">
              <td colSpan={4} className="px-3 py-3 text-[11px] font-extrabold uppercase tracking-[0.14em]">
                Total
              </td>
              <td className="tnum px-3 py-3 text-right text-[15px] font-extrabold">
                {rupeesDot(total)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 flex items-end justify-between gap-6">
          <p className="max-w-[38ch] text-[9px] leading-relaxed text-[#888]">
            Note: attendance bonus Rs.{money(bonusAmountSafe(lines))} for {bonusDays}+ working days
            (distinct dates). Female night allowance is counted per N shift for female staff.
          </p>
          <div className="shrink-0 text-right">
            <div className="h-[40px] w-[170px] border-b border-black" />
            <div className="mt-1.5 text-[10px] font-semibold text-[#444]">Authorized Signature</div>
          </div>
        </div>
      </div>
    </>
  );
}

function bonusAmountSafe(lines: ReturnType<typeof invoiceLinesFor>): number {
  return lines.find((l) => l.no === 7)?.rate ?? 5500;
}

function BonusPaper({
  periodText,
  rows,
  bonusDays,
  bonusAmount,
  total,
}: {
  periodText: string;
  rows: PayslipRow[];
  bonusDays: number;
  bonusAmount: number;
  total: number;
}) {
  const eligible = rows.filter((r) => r.bonusEligible).length;
  return (
    <>
      <Letterhead
        title="Bonus Sheet"
        subtitle={periodText}
        right={
          <div className="flex flex-wrap gap-2">
            <PaperStat label="Threshold" value={`${bonusDays}+ days`} />
            <PaperStat label="Bonus" value={rupeesDot(bonusAmount)} />
            <PaperStat label="Eligible" value={`${eligible} / ${rows.length}`} />
            <PaperStat label="Total" value={rupeesDot(total)} accent />
          </div>
        }
      />

      <div className="px-6 py-5">
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="bg-[#0f3d2e] text-white">
              <th className="w-8 px-3 py-2 text-left text-[9.5px] font-bold uppercase tracking-wider">#</th>
              <th className="px-3 py-2 text-left text-[9.5px] font-bold uppercase tracking-wider">Name</th>
              <th className="px-3 py-2 text-left text-[9.5px] font-bold uppercase tracking-wider">NIC</th>
              <th className="px-3 py-2 text-center text-[9.5px] font-bold uppercase tracking-wider">
                Working days
              </th>
              <th className="px-3 py-2 text-center text-[9.5px] font-bold uppercase tracking-wider">
                Eligible
              </th>
              <th className="px-3 py-2 text-right text-[9.5px] font-bold uppercase tracking-wider">
                Bonus
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eee]">
            {rows.map((r, i) => (
              <tr key={r.emp.id} className={cn(r.bonusEligible && "bg-[#fff9e6]")}>
                <td className="px-3 py-2 text-[#888]">{i + 1}</td>
                <td className="px-3 py-2 font-semibold text-[#222]">{r.emp.name}</td>
                <td className="tnum px-3 py-2 font-mono text-[10px] text-[#555]">{r.emp.nic}</td>
                <td className="tnum px-3 py-2 text-center font-bold text-[#111]">{r.workingDays}</td>
                <td className="px-3 py-2 text-center">
                  {r.bonusEligible ? (
                    <span className="rounded bg-[#0f3d2e] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      Yes
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-[#999]">No</span>
                  )}
                </td>
                <td className="tnum px-3 py-2 text-right font-bold text-[#111]">
                  {r.bonusEligible ? rupeesDot(bonusAmount) : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[12px] text-[#999]">
                  No staff on the roster
                </td>
              </tr>
            )}
            <tr className="bg-[#0f3d2e] text-white">
              <td colSpan={5} className="px-3 py-3 text-[11px] font-extrabold uppercase tracking-[0.14em]">
                Total · {eligible} eligible
              </td>
              <td className="tnum px-3 py-3 text-right text-[15px] font-extrabold">
                {rupeesDot(total)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 flex items-end justify-between gap-6">
          <p className="flex max-w-[38ch] items-start gap-1.5 text-[9px] leading-relaxed text-[#888]">
            <Sparkles className="mt-px h-3 w-3 shrink-0 text-[#d4af37]" />
            Rs.{money(bonusAmount)} paid once per employee who works {bonusDays} or more distinct
            dates in {periodText}.
          </p>
          <div className="shrink-0 text-right">
            <div className="h-[40px] w-[170px] border-b border-black" />
            <div className="mt-1.5 text-[10px] font-semibold text-[#444]">Authorized Signature</div>
          </div>
        </div>
      </div>
    </>
  );
}

function PaperStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-1.5",
        accent ? "border-[#d4af37] bg-[#fff9e6]" : "border-[#dcecdc] bg-[#f4faf4]",
      )}
    >
      <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-[#8aa58a]">{label}</div>
      <div className={cn("tnum mt-0.5 text-[12px] font-extrabold", accent ? "text-[#8a6d1a]" : "text-[#0f3d2e]")}>
        {value}
      </div>
    </div>
  );
}

function ExportButton({
  icon,
  label,
  onClick,
  busy,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  busy?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn("h-11 w-full text-[12px]", primary ? "btn-gold" : "btn-outline")}
    >
      {icon}
      {busy ? "Working…" : label}
    </button>
  );
}

export default InvoiceTab;
