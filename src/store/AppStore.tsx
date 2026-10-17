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
import {
  DATA_VERSION,
  autoBackupDue,
  autoBackupEnabled,
  downloadJson,
  hydrateAppData,
  loadAppData,
  markAutoBackup,
  readBackup,
  readMeta,
  saveAppData,
  setAutoBackupEnabled,
  wipeStorage,
  type StorageMeta,
} from "@/lib/storage";
import { blankAppData, demoAppData } from "@/data/defaults";
import { countRecords } from "@/lib/payroll";
import type { AppData, DataSource, EstateState, ModuleId, RoyalState } from "@/lib/types";

/* ═══════════════════════════════════════════════════════════════════════
 * Global store — single source of truth for both modules, with an undo
 * stack, debounced dual-key autosave and weekly JSON auto-backup.
 * ═════════════════════════════════════════════════════════════════════ */

const UNDO_LIMIT = 24;
const AUTOSAVE_MS = 700;

export interface StoreValue {
  data: AppData;
  royal: RoyalState;
  estate: EstateState;
  module: ModuleId;
  source: DataSource;
  saving: boolean;
  lastSaved: string | null;
  meta: StorageMeta;
  canUndo: boolean;
  storageOk: boolean;

  setModule: (m: ModuleId) => void;
  /** functional update — pushes an undo snapshot */
  update: (recipe: (draft: AppData) => AppData, opts?: { undoable?: boolean }) => void;
  updateRoyal: (recipe: (r: RoyalState) => RoyalState, opts?: { undoable?: boolean }) => void;
  updateEstate: (recipe: (e: EstateState) => EstateState, opts?: { undoable?: boolean }) => void;
  undo: () => boolean;

  loadDemo: () => void;
  resetAll: () => void;
  exportBackup: () => void;
  importBackup: (file: File) => Promise<{ ok: boolean; message: string }>;
  restoreBackup: () => { ok: boolean; message: string };
  setAutoBackup: (v: boolean) => void;
  autoBackup: boolean;
  saveNow: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function emptyMeta(): StorageMeta {
  return {
    lastBackupTime: null,
    dataSize: 0,
    dataSizeKB: "0",
    employeeCount: 0,
    recordCount: 0,
    estateRecordCount: 0,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const boot = useMemo(() => loadAppData(), []);

  const [data, setData] = useState<AppData>(boot.data);
  const [source] = useState<DataSource>(boot.source);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(readMeta()?.lastBackupTime ?? null);
  const [meta, setMeta] = useState<StorageMeta>(() => readMeta() ?? emptyMeta());
  const [autoBackupOn, setAutoBackupOn] = useState<boolean>(() => autoBackupEnabled());
  const [storageOk] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && !!window.localStorage;
    } catch {
      return false;
    }
  });

  const undoStack = useRef<AppData[]>([]);
  const lastJson = useRef<string>("");
  const timer = useRef<number | null>(null);
  const [undoDepth, setUndoDepth] = useState(0);

  /* ── undo ─────────────────────────────────────────────────────────── */
  const pushUndo = useCallback((snapshot: AppData) => {
    undoStack.current = [...undoStack.current.slice(-(UNDO_LIMIT - 1)), snapshot];
    setUndoDepth(undoStack.current.length);
  }, []);

  const undo = useCallback((): boolean => {
    const prev = undoStack.current.pop();
    setUndoDepth(undoStack.current.length);
    if (!prev) return false;
    setData(prev);
    return true;
  }, []);

  /* ── updaters ─────────────────────────────────────────────────────── */
  const update = useCallback<StoreValue["update"]>(
    (recipe, opts) => {
      setData((current) => {
        const next = recipe(current);
        if (next === current) return current;
        if (opts?.undoable !== false) pushUndo(current);
        return next;
      });
    },
    [pushUndo],
  );

  const updateRoyal = useCallback<StoreValue["updateRoyal"]>(
    (recipe, opts) =>
      update((d) => ({ ...d, royal: recipe(d.royal) }), opts),
    [update],
  );

  const updateEstate = useCallback<StoreValue["updateEstate"]>(
    (recipe, opts) => update((d) => ({ ...d, estate: recipe(d.estate) }), opts),
    [update],
  );

  const setModule = useCallback(
    (m: ModuleId) => update((d) => ({ ...d, activeModule: m }), { undoable: false }),
    [update],
  );

  /* ── debounced dual-key autosave ──────────────────────────────────── */
  const persist = useCallback(
    (next: AppData, allowAutoBackup: boolean) => {
      const json = JSON.stringify(next);
      if (json === lastJson.current) {
        setSaving(false);
        return;
      }
      lastJson.current = json;
      const { ok, meta: m } = saveAppData(next);
      setSaving(false);
      if (ok) {
        setMeta(m);
        setLastSaved(m.lastBackupTime);
        if (allowAutoBackup && autoBackupOn && autoBackupDue()) {
          try {
            downloadJson(
              next,
              `empire-ml-auto-backup-${new Date().toISOString().slice(0, 10)}.json`,
            );
            markAutoBackup();
          } catch {
            /* never block a save on a download */
          }
        }
      }
    },
    [autoBackupOn],
  );

  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    setSaving(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => persistRef.current(data, true), AUTOSAVE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [data]);

  // first paint: stamp whatever we booted with so MAIN always exists
  useEffect(() => {
    const { meta: m } = saveAppData(boot.data);
    lastJson.current = JSON.stringify(boot.data);
    setMeta(m);
    setLastSaved(m.lastBackupTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveNow = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    persistRef.current(data, false);
  }, [data]);

  /* ── warn on unload while a write is in flight ────────────────────── */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!saving) return;
      e.preventDefault();
      e.returnValue = "Saving your data — leave anyway?";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saving]);

  /* ── bulk operations ──────────────────────────────────────────────── */
  const loadDemo = useCallback(() => {
    const demo = demoAppData();
    pushUndo(data);
    setData(demo);
  }, [data, pushUndo]);

  const resetAll = useCallback(() => {
    wipeStorage();
    lastJson.current = "";
    undoStack.current = [];
    setUndoDepth(0);
    setData(blankAppData());
    setMeta(emptyMeta());
    setLastSaved(null);
  }, []);

  const exportBackup = useCallback(() => {
    saveNow();
    downloadJson(
      { ...data, version: DATA_VERSION, exportedAt: new Date().toISOString() },
      `empire-ml-backup-${new Date().toISOString().slice(0, 10)}.json`,
    );
  }, [data, saveNow]);

  const importBackup = useCallback<StoreValue["importBackup"]>(
    async (file) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object") return { ok: false, message: "Invalid backup file" };

        const royalDoc = (parsed.royal ?? parsed) as Record<string, unknown>;
        const looksLikeOurs =
          Array.isArray(royalDoc.employees) ||
          parsed.estate !== undefined ||
          royalDoc.invoiceRates !== undefined ||
          royalDoc.payrollRates !== undefined;
        if (!looksLikeOurs) {
          return { ok: false, message: "Not an Empire ML backup — no recognisable data" };
        }

        const next = hydrateAppData(parsed);
        pushUndo(data);
        setData(next);
        return {
          ok: true,
          message: `Imported • ${next.royal.employees.length} staff, ${countRecords(
            next.royal.attendance,
          )} records`,
        };
      } catch (err) {
        console.error(err);
        return { ok: false, message: "Failed to parse backup file" };
      }
    },
    [data, pushUndo],
  );

  const restoreBackup = useCallback<StoreValue["restoreBackup"]>(() => {
    const raw = readBackup();
    if (!raw) return { ok: false, message: "No backup found" };
    pushUndo(data);
    setData(raw);
    return { ok: true, message: `Backup restored • ${raw.royal.employees.length} staff` };
  }, [data, pushUndo]);

  const setAutoBackup = useCallback((v: boolean) => {
    setAutoBackupOn(v);
    setAutoBackupEnabled(v);
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      data,
      royal: data.royal,
      estate: data.estate,
      module: data.activeModule,
      source,
      saving,
      lastSaved,
      meta,
      canUndo: undoDepth > 0,
      storageOk,
      setModule,
      update,
      updateRoyal,
      updateEstate,
      undo,
      loadDemo,
      resetAll,
      exportBackup,
      importBackup,
      restoreBackup,
      setAutoBackup,
      autoBackup: autoBackupOn,
      saveNow,
    }),
    [
      data,
      source,
      saving,
      lastSaved,
      meta,
      undoDepth,
      storageOk,
      setModule,
      update,
      updateRoyal,
      updateEstate,
      undo,
      loadDemo,
      resetAll,
      exportBackup,
      importBackup,
      restoreBackup,
      setAutoBackup,
      autoBackupOn,
      saveNow,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
