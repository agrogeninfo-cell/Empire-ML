/**
 * Installs jsdom globals, then bundles and runs tests/render.tsx.
 *
 * Order matters: React reads `document` at module-init time, so the DOM must
 * exist before the bundle is imported.
 */
import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(import.meta.dirname, "..");
const outfile = path.join(root, "tests", ".render.bundle.mjs");

// Keep jsdom's "Not implemented" noise off stderr; real errors still surface.
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => {
  if (!/Not implemented/.test(String(e.message))) console.error("[jsdom]", e.message);
});
virtualConsole.on("error", (...args) => console.error("[page]", ...args));

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost:5173/",
  pretendToBeVisual: true,
  virtualConsole,
});

const { window } = dom;

// ── expose the DOM as globals ────────────────────────────────────────
const globals = {
  window,
  document: window.document,
  navigator: window.navigator,
  location: window.location,
  history: window.history,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLAnchorElement: window.HTMLAnchorElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  Blob: window.Blob,
  File: window.File,
  FileReader: window.FileReader,
  FormData: window.FormData,
  DOMParser: window.DOMParser,
  CustomEvent: window.CustomEvent,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
};
// Node 22 defines some of these (navigator) as getter-only, so plain
// assignment throws. defineProperty with configurable/writable wins.
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

for (const [key, value] of Object.entries(globals)) define(key, value);

// Node ships its own AbortController/AbortSignal/EventTarget. If a library
// creates one of those and hands it to a *jsdom* element, jsdom rejects it
// ("member 'signal' that is not of type 'AbortSignal'"). Force the jsdom
// implementations so both sides of the boundary agree.
const OVERRIDE_WITH_JSDOM = [
  "AbortController",
  "AbortSignal",
  "EventTarget",
  "Event",
  "CustomEvent",
  "MessageChannel",
  "MessagePort",
  "DOMException",
  "PerformanceObserver",
  "URL",
  "Blob",
  "File",
];
for (const key of OVERRIDE_WITH_JSDOM) {
  if (window[key]) define(key, window[key]);
}

// framer-motion and friends reach for constructors we did not enumerate
// (SVGElement, DOMRect, MutationObserver, …). Mirror everything jsdom exposes
// that Node does not already have, so library feature-detection behaves as it
// would in a real browser.
let mirrored = 0;
for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) continue;
  let value;
  try {
    value = window[key];
  } catch {
    continue; // accessor that throws without a jsdom `this`
  }
  if (value === undefined) continue;
  if (define(key, value)) mirrored++;
}

if (window.matchMedia) define("matchMedia", window.matchMedia.bind(window));

// jsdom has no layout engine — give elements a non-zero box so components that
// measure before painting (the sliding nav pill) behave like they do in a browser.
window.Element.prototype.getBoundingClientRect = function () {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 80,
    bottom: 52,
    width: 80,
    height: 52,
    toJSON() {},
  };
};

// jsdom implements no scrolling. Provide no-op stubs so components that
// smooth-scroll (the attendance grid jumping to today) can run unguarded.
window.Element.prototype.scrollTo = function (opts) {
  if (opts && typeof opts === "object") {
    if (typeof opts.left === "number") this.scrollLeft = opts.left;
    if (typeof opts.top === "number") this.scrollTop = opts.top;
  }
};
window.Element.prototype.scrollIntoView = function () {};

// React 18 requires this flag so act() does not warn.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

await build({
  entryPoints: [path.join(root, "tests", "render.tsx")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  jsx: "automatic",
  logLevel: "warning",
  alias: { "@": path.join(root, "src") },
  external: [
    "react",
    "react-dom",
    "react-dom/client",
    "framer-motion",
    "lucide-react",
    "xlsx",
    "jspdf",
    "html2canvas",
  ],
});

try {
  const mod = await import(pathToFileURL(outfile).href);
  await mod.main();
} finally {
  fs.rmSync(outfile, { force: true });
  // jsdom's pretendToBeVisual rAF loop keeps the event alive, so exit explicitly
  // once the bundle is gone.
  try {
    dom.window.close();
  } catch {
    /* ignore */
  }
}
process.exit(process.exitCode ?? 0);
