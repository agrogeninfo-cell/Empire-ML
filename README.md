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
npm run verify           # all five suites: 772 assertions
npm run verify:calc      # calculation fidelity against the source artefacts
npm run verify:storage   # vault round-trip, backup fallback, legacy migration
npm run verify:export    # CSV / XLSX / PDF-pagination fidelity, real workbook round trip
npm run verify:render    # mounts the real <App /> in jsdom and drives the UI
npm run verify:css       # guard: html2canvas can still rasterise every document
```

The app starts **blank** on purpose. Use **Load demo data** (Settings, or the
welcome sheet) to drop in the six-person roster with a full month of attendance
and an estate window seeded across whichever 24–24 period contains today, so
every calculation lights up immediately. The demo is **seeded, not random**: the
same month always produces the same marks, so it can be documented, screenshotted
and tested, and the 21-day attendance bonus is always demonstrated rather than
appearing by luck.

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

## Deliberate deviations

Four places where the rebuild knowingly differs from the source artefacts. Each
one is a bug fix, and each is pinned by an assertion so it cannot silently
regress.

**1 · A 24–24 window is one day shorter than the artefact claimed.**
The source artefact computed the length of a 24–24 window as:

```js
Math.round((end.getTime() - start.getTime()) / 86400000) + 1
```

with `end` stamped at `23:59:59.999`. That rounds the fractional day *up*
before adding one, so a 24 Aug → 23 Sep window reported **32** days when it
contains **31** dates. `estatePeriodDays()` now counts actual dates and returns
31. The deviation is asserted explicitly in the test harness.

**2 · Month abbreviations no longer depend on the host's ICU.**
`estatePeriodLabel()` is formatted from our own month table instead of
`toLocaleDateString("en-GB", …)`, whose short form for September is `"Sept"` or
`"Sep"` depending on the host's ICU/CLDR version — which made exported filenames
and window labels differ between machines.

**3 · The demo month is seeded.**
Both artefacts generated their sample data with `Math.random()`, so every reload
reshuffled the roster. `seedAttendance()` and `seedEstateRecords()` now draw from
`mulberry32` (`src/lib/random.ts`) with the artefacts' original probabilities and
skip rules intact. Each employee gets its own stream, so hiring somebody never
reshuffles the staff already on the roster. Seed `43` was picked by scanning: it
keeps at least one bonus-eligible employee in every month for a year ahead, puts
somebody exactly on the 21-day threshold and somebody one day short, and keeps
the Sunday/Poya, female-night and `D+N` invoice lines alive. The suites assert
determinism by making `Math.random()` count its own calls and demanding zero.

**4 · An exact-fit PDF no longer ends with a blank page.**
The artefact paginated a tall raster with

```js
mn = imgH; addImage(…, 0, …); mn -= usableH;
while (mn >= 0) { offset = mn - imgH; addPage(); addImage(…, offset, …); mn -= usableH; }
```

`>= 0` emits one extra page whenever the image height is an exact multiple of the
usable page height, and on that page the image sits entirely above the sheet — a
trailing blank. `planPdfPages()` ceil-s the page count instead; the export suite
sweeps 9 600 raster heights against a transcription of that loop and asserts
identical offsets everywhere except exact fits, which come out one page shorter.

---

## Verification

Five suites, all runnable with `npm run verify`.

**`tests/verify.ts` — calculation fidelity (181 assertions).** Transcribes the
original minified functions inline (`legacyDayInfo`, `legacyPayslip`,
`legacyInvoice`, `legacyPeriod`, `legacyDayAmount`, `legacyDelta`) and asserts the
rebuilt engines agree with them: across all of 2026 for day classification, and on
hand-built attendance fixtures covering the bonus threshold, `D+N`
double-counting, Poya-at-the-top-rate, female night allowance, week-range bonus
suppression, the seven invoice lines and their derived OT quantities, the 24–24
boundaries at days 1/12/23/24/25/30/31, CSV headers and row shapes, the extracted
defaults, and the seeded demo month (reproducible, per-employee independent,
never touching `Math.random()`, and rich enough to demonstrate every payroll
rule).

**`tests/run-storage.mjs` — persistence & migration (88 assertions).** The vault
is the one place a silent failure costs real payroll data, so it is tested
hostilely: full round-trip, the backup fallback when the main key is deleted,
migration of the original artefact's own storage keys (whole-document
`rh_final_data`, scattered `rh_employees`/`rh_attendance`/`deductions`, and the
legacy backup key), corrupt-JSON recovery, and shape normalisation — numeric
strings coerced, `null`s zeroed, non-boolean shift marks dropped, employees
without an id rejected, unknown rate keys not smuggled into state, and an
invalid period falling back rather than corrupting the calendar.

**`tests/run-export.mjs` — document export (141 assertions).** Everything a
download touches except the rasteriser is pure, so it is verified without a
browser: CSV quoting and escaping, filename hygiene (`ensureExt`,
`fileNameSafe`, the dated backup name), the A4 page plan against a transcription
of the artefact's pagination loop, Excel column widths, and the estate sheet
builder for **all three shapes** — male, female and combined — asserting the
header, the per-row arity, the spacer, every `TOTAL` footer cell, and the exact
CSV/XLSX parity that follows from both being built by one row function. It then
writes a real workbook with the shipped `xlsx` package into a temp directory,
reads it back and compares cell by cell, including the 31-character sheet-name
truncation and the stored column widths.

**`tests/run-render.mjs` — render smoke test (320 assertions).** Mounts the real
`<App />` in jsdom and drives it the way a user would: load demo data, tap a shift
cell and then **undo** it from the top bar, run the *Mark weekdays* bulk action and
confirm the month actually fills, walk Cards → Today → Grid, open a payslip and edit
a deduction, read all seven invoice lines, fire a CSV export and assert the file
contents column by column, walk the two-step `DELETE` reset guard (including that
lowercase `delete` does *not* unlock it), switch to the Estate module and walk all
five of its tabs, **save a half-shift and confirm the overwrite persists under the
same date key**, add a new employee and confirm the roster grows, confirm the
scroll-reveal behaviour is actually wired up, then assert the vault landed in
`localStorage` under both keys.

It then drives the surfaces a payroll user actually lives in: the **period
sheet** (stepper, month/year pickers, a leap-year February, *Jump to current
month*, and an applied month propagating to the period bar, the shift counts and
the persisted `royal.period`), the **search field and filter chips** (every
chip's badge must equal the number of cards it filters to, NIC search, the
dead-end empty state and *Reset filters*), the **Excel export** (a real `.xlsx`
written under the invoice-derived filename), the **backup round trip** (export →
parse → rename a worker → import through the hidden file input → toast → vault,
then reject a foreign JSON file and a corrupt one without touching the vault,
then Undo the import), and the **estate 24–24 navigation** (Previous / Next /
*This month*, the Live badge only on the window that holds today, the record
count dropping to zero outside the seeded window, the anchor persisting as a
24th, and navigation never mutating the data).

Five more sections cover the behaviour a premium UI is judged on:

- **Dialogs are real modals.** Every sheet is named (`aria-labelledby` for a
  titled sheet, `aria-label` for the bare destructive one), focus moves in on
  open, `Tab` / `Shift+Tab` cycle inside instead of escaping to the page behind,
  `Escape` dismisses, focus returns to the control that opened the sheet, the
  body scroll lock is applied *and released*, and the `DELETE` guard grabs focus
  on step two.
- **Rates drive every calculation.** Editing the weekday billing rate moves the
  invoice total by exactly `weekdayShifts × Δrate`, and the document on screen
  equals what the engine computes from the persisted vault — before and after.
  Same for the estate male-day rate: the summary grand total moves by
  `Δrate × male shifts` and the live formula under the entry form quotes the new
  rate. `Reset defaults` puts the rate card back.
- **The Poya calendar is editable.** Adding a date grows the persisted list,
  shows up in the settings list, and reclassifies that date to `POYA` in the
  period sheet's day map; removing it reverses all three.
- **Failure paths stay graceful.** jsdom has no 2D canvas, so PDF and PNG export
  genuinely fail: the suite asserts the error is logged, a toast says so
  ("PDF failed — try Print instead", "Image failed"), the button does not stick
  on "Working…", and the workspace is still usable afterwards. `Print` is
  asserted to reach `window.print()`.
- **The clipboard degrades honestly.** With a working `navigator.clipboard` the
  estate CSV preview is copied and confirmed; with neither `clipboard` nor
  `execCommand` the app says "Clipboard blocked by the browser" instead of
  pretending.
- **Bulk actions respect the selection.** Selecting one worker and clearing the
  range empties *that* worker's month and leaves every other roster entry
  byte-identical in the vault; Undo restores the exact day count, and
  `Select all visible` / `Clear selection` drive the bulk bar's own copy.
- **A reload boots from the vault.** The suite unmounts the tree and mounts a
  fresh `<App />` against the same `localStorage`: no welcome sheet, the module
  and tab you left are showing, the roster and the month's marks are intact, and
  the view preferences in `empire_ml:ui` are demonstrably a different key from
  the data vault — so a data reset cannot cost someone their favourite view.
- **The old artefact's storage migrates on boot.** With only `rh_final_data` in
  `localStorage`, a fresh mount announces "Legacy data migrated into the new
  vault", shows the legacy roster instead of merging it with the demo data,
  carries it into `empire_ml:data` on the first edit, and leaves the legacy key
  untouched so the original single-file app still opens with its own data.

**`tests/run-css.mjs` — export-compatibility guard (42 assertions).** PDF and PNG
export rasterise live DOM through `html2canvas` 1.4.1, whose colour parser throws
on `oklch()`, `oklab()`, `lab()`, `lch()`, `hwb()` and `color-mix()`. Tailwind v4
emits `oklch()` for its entire default palette, so a routine major-version bump
would silently break every document export. This project is pinned to Tailwind v3
for exactly that reason; the guard asserts the pin holds, scans both the
hand-written CSS and the compiled bundle, and checks that each printable
document still uses explicit hex.

```
✅ 181 assertions passed — calculations match the source artefacts
✅  88 persistence assertions passed — the vault round-trips and migrates
✅ 141 export assertions passed — CSV, XLSX and PDF pagination are sound
✅ 320 render assertions passed — the UI mounts and drives cleanly
✅  42 export-compatibility assertions passed
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
- The appended `TOTAL` footer row in an estate CSV carried 10 cells against the
  11-column combined header, so the grand total slid sideways into the `Out`
  column — and for the male/female shapes it appended four stray columns filled
  with combined totals. The footer is now built per shape, and the suite asserts
  every row matches the header arity and the grand total lands in the final
  column.

Two more were caught by review rather than by a test:

- The `Reveal` component and its `.scroll-rise` stylesheet — the defining
  behaviour of `millennium-scroll-reveal.html` — had been built and then never
  imported anywhere. They are now wired through the long-scroll surfaces of both
  modules, and the render suite asserts `.scroll-rise` elements exist and fall
  back to visible when `IntersectionObserver` is unavailable, so it cannot
  quietly become dead code again.
- Settings carried a second hidden `<input type="file">` for importing Poya
  dates that nothing ever opened and that had no `onChange` — dead scaffolding
  the source artefact never had. Removed.

Covering the filter chips also made them accessible: each pill now carries
`aria-pressed` and their row is a `role="group"` with a name, so a screen reader
announces which filter is active instead of four indistinguishable pills.

A third came out of the same pass: the sheets were dialogs in name only. They
locked body scroll and closed on `Escape`, but nothing was labelled
(`aria-modal` with no accessible name) and focus never moved — a keyboard user
tabbed straight through the modal into the page behind it, and focus was left on
a hidden trigger when it closed. `src/hooks/useDialogA11y.ts` now gives every
sheet the same focus-in / focus-restore / `Tab`-trap behaviour, wired once in
`Sheet.tsx` so the payslip, day, add-staff, period and confirm sheets all
inherit it.

---

## Architecture

```
src/
  lib/
    types.ts       domain model for both modules
    calendar.ts    dates, Poya, day classes, week slices, 24–24 window, formatting
    payroll.ts     Royal engine — payslips, invoice roll-up, attendance mutations
    estate.ts      Millennium engine — day amounts, window totals, deltas, CSV/XLSX sheets
    storage.ts     dual-key vault, legacy migration, shape guards
    random.ts      mulberry32 + seed mixing for the deterministic demo
    exporters.ts   CSV / XLSX / PDF / PNG (heavy libs are dynamically imported)
    cn.ts          Tailwind-aware className merge
  data/defaults.ts every default value lifted from the artefacts
  store/AppStore.tsx  context store, undo stack, debounced autosave
  hooks/           UI preferences, dialog accessibility (focus trap, Escape)
  components/
    ui/            Reveal, Sheet, Confirm, Toast, Segmented, Field, Metrics
    layout/        Nav (bottom bar + desktop rail), TopBar, Brand, ModuleSwitch
  modules/
    royal/         AttendanceTab, PayrollTab, InvoiceTab, SettingsTab, sheets
    estate/        Dashboard, Attendance, Summary, Export, Settings
tests/             five harnesses: calc, storage, export, render, css
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
