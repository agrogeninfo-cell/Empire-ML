import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { cn } from "@/lib/cn";

/* ═══════════════════════════════════════════════════════════════════════
 * Sheet — bottom-sheet on phones, centred dialog from `sm:` up.
 * Locks body scroll, closes on backdrop tap / Escape, and behaves like a
 * real modal for the keyboard: focus moves in, Tab cycles inside, focus
 * returns to whatever opened it (see useDialogA11y).
 * ═════════════════════════════════════════════════════════════════════ */

export type SheetSize = "sm" | "md" | "lg" | "xl" | "full";

const SIZES: Record<SheetSize, string> = {
  sm: "max-w-[400px]",
  md: "max-w-[460px]",
  lg: "max-w-[560px]",
  xl: "max-w-[720px]",
  full: "max-w-[1000px]",
};

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: SheetSize;
  /** hide the built-in close button */
  bare?: boolean;
  /** accessible name for a `bare` sheet, which has no visible title */
  ariaLabel?: string;
  className?: string;
  bodyClassName?: string;
}

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  children,
  footer,
  size = "md",
  bare = false,
  ariaLabel,
  className,
  bodyClassName,
}: SheetProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useDialogA11y({ open, onClose, dialogRef });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
          <motion.button
            type="button"
            aria-label="Close dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/72 backdrop-blur-[6px]"
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : ariaLabel}
            initial={{ y: "100%", opacity: 0.6, scale: 0.99 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "100%", opacity: 0, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 340, damping: 34, mass: 0.85 }}
            className={cn(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden",
              "rounded-t-[28px] border border-white/[0.09] bg-ink-850 shadow-sheet",
              "sm:rounded-[26px] sm:shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)]",
              SIZES[size],
              className,
            )}
          >
            {/* grab handle — phones only */}
            <div className="flex justify-center pt-2.5 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-white/18" />
            </div>

            {(title || eyebrow || !bare) && (
              <header className="relative flex items-start gap-3 px-5 pb-3 pt-4">
                <div className="min-w-0 flex-1">
                  {eyebrow && (
                    <div className="eyebrow-gold mb-1.5">
                      {typeof eyebrow === "string" ? eyebrow : eyebrow}
                    </div>
                  )}
                  {title && (
                    <h2
                      id={titleId}
                      className="display truncate text-[22px] leading-tight text-ink-50"
                    >
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-300">{subtitle}</p>
                  )}
                </div>
                {!bare && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-ink-200 transition hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-92"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </header>
            )}

            <div
              className={cn(
                "scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5",
                bodyClassName,
              )}
            >
              {children}
            </div>

            {footer && (
              <footer
                className="border-t border-white/[0.07] bg-ink-900/70 px-5 pt-3 backdrop-blur-xl"
                style={{ paddingBottom: "calc(0.75rem + var(--safe-b))" }}
              >
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default Sheet;
