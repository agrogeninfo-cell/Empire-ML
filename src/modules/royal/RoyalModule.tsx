import { useCallback, useMemo, useState } from "react";
import {
  CalendarDays,
  Crown,
  FileText,
  Receipt,
  Settings2,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useStore } from "@/store/AppStore";
import { useToast } from "@/components/ui/Toast";
import { Badge, MetricCard } from "@/components/ui/Metrics";
import { Sheet } from "@/components/ui/Sheet";
import { BottomNav } from "@/components/layout/Nav";
import { cn } from "@/lib/cn";
import { MONTHS, money, todayKey } from "@/lib/calendar";
import {
  dropEmployee,
  invoiceLinesFor,
  makeEmployeeId,
  setMark,
} from "@/lib/payroll";
import type {
  AttendanceMap,
  CalendarDay,
  DayMark,
  Deductions,
  Employee,
  OtHours,
  Period,
  RangeMode,
  WeekId,
} from "@/lib/types";
import { useUiPref } from "@/hooks/useUiPrefs";
import { useRoyal } from "./useRoyal";
import { AttendanceTab, type AttendanceView } from "./AttendanceTab";
import { PayrollTab } from "./PayrollTab";
import { InvoiceTab, type InvoiceDoc } from "./InvoiceTab";
import { SettingsTab } from "./SettingsTab";
import { PeriodSheet } from "./PeriodSheet";
import { PayslipSheet } from "./PayslipSheet";
import { AddStaffSheet } from "./AddStaffSheet";
import { DaySheet } from "./DaySheet";

/* ═══════════════════════════════════════════════════════════════════════
 * RoyalModule — Payroll workspace
 * Tabs: Attendance · Payroll · Invoice · Settings
 * ═════════════════════════════════════════════════════════════════════ */

export type RoyalTab = "attendance" | "payroll" | "invoice" | "settings";

export const ROYAL_TABS = [
  { id: "attendance" as const, label: "Attendance", icon: <CalendarDays /> },
  { id: "payroll" as const, label: "Payroll", icon: <Receipt /> },
  { id: "invoice" as const, label: "Invoice", icon: <FileText /> },
  { id: "settings" as const, label: "Settings", icon: <Settings2 /> },
];

export function RoyalModule() {
  const store = useStore();
  const toast = useToast();
  const royal = store.royal;

  const [tab, setTab] = useUiPref<RoyalTab>("royal.tab", "attendance");
  const [view, setView] = useUiPref<AttendanceView>("royal.view", "cards");
  const [mode, setMode] = useUiPref<RangeMode>("royal.rangeMode", "month");
  const [weekId, setWeekId] = useUiPref<WeekId>("royal.weekId", "w1");
  const [fromDay, setFromDay] = useState(1);
  const [toDay, setToDay] = useState(7);
  const [doc, setDoc] = useUiPref<InvoiceDoc>("royal.doc", "invoice");

  const [periodOpen, setPeriodOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [payslipId, setPayslipId] = useState<string | null>(null);
  const [dayTarget, setDayTarget] = useState<{ empId: string; key: string } | null>(null);

  const range = useMemo(
    () => ({ mode, weekId, fromDay, toDay }),
    [mode, weekId, fromDay, toDay],
  );

  const d = useRoyal(royal, range);

  const notify = useCallback(
    (message: string, tone: "success" | "error" | "info" | "warn" = "info") =>
      toast.push({ message, tone }),
    [toast],
  );

  /* ── attendance mutations ───────────────────────────────────────── */

  const applyAttendance = useCallback(
    (next: AttendanceMap, message?: string, undoable = true) => {
      const snapshot = royal.attendance;
      store.updateRoyal((r) => ({ ...r, attendance: next }), { undoable });
      if (message) {
        toast.push({
          message,
          tone: "success",
          actionLabel: "Undo",
          onAction: () => store.updateRoyal((r) => ({ ...r, attendance: snapshot })),
        });
      }
    },
    [royal.attendance, store, toast],
  );

  const setExplicit = useCallback(
    (empId: string, key: string, mark: DayMark | null) => {
      const emp = royal.employees.find((e) => e.id === empId);
      const day = d.days.find((x) => x.key === key);
      const label = !mark ? "OFF" : mark.D && mark.N ? "Day + Night" : mark.D ? "Day" : "Night";
      applyAttendance(
        setMark(royal.attendance, empId, key, mark),
        `${emp?.name ?? "Staff"} · ${day ? `${MONTHS[day.date.getMonth()]} ${day.d}` : key} → ${label}`,
      );
    },
    [royal.attendance, royal.employees, d.days, applyAttendance],
  );

  /* ── roster mutations ───────────────────────────────────────────── */

  const addEmployee = useCallback(
    (payload: Omit<Employee, "id">, ded: Deductions) => {
      const id = makeEmployeeId();
      const emp: Employee = { id, ...payload };
      store.updateRoyal((r) => ({
        ...r,
        employees: [...r.employees, emp],
        attendance: { ...r.attendance, [id]: {} },
        deductions: { ...r.deductions, [id]: ded },
      }));
      notify(`${emp.name} added to the roster`, "success");
    },
    [store, notify],
  );

  const removeEmployee = useCallback(
    (id: string) => {
      const snapshot = royal;
      const { attendance, deductions } = dropEmployee(royal.attendance, royal.deductions, id);
      store.updateRoyal((r) => ({
        ...r,
        employees: r.employees.filter((e) => e.id !== id),
        attendance,
        deductions,
      }));
      toast.push({
        message: "Employee removed",
        tone: "warn",
        actionLabel: "Undo",
        onAction: () => store.updateRoyal(() => snapshot),
      });
    },
    [royal, store, toast],
  );

  const setDeduction = useCallback(
    (empId: string, ded: Deductions) => {
      store.updateRoyal((r) => ({ ...r, deductions: { ...r.deductions, [empId]: ded } }));
    },
    [store],
  );

  /* ── derived bits for the UI ────────────────────────────────────── */

  const payslipRow = useMemo(
    () => d.rows.find((r) => r.emp.id === payslipId) ?? d.monthRows.find((r) => r.emp.id === payslipId) ?? null,
    [d.rows, d.monthRows, payslipId],
  );

  const daySheetData = useMemo(() => {
    if (!dayTarget) return { emp: null as Employee | null, day: null as CalendarDay | null };
    return {
      emp: royal.employees.find((e) => e.id === dayTarget.empId) ?? null,
      day: d.days.find((x) => x.key === dayTarget.key) ?? null,
    };
  }, [dayTarget, royal.employees, d.days]);

  const tKey = todayKey();
  const todayInMonth = d.days.some((x) => x.key === tKey);
  const presentToday = todayInMonth
    ? royal.employees.filter((e) => {
        const m = royal.attendance[e.id]?.[tKey];
        return m && (m.D || m.N);
      }).length
    : 0;

  const invoiceLines = useMemo(
    () => invoiceLinesFor(d.invoice, royal.invoiceRates, royal.otHours, royal.bonusDays),
    [d.invoice, royal.invoiceRates, royal.otHours, royal.bonusDays],
  );

  /* ── render ─────────────────────────────────────────────────────── */

  return (
    <>
      {/* ══ period bar ══════════════════════════════════════════════ */}
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-1 pt-3 md:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setPeriodOpen(true)}
          className={cn(
            "group relative flex w-full items-center gap-3 overflow-hidden rounded-[20px] border border-white/[0.08]",
            "bg-ink-850/85 px-4 py-3.5 text-left shadow-lift backdrop-blur-xl transition",
            "hover:border-gold-500/35 active:scale-[0.995]",
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              backgroundImage:
                "radial-gradient(520px 110px at 0% -30%, rgba(212,175,55,0.16), transparent 66%)",
            }}
          />
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-gold-500/25 bg-gold-500/10 text-[19px]">
            📅
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="display truncate text-[19px] leading-none text-ink-50">
                {d.periodText}
              </span>
              <Badge tone="neutral">{d.totalDays} days</Badge>
              {todayInMonth && (
                <Badge tone="jade" dot>
                  Live month
                </Badge>
              )}
            </span>
            <span className="mt-1.5 block truncate text-[11px] text-ink-400">
              {d.stats.totalShifts} shifts · {d.recordCount} records · {d.invoice.bonusCount} bonus
              eligible · {royal.employees.length} staff
            </span>
          </span>
          <span className="relative shrink-0 text-[18px] text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-gold-400">
            ›
          </span>
        </button>
      </div>

      {/* ══ tab body ════════════════════════════════════════════════ */}
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-4 pt-3 md:px-6 lg:px-8">
        {tab === "attendance" && (
          <>
            {/* headline metrics */}
            <div className="mb-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                label="Shifts booked"
                value={d.stats.totalShifts}
                icon={<Crown className="h-3.5 w-3.5" />}
                tone="gold"
                fill={
                  royal.employees.length
                    ? (d.stats.totalShifts / (d.totalDays * royal.employees.length * 2)) * 100
                    : 0
                }
                sub={`${d.stats.weekdays} weekdays · ${d.stats.saturdays} Sat · ${d.stats.sundays + d.stats.poyas} Sun/Poya`}
              />
              <MetricCard
                label="Present today"
                value={todayInMonth ? `${presentToday}/${royal.employees.length}` : "—"}
                icon={<Users className="h-3.5 w-3.5" />}
                tone="jade"
                fill={royal.employees.length ? (presentToday / royal.employees.length) * 100 : 0}
                sub={todayInMonth ? tKey : "Today falls outside this period"}
              />
              <MetricCard
                label="Net payable"
                value={`Rs ${money(d.netTotal)}`}
                icon={<Receipt className="h-3.5 w-3.5" />}
                tone="jade"
                sub={`Gross Rs ${money(d.grossTotal)} − Rs ${money(d.deductionTotal)} deductions`}
              />
              <MetricCard
                label="Client invoice"
                value={`Rs ${money(d.invoice.total)}`}
                icon={<FileText className="h-3.5 w-3.5" />}
                tone="gold"
                sub={`7 lines · ${d.invoice.bonusCount} bonuses · margin Rs ${money(d.invoice.total - d.grossTotal)}`}
              />
            </div>

            <AttendanceTab
              view={view}
              onView={setView}
              employees={royal.employees}
              days={d.rangeDays}
              allDays={d.days}
              attendance={royal.attendance}
              rows={d.rows}
              monthRows={d.monthRows}
              bonusDays={royal.bonusDays}
              periodText={d.periodText}
              onAttendance={applyAttendance}
              onOpenAdd={() => setAddOpen(true)}
              onOpenDay={(empId, key) => setDayTarget({ empId, key })}
              onOpenPayslip={(empId) => {
                setPayslipId(empId);
                setTab("payroll");
              }}
            />
          </>
        )}

        {tab === "payroll" && (
          <PayrollTab
            rows={d.rows}
            mode={mode}
            onMode={setMode}
            weekId={weekId}
            onWeekId={setWeekId}
            weeks={d.weeks}
            fromDay={fromDay}
            toDay={toDay}
            onFromDay={setFromDay}
            onToDay={setToDay}
            totalDays={d.totalDays}
            bonusDays={royal.bonusDays}
            bonusAmount={royal.bonusAmount}
            rangeText={d.isWeek ? d.rangeText : d.periodText}
            grossTotal={d.grossTotal}
            deductionTotal={d.deductionTotal}
            netTotal={d.netTotal}
            bonusEligible={d.bonusEligible}
            payrollRates={royal.payrollRates}
            isWeek={d.isWeek}
            onOpenPayslip={setPayslipId}
          />
        )}

        {tab === "invoice" && (
          <InvoiceTab
            doc={doc}
            onDoc={setDoc}
            totals={d.invoice}
            lines={invoiceLines}
            invoiceRates={royal.invoiceRates}
            otHours={royal.otHours}
            bonusDays={royal.bonusDays}
            bonusAmount={royal.bonusAmount}
            monthRows={d.monthRows}
            period={royal.period}
            totalDays={d.totalDays}
            toCompany={royal.toCompany}
            invoiceNo={royal.invoiceNo}
            invoiceDate={royal.invoiceDate}
            onToCompany={(v) => store.updateRoyal((r) => ({ ...r, toCompany: v }))}
            onInvoiceNo={(v) => store.updateRoyal((r) => ({ ...r, invoiceNo: v }))}
            onInvoiceDate={(v) => store.updateRoyal((r) => ({ ...r, invoiceDate: v }))}
            onRate={(k, v) =>
              store.updateRoyal((r) => ({ ...r, invoiceRates: { ...r.invoiceRates, [k]: v } }))
            }
            notify={notify}
          />
        )}

        {tab === "settings" && (
          <SettingsTab
            employees={royal.employees}
            deductions={royal.deductions}
            payrollRates={royal.payrollRates}
            invoiceRates={royal.invoiceRates}
            otHours={royal.otHours}
            bonusDays={royal.bonusDays}
            bonusAmount={royal.bonusAmount}
            poyaDays={royal.poyaDays}
            meta={store.meta}
            lastSaved={store.lastSaved}
            saving={store.saving}
            autoBackup={store.autoBackup}
            storageOk={store.storageOk}
            hasData={royal.employees.length > 0 || d.recordCount > 0}
            onAddEmployee={() => setAddOpen(true)}
            onRemoveEmployee={removeEmployee}
            onPayrollRate={(k, v) =>
              store.updateRoyal((r) => ({ ...r, payrollRates: { ...r.payrollRates, [k]: v } }))
            }
            onInvoiceRate={(k, v) =>
              store.updateRoyal((r) => ({ ...r, invoiceRates: { ...r.invoiceRates, [k]: v } }))
            }
            onOtHours={(k: keyof OtHours, v) =>
              store.updateRoyal((r) => ({ ...r, otHours: { ...r.otHours, [k]: v } }))
            }
            onBonus={(days, amount) =>
              store.updateRoyal((r) => ({ ...r, bonusDays: days, bonusAmount: amount }))
            }
            onPoya={(days) => store.updateRoyal((r) => ({ ...r, poyaDays: days }))}
            onDeduction={(empId, key, v) =>
              store.updateRoyal((r) => ({
                ...r,
                deductions: {
                  ...r.deductions,
                  [empId]: { ...(r.deductions[empId] ?? { meal: 0, boarding: 0, advance: 0 }), [key]: v },
                },
              }))
            }
            onAutoBackup={store.setAutoBackup}
            onExportBackup={store.exportBackup}
            onImportBackup={async (file) => {
              const res = await store.importBackup(file);
              notify(res.message, res.ok ? "success" : "error");
            }}
            onRestoreBackup={() => {
              const res = store.restoreBackup();
              notify(res.message, res.ok ? "success" : "error");
            }}
            onLoadDemo={() => {
              store.loadDemo();
              notify("Demo workspace loaded — 6 staff with a full month of attendance", "success");
            }}
            onResetAll={store.resetAll}
            notify={notify}
          />
        )}
      </div>

      {/* ══ sheets ══════════════════════════════════════════════════ */}
      <PeriodSheet
        open={periodOpen}
        onClose={() => setPeriodOpen(false)}
        period={royal.period}
        poyaDays={royal.poyaDays}
        onApply={(p: Period) => store.updateRoyal((r) => ({ ...r, period: p }))}
        dayLoad={(day: CalendarDay) =>
          royal.employees.reduce((n, e) => {
            const m = royal.attendance[e.id]?.[day.key];
            return n + (m?.D ? 1 : 0) + (m?.N ? 1 : 0);
          }, 0)
        }
      />

      <PayslipSheet
        open={!!payslipRow}
        onClose={() => setPayslipId(null)}
        row={payslipRow}
        rates={royal.payrollRates}
        period={royal.period}
        companyName={`Royal Hires · ${royal.toCompany}`}
        onDeductionChange={(empId, ded) => setDeduction(empId, ded)}
        notify={notify}
      />

      <AddStaffSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={addEmployee}
        onLoadDemo={() => {
          store.loadDemo();
          setAddOpen(false);
          notify("Demo workspace loaded", "success");
        }}
        existingCount={royal.employees.length}
        existingNics={royal.employees.map((e) => e.nic)}
        defaultRate={royal.payrollRates.weekday}
      />

      <DaySheet
        open={!!dayTarget}
        onClose={() => setDayTarget(null)}
        employee={daySheetData.emp}
        day={daySheetData.day}
        attendance={royal.attendance}
        payrollRates={royal.payrollRates}
        bonusDays={royal.bonusDays}
        workingDays={
          dayTarget
            ? (d.monthRows.find((r) => r.emp.id === dayTarget.empId)?.workingDays ?? 0)
            : 0
        }
        onApply={setExplicit}
      />

      {/* ══ first-run banner ════════════════════════════════════════ */}
      {royal.employees.length === 0 && store.source === "fresh" && (
        <FirstRun
          onDemo={() => {
            store.loadDemo();
            notify("Demo workspace loaded", "success");
          }}
          onAdd={() => setAddOpen(true)}
        />
      )}

      {store.source === "backup_restored" && (
        <Banner
          tone="warn"
          icon={<TriangleAlert className="h-4 w-4" />}
          text="Primary storage was missing — your data was restored from the backup key automatically."
        />
      )}
      {store.source === "legacy_migrated" && (
        <Banner
          tone="info"
          icon={<Sparkles className="h-4 w-4" />}
          text="Legacy Royal Hires data detected and migrated into the new vault."
        />
      )}

      <BottomNav
        items={ROYAL_TABS.map((t) => ({
          id: t.id,
          label: t.label,
          icon: t.icon,
          badge: t.id === "payroll" && d.bonusEligible > 0 ? d.bonusEligible : undefined,
        }))}
        active={tab}
        onChange={(id) => {
          setTab(id as RoyalTab);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        tone="gold"
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Banners
 * ═════════════════════════════════════════════════════════════════════ */

function Banner({
  tone,
  icon,
  text,
}: {
  tone: "info" | "warn";
  icon: React.ReactNode;
  text: string;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-3 pt-3">
      <div
        className={cn(
          "pointer-events-auto flex w-full max-w-[560px] items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-[11.5px] font-semibold shadow-lift backdrop-blur-xl",
          tone === "warn"
            ? "border-gold-500/35 bg-[#241d0c]/95 text-gold-100"
            : "border-jade-500/32 bg-[#0d2417]/95 text-jade-100",
        )}
      >
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 leading-snug">{text}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-current/60 transition hover:bg-white/10 hover:text-current"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function FirstRun({ onDemo, onAdd }: { onDemo: () => void; onAdd: () => void }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      eyebrow="Welcome"
      title="Start your payroll workspace"
      subtitle="Empire ML keeps both modules in one vault on this device. Nothing leaves your browser."
      size="md"
    >
      <div className="space-y-3 pt-1">
        <ul className="space-y-2">
          {[
            ["Attendance", "Tap-to-cycle day / night / both marking, with Poya and weekend rules built in"],
            ["Payroll", "Month, week or custom ranges — bonus at 21+ distinct working days"],
            ["Invoicing", "Labour invoice & bonus sheet with auto-derived OT quantities"],
            ["Exports", "PDF, PNG, XLSX, CSV and a full JSON backup"],
          ].map(([t, s]) => (
            <li key={t} className="flex gap-3 rounded-xl border border-white/[0.06] bg-ink-900/50 p-3">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-bold text-ink-50">{t}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-400">{s}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="grid gap-2 pt-1">
          <button type="button" className="btn-gold h-12 w-full" onClick={onDemo}>
            <Sparkles className="h-4 w-4" />
            Load demo workspace
          </button>
          <button type="button" className="btn-outline h-12 w-full" onClick={onAdd}>
            <Users className="h-4 w-4" />
            Start blank · add my first employee
          </button>
        </div>
      </div>
    </Sheet>
  );
}
