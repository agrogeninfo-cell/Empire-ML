/**
 * Installs a jsdom window (for localStorage), then bundles and runs
 * tests/storage.ts.
 *
 * Lighter than run-render.mjs — no React is mounted, so we only need the
 * storage-bearing window rather than the full DOM global surface.
 */
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(import.meta.dirname, "..");
const outfile = path.join(root, "tests", ".storage.bundle.mjs");

const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => {
  if (!/Not implemented/.test(String(e.message))) console.error("[jsdom]", e.message);
});
virtualConsole.on("error", (...args) => console.error("[page]", ...args));

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:5173/",
  virtualConsole,
});

const { window } = dom;

function define(key, value) {
  try {
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    return true;
  } catch {
    return false;
  }
}

define("window", window);
define("document", window.document);
define("localStorage", window.localStorage);
define("Blob", window.Blob);
define("File", window.File);
define("navigator", window.navigator);
define("URL", window.URL);

// The vault writes downloadable backups via URL.createObjectURL; stub it so a
// stray auto-backup during a test cannot blow up on a missing implementation.
window.URL.createObjectURL = () => "blob:stub";
window.URL.revokeObjectURL = () => {};

await build({
  entryPoints: [path.join(root, "tests", "storage.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  logLevel: "warning",
  alias: { "@": path.join(root, "src") },
  external: ["xlsx", "jspdf", "html2canvas"],
});

try {
  await import(pathToFileURL(outfile).href);
} finally {
  fs.rmSync(outfile, { force: true });
  try {
    dom.window.close();
  } catch {
    /* ignore */
  }
}
process.exit(process.exitCode ?? 0);
