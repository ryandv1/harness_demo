// Tiny seeded PRNG so the committed fixtures are reproducible: same seed in,
// same experiment result out. mulberry32 — fast, good enough for a demo.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic 50/50 bucketing by string key — mirrors how FME allocates a
 * percentage rollout: the same user key always lands in the same arm.
 * Returns a value in [0, 1) derived from a stable hash of the key.
 */
export function hashUnit(key: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
