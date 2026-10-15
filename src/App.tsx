import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { StoreProvider, useStore } from "@/store/AppStore";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { TopBar } from "@/components/layout/Nav";
import { BrandMark, ModuleSwitch, SaveDot } from "@/components/layout/Brand";
import { RoyalModule } from "@/modules/royal/RoyalModule";
import { EstateModule } from "@/modules/estate/EstateModule";
import { cn } from "@/lib/cn";

/* ═══════════════════════════════════════════════════════════════════════
 * App shell — ambient backdrop, top bar, module switcher, active module
 * ═════════════════════════════════════════════════════════════════════ */

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  );
}

function Shell() {
  const store = useStore();
  const toast = useToast();
  const [booted, setBooted] = useState(false);

  // Let the ambient layer paint before the first tab animates in.
  useEffect(() => {
    const t = window.setTimeout(() => setBooted(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (store.source === "backup_restored") {
      toast.push({
        message: "Data restored from the backup key automatically",
        tone: "warn",
        duration: 6000,
      });
    } else if (store.source === "legacy_migrated") {
      toast.push({
        message: "Legacy data migrated into the new vault",
        tone: "info",
        duration: 5000,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isRoyal = store.module === "royal";

  return (
    <div className="relative min-h-dvh lg:pl-[84px]">
      <div className="ambient" aria-hidden />

      <TopBar
        left={
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark tone={isRoyal ? "gold" : "jade"} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-[14.5px] font-extrabold leading-none tracking-tight text-ink-50">
                  Empire ML
                </h1>
                <span className="hidden rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-px text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink-400 sm:inline">
                  Suite
                </span>
              </div>
              <p className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-ink-400">
                {isRoyal ? "Payroll · Bonus · Invoice" : "Estate Labour · 24–24"}
              </p>
            </div>
          </div>
        }
        right={
          <>
            <UndoButton />
            <SaveDot saving={store.saving} lastSaved={store.lastSaved} className="hidden sm:flex" />
            <ModuleSwitch value={store.module} onChange={store.setModule} />
          </>
        }
      />

      {!store.storageOk && <StorageWarning />}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={store.module}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: booted ? 1 : 0, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={cn("pb-nav", store.module === "royal" ? "" : "")}
        >
          {isRoyal ? <RoyalModule /> : <EstateModule />}
        </motion.div>
      </AnimatePresence>

      <footer
        className="no-print mx-auto max-w-[1180px] px-4 pb-6 pt-2 md:px-6 lg:px-8"
        style={{ paddingBottom: "calc(1.5rem + var(--safe-b))" }}
      >
        <div className="rule-gold mb-4" />
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-ink-500">
          <span>
            Empire ML · both modules in one local vault · nothing leaves this device
          </span>
          <span className="tnum">
            {store.meta.dataSizeKB} KB stored · {store.meta.employeeCount} staff ·{" "}
            {store.meta.recordCount + store.meta.estateRecordCount} records
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * Top-bar bits
 * ═════════════════════════════════════════════════════════════════════ */

function UndoButton() {
  const store = useStore();
  const toast = useToast();

  if (!store.canUndo) return null;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      type="button"
      onClick={() => {
        const ok = store.undo();
        toast.push({
          message: ok ? "Reverted the last change" : "Nothing left to undo",
          tone: ok ? "success" : "info",
        });
      }}
      className="flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-ink-900/70 px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-200 backdrop-blur-xl transition hover:border-gold-500/40 hover:text-gold-200 active:scale-95"
      title="Undo the last change"
    >
      <RotateCcw className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Undo</span>
    </motion.button>
  );
}

function StorageWarning() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="no-print mx-auto max-w-[1180px] px-4 pt-3 md:px-6 lg:px-8">
      <div className="flex items-start gap-2.5 rounded-2xl border border-danger/30 bg-danger/10 px-3.5 py-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger-soft" />
        <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-red-100/90">
          Local storage is blocked in this browser context. Your work will be lost on reload —
          export a backup JSON from Settings before closing the tab.
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Dismiss storage warning"
          className="shrink-0 rounded-md px-1.5 py-0.5 text-red-100/60 transition hover:bg-white/10 hover:text-red-50"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
