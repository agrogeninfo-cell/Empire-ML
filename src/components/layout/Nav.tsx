import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

/* ═══════════════════════════════════════════════════════════════════════
 * Navigation — a fixed bottom tab bar on phones and a vertical rail from
 * `lg:` up. Each renders its own sliding indicator and measures its own
 * buttons, because only one of them is ever laid out.
 * ═════════════════════════════════════════════════════════════════════ */

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: ReactNode;
}

interface NavProps {
  items: NavItem[];
  active: string;
  onChange: (id: string) => void;
  tone?: "gold" | "jade";
}

/** Tracks the bounding box of `[data-nav="<active>"]` inside `root`. */
function useActiveRect(root: React.RefObject<HTMLElement | null>, active: string, count: number) {
  const [rect, setRect] = useState({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const measure = () => {
      const target = el.querySelector<HTMLElement>(`[data-nav="${active}"]`);
      if (!target) return;
      const r = target.getBoundingClientRect();
      const p = el.getBoundingClientRect();
      // A `display:none` rail measures 0×0 — skip so the other nav keeps its pill.
      if (r.width === 0 && r.height === 0) return;
      setRect({ left: r.left - p.left, top: r.top - p.top, width: r.width, height: r.height });
    };

    measure();
    const raf = requestAnimationFrame(measure);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    const settle = window.setTimeout(measure, 140);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.clearTimeout(settle);
    };
  }, [root, active, count]);

  return rect;
}

const ACCENT: Record<NonNullable<NavProps["tone"]>, string> = {
  gold: "bg-gold-sheen bg-[length:200%_100%] shadow-gold",
  jade: "bg-jade-sheen shadow-jade",
};

export function BottomNav({ items, active, onChange, tone = "gold" }: NavProps) {
  return (
    <>
      <MobileBar items={items} active={active} onChange={onChange} tone={tone} />
      <DesktopRail items={items} active={active} onChange={onChange} tone={tone} />
    </>
  );
}

/* ── phones ───────────────────────────────────────────────────────────── */

function MobileBar({ items, active, onChange, tone }: NavProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const r = useActiveRect(railRef, active, items.length);

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{ paddingBottom: "var(--safe-b)" }}
      aria-label="Primary"
    >
      <div className="mx-auto max-w-[720px] px-2.5 pb-2">
        <div
          ref={railRef}
          className="relative flex items-stretch gap-1 rounded-[22px] border border-white/[0.08] bg-ink-900/88 p-1.5 shadow-[0_-10px_40px_-18px_rgba(0,0,0,0.95)] backdrop-blur-2xl"
        >
          {r.width > 0 && (
            <motion.span
              aria-hidden
              className={cn("pointer-events-none absolute inset-y-1.5 rounded-[16px]", ACCENT[tone ?? "gold"])}
              animate={{ left: r.left + 2, width: Math.max(0, r.width - 4) }}
              initial={false}
              transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
            />
          )}
          {items.map((it) => (
            <NavButton
              key={it.id}
              item={it}
              active={it.id === active}
              onClick={() => onChange(it.id)}
              className="h-[52px] min-w-0 flex-1 flex-col gap-[3px] rounded-[16px] px-1"
              labelClass="truncate text-[9.5px] font-bold uppercase tracking-[0.06em]"
            />
          ))}
        </div>
      </div>
    </nav>
  );
}

/* ── desktop ──────────────────────────────────────────────────────────── */

function DesktopRail({ items, active, onChange, tone }: NavProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const r = useActiveRect(railRef, active, items.length);

  return (
    <nav
      className="no-print fixed left-0 top-0 z-40 hidden h-dvh w-[84px] flex-col items-center border-r border-white/[0.06] bg-ink-900/70 py-5 backdrop-blur-2xl lg:flex"
      aria-label="Primary"
    >
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-gold-sheen bg-[length:200%_100%] font-serif text-[18px] font-bold text-ink-950 shadow-gold">
        E
      </div>
      <div ref={railRef} className="relative flex w-full flex-1 flex-col gap-1.5 px-2.5">
        {r.height > 0 && (
          <motion.span
            aria-hidden
            className={cn("pointer-events-none absolute rounded-[14px]", ACCENT[tone ?? "gold"])}
            animate={{ left: r.left + 4, top: r.top, width: r.width - 8, height: r.height }}
            initial={false}
            transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
          />
        )}
        {items.map((it) => (
          <NavButton
            key={it.id}
            item={it}
            active={it.id === active}
            onClick={() => onChange(it.id)}
            className="h-[58px] w-full flex-col gap-1 rounded-[14px]"
            labelClass="text-[9px] font-bold uppercase tracking-[0.05em]"
          />
        ))}
      </div>
    </nav>
  );
}

function NavButton({
  item,
  active,
  onClick,
  className,
  labelClass,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
  className?: string;
  labelClass?: string;
}) {
  return (
    <button
      data-nav={item.id}
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "relative z-10 flex items-center justify-center transition-colors",
        active ? "text-ink-950" : "text-ink-400 hover:bg-white/[0.05] hover:text-ink-100",
        className,
      )}
    >
      <span className={cn("[&>svg]:h-[18px] [&>svg]:w-[18px]", active && "scale-105")}>
        {item.icon}
      </span>
      <span className={labelClass}>{item.label}</span>
      {item.badge != null && (
        <span
          className={cn(
            "absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full",
            active ? "bg-ink-950/60" : "bg-gold-500",
          )}
        />
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Scroll-aware top bar
 * ═════════════════════════════════════════════════════════════════════ */

export function useScrolled(offset = 8): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [offset]);
  return scrolled;
}

export function TopBar({
  left,
  right,
  className,
}: {
  left: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  const scrolled = useScrolled();
  return (
    <header
      className={cn(
        "no-print sticky top-0 z-30 transition-all duration-300",
        scrolled
          ? "border-b border-white/[0.07] bg-ink-900/82 shadow-[0_10px_30px_-24px_rgba(0,0,0,1)] backdrop-blur-2xl"
          : "border-b border-transparent bg-transparent",
        className,
      )}
      style={{ paddingTop: "max(0.6rem, var(--safe-t))" }}
    >
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 pb-2.5 pt-1.5 md:px-6 lg:px-8">
        <div className="min-w-0">{left}</div>
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
      </div>
    </header>
  );
}

export default BottomNav;
