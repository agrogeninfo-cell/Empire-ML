import { useEffect, useState } from "react";
import { Check, UserRoundPlus, Users } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { NumberField, TextField } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { money } from "@/lib/calendar";
import { DEMO_EMPLOYEES } from "@/data/defaults";
import type { Deductions, Employee } from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════
 * AddStaffSheet — new employee with name, NIC, gender and opening
 * deductions. Offers a one-tap demo import when the roster is empty.
 * ═════════════════════════════════════════════════════════════════════ */

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (emp: Omit<Employee, "id">, ded: Deductions) => void;
  onLoadDemo: () => void;
  existingCount: number;
  existingNics: string[];
  defaultRate: number;
}

export function AddStaffSheet({
  open,
  onClose,
  onAdd,
  onLoadDemo,
  existingCount,
  existingNics,
  defaultRate,
}: Props) {
  const [name, setName] = useState("");
  const [nic, setNic] = useState("");
  const [isFemale, setIsFemale] = useState(false);
  const [rate, setRate] = useState(defaultRate);
  const [meal, setMeal] = useState(0);
  const [boarding, setBoarding] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setNic("");
      setIsFemale(false);
      setRate(defaultRate);
      setMeal(0);
      setBoarding(0);
      setAdvance(0);
      setTouched(false);
    }
  }, [open, defaultRate]);

  const nicDigits = nic.replace(/\D/g, "");
  const nicError =
    touched && nic.length > 0 && (nicDigits.length !== 10 && nicDigits.length !== 12)
      ? "Sri Lankan NICs are 10 or 12 digits"
      : touched && nic.length > 0 && existingNics.includes(nicDigits)
        ? "That NIC is already on the roster"
        : null;

  const canSubmit = name.trim().length > 1 && nicDigits.length >= 9 && !nicError;

  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;
    onAdd(
      { name: name.trim(), nic: nicDigits, rate, isFemale },
      { meal, boarding, advance },
    );
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow="Roster"
      title="Add staff"
      subtitle="They appear in Attendance, Payroll and the invoice roll-up immediately."
      size="md"
      footer={
        <div className="flex gap-2 pb-1">
          <button type="button" className="btn-outline h-12 flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={cn("h-12 flex-1", canSubmit ? "btn-gold" : "btn cursor-not-allowed bg-ink-700 text-ink-400")}
            onClick={submit}
          >
            <UserRoundPlus className="h-4 w-4" />
            Add employee
          </button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <TextField
          label="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Kamal Perera"
          autoFocus
          autoComplete="off"
        />

        <TextField
          label="NIC number"
          value={nic}
          onChange={(e) => setNic(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="199012345678"
          inputMode="numeric"
          autoComplete="off"
          className={cn("font-mono", nicError && "!border-danger/60 focus:!border-danger")}
          hint={
            nicError ? (
              <span className="text-danger-soft">{nicError}</span>
            ) : (
              "10 or 12 digits — used on payslips and the bonus sheet"
            )
          }
        />

        <div>
          <div className="field-label">Gender</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: false, label: "Male", glyph: "♂", hint: "No night allowance" },
              { v: true, label: "Female", glyph: "♀", hint: "Night allowance applies" },
            ].map((o) => {
              const on = isFemale === o.v;
              return (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => setIsFemale(o.v)}
                  className={cn(
                    "flex h-[62px] flex-col items-center justify-center gap-0.5 rounded-xl border transition active:scale-[0.97]",
                    on
                      ? o.v
                        ? "border-gold-500/55 bg-gold-500/12 text-gold-200"
                        : "border-white/25 bg-white/[0.08] text-ink-50"
                      : "border-white/[0.08] bg-ink-900/60 text-ink-400 hover:border-white/18",
                  )}
                  aria-pressed={on}
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-bold">
                    <span className="text-[15px]">{o.glyph}</span>
                    {o.label}
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="text-[10px] opacity-70">{o.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <NumberField
          label="Base rate per shift"
          hint="Reference rate stored on the record — payroll uses the rate table below"
          prefix="Rs."
          min={0}
          step={50}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value) || 0)}
        />

        <div>
          <div className="field-label">Opening deductions</div>
          <div className="grid grid-cols-3 gap-2">
            <NumberField
              label="Meal"
              prefix="Rs."
              min={0}
              step={50}
              value={meal}
              onChange={(e) => setMeal(Number(e.target.value) || 0)}
              className="!py-2.5 !text-[13px]"
            />
            <NumberField
              label="Boarding"
              prefix="Rs."
              min={0}
              step={50}
              value={boarding}
              onChange={(e) => setBoarding(Number(e.target.value) || 0)}
              className="!py-2.5 !text-[13px]"
            />
            <NumberField
              label="Advance"
              prefix="Rs."
              min={0}
              step={50}
              value={advance}
              onChange={(e) => setAdvance(Number(e.target.value) || 0)}
              className="!py-2.5 !text-[13px]"
            />
          </div>
        </div>

        {existingCount === 0 && (
          <div className="rounded-2xl border border-gold-500/22 bg-gold-500/[0.07] p-3.5">
            <div className="flex items-center gap-2 text-[12.5px] font-bold text-gold-200">
              <Users className="h-4 w-4" />
              Just exploring?
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-gold-100/70">
              Load the {DEMO_EMPLOYEES.length}-person demo roster with a full month of sample
              attendance to see payslips, bonuses and the invoice populate instantly.
            </p>
            <button type="button" className="btn-gold mt-3 h-10 w-full text-[12px]" onClick={onLoadDemo}>
              Load demo data · {DEMO_EMPLOYEES.length} staff
            </button>
          </div>
        )}

        <div className="rounded-xl border border-white/[0.06] bg-ink-900/60 px-3 py-2.5 text-[11px] text-ink-400">
          Preview ·{" "}
          <b className="text-ink-100">{name.trim() || "Unnamed"}</b>
          {isFemale && <span className="text-gold-300"> · female night allowance</span>} · base Rs{" "}
          {money(rate)} · opening deductions Rs {money(meal + boarding + advance)}
        </div>
      </div>
    </Sheet>
  );
}

export default AddStaffSheet;
