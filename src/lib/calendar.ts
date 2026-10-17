import type {
  CalendarDay,
  DayInfo,
  EstatePeriod,
  Period,
  WeekSlice,
} from "./types";

/* ═══════════════════════════════════════════════════════════════════════
 * Constants extracted from the source artefacts
 * ═════════════════════════════════════════════════════════════════════ */

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Full-moon (Poya) public-holiday dates shipped with the Royal Hires artefact. */
export const POYA_DAYS_2026 = [
  "2026-01-03",
  "2026-02-01",
  "2026-03-02",
  "2026-04-01",
  "2026-05-01",
  "2026-05-30",
  "2026-06-29",
  "2026-07-29",
  "2026-08-27",
  "2026-09-26",
  "2026-10-25",
  "2026-11-24",
  "2026-12-23",
] as const;

/* ═══════════════════════════════════════════════════════════════════════
 * Key helpers
 * ═════════════════════════════════════════════════════════════════════ */

/** `2026-10-05` — the canonical storage key. */
export function dateKey(y: number, m: number, d: number): string;
export function dateKey(date: Date): string;
export function dateKey(a: number | Date, m?: number, d?: number): string {
  if (a instanceof Date) {
    return `${a.getFullYear()}-${pad(a.getMonth() + 1)}-${pad(a.getDate())}`;
  }
  return `${a}-${pad((m ?? 0) + 1)}-${pad(d ?? 1)}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m - 1, d };
}

/** `new Date()` at local midnight — avoids UTC drift from `toISOString()`. */
export function startOfLocalDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function todayKey(): string {
  return dateKey(startOfLocalDay());
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

export function currentPeriod(): Period {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth() };
}

export function periodLabel(p: Period): string {
  return `${MONTHS[p.m]} ${p.y}`;
}

export function shiftPeriod(p: Period, delta: number): Period {
  const d = new Date(p.y, p.m + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}

/* ═══════════════════════════════════════════════════════════════════════
 * Day classification  (Royal Hires)
 *
 * Priority — a Poya day always wins over the weekday/Saturday/Sunday test,
 * exactly like `getDayInfo()` in the source artefact.
 * ═════════════════════════════════════════════════════════════════════ */

export function classifyDay(date: Date, key: string, poyaDays: Iterable<string>): DayInfo {
  if (poyaSet(poyaDays).has(key)) {
    return { type: "poya", label: "POYA", tone: "poya" };
  }
  const dow = date.getDay();
  if (dow === 0) return { type: "sunday", label: "SUN", tone: "sunday" };
  if (dow === 6) return { type: "saturday", label: "SAT", tone: "saturday" };
  return { type: "weekday", label: "WEEKDAY", tone: "weekday" };
}

let _poyaCache: { src: Iterable<string> | null; set: Set<string> } = {
  src: null,
  set: new Set(),
};

function poyaSet(src: Iterable<string>): Set<string> {
  if (_poyaCache.src !== src) {
    _poyaCache = { src, set: new Set(src) };
  }
  return _poyaCache.set;
}

export function buildMonth(period: Period, poyaDays: string[]): CalendarDay[] {
  const total = daysInMonth(period.y, period.m);
  return Array.from({ length: total }, (_, i) => {
    const d = i + 1;
    const date = new Date(period.y, period.m, d);
    const key = dateKey(period.y, period.m, d);
    return { d, date, key, info: classifyDay(date, key, poyaDays), dow: DOW[date.getDay()] };
  });
}

/* ═══════════════════════════════════════════════════════════════════════
 * Week slicing (1-7, 8-14, 15-21, 22-28, 29-end)
 * ═════════════════════════════════════════════════════════════════════ */

export function buildWeeks(total: number): WeekSlice[] {
  const weeks: WeekSlice[] = [
    { id: "w1", label: "Week 1 (1-7)", start: 1, end: Math.min(7, total) },
    { id: "w2", label: "Week 2 (8-14)", start: 8, end: Math.min(14, total) },
    { id: "w3", label: "Week 3 (15-21)", start: 15, end: Math.min(21, total) },
    { id: "w4", label: "Week 4 (22-28)", start: 22, end: Math.min(28, total) },
  ];
  if (total > 28) weeks.push({ id: "w5", label: `Week 5 (29-${total})`, start: 29, end: total });
  return weeks.filter((w) => w.start <= w.end);
}

/* ═══════════════════════════════════════════════════════════════════════
 * Estate "24–24" billing window  (Millennium Teas)
 *
 *   if (day >= 24)  →  24th this month   ..  23rd next month
 *   else            →  24th prev month   ..  23rd this month
 * ═════════════════════════════════════════════════════════════════════ */

export const ESTATE_CUTOFF_START = 24;
export const ESTATE_CUTOFF_END = 23;

export function estatePeriodFor(anchor: Date): EstatePeriod {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const d = anchor.getDate();

  let start: Date;
  let end: Date;

  if (d >= ESTATE_CUTOFF_START) {
    start = new Date(y, m, ESTATE_CUTOFF_START);
    end = new Date(y, m + 1, ESTATE_CUTOFF_END);
  } else {
    start = new Date(y, m - 1, ESTATE_CUTOFF_START);
    end = new Date(y, m, ESTATE_CUTOFF_END);
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** The window immediately before the given one. */
export function estatePreviousPeriod(period: EstatePeriod): EstatePeriod {
  const probe = new Date(period.start);
  probe.setDate(probe.getDate() - 1);
  return estatePeriodFor(probe);
}

/** The window immediately after the given one. */
export function estateNextPeriod(period: EstatePeriod): EstatePeriod {
  const probe = new Date(period.end);
  probe.setDate(probe.getDate() + 1);
  return estatePeriodFor(probe);
}

/**
 * `24 Aug – 23 Sep 2025`
 *
 * Formatted from our own month table rather than `toLocaleDateString`, which
 * renders September as "Sept" or "Sep" depending on the host's ICU/CLDR
 * version — the source artefact used the locale call and therefore produced
 * inconsistent labels across browsers and Node.
 */
export function estatePeriodLabel(period: EstatePeriod): string {
  const fmt = (d: Date) => `${pad(d.getDate())} ${MONTHS_SHORT[d.getMonth()]}`;
  return `${fmt(period.start)} – ${fmt(period.end)} ${period.end.getFullYear()}`;
}

/**
 * Inclusive number of calendar dates in the window.
 *
 * NOTE — intentional deviation from the source artefact: its `O0()` measured
 * against an end timestamp of 23:59:59.999, so `Math.round()` pushed the
 * result up by one (a 24 Aug → 23 Sep window reported 32 days). We count
 * actual dates, so that window reports 31.
 */
export function estatePeriodDays(period: EstatePeriod): number {
  const a = startOfLocalDay(period.start);
  const b = startOfLocalDay(period.end);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** Every `YYYY-MM-DD` key inside the window. */
export function estatePeriodKeys(period: EstatePeriod): string[] {
  const keys: string[] = [];
  const cursor = startOfLocalDay(period.start);
  const last = startOfLocalDay(period.end);
  while (cursor <= last) {
    keys.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/* ═══════════════════════════════════════════════════════════════════════
 * Formatting
 * ═════════════════════════════════════════════════════════════════════ */

const LK = new Intl.NumberFormat("en-LK", { maximumFractionDigits: 2 });

export function money(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return LK.format(Math.round(n * 100) / 100);
}

export function rupees(n: number): string {
  return `Rs ${money(n)}`;
}

export function rupeesDot(n: number): string {
  return `Rs. ${money(n)}`;
}

export function num(n: number, dp = 1): string {
  return Number(n).toFixed(dp);
}

/** `5th`, `21st`, `3rd` … */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function fileNameSafe(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function clockTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}
