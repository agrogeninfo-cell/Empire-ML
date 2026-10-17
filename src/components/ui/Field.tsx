import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

/* ═══════════════════════════════════════════════════════════════════════
 * Form primitives — big touch targets, no number spinners, gold focus ring
 * ═════════════════════════════════════════════════════════════════════ */

interface BaseProps {
  label?: ReactNode;
  hint?: ReactNode;
  suffix?: ReactNode;
  prefix?: ReactNode;
  className?: string;
  wrapClassName?: string;
}

export function TextField({
  label,
  hint,
  prefix,
  suffix,
  className,
  wrapClassName,
  ...rest
}: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={cn("min-w-0", wrapClassName)}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      )}
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-ink-400">
            {prefix}
          </span>
        )}
        <input
          id={id}
          {...rest}
          className={cn("field", prefix && "pl-11", suffix && "pr-14", className)}
        />
        {suffix && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-ink-400">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-ink-400">{hint}</p>}
    </div>
  );
}

export function NumberField({
  label,
  hint,
  prefix = "Rs.",
  className,
  wrapClassName,
  ...rest
}: BaseProps & InputHTMLAttributes<HTMLInputElement> & { prefix?: ReactNode }) {
  const id = useId();
  return (
    <div className={cn("min-w-0", wrapClassName)}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      )}
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-ink-400">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          {...rest}
          className={cn(
            "field tnum",
            prefix && "pl-11",
            className,
          )}
        />
      </div>
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-ink-400">{hint}</p>}
    </div>
  );
}

interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  label?: ReactNode;
  suffix?: string;
  size?: "sm" | "md";
  className?: string;
}

/** −/+ stepper; the workhorse for counts, rates and day ranges. */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  label,
  suffix,
  size = "md",
  className,
}: StepperProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const round = (n: number) => {
    const dp = String(step).includes(".") ? String(step).split(".")[1].length : 0;
    return Number(clamp(n).toFixed(dp));
  };

  const btn =
    "grid place-items-center rounded-lg border border-white/10 bg-ink-800 text-ink-200 transition hover:border-gold-500/40 hover:text-gold-200 active:scale-90 disabled:opacity-35";

  return (
    <div className={cn("min-w-0", className)}>
      {label && <div className="field-label">{label}</div>}
      <div
        className={cn(
          "flex items-stretch gap-1.5 rounded-xl border border-white/[0.08] bg-ink-900/70 p-1.5",
          size === "sm" && "gap-1 p-1",
        )}
      >
        <button
          type="button"
          aria-label={`Decrease ${typeof label === "string" ? label : "value"}`}
          className={cn(btn, size === "sm" ? "h-8 w-8" : "h-10 w-10")}
          disabled={value <= min}
          onClick={() => onChange(round(value - step))}
        >
          <Minus className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>
        <div className="tnum flex min-w-0 flex-1 items-center justify-center gap-1 px-1 text-center">
          <span
            className={cn(
              "truncate font-bold text-ink-50",
              size === "sm" ? "text-[14px]" : "text-[17px]",
            )}
          >
            {Number.isFinite(value) ? round(value) : 0}
          </span>
          {suffix && <span className="text-[11px] font-semibold text-ink-400">{suffix}</span>}
        </div>
        <button
          type="button"
          aria-label={`Increase ${typeof label === "string" ? label : "value"}`}
          className={cn(btn, size === "sm" ? "h-8 w-8" : "h-10 w-10")}
          disabled={value >= max}
          onClick={() => onChange(round(value + step))}
        >
          <Plus className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>
      </div>
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
  tone?: "gold" | "jade" | "danger";
  className?: string;
  disabled?: boolean;
}

const SWITCH_ON: Record<NonNullable<SwitchProps["tone"]>, string> = {
  gold: "bg-gold-sheen bg-[length:200%_100%]",
  jade: "bg-jade-sheen",
  danger: "bg-danger",
};

export function Switch({
  checked,
  onChange,
  label,
  hint,
  tone = "gold",
  className,
  disabled,
}: SwitchProps) {
  const id = useId();
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      {(label || hint) && (
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          {label && <div className="text-[13px] font-semibold text-ink-100">{label}</div>}
          {hint && <div className="mt-0.5 text-[11px] leading-snug text-ink-400">{hint}</div>}
        </label>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[30px] w-[52px] shrink-0 rounded-full border transition-colors duration-300 disabled:opacity-40",
          checked
            ? cn("border-transparent", SWITCH_ON[tone])
            : "border-white/12 bg-ink-750",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-[22px] w-[22px] -translate-y-1/2 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-all duration-300",
            checked ? "left-[26px]" : "left-[4px] bg-ink-300",
          )}
        />
      </button>
    </div>
  );
}

interface SelectFieldProps extends BaseProps {
  value: string | number;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
  selectProps?: Omit<InputHTMLAttributes<HTMLSelectElement>, "onChange" | "value">;
}

export function SelectField({
  label,
  hint,
  value,
  onChange,
  options,
  className,
  wrapClassName,
}: SelectFieldProps) {
  const id = useId();
  return (
    <div className={cn("min-w-0", wrapClassName)}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("field appearance-none pr-9", className)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-ink-850 text-ink-50">
              {o.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 12 8"
          className="pointer-events-none absolute right-3.5 top-1/2 h-2 w-3 -translate-y-1/2 text-ink-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M1 1.5 6 6.5 11 1.5" />
        </svg>
      </div>
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-ink-400">{hint}</p>}
    </div>
  );
}
