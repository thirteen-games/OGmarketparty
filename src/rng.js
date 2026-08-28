// Seedable RNG (mulberry32) so the engine is deterministic in tests.
// Pass no seed for a random game.

export function makeRng(seed) {
  if (seed === undefined || seed === null) {
    seed = (Math.random() * 2 ** 32) >>> 0;
  }
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.seed = seed;
  return next;
}

// Weighted pick: entries is [{value, weight}, ...]. Returns a value.
export function weightedPick(rng, entries) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) throw new Error('weightedPick: empty pool');
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r < 0) return e.value;
  }
  return entries[entries.length - 1].value;
}
