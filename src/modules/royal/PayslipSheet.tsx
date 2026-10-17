import { useRef, useState } from "react";
import { Camera, FileDown, Printer } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { NumberField } from "@/components/ui/Field";
import { MONTHS, money, rupeesDot } from "@/lib/calendar";
import { downloadPdf, downloadPng, fileNameSafe } from "@/lib/exporters";
import type { Deductions, PayrollRates, PayslipRow, Period } from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════
 * PayslipSheet — the printable "SALARY SLIP" document from the source
 * artefact, on white paper, with inline deduction editing.
 * ═════════════════════════════════════════════════════════════════════ */

interface Props {
  open: boolean;
  onClose: () => void;
  row: PayslipRow | null;
  rates: PayrollRates;
  period: Period;
  companyName?: string;
  onDeductionChange: (empId: string, ded: Deductions) => void;
  notify: (msg: string, tone?: "success" | "error" | "info" | "warn") => void;
}

export function PayslipSheet({
  open,
  onClose,
  row,
  rates,
  period,
  companyName = "Royal Hires Manpower Solutions",
  onDeductionChange,
  notify,
}: Props) {
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!row) return null;

  const emp = row.emp;
  const shiftTotal = row.weekday + row.saturday + row.sunday;

  const earnings = [
    { label: "Weekday", qty: row.weekday, rate: rates.weekday, amount: row.weekday * rates.weekday },
    { label: "Saturday", qty: row.saturday, rate: rates.saturday, amount: row.saturday * rates.saturday },
    { label: "Sunday / Poya", qty: row.sunday, rate: rates.sunday, amount: row.sunday * rates.sunday },
    ...(emp.isFemale
      ? [
          {
            label: "Female Night Allowance",
            qty: row.femaleN,
            rate: rates.female,
            amount: row.femaleN * rates.female,
          },
        ]
      : []),
    {
      label: `Attendance Bonus${row.bonusEligible ? " ★" : row.isWeek ? " (N/A week)" : ""}`,
      qty: row.bonusEligible ? 1 : 0,
      rate: row.bonus,
      amount: row.bonus,
      plain: row.bonusEligible ? rupeesDot(row.bonus) : row.isWeek ? "N/A" : "—",
    },
  ];

  const exportPdf = async () => {
    if (!paperRef.current || busy) return;
    setBusy("pdf");
    try {
      await downloadPdf(
        paperRef.current,
        `Payslip_${fileNameSafe(emp.name)}_${MONTHS[period.m]}_${period.y}.pdf`,
      );
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
      await downloadPng(
        paperRef.current,
        `Payslip_${fileNameSafe(emp.name)}_${MONTHS[period.m]}_${period.y}.png`,
      );
      notify("Image saved", "success");
    } catch (e) {
      console.error(e);
      notify("Image failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const setDed = (key: keyof Deductions, value: number) =>
    onDeductionChange(emp.id, { ...row.ded, [key]: Math.max(0, value || 0) });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      bare
      size="lg"
      className="border-gold-500/22"
      bodyClassName="px-4 pb-4 pt-3 sm:px-5"
      footer={
        <div className="no-print flex gap-2 pb-1">
          <button
            type="button"
            onClick={exportPdf}
            disabled={!!busy}
            className="btn-outline h-12 flex-1"
          >
            <FileDown className="h-4 w-4" />
            {busy === "pdf" ? "Working…" : "PDF"}
          </button>
          <button
            type="button"
            onClick={exportPng}
            disabled={!!busy}
            className="btn-outline h-12 flex-1"
          >
            <Camera className="h-4 w-4" />
            {busy === "png" ? "Working…" : "PNG"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-gold h-12 flex-1"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      }
    >
      {/* ── paper document ─────────────────────────────────────────── */}
      <div
        ref={paperRef}
        className="print-area paper mx-auto w-full max-w-[520px] overflow-hidden rounded-[20px] border border-black/10 shadow-[0_24px_70px_-28px_rgba(0,0,0,0.8)]"
      >
        {/* letterhead */}
        <div className="relative overflow-hidden bg-[#0f3d2e] px-5 pb-4 pt-5 text-white">
          <div
            aria-hidden
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(420px 120px at 88% -20%, #d4af37, transparent 65%)",
            }}
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[16px] font-extrabold leading-none tracking-tight">
                {companyName}
              </div>
              <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-[#a8d4b8]">
                Manpower Solutions
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em]">
              Salary Slip
            </span>
          </div>
        </div>

        <div className="px-5 pb-5 pt-4">
          {/* identity */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[19px] font-extrabold leading-tight text-[#111]">
                {emp.name}
              </div>
              <div className="tnum mt-1 font-mono text-[10.5px] leading-relaxed text-[#6a8a6a]">
                NIC: {emp.nic || "—"} · {row.workingDays} days · Rs. {money(emp.rate)}/shift
                {emp.isFemale ? " · Female" : ""}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <span className="inline-block rounded-full border border-[#c8e6c8] bg-[#e6f4e6] px-2.5 py-1 text-[10px] font-bold text-[#1a5a2a]">
                {row.periodLabel}
              </span>
              <div className="tnum mt-1.5 text-[10px] text-[#7a9a7a]">
                ID {emp.nic ? emp.nic.slice(-4) : "—"}
              </div>
            </div>
          </div>

          {row.isWeek && (
            <div className="mt-3 inline-block rounded-full border border-[#ffeeba] bg-[#fff3cd] px-2.5 py-1 text-[10px] font-semibold text-[#856404]">
              Week-wise range • attendance bonus not applicable
            </div>
          )}

          {/* earnings */}
          <section className="mt-4 overflow-hidden rounded-[14px] border border-[#d6e9d6] bg-white">
            <header className="flex items-center justify-between bg-[#eaf5ea] px-4 py-2.5">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#2a6a2a]">
                Earnings
              </span>
              <span className="text-[10.5px] text-[#5a8a5a]">{shiftTotal} shifts</span>
            </header>
            <div className="divide-y divide-[#eef5ee]">
              {earnings.map((e) => (
                <div key={e.label} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[12.5px] text-[#444]">
                    {e.label}
                    {"plain" in e && e.plain ? "" : ` (${e.qty} × ${money(e.rate)})`}
                  </span>
                  <span className="tnum text-[12.5px] font-semibold text-[#111]">
                    {"plain" in e && e.plain ? e.plain : rupeesDot(e.amount)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between bg-[#f4faf4] px-4 py-3">
                <span className="text-[13px] font-extrabold text-[#111]">Gross Earnings</span>
                <span className="tnum text-[14px] font-extrabold text-[#0f3d2e]">
                  {rupeesDot(row.gross)}
                </span>
              </div>
            </div>
          </section>

          {/* deductions */}
          <section className="mt-3 overflow-hidden rounded-[14px] border border-[#f0d0d0] bg-white">
            <header className="flex items-center justify-between bg-[#fdf0f0] px-4 py-2.5">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#8a3a3a]">
                Deductions
              </span>
              <span className="text-[10.5px] text-[#a06060]">Editable</span>
            </header>
            <div className="grid gap-2 px-3 py-3 sm:grid-cols-3">
              <NumberField
                label="Meal"
                prefix="Rs."
                value={row.ded.meal}
                min={0}
                step={50}
                onChange={(e) => setDed("meal", Number(e.target.value))}
                className="!bg-[#fafafa] !text-[#111] !border-[#e6dada] focus:!border-[#c0392b] focus:!ring-[#c0392b]/10 !py-2.5 !text-[13px]"
              />
              <NumberField
                label="Boarding"
                prefix="Rs."
                value={row.ded.boarding}
                min={0}
                step={50}
                onChange={(e) => setDed("boarding", Number(e.target.value))}
                className="!bg-[#fafafa] !text-[#111] !border-[#e6dada] focus:!border-[#c0392b] focus:!ring-[#c0392b]/10 !py-2.5 !text-[13px]"
              />
              <NumberField
                label="Advance"
                prefix="Rs."
                value={row.ded.advance}
                min={0}
                step={50}
                onChange={(e) => setDed("advance", Number(e.target.value))}
                className="!bg-[#fafafa] !text-[#111] !border-[#e6dada] focus:!border-[#c0392b] focus:!ring-[#c0392b]/10 !py-2.5 !text-[13px]"
              />
            </div>
            <div className="flex items-center justify-between bg-[#fdf7f7] px-4 py-3">
              <span className="text-[13px] font-extrabold text-[#8a3a3a]">Total Deductions</span>
              <span className="tnum text-[14px] font-extrabold text-[#a5342c]">
                {rupeesDot(row.totalDed)}
              </span>
            </div>
          </section>

          {/* net */}
          <div className="mt-4 flex items-center justify-between rounded-[14px] bg-[#0f3d2e] px-4 py-4 text-white">
            <div>
              <div className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#a8d4b8]">
                Net Payable
              </div>
              <div className="mt-1 text-[10px] text-[#8fbf9f]">
                {row.periodLabel} · {row.workingDays} working days
              </div>
            </div>
            <div className="tnum text-[24px] font-extrabold leading-none">{rupeesDot(row.net)}</div>
          </div>

          {/* signatures */}
          <div className="mt-6 flex items-end justify-between gap-6">
            {["Employee Signature", "Authorized Signature"].map((s) => (
              <div key={s} className="flex-1 text-center">
                <div className="h-[38px] border-b border-[#111]" />
                <div className="mt-1.5 text-[10px] font-semibold text-[#444]">{s}</div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-center text-[9px] leading-relaxed text-[#8aa58a]">
            Computer generated statement · Generated {new Date().toLocaleDateString("en-GB")}
          </p>
        </div>
      </div>

      <div className="no-print mt-3 text-center text-[11px] text-ink-400">
        Deductions edit live and flow straight into Payroll totals.
      </div>
    </Sheet>
  );
}

export default PayslipSheet;
