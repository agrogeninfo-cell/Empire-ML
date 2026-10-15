import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, RotateCcw, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/* ═══════════════════════════════════════════════════════════════════════
 * Toasts — with optional Undo action (the source artefact's `nn()` helper)
 * ═════════════════════════════════════════════════════════════════════ */

export type ToastTone = "info" | "success" | "warn" | "error";

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastItem extends Required<Pick<ToastInput, "message" | "tone" | "duration">> {
  id: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastApi {
  push: (t: ToastInput | string) => void;
  success: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => void;
  error: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => void;
  warn: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => void;
  info: (message: string, opts?: Omit<ToastInput, "message" | "tone">) => void;
  dismiss: (id: number) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLES: Record<ToastTone, { wrap: string; icon: ReactNode }> = {
  info: {
    wrap: "border-white/12 bg-ink-800/95 text-ink-50",
    icon: <Info className="h-4 w-4 text-gold-400" />,
  },
  success: {
    wrap: "border-jade-500/35 bg-jade-900/92 text-jade-50",
    icon: <CheckCircle2 className="h-4 w-4 text-jade-300" />,
  },
  warn: {
    wrap: "border-gold-500/40 bg-[#2a2110]/95 text-gold-100",
    icon: <AlertTriangle className="h-4 w-4 text-gold-400" />,
  },
  error: {
    wrap: "border-danger/40 bg-[#2a1414]/95 text-red-50",
    icon: <XCircle className="h-4 w-4 text-danger-soft" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback<ToastApi["push"]>(
    (input) => {
      const t: ToastInput = typeof input === "string" ? { message: input } : input;
      const id = ++seq.current;
      const item: ToastItem = {
        id,
        message: t.message,
        tone: t.tone ?? "info",
        duration: t.duration ?? 3200,
        actionLabel: t.actionLabel,
        onAction: t.onAction,
      };
      setItems((cur) => [...cur.slice(-2), item]);
      if (item.duration > 0) {
        const handle = window.setTimeout(() => dismiss(id), item.duration);
        timers.current.set(id, handle);
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((h) => window.clearTimeout(h));
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      dismiss,
      clear: () => setItems([]),
      success: (message, opts) => push({ ...opts, message, tone: "success" }),
      error: (message, opts) => push({ ...opts, message, tone: "error" }),
      warn: (message, opts) => push({ ...opts, message, tone: "warn" }),
      info: (message, opts) => push({ ...opts, message, tone: "info" }),
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex flex-col items-center gap-2 px-3"
        style={{ paddingBottom: "calc(var(--nav-h) + var(--safe-b) + 14px)" }}
        aria-live="polite"
        aria-atomic="false"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const tone = TONE_STYLES[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 26, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 14, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
                className={cn(
                  "pointer-events-auto flex w-full max-w-[520px] items-center gap-2.5 rounded-2xl border px-3.5 py-2.5",
                  "shadow-[0_18px_44px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl",
                  tone.wrap,
                )}
              >
                <span className="shrink-0">{tone.icon}</span>
                <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold leading-tight">
                  {t.message}
                </p>
                {t.actionLabel && t.onAction && (
                  <button
                    type="button"
                    onClick={() => {
                      t.onAction?.();
                      dismiss(t.id);
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/12 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition hover:bg-white/20 active:scale-95"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t.actionLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="shrink-0 rounded-lg p-1 opacity-55 transition hover:bg-white/10 hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
