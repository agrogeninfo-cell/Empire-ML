import { useRef, useState } from "react";
import {
  CalendarPlus,
  Database,
  Download,
  HardDrive,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRoundPlus,
  Users,
  X,
} from "lucide-react";
import { Confirm } from "@/components/ui/Confirm";
import { NumberField, Switch, TextField } from "@/components/ui/Field";
import { Badge, EmptyState, Row } from "@/components/ui/Metrics";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { MONTHS_SHORT, clockTime, money, parseKey } from "@/lib/calendar";
import type { StorageMeta } from "@/lib/storage";
import { KEY_BACKUP, KEY_MAIN } from "@/lib/storage";
import { ROYAL_NOTES } from "@/data/defaults";
import type {
  DeductionMap,
  Employee,
  InvoiceRates,
  OtHours,
  PayrollRates,
} from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════
 * SettingsTab — rates, roster, Poya calendar, persistence vault
 * ═════════════════════════════════════════════════════════════════════ */

interface Props {
  employees: Employee[];
  deductions: DeductionMap;
  payrollRates: PayrollRates;
  invoiceRates: InvoiceRates;
  otHours: OtHours;
  bonusDays: number;
  bonusAmount: number;
  poyaDays: string[];
  meta: StorageMeta;
  lastSaved: string | null;
  saving: boolean;
  autoBackup: boolean;
  storageOk: boolean;
  hasData: boolean;

  onAddEmployee: () => void;
  onRemoveEmployee: (id: string) => void;
  onPayrollRate: (k: keyof PayrollRates, v: number) => void;
  onInvoiceRate: (k: keyof InvoiceRates, v: number) => void;
  onOtHours: (k: keyof OtHours, v: number) => void;
  onBonus: (days: number, amount: number) => void;
  onPoya: (days: string[]) => void;
  onDeduction: (empId: string, key: "meal" | "boarding" | "advance", v: number) => void;
  onAutoBackup: (v: boolean) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onRestoreBackup: () => void;
  onLoadDemo: () => void;
  onResetAll: () => void;
  notify: (msg: string, tone?: "success" | "error" | "info" | "warn") => void;
}

const PAYROLL_FIELDS: { key: keyof PayrollRates; label: string; hint: string }[] = [
  { key: "weekday", label: "Weekday", hint: "Mon–Fri shift" },
  { key: "saturday", label: "Saturday", hint: "Saturday shift" },
  { key: "sunday", label: "Sunday / Poya", hint: "Highest rate" },
  { key: "female", label: "Female night", hint: "Per N shift" },
];

const INVOICE_FIELDS: { key: keyof InvoiceRates; label: string }[] = [
  { key: "weekday", label: "Weekday" },
  { key: "saturday", label: "Saturday" },
  { key: "weekdayOT", label: "Weekday OT" },
  { key: "saturdayOT", label: "Saturday OT" },
  { key: "sunday", label: "Sunday / Poya OT" },
  { key: "female", label: "Female night" },
  { key: "bonus", label: "Bonus" },
];

export function SettingsTab(props: Props) {
  const {
    employees,
    deductions,
    payrollRates,
    invoiceRates,
    otHours,
    bonusDays,
    bonusAmount,
    poyaDays,
    meta,
    lastSaved,
    saving,
    autoBackup,
    storageOk,
    hasData,
  } = props;

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Employee | null>(null);
  const [newPoya, setNewPoya] = useState("");

  const sortedPoya = [...poyaDays].sort();

  return (
    <div className="space-y-4">
      {/* ═══ Roster ══════════════════════════════════════════════════ */}
      <Panel
        icon={<Users className="h-4 w-4" />}
        title="Staff roster"
        subtitle={`${employees.length} employee${employees.length === 1 ? "" : "s"} on the payroll`}
        action={
          <button type="button" className="btn-gold h-9 px-3.5 text-[12px]" onClick={props.onAddEmployee}>
            <UserRoundPlus className="h-3.5 w-3.5" />
            Add
          </button>
        }
      >
        {employees.length === 0 ? (
          <EmptyState
            className="border-0 bg-transparent py-6"
            icon={<Users className="h-5 w-5" />}
            title="Roster is empty"
            body="Add staff manually, or drop in the six-person demo roster to see every calculation in action."
            action={
              <button type="button" className="btn-outline h-10 px-4 text-[12px]" onClick={props.onLoadDemo}>
                <Sparkles className="h-3.5 w-3.5" />
                Load demo data
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {employees.map((emp) => {
              const ded = deductions[emp.id] ?? { meal: 0, boarding: 0, advance: 0 };
              return (
                <li key={emp.id} className="px-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13.5px] font-bold text-ink-50">
                          {emp.name}
                        </span>
                        {emp.isFemale && <Badge tone="gold">♀ Female</Badge>}
                      </div>
                      <div className="tnum mt-0.5 font-mono text-[10.5px] text-ink-500">
                        NIC {emp.nic || "—"} · base Rs {money(emp.rate)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(emp)}
                      aria-label={`Remove ${emp.name}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] text-ink-400 transition hover:border-danger/45 hover:bg-danger/10 hover:text-danger-soft active:scale-92"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    {(["meal", "boarding", "advance"] as const).map((k) => (
                      <NumberField
                        key={k}
                        label={k === "meal" ? "Meal" : k === "boarding" ? "Boarding" : "Advance"}
                        prefix="Rs."
                        min={0}
                        step={50}
                        value={ded[k]}
                        onChange={(e) => props.onDeduction(emp.id, k, Number(e.target.value) || 0)}
                        className="!py-2 !text-[12.5px]"
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* ═══ Payroll rates ═══════════════════════════════════════════ */}
      <Panel
        icon={<Database className="h-4 w-4" />}
        title="Payroll rates"
        subtitle="What each employee is paid per shift"
        tone="jade"
      >
        <div className="grid grid-cols-2 gap-2.5">
          {PAYROLL_FIELDS.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              hint={f.hint}
              prefix="Rs."
              min={0}
              step={25}
              value={payrollRates[f.key]}
              onChange={(e) => props.onPayrollRate(f.key, Number(e.target.value) || 0)}
            />
          ))}
        </div>
      </Panel>

      {/* ═══ Billing rules ═══════════════════════════════════════════ */}
      <Panel
        icon={<Sparkles className="h-4 w-4" />}
        title="Invoice rates & billing rules"
        subtitle="What the client company is billed, plus the bonus rule"
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {INVOICE_FIELDS.map((f) => (
            <NumberField
              key={f.key}
              label={f.label}
              prefix="Rs."
              min={0}
              step={25}
              value={invoiceRates[f.key]}
              onChange={(e) => props.onInvoiceRate(f.key, Number(e.target.value) || 0)}
            />
          ))}
        </div>

        <div className="rule-gold my-4" />

        <div className="grid grid-cols-3 gap-2.5">
          {(["weekday", "saturday", "sunday"] as const).map((k) => (
            <NumberField
              key={k}
              label={`${k === "sunday" ? "Sun/Poya" : k === "saturday" ? "Saturday" : "Weekday"} OT hrs`}
              prefix=""
              min={0}
              max={24}
              step={1}
              value={otHours[k]}
              onChange={(e) => props.onOtHours(k, Number(e.target.value) || 0)}
            />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <NumberField
            label="Bonus threshold"
            hint="Distinct working days"
            prefix=""
            min={1}
            max={31}
            step={1}
            value={bonusDays}
            onChange={(e) => props.onBonus(Number(e.target.value) || bonusDays, bonusAmount)}
          />
          <NumberField
            label="Bonus amount"
            hint="Paid once per employee"
            prefix="Rs."
            min={0}
            step={100}
            value={bonusAmount}
            onChange={(e) => props.onBonus(bonusDays, Number(e.target.value) || 0)}
          />
        </div>

        <ul className="mt-4 space-y-1.5">
          {ROYAL_NOTES.map((n) => (
            <li key={n} className="flex gap-2 text-[11px] leading-relaxed text-ink-400">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-gold-500/70" />
              {n}
            </li>
          ))}
        </ul>
      </Panel>

      {/* ═══ Poya calendar ═══════════════════════════════════════════ */}
      <Panel
        icon={<CalendarPlus className="h-4 w-4" />}
        title="Poya days"
        subtitle="Full-moon holidays — billed at the Sunday rate"
        tone="danger"
        action={<Badge tone="danger">{sortedPoya.length} dates</Badge>}
      >
        <div className="flex flex-wrap gap-1.5">
          {sortedPoya.length === 0 && (
            <p className="text-[12px] text-ink-400">No Poya dates set for this dataset.</p>
          )}
          {sortedPoya.map((p) => {
            const { y, m, d } = parseKey(p);
            return (
              <span
                key={p}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-danger/25 bg-danger/10 px-2 py-1.5 text-[11px] font-semibold text-danger-soft"
              >
                <span className="tnum">
                  {d} {MONTHS_SHORT[m]} {y}
                </span>
                <button
                  type="button"
                  aria-label={`Remove Poya day ${p}`}
                  onClick={() => props.onPoya(poyaDays.filter((x) => x !== p))}
                  className="opacity-55 transition hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <TextField
            type="date"
            value={newPoya}
            onChange={(e) => setNewPoya(e.target.value)}
            className="flex-1"
            aria-label="New Poya date"
          />
          <button
            type="button"
            className="btn-outline h-[46px] shrink-0 px-4 text-[12px]"
            disabled={!newPoya || poyaDays.includes(newPoya)}
            onClick={() => {
              if (!newPoya || poyaDays.includes(newPoya)) return;
              props.onPoya([...poyaDays, newPoya]);
              props.notify(`Poya day added · ${newPoya}`, "success");
              setNewPoya("");
            }}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
      </Panel>

      {/* ═══ Data vault ══════════════════════════════════════════════ */}
      <Panel
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Data vault"
        subtitle="Dual-key local persistence with weekly auto-backup"
        action={
          <span className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", saving ? "animate-pulse bg-gold-400" : "bg-jade-500")} />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400">
              {saving ? "Saving" : "Saved"}
            </span>
          </span>
        }
      >
        {!storageOk && (
          <div className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[11.5px] leading-snug text-danger-soft">
            Local storage is unavailable in this browser context — changes will be lost on reload.
            Export a backup before closing the tab.
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <VaultStat label="Last backup" value={clockTime(lastSaved)} />
          <VaultStat label="Data size" value={`${meta.dataSizeKB} KB`} />
          <VaultStat label="Staff" value={String(meta.employeeCount)} />
          <VaultStat label="Records" value={String(meta.recordCount + meta.estateRecordCount)} />
        </div>

        <div className="mt-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-400">
            <HardDrive className="h-3.5 w-3.5" />
            Storage keys
          </div>
          <div className="mt-2 space-y-1 font-mono text-[10.5px] text-ink-300">
            <div className="flex items-center gap-2">
              <Badge tone="jade">main</Badge>
              <span className="truncate">{KEY_MAIN}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="gold">backup</Badge>
              <span className="truncate">{KEY_BACKUP}</span>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <Switch
            checked={autoBackup}
            onChange={props.onAutoBackup}
            label="Auto backup weekly"
            hint="Downloads a JSON snapshot at most once every 7 days"
            tone="jade"
          />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-outline h-11 text-[12px]" onClick={props.onExportBackup}>
            <Download className="h-4 w-4" />
            Export backup JSON
          </button>
          <button
            type="button"
            className="btn-outline h-11 text-[12px]"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Import backup JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) props.onImportBackup(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn-outline h-11 text-[12px]"
            disabled={!hasData}
            onClick={props.onRestoreBackup}
          >
            <RotateCcw className="h-4 w-4" />
            Restore last backup
          </button>
          <button
            type="button"
            className="btn-outline h-11 text-[12px]"
            onClick={props.onLoadDemo}
          >
            <Sparkles className="h-4 w-4" />
            Load demo data
          </button>
        </div>

        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          className="btn-danger mt-2 h-11 w-full text-[12px]"
        >
          <Trash2 className="h-4 w-4" />
          Delete all data & reset
        </button>
      </Panel>

      {/* ═══ dialogs ═════════════════════════════════════════════════ */}
      <Confirm
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          props.onResetAll();
          props.notify("All data cleared — reset to a blank workspace", "success");
        }}
        title="Are you absolutely sure?"
        requireText="DELETE"
        confirmLabel="Delete everything"
        body={
          <>
            This erases{" "}
            <b className="text-ink-50">
              {employees.length} employee{employees.length === 1 ? "" : "s"}
            </b>{" "}
            and{" "}
            <b className="text-ink-50">
              {meta.recordCount + meta.estateRecordCount} records
            </b>{" "}
            from both modules, permanently.
            <br />
            <br />
            Main storage <span className="font-mono text-[11px] text-ink-200">{KEY_MAIN}</span> and
            backup <span className="font-mono text-[11px] text-ink-200">{KEY_BACKUP}</span> will be
            deleted. This cannot be undone unless you have a downloaded backup JSON.
          </>
        }
        requirePrompt={
          <>
            To prevent an accidental erase, type{" "}
            <b className="font-mono text-danger-soft">DELETE</b> in capital letters.
          </>
        }
        stats={
          <div className="rounded-xl border border-white/[0.07] bg-ink-900/60 px-3 py-2">
            <Row label="Employees" value={String(employees.length)} />
            <Row label="Attendance records" value={String(meta.recordCount)} />
            <Row label="Estate day records" value={String(meta.estateRecordCount)} />
          </div>
        }
      />

      <Confirm
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (!confirmRemove) return;
          props.onRemoveEmployee(confirmRemove.id);
          props.notify(`${confirmRemove.name} removed from the roster`, "success");
        }}
        title={`Remove ${confirmRemove?.name ?? "employee"}?`}
        tone="danger"
        confirmLabel="Remove"
        body={
          <>
            Their attendance history and deductions will be deleted with them. Payslips already
            exported stay untouched.
          </>
        }
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Bits
 * ═════════════════════════════════════════════════════════════════════ */

function Panel({
  icon,
  title,
  subtitle,
  action,
  children,
  tone = "gold",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  tone?: "gold" | "jade" | "danger";
}) {
  const accent =
    tone === "jade"
      ? "text-jade-300 border-jade-500/25 bg-jade-600/10"
      : tone === "danger"
        ? "text-danger-soft border-danger/25 bg-danger/10"
        : "text-gold-300 border-gold-500/25 bg-gold-500/10";
  return (
    <Reveal as="section" className="surface overflow-hidden">
      <header className="flex items-start gap-3 px-4 pb-3 pt-4">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl border", accent)}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-bold leading-tight text-ink-50">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-400">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="border-t border-white/[0.06] px-4 py-4">{children}</div>
    </Reveal>
  );
}

function VaultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-ink-900/60 px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-500">{label}</div>
      <div className="tnum mt-1 truncate text-[13px] font-bold text-ink-100">{value}</div>
    </div>
  );
}

export default SettingsTab;
