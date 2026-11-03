/**
 * AI-06 / AI-07: checked start spots and a stuck watchdog for bots. Pure: no three.js, no DOM.
 */
type P = { x: number; z: number };

export const UNSTICK = {
  /** Spiral ring spacing (m), the same as the route grid. */
  step: 0.75,
  /** Look no further than this for a free spot (m). */
  maxR: 10,
  /** No progress for this long while trying to move: jump to a free spot (s). */
  watchdogS: 8,
  /** "Progress" means getting this much closer to the goal (m). */
  progressM: 1,
  /** The watchdog looks for a free spot this far along the way to the goal (m). */
  aheadM: 3,
};

/** Nearest spot to p (p itself first, then rings outward) where a bot can stand, or null. */
export function spiralFree(p: P, ok: (x: number, z: number) => boolean, step = UNSTICK.step, maxR = UNSTICK.maxR): P | null {
  if (ok(p.x, p.z)) return { x: p.x, z: p.z };
  for (let r = step; r <= maxR + 1e-6; r += step) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (ok(x, z)) return { x, z };
    }
  }
  return null;
}

export interface Watchdog {
  /** Distance to the goal at the last real progress. */
  bestD: number;
  /** Seconds without getting closer. */
  t: number;
}
export const newWatchdog = (): Watchdog => ({ bestD: Infinity, t: 0 });

/**
 * Track progress toward the goal. `goal` null (standing still on purpose) resets it.
 * Returns `fire: true` once the bot has made no progress for `UNSTICK.watchdogS`.
 */
export function stepWatchdog(w: Watchdog, pos: P, goal: P | null, dt: number): { w: Watchdog; fire: boolean } {
  if (!goal) return { w: newWatchdog(), fire: false };
  const d = Math.hypot(goal.x - pos.x, goal.z - pos.z);
  if (d < 2) return { w: newWatchdog(), fire: false };
  if (d < w.bestD - UNSTICK.progressM) return { w: { bestD: d, t: 0 }, fire: false };
  const t = w.t + dt;
  if (t >= UNSTICK.watchdogS) return { w: { bestD: d, t: 0 }, fire: true };
  return { w: { bestD: w.bestD, t }, fire: false };
}

/** Where a stuck bot jumps to: the free spot nearest a point a few metres toward its goal. */
export function unstickSpot(pos: P, goal: P, ok: (x: number, z: number) => boolean): P | null {
  const d = Math.hypot(goal.x - pos.x, goal.z - pos.z) || 1;
  const k = Math.min(UNSTICK.aheadM, d) / d;
  const ahead = { x: pos.x + (goal.x - pos.x) * k, z: pos.z + (goal.z - pos.z) * k };
  return spiralFree(ahead, ok);
}
