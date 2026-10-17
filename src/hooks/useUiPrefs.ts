import { useCallback, useState } from "react";

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
