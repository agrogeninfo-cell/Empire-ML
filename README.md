# Empire ML

A premium, **mobile-first** labour, attendance and payroll suite. It unifies the
calculations, business rules and data from two standalone React artefacts into a
single workspace with a shared persistence vault:

| Module | Source artefact | Domain |
| --- | --- | --- |
| **Royal Hires** | `royal_x5f_hires_final_bonus.html` | Per-employee attendance, payroll with an attendance bonus, and client invoicing |
| **Millennium Estate** | `millennium-scroll-reveal.html` | Estate day-labour billing on a rolling **24–24** window |

Switch between them from the pill in the top bar. Both write to the same
local vault, so one backup covers everything.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build          # production bundle → dist/
npm run preview        # serve the production build
npm run typecheck      # tsc, no emit
npm run verify           # all three suites: 359 assertions
npm run verify:calc      # calculation fidelity against the source artefacts
npm run verify:storage   # vault round-trip, backup fallback, legacy migration
npm run verify:render    # mounts the real <App /> in jsdom and drives the UI
```

The app starts **blank** on purpose. Use **Load demo data** (Settings, or the
welcome sheet) to drop in the six-person roster with a full month of attendance
and an estate window seeded across whichever 24–24 period contains today, so
every calculation lights up immediately.

---

## What was extracted

### Royal Hires · Payroll

**Day classification** — priority order matters, and is preserved exactly:

1. a **Poya** (full-moon) date, regardless of weekday
2. **Sunday**
3. **Saturday**
4. otherwise **weekday**

All 13 Poya dates for 2026 ship as data and are editable in Settings:

```
2026-01-03  2026-02-01  2026-03-02  2026-04-01  2026-05-01  2026-05-30
2026-06-29  2026-07-29  2026-08-27  2026-09-26  2026-10-25  2026-11-24
2026-12-23
```

**Shift marking** — one tap cycles a date through `∅ → D → N → D+N → ∅`.
A `D+N` date bills **two** shifts but still counts as **one** distinct working
day for the bonus test.

**Payslip maths**

```
gross = weekday × payroll.weekday
      + saturday × payroll.saturday
      + sunday   × payroll.sunday        (Sundays and Poya share this rate)
      + femaleN  × payroll.female        (female staff, per N shift only)
      + bonus

workingDays   = count of distinct dates carrying any mark
bonusEligible = workingDays ≥ bonusDays  (21)   — never true on a week range
bonus         = bonusEligible ? bonusAmount (5500) : 0

net = gross − (meal + boarding + advance)
```

**Client invoice** — OT quantities are *derived*, never entered:

| # | Line | Qty | Rate |
| --- | --- | --- | --- |
| 1 | Week days Shift | weekday shifts | 1525 |
| 2 | Saturday Shift | saturday shifts | 1875 |
| 3 | Weekday N/Day OT (3h) | weekday × 3 | 225 |
| 4 | Saturday OT (3h) | saturday × 3 | 225 |
| 5 | Sunday / Poya OT (12h) | sunday × 12 | 300 |
| 6 | Female Night Allowance | female N shifts | 100 |
| 7 | Attendance Bonus (21+ days) | qualifying staff | 5500 |

**Default rates**

```
payroll : weekday 2200 · saturday 2550 · sunday 3600 · female night 100
invoice : weekday 1525 · saturday 1875 · weekdayOT 225 · saturdayOT 225
          sunday 300  · female 100    · bonus 5500
OT hours: weekday 3   · saturday 3    · sunday 12
bonus   : 21 distinct working days → Rs 5500
opening deductions: meal 1200 · boarding 2000 · advance 0
```

**Week slicing** — `1-7`, `8-14`, `15-21`, `22-28`, and `29-end` when the month
runs past 28 days, plus a custom from/to range. Week ranges suppress the bonus
by design.

### Millennium Estate · Labour

**The 24–24 window** — the estate bills from the 24th of one month to the 23rd
of the next:

```
if (day ≥ 24)  →  24th this month   ..  23rd next month
else           →  24th prev month   ..  23rd this month
```

**One record per date.** Saving a date that already exists overwrites it. Counts
accept `0.5` steps so half shifts bill correctly.

```
dayAmount = (maleCount × maleDay + femaleCount × femaleDay)
          + (maleOt + femaleOt) × otRate
          − lateHours × lateRate
```

**Default rates**

```
maleDay 3000 · femaleDay 2500 · maleNight 2925 · femaleNight 2425
otRate 225/hr · lateRate 150/hr (deduction)
```

> `maleNight` and `femaleNight` are carried in the rate card exactly as the
> source artefact stored them, but that artefact's day formula never consumed
> them. They are flagged *"stored, not used by the day formula"* in Settings
> rather than silently wired in.

**Dashboard deltas** compare today against yesterday per metric, and the current
window against the previous window for the grand total, using the original edge
handling (`previous === 0` → `+100%` when current is positive, else `0%`).

**Card meter denominators** — male/female fill against `days × 6` shifts, OT
against `days × 8` hours, grand total against `logged ÷ days`.

**CSV export** — three shapes, comma format like `2025,08,24,4.5,1,13800`:

```
male     Year,Month,Day,Male Shifts,Male OT,Male Amount
female   Year,Month,Day,Female Shifts,Female OT,Female Amount
combined Year,Month,Day,Male,Female,MaleOT,FemaleOT,LateHours,In,Out,Grand Total
```

### Persistence

The Royal artefact's dual-key strategy is kept and extended to cover both
modules:

```
empire_ml:data           ← read first
empire_ml:data:backup    ← written on every save, read as a fallback
empire_ml:meta           ← last backup time, size, counts
```

Autosave is debounced and skips writes when the serialised payload is unchanged.
A weekly JSON auto-backup can download itself (toggleable). On first boot the app
also scans the **original artefact's** storage keys — `rh_final_data`,
`rh_employees`, `rh_attendance`, `rh_deductions`, `rh_invoiceRates`,
`rh_payrollRates` and friends — and migrates anything it finds, so data entered
in the old single-file app is not lost.

Deleting everything is a two-step flow that requires typing `DELETE`.

---

## One deliberate deviation

The source artefact computed the length of a 24–24 window as:

```js
Math.round((end.getTime() - start.getTime()) / 86400000) + 1
```

with `end` stamped at `23:59:59.999`. That rounds the fractional day *up*
before adding one, so a 24 Aug → 23 Sep window reported **32** days when it
contains **31** dates. `estatePeriodDays()` now counts actual dates and returns
31. The deviation is asserted explicitly in the test harness.

`estatePeriodLabel()` is likewise formatted from our own month table instead of
`toLocaleDateString("en-GB", …)`, whose short form for September is `"Sept"` or
`"Sep"` depending on the host's ICU/CLDR version.

---

## Verification

Three suites, all runnable with `npm run verify`.

**`tests/verify.ts` — calculation fidelity (164 assertions).** Transcribes the
original minified functions inline (`legacyDayInfo`, `legacyPayslip`,
`legacyInvoice`, `legacyPeriod`, `legacyDayAmount`, `legacyDelta`) and asserts the
rebuilt engines agree with them: across all of 2026 for day classification, and on
hand-built attendance fixtures covering the bonus threshold, `D+N`
double-counting, Poya-at-the-top-rate, female night allowance, week-range bonus
suppression, the seven invoice lines and their derived OT quantities, the 24–24
boundaries at days 1/12/23/24/25/30/31, CSV headers and row shapes, and the
extracted defaults.

**`tests/run-storage.mjs` — persistence & migration (88 assertions).** The vault
is the one place a silent failure costs real payroll data, so it is tested
hostilely: full round-trip, the backup fallback when the main key is deleted,
migration of the original artefact's own storage keys (whole-document
`rh_final_data`, scattered `rh_employees`/`rh_attendance`/`deductions`, and the
legacy backup key), corrupt-JSON recovery, and shape normalisation — numeric
strings coerced, `null`s zeroed, non-boolean shift marks dropped, employees
without an id rejected, unknown rate keys not smuggled into state, and an
invalid period falling back rather than corrupting the calendar.

**`tests/run-render.mjs` — render smoke test (107 assertions).** Mounts the real
`<App />` in jsdom and drives it the way a user would: load demo data, tap a shift
cell and then **undo** it from the top bar, walk Cards → Today → Grid, open a
payslip and edit a deduction, read all seven invoice lines, fire a CSV export and
assert the file contents, walk the two-step `DELETE` reset guard (including that
lowercase `delete` does *not* unlock it), switch to the Estate module and walk all
five of its tabs, confirm the scroll-reveal behaviour is actually wired up, then
assert the vault landed in `localStorage` under both keys.

```
✅ 164 assertions passed — calculations match the source artefacts
✅  88 persistence assertions passed — the vault round-trips and migrates
✅ 107 render assertions passed — the UI mounts and drives cleanly
```

The render suite has already earned its keep — it caught defects that
typechecking, the production build and the calculation suite all missed:

- `AttendanceGrid` called `Element.scrollTo` unguarded, which throws outright in
  environments that lack it. Now feature-detected with a `scrollLeft` fallback.
- `AnimatePresence mode="wait"` gated the incoming workspace on the outgoing one
  finishing its exit, leaving a ~300 ms blank shell on every module switch. Both
  that and the equivalent gate on the reset dialog's second step were replaced
  with keyed enter-only transitions — snappier, and no blank gap.
- Estate CSV downloads were built from the *display* header copy, shipping
  `Late,In,Out,Grand` instead of the canonical `LateHours,In,Out,Grand Total`.
  Now a regression assertion pins file headers to
  `ESTATE_CSV_FILE_HEADERS` and keeps the shortened display copy separate.

A fourth defect was caught by review rather than by a test: the `Reveal`
component and its `.scroll-rise` stylesheet — the defining behaviour of
`millennium-scroll-reveal.html` — had been built and then never imported
anywhere. They are now wired through the long-scroll surfaces of both modules,
and the render suite asserts `.scroll-rise` elements exist and fall back to
visible when `IntersectionObserver` is unavailable, so it cannot quietly become
dead code again.

---

## Architecture

```
src/
  lib/
    types.ts       domain model for both modules
    calendar.ts    dates, Poya, day classes, week slices, 24–24 window, formatting
    payroll.ts     Royal engine — payslips, invoice roll-up, attendance mutations
    estate.ts      Millennium engine — day amounts, window totals, deltas, CSV
    storage.ts     dual-key vault, legacy migration, shape guards
    exporters.ts   CSV / XLSX / PDF / PNG (heavy libs are dynamically imported)
    cn.ts          Tailwind-aware className merge
  data/defaults.ts every default value lifted from the artefacts
  store/AppStore.tsx  context store, undo stack, debounced autosave
  hooks/           UI preferences, media query, ticking clock
  components/
    ui/            Reveal, Sheet, Confirm, Toast, Segmented, Field, Metrics
    layout/        Nav (bottom bar + desktop rail), TopBar, Brand, ModuleSwitch
  modules/
    royal/         AttendanceTab, PayrollTab, InvoiceTab, SettingsTab, sheets
    estate/        Dashboard, Attendance, Summary, Export, Settings
tests/verify.ts    calculation-fidelity harness
```

**Stack** — Vite 6 · React 18 · TypeScript (strict) · Tailwind 3 · Framer Motion
· lucide-react. `jspdf`, `html2canvas` and `xlsx` are split into a lazily loaded
`docs` chunk so they never affect first paint.

### Design system

Obsidian surfaces (`#0B0B0D` → `#1F1F27`) with royal gold `#D4AF37` and estate
jade `#22B34A` / `#0F3D2E` accents. Inter for UI, Instrument Serif for display
numerals, JetBrains Mono for NICs and CSV previews. Documents that get exported
or printed (payslip, invoice, bonus sheet, period statement) render on white
paper regardless of the app theme, and a print stylesheet isolates them from the
app chrome.

Mobile-first throughout: 44px+ touch targets, `env(safe-area-inset-*)` padding,
bottom sheets instead of dialogs, a fixed bottom tab bar that becomes a left rail
at `lg:`, sticky frozen panes in the attendance grid, and no horizontal page
scroll. `prefers-reduced-motion` disables the reveal and spring animations.
