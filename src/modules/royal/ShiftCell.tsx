import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { markKind, type MarkKind } from "@/lib/payroll";
import type { DayInfo, DayMark } from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════
 * ShiftCell — one tappable attendance cell.
 *   ∅   → muted dash
 *   D   → jade (☀ day shift)
 *   N   → obsidian + gold ring (🌙 night shift)
 *   D+N → diagonal jade/obsidian split with a gold ring
 * ═════════════════════════════════════════════════════════════════════ */

export const KIND_STYLE: Record<
  MarkKind,
  { wrap: string; text: string; glyph: string; short: string }
> = {
  OFF: {
    wrap: "border-white/[0.07] bg-ink-800/80",
    text: "text-ink-500",
    glyph: "·",
    short: "—",
  },
  D: {
    wrap: "border-jade-500/55 bg-jade-600 text-white shadow-jade",
    text: "text-white",
    glyph: "☀",
    short: "D",
  },
  N: {
    wrap: "border-gold-500/60 bg-ink-950 text-gold-400",
    text: "text-gold-400",
    glyph: "☾",
    short: "N",
  },
  BOTH: {
    wrap: "split-dn border-gold-500/70 text-white shadow-[0_0_0_1px_rgba(212,175,55,0.28)]",
    text: "text-white",
    glyph: "◑",
    short: "D+N",
  },
};

export const DAY_TONE: Record<DayInfo["tone"], string> = {
  poya: "text-danger-soft",
  sunday: "text-danger-soft",
  saturday: "text-[#8ec1ff]",
  weekday: "text-ink-400",
};

interface ShiftCellProps {
  mark: DayMark | undefined;
  info?: DayInfo;
  day?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
  size?: "xs" | "sm" | "md";
  showDay?: boolean;
  className?: string;
  disabled?: boolean;
  highlight?: boolean;
}

const SIZE: Record<NonNullable<ShiftCellProps["size"]>, string> = {
  xs: "h-7 w-7 text-[9px] rounded-[7px]",
  sm: "h-9 w-9 text-[10px] rounded-[9px]",
  md: "h-11 w-11 text-[12px] rounded-[11px]",
};

export function ShiftCell({
  mark,
  onClick,
  onDoubleClick,
  size = "sm",
  showDay = false,
  day,
  className,
  disabled,
  highlight,
}: ShiftCellProps) {
  const kind = markKind(mark);
  const style = KIND_STYLE[kind];
  const interactive = !!onClick && !disabled;

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      whileTap={interactive ? { scale: 0.86 } : undefined}
      animate={highlight ? { scale: [1, 1.14, 1] } : { scale: 1 }}
      transition={{ duration: highlight ? 0.36 : 0.14 }}
      aria-label={`${showDay && day ? `Day ${day}: ` : ""}${kind}`}
      aria-pressed={kind !== "OFF"}
      className={cn(
        "relative grid shrink-0 place-items-center border font-bold transition-colors duration-200",
        SIZE[size],
        style.wrap,
        interactive && "cursor-pointer hover:brightness-115 active:brightness-95",
        !interactive && "cursor-default",
        className,
      )}
    >
      {kind === "BOTH" ? (
        <span className="relative z-10 flex items-center leading-none">
          <span className="text-[0.78em]">D</span>
          <span className="text-[0.78em] text-gold-400">N</span>
        </span>
      ) : (
        <span className="relative z-10 leading-none">{style.glyph}</span>
      )}
    </motion.button>
  );
}

/** Column header for the grid: day number + type initial. */
export function DayHeaderCell({
  day,
  dow,
  info,
  active,
  className,
}: {
  day: number;
  dow: string;
  info: DayInfo;
  active?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-[46px] w-[42px] shrink-0 flex-col items-center justify-center gap-0.5 border-b border-white/[0.07] px-1",
        active && "bg-gold-500/[0.09]",
        className,
      )}
    >
      <span
        className={cn(
          "tnum text-[12.5px] font-bold leading-none",
          info.type === "weekday" ? "text-ink-100" : DAY_TONE[info.tone],
        )}
      >
        {day}
      </span>
      <span
        className={cn(
          "text-[8px] font-bold uppercase leading-none tracking-[0.06em]",
          info.type === "poya"
            ? "text-danger-soft"
            : info.type === "sunday"
              ? "text-danger-soft/80"
              : info.type === "saturday"
                ? "text-[#7fb0ff]"
                : "text-ink-500",
        )}
      >
        {info.type === "poya" ? "Poya" : dow}
      </span>
    </div>
  );
}

export default ShiftCell;
