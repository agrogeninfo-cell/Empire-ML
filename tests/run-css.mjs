/**
 * Export-compatibility guard.
 *
 * PDF and PNG export rasterise live DOM through html2canvas 1.4.1, whose CSS
 * colour parser throws on the modern colour functions — `oklch()`, `oklab()`,
 * `lab()`, `lch()`, `hwb()` and `color-mix()`. Tailwind v4 emits `oklch()` for
 * its entire default palette, so a routine major-version bump would silently
 * break every document export in the app.
 *
 * This project is deliberately pinned to Tailwind v3 (rgb-based) and the paper
 * documents use hardcoded hex. This script keeps it that way.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);

let pass = 0;
const failures = [];

function check(cond, label) {
  if (cond) pass++;
  else failures.push(label);
}

const UNSUPPORTED = ["oklch(", "oklab(", "color-mix(", "lab(", "lch(", "hwb("];

/* ── 1 · the framework that generates our utility colours ────────────── */

const twVersion = require("tailwindcss/package.json").version;
const twMajor = Number(twVersion.split(".")[0]);
check(
  twMajor === 3,
  `tailwindcss is v3 (rgb-based) — found v${twVersion}. Tailwind v4+ emits oklch(), which html2canvas 1.4.1 cannot parse and would break PDF/PNG export.`,
);

const h2cVersion = require("html2canvas/package.json").version;
check(
  h2cVersion.startsWith("1.4"),
  `html2canvas is on the 1.4 line — found ${h2cVersion}`,
);

/* ── 2 · our own hand-written CSS ───────────────────────────────────── */

const sourceFiles = [
  path.join(root, "src", "index.css"),
  path.join(root, "tailwind.config.js"),
];

for (const file of sourceFiles) {
  if (!fs.existsSync(file)) {
    failures.push(`missing expected stylesheet: ${path.relative(root, file)}`);
    continue;
  }
  const css = fs.readFileSync(file, "utf8");
  for (const fn of UNSUPPORTED) {
    check(
      !css.includes(fn),
      `${path.relative(root, file)} must not use ${fn} — html2canvas cannot parse it`,
    );
  }
}

/* ── 3 · the built bundle, when one is present ──────────────────────── */

const distAssets = path.join(root, "dist", "assets");
if (fs.existsSync(distAssets)) {
  const sheets = fs
    .readdirSync(distAssets)
    .filter((f) => f.endsWith(".css"))
    .map((f) => path.join(distAssets, f));

  check(sheets.length > 0, "a production build emitted at least one stylesheet");

  for (const sheet of sheets) {
    const css = fs.readFileSync(sheet, "utf8");
    for (const fn of UNSUPPORTED) {
      check(
        !css.includes(fn),
        `built ${path.basename(sheet)} contains ${fn} — PDF/PNG export would throw`,
      );
    }
  }
} else {
  console.log("  (dist/ not built — skipping the compiled-CSS scan)");
}

/* ── 4 · the printable documents stay on plain hex ──────────────────── */

const papers = [
  path.join(root, "src", "modules", "royal", "InvoiceTab.tsx"),
  path.join(root, "src", "modules", "royal", "PayslipSheet.tsx"),
  path.join(root, "src", "modules", "estate", "EstateExport.tsx"),
];

for (const file of papers) {
  if (!fs.existsSync(file)) {
    failures.push(`missing printable document component: ${path.relative(root, file)}`);
    continue;
  }
  const src = fs.readFileSync(file, "utf8");
  // Only inspect the `.paper` blocks: those are what html2canvas rasterises.
  const paperStart = src.indexOf('className="print-area paper');
  if (paperStart === -1) {
    check(false, `${path.relative(root, file)} no longer renders a .print-area paper document`);
    continue;
  }
  const paper = src.slice(paperStart);
  for (const fn of UNSUPPORTED) {
    check(
      !paper.includes(fn),
      `${path.relative(root, file)} paper document must not use ${fn}`,
    );
  }
  check(
    /#[0-9a-fA-F]{6}/.test(paper),
    `${path.relative(root, file)} paper document uses explicit hex colours`,
  );
}

/* ── report ─────────────────────────────────────────────────────────── */

console.log(`\n${"═".repeat(58)}`);
if (failures.length === 0) {
  console.log(
    `  ✅ ${pass} export-compatibility assertions passed — html2canvas can rasterise every document`,
  );
} else {
  console.log(
    `  ❌ ${failures.length} of ${pass + failures.length} export-compatibility assertions FAILED\n`,
  );
  failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
}
console.log(`${"═".repeat(58)}\n`);

process.exit(failures.length === 0 ? 0 : 1);
