// Bundles tests/verify.ts (TS + `@/` aliases) with esbuild, then runs it.
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(import.meta.dirname, "..");
const outfile = path.join(root, "tests", ".verify.bundle.mjs");

await build({
  entryPoints: [path.join(root, "tests", "verify.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  logLevel: "warning",
  alias: { "@": path.join(root, "src") },
  external: ["react", "react-dom", "framer-motion", "lucide-react", "xlsx", "jspdf", "html2canvas"],
});

try {
  await import(pathToFileURL(outfile).href);
} finally {
  fs.rmSync(outfile, { force: true });
}
process.exit(process.exitCode ?? 0);
