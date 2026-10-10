/** Deterministic randomness: the same building id always gets the same "random" facade. */

/** 32-bit FNV-1a hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** Uniform in [0, 1). */
  (): number;
  range(a: number, b: number): number;
  int(a: number, bInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

/** mulberry32 PRNG seeded by a number or a string (hashed). */
export function makeRng(seed: number | string): Rng {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = (items) => items[Math.floor(next() * items.length)]!;
  next.chance = (p) => next() < p;
  return next;
}
