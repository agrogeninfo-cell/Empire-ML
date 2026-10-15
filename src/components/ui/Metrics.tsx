import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

/* ═══════════════════════════════════════════════════════════════════════
 * Metric primitives — the "sales card" pattern from the Millennium
 * artefact, rebuilt with a premium glass + sheen treatment.
 * ═════════════════════════════════════════════════════════════════════ */

export type MetricTone = "gold" | "jade" | "sky" | "danger" | "neutral";

const TONE: Record<
  MetricTone,
  { glow: string; bar: string; text: string; ring: string }
> = {
  gold: {
    glow: "radial-gradient(circle at 78% -10%, rgba(212,175,55,0.26), transparent 62%)",
    bar: "bg-gold-sheen bg-[length:200%_100%]",
    text: "text-gold-300",
    ring: "stroke-gold-500",
  },
  jade: {
    glow: "radial-gradient(circle at 78% -10%, rgba(34,179,74,0.24), transparent 62%)",
    bar: "bg-jade-sheen",
    text: "text-jade-300",
    ring: "stroke-jade-500",
  },
  sky: {
    glow: "radial-gradient(circle at 78% -10%, rgba(59,130,246,0.24), transparent 62%)",
    bar: "bg-gradient-to-r from-sky2 to-[#7fb0ff]",
    text: "text-[#8ec1ff]",
    ring: "stroke-sky2",
  },
  danger: {
    glow: "radial-gradient(circle at 78% -10%, rgba(255,59,59,0.22), transparent 62%)",
    bar: "bg-gradient-to-r from-danger-deep to-danger-soft",
    text: "text-danger-soft",
    ring: "stroke-danger",
  },
  neutral: {
    glow: "radial-gradient(circle at 78% -10%, rgba(255,255,255,0.1), transparent 62%)",
    bar: "bg-gradient-to-r from-ink-400 to-ink-200",
    text: "text-ink-200",
    ring: "stroke-ink-300",
  },
};

interface MetricCardProps {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  /** 0–100 fill of the meter */
  fill?: number;
  delta?: string;
  deltaDir?: "up" | "down" | "flat";
  sub?: ReactNode;
  tone?: MetricTone;
  className?: string;
  onClick?: () => void;
  delay?: number;
}

export function MetricCard({
  label,
  value,
  icon,
  fill,
  delta,
  deltaDir = "flat",
  sub,
  tone = "gold",
  className,
  onClick,
  delay = 0,
}: MetricCardProps) {
  const t = TONE[tone];
  const Tag = onClick ? motion.button : motion.div;
  const pct = Math.min(100, Math.max(0, fill ?? 0));

  return (
    <Tag
      {...(onClick ? { whileTap: { scale: 0.975 }, onClick } : {})}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: delay / 1000, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative isolate overflow-hidden rounded-2xl border border-white/[0.075]",
        "bg-ink-850/90 p-4 text-left shadow-lift backdrop-blur-xl transition-colors",
        onClick && "cursor-pointer hover:border-white/16",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-90 transition-opacity duration-500 group-hover:opacity-100"
        style={{ backgroundImage: t.glow }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-white/22 to-transparent"
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon && (
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-[13px]",
                t.text,
              )}
            >
              {icon}
            </span>
          )}
          <span className="eyebrow truncate">{label}</span>
        </div>
        {delta && <DeltaBadge value={delta} dir={deltaDir} tone={tone} />}
      </div>

      <div className="tnum mt-3 truncate text-[26px] font-bold leading-none tracking-tight text-ink-50">
        {value}
      </div>

      {sub && <div className="mt-1.5 text-[11px] leading-snug text-ink-400">{sub}</div>}

      {fill !== undefined && (
        <div className="mt-3.5 h-[5px] w-full overflow-hidden rounded-full bg-white/[0.07]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(3, pct)}%` }}
            transition={{ duration: 0.85, delay: delay / 1000 + 0.1, ease: [0.22, 1, 0.36, 1] }}
            className={cn("h-full rounded-full", t.bar)}
          />
        </div>
      )}
    </Tag>
  );
}

export function DeltaBadge({
  value,
  dir = "flat",
  tone = "neutral",
  className,
}: {
  value: ReactNode;
  dir?: "up" | "down" | "flat";
  tone?: MetricTone;
  className?: string;
}) {
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  const good = dir === "up";
  return (
    <span
      className={cn(
        "tnum inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold",
        dir === "flat"
          ? "border-white/10 bg-white/[0.04] text-ink-300"
          : good
            ? "border-jade-500/30 bg-jade-600/14 text-jade-200"
            : "border-danger/28 bg-danger/12 text-danger-soft",
        tone === "gold" && dir === "up" && "border-gold-500/32 bg-gold-500/12 text-gold-200",
        className,
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2.6} />
      {value}
    </span>
  );
}

/* ── Progress ring ────────────────────────────────────────────────────── */

export function ProgressRing({
  value,
  size = 46,
  stroke = 4,
  tone = "gold",
  label,
  sublabel,
  className,
}: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  tone?: MetricTone;
  label?: ReactNode;
  sublabel?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  const t = TONE[tone];

  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className={t.ring}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <div className="tnum text-[12px] font-bold text-ink-50">{label}</div>
          {sublabel && <div className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-wider text-ink-400">{sublabel}</div>}
        </div>
      </div>
    </div>
  );
}

/* ── Horizontal meter ─────────────────────────────────────────────────── */

export function Meter({
  value,
  tone = "gold",
  className,
  height = 6,
}: {
  value: number; // 0..1
  tone?: MetricTone;
  className?: string;
  height?: number;
}) {
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-white/[0.07]", className)}
      style={{ height }}
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className={cn("h-full rounded-full", TONE[tone].bar)}
      />
    </div>
  );
}

/* ── Section heading ──────────────────────────────────────────────────── */

export function SectionHead({
  eyebrow,
  title,
  sub,
  right,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow-gold mb-1.5">{eyebrow}</div>}
        <h2 className="display truncate text-[26px] leading-none text-ink-50">{title}</h2>
        {sub && <p className="mt-2 text-[12.5px] leading-relaxed text-ink-300">{sub}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/* ── Key/value row ────────────────────────────────────────────────────── */

export function Row({
  label,
  value,
  tone,
  strong,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "gold" | "jade" | "danger";
  strong?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2.5",
        strong && "font-bold",
        className,
      )}
    >
      <span className={cn("min-w-0 text-[13px]", strong ? "text-ink-50" : "text-ink-300")}>
        {label}
      </span>
      <span
        className={cn(
          "tnum shrink-0 text-[13px] font-semibold",
          strong ? "text-[15px]" : "text-ink-50",
          tone === "gold" && "text-gold-300",
          tone === "jade" && "text-jade-300",
          tone === "danger" && "text-danger-soft",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.09] bg-ink-850/40 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-ink-300">
          {icon}
        </div>
      )}
      <h3 className="mt-4 text-[15px] font-bold text-ink-100">{title}</h3>
      {body && <p className="mt-1.5 max-w-[38ch] text-[12.5px] leading-relaxed text-ink-400">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ── Badge ────────────────────────────────────────────────────────────── */

export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: "neutral" | "gold" | "jade" | "sky" | "danger";
  className?: string;
  dot?: boolean;
}) {
  const tones: Record<string, string> = {
    neutral: "border-white/10 bg-white/[0.05] text-ink-300",
    gold: "border-gold-500/32 bg-gold-500/12 text-gold-200",
    jade: "border-jade-500/32 bg-jade-600/16 text-jade-200",
    sky: "border-sky2/32 bg-sky2/14 text-[#a5cbff]",
    danger: "border-danger/30 bg-danger/12 text-danger-soft",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
