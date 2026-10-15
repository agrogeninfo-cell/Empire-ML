import { useCallback, useEffect, useState } from "react";

/* ═══════════════════════════════════════════════════════════════════════
 * UI preferences — kept out of the data vault so a reset never loses
 * someone's favourite view.
 * ═════════════════════════════════════════════════════════════════════ */

const KEY = "empire_ml:ui";

type Prefs = Record<string, string>;

function read(): Prefs {
  try {
    const raw = window.localStorage?.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Prefs) : {};
  } catch {
    return {};
  }
}

function write(prefs: Prefs) {
  try {
    window.localStorage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode — ignore */
  }
}

export function useUiPref<T extends string>(
  key: string,
  initial: T,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => (read()[key] as T) ?? initial);

  const set = useCallback(
    (v: T) => {
      setValue(v);
      const all = read();
      all[key] = v;
      write(all);
    },
    [key],
  );

  return [value, set];
}

/** Re-read prefs when the tab regains focus (multi-device debugging aid). */
export function usePrefSync() {
  useEffect(() => {
    const onFocus = () => read();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
}

/* ═══════════════════════════════════════════════════════════════════════
 * useNow — a ticking clock for "live" headers
 * ═════════════════════════════════════════════════════════════════════ */

export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

/* ═══════════════════════════════════════════════════════════════════════
 * useMediaQuery
 * ═════════════════════════════════════════════════════════════════════ */

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/* ═══════════════════════════════════════════════════════════════════════
 * useBusy — wraps an async action with a keyed loading flag
 * ═════════════════════════════════════════════════════════════════════ */

export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }, [busy]);
  return { busy, run };
}
