import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

/* ═══════════════════════════════════════════════════════════════════════
 * Segmented — sliding pill control used for view/range switching
 * ═════════════════════════════════════════════════════════════════════ */

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  hint?: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  tone?: "light" | "gold" | "jade";
  className?: string;
  ariaLabel?: string;
}

const TONE_ACTIVE: Record<NonNullable<SegmentedProps<string>["tone"]>, string> = {
  light: "bg-white text-ink-950 shadow-[0_6px_18px_-8px_rgba(255,255,255,0.5)]",
  gold: "bg-gold-sheen bg-[length:200%_100%] text-ink-950 shadow-gold",
  jade: "bg-jade-sheen text-white shadow-jade",
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  tone = "light",
  className,
  ariaLabel,
}: SegmentedProps<T>) {
  const uid = useId();
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("seg relative", className)}
      style={{ ["--seg-n" as string]: options.length }}
    >
      <motion.span
        layoutId={`${uid}-pill`}
        className={cn(
          "absolute inset-y-1 rounded-xl",
          TONE_ACTIVE[tone],
        )}
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          left: `calc(0.25rem + (100% - 0.5rem) * ${activeIndex} / ${options.length})`,
        }}
        transition={{ type: "spring", stiffness: 480, damping: 38, mass: 0.6 }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            data-active={active}
            className={cn(
              "seg-item relative z-10 flex items-center justify-center gap-1.5",
              size === "sm" && "py-2 text-[12px]",
              active && "font-bold",
            )}
          >
            {o.icon && <span className="shrink-0 [&>svg]:h-[15px] [&>svg]:w-[15px]">{o.icon}</span>}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;
