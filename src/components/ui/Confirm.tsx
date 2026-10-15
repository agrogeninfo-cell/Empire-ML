import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Sheet } from "./Sheet";
import { cn } from "@/lib/cn";

/* ═══════════════════════════════════════════════════════════════════════
 * Confirm — two-step destructive flow lifted from the source artefact:
 *   step 1 → warning + "Yes, Continue"
 *   step 2 → type DELETE to unlock the button
 * ═════════════════════════════════════════════════════════════════════ */

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  /** shown on the first step */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** require typing this exact string on step 2; omit to skip step 2 */
  requireText?: string;
  requirePrompt?: ReactNode;
  stats?: ReactNode;
  tone?: "danger" | "gold";
}

export function Confirm({
  open,
  onClose,
  onConfirm,
  title = "Are you absolutely sure?",
  body,
  confirmLabel = "Yes, continue",
  cancelLabel = "Cancel",
  requireText,
  requirePrompt,
  stats,
  tone = "danger",
}: ConfirmProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) {
      setStep(1);
      setTyped("");
    }
  }, [open]);

  const danger = tone === "danger";
  const unlocked = !requireText || typed === requireText;

  const close = () => {
    setStep(1);
    setTyped("");
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      bare
      ariaLabel={title}
      size="sm"
      className={cn(
        "border",
        danger ? "border-danger/28" : "border-gold-500/28",
      )}
      bodyClassName="px-5 pt-5"
    >
        {step === 1 ? (
          <motion.div
            key="s1"
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className={cn(
                "grid h-12 w-12 place-items-center rounded-2xl border",
                danger
                  ? "border-danger/22 bg-danger/12 text-danger-soft"
                  : "border-gold-500/22 bg-gold-500/12 text-gold-300",
              )}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-[18px] font-bold leading-snug text-ink-50">{title}</h3>
            {body && (
              <div className="mt-2 text-[13px] leading-relaxed text-ink-300">{body}</div>
            )}
            {stats && <div className="mt-4">{stats}</div>}

            <div className="mt-6 flex gap-2">
              <button type="button" onClick={close} className="btn-outline h-12 flex-1">
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => (requireText ? setStep(2) : onConfirm())}
                className={cn("h-12 flex-1", danger ? "btn-danger" : "btn-gold")}
              >
                {requireText ? "Yes, continue" : confirmLabel}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="s2"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
          >
            <h3 className="text-[16px] font-bold text-ink-50">
              Type{" "}
              <span className={cn("font-mono font-bold", danger ? "text-danger-soft" : "text-gold-300")}>
                {requireText}
              </span>{" "}
              to confirm
            </h3>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-300">
              {requirePrompt ?? "This guard prevents an accidental, irreversible action."}
            </p>

            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireText}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className={cn(
                "field mt-4 font-mono tracking-[0.18em]",
                danger && "border-danger/30 focus:border-danger focus:ring-danger/12",
              )}
            />
            {stats && <div className="mt-3">{stats}</div>}

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setTyped("");
                }}
                className="btn-outline h-12 flex-1"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!unlocked}
                onClick={() => {
                  if (!unlocked) return;
                  close();
                  onConfirm();
                }}
                className={cn(
                  "h-12 flex-1 font-bold",
                  unlocked ? "btn-danger" : "btn cursor-not-allowed border border-white/[0.06] bg-ink-800 text-ink-400",
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        )}
    </Sheet>
  );
}

export default Confirm;
