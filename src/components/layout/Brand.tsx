import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, Check, ChevronsUpDown, Crown, Landmark, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { clockTime } from "@/lib/calendar";
import type { ModuleId } from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════
 * Brand mark + module switcher + save indicator
 * ═════════════════════════════════════════════════════════════════════ */

export const MODULES: {
  id: ModuleId;
  name: string;
  tagline: string;
  icon: typeof Crown;
  accent: string;
}[] = [
  {
    id: "royal",
    name: "Royal Hires",
    tagline: "Payroll · Bonus · Invoice",
    icon: Crown,
    accent: "text-gold-400",
  },
  {
    id: "estate",
    name: "Millennium Estate",
    tagline: "Labour · 24–24 billing",
    icon: Landmark,
    accent: "text-jade-300",
  },
];

export function BrandMark({
  className,
  tone = "gold",
}: {
  className?: string;
  tone?: "gold" | "jade";
}) {
  return (
    <div
      className={cn(
        "relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl",
        tone === "gold" ? "bg-gold-sheen bg-[length:200%_100%] shadow-gold" : "bg-jade-sheen shadow-jade",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-white/35 to-transparent opacity-60"
      />
      <span className="display relative text-[19px] font-bold leading-none text-ink-950">E</span>
    </div>
  );
}

export function SaveDot({
  saving,
  lastSaved,
  className,
}: {
  saving: boolean;
  lastSaved: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-ink-900/70 px-2.5 py-1.5 backdrop-blur-xl",
        className,
      )}
      title={saving ? "Saving…" : `Saved ${clockTime(lastSaved)}`}
    >
      <span className="relative flex h-2 w-2">
        {saving && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-70" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            saving ? "bg-gold-400" : "bg-jade-500",
          )}
        />
      </span>
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-300">
        {saving ? "Saving" : "Saved"}
      </span>
    </div>
  );
}

export function ModuleSwitch({
  value,
  onChange,
}: {
  value: ModuleId;
  onChange: (m: ModuleId) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = MODULES.find((m) => m.id === value) ?? MODULES[0];
  const Icon = current.icon;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "group flex items-center gap-2 rounded-full border border-white/[0.09] bg-ink-900/72 py-1.5 pl-2 pr-2.5 backdrop-blur-xl transition",
          "hover:border-gold-500/35 hover:bg-ink-850 active:scale-[0.97]",
        )}
      >
        <span
          className={cn(
            "grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-white/[0.05]",
            current.accent,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="hidden text-left leading-none sm:block">
          <span className="block text-[11.5px] font-bold text-ink-100">{current.name}</span>
          <span className="mt-0.5 block text-[9px] uppercase tracking-[0.1em] text-ink-400">
            {current.tagline}
          </span>
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-ink-400 transition group-hover:text-gold-300" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-label="Close module menu"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
            />
            <motion.ul
              role="listbox"
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-0 top-[calc(100%+8px)] z-50 w-[262px] overflow-hidden rounded-2xl border border-white/[0.09] bg-ink-850/97 p-1.5 shadow-[0_28px_70px_-24px_rgba(0,0,0,0.95)] backdrop-blur-2xl"
            >
              <li className="eyebrow px-2.5 pb-1.5 pt-2">Workspace</li>
              {MODULES.map((m) => {
                const on = m.id === value;
                const MIcon = m.icon;
                return (
                  <li key={m.id} role="option" aria-selected={on}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(m.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition",
                        on ? "bg-white/[0.07]" : "hover:bg-white/[0.045]",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.08]",
                          on ? "bg-white/[0.09]" : "bg-white/[0.035]",
                          m.accent,
                        )}
                      >
                        <MIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-ink-50">
                          {m.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[10.5px] text-ink-400">
                          {m.tagline}
                        </span>
                      </span>
                      {on && <Check className="h-4 w-4 shrink-0 text-gold-400" />}
                    </button>
                  </li>
                );
              })}
              <li className="mt-1 flex items-center gap-2 border-t border-white/[0.07] px-2.5 py-2 text-[10.5px] text-ink-400">
                <Sparkles className="h-3 w-3 text-gold-500" />
                Both modules share one encrypted-at-rest local vault
              </li>
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ModuleGlyph({ id, className }: { id: ModuleId; className?: string }) {
  const Icon = id === "royal" ? Crown : Building2;
  return <Icon className={cn("h-4 w-4", className)} />;
}
