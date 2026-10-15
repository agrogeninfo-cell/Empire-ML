import { useEffect, useRef, type RefObject } from "react";

/* ═══════════════════════════════════════════════════════════════════════
 * useDialogA11y — the keyboard half of a modal
 *
 * A bottom sheet that only responds to taps is not a dialog: `aria-modal`
 * tells assistive technology the background is inert, so focus has to
 * actually live inside the sheet. This hook gives every Sheet in the app the
 * same three behaviours:
 *
 *   1. focus moves in on open and back to the trigger on close
 *   2. Tab and Shift+Tab cycle inside the sheet instead of escaping to the
 *      page behind it
 *   3. Escape dismisses
 *
 * It is deliberately dependency-free and tolerant: anything missing — no
 * focusables, no `focus()`, a trigger that unmounted — degrades to "do
 * nothing" rather than throwing halfway through a payroll run.
 * ═════════════════════════════════════════════════════════════════════ */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function isReachable(el: Element): boolean {
  if (el.hasAttribute("disabled") || el.hasAttribute("hidden")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  return !el.classList.contains("hidden");
}

/** Every element inside `root` that a keyboard can actually land on. */
export function focusablesIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isReachable);
}

function safeFocus(el: HTMLElement | null): void {
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    try {
      el.focus();
    } catch {
      /* not focusable in this environment — leave focus where it is */
    }
  }
}

interface Options {
  open: boolean;
  onClose: () => void;
  /** the dialog element itself — focus is trapped inside it */
  dialogRef: RefObject<HTMLElement | null>;
}

export function useDialogA11y({ open, onClose, dialogRef }: Options): void {
  const restoreTo = useRef<Element | null>(null);

  /* ── focus in on open, focus back on close ─────────────────────────── */
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement;

    // One frame later, so React has committed the sheet (and any field that
    // asks for autoFocus itself, like the DELETE guard, wins).
    const raf = requestAnimationFrame(() => {
      const node = dialogRef.current;
      if (!node) return;
      const active = document.activeElement;
      if (active && active !== document.body && node.contains(active)) return;
      safeFocus(focusablesIn(node)[0] ?? node);
    });

    return () => {
      cancelAnimationFrame(raf);
      const el = restoreTo.current;
      restoreTo.current = null;
      if (el instanceof HTMLElement && el.isConnected) safeFocus(el);
    };
  }, [open, dialogRef]);

  /* ── Escape and the Tab cycle ──────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const node = dialogRef.current;
      const items = focusablesIn(node);
      if (items.length === 0) {
        e.preventDefault();
        safeFocus(node);
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      const first = items[0];
      const last = items[items.length - 1];

      if (!active || !node?.contains(active)) {
        e.preventDefault();
        safeFocus(first);
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        safeFocus(last);
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        safeFocus(first);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, dialogRef]);
}
