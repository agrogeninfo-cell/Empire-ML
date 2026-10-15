/* ═══════════════════════════════════════════════════════════════════════
 * Deterministic randomness for the demo workspace
 *
 * Both source artefacts generated their sample month with `Math.random()`,
 * so every reload reshuffled the roster. That made the demo impossible to
 * document, impossible to test and — because the attendance bonus needs 21
 * working days — it sometimes hid the very feature the payroll artefact was
 * named after. Everything here is seeded instead: the same roster and the
 * same month always produce the same marks.
 * ═════════════════════════════════════════════════════════════════════ */

/**
 * mulberry32 — a tiny, fast 32-bit PRNG. Same generator the estate seed
 * already used; lifted out so both demo seeds share one implementation.
 */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit string hash (djb2 variant) — used to salt per-employee seeds. */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Mix several integers into one seed. Multiplying by large odd primes keeps
 * neighbouring inputs (employee 1 vs 2, month 9 vs 10) far apart in the
 * generator's state space, so sibling sequences do not look alike.
 */
export function mixSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h = Math.imul(h ^ (p | 0), 16777619);
  }
  return h >>> 0;
}
