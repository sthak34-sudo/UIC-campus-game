/**
 * Shrinking safe zone. Numbers only: no three.js, no DOM.
 * Milestone 5 can run this same module on the server.
 *
 * A match is a list of phases. Each phase waits, then moves the safe circle
 * from `start` to `end`. The next circle is always fully inside the current one.
 * Standing outside the circle that exists *right now* deals that phase's damage
 * per second. After the last shrink, the final circle stays put.
 *
 * Horizontal position is world meters: x = east, z = south (same as three.js).
 * Campus bounds come in as plan meters (x = east, y = north).
 */
import { planToWorld, type PlanPoint } from '../core/geo';

export interface PlanBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Circle {
  x: number;
  z: number;
  radius: number;
}

export interface ZonePhase {
  index: number;
  /** Seconds the safe circle holds still before it moves. */
  wait: number;
  /** Seconds the safe circle spends moving from `start` to `end`. */
  shrink: number;
  /** Health lost per second while outside the circle that exists right now. */
  damagePerSecond: number;
  start: Circle;
  end: Circle;
}

export type ZoneMode = 'wait' | 'shrink' | 'final';

export interface ZoneSnapshot {
  mode: ZoneMode;
  phase: number;
  /** Seconds left in this wait or shrink. Zero once the final circle has closed. */
  remaining: number;
  /** Safe circle at this moment. */
  current: Circle;
  /** Where the circle will finish this phase. Null after the final circle closes. */
  next: Circle | null;
  damagePerSecond: number;
}

/**
 * End radius of each phase, as a fraction of the first circle.
 * The last entry is ignored: that phase closes on `FINAL_RADIUS_M`.
 */
export const PHASE_TABLE = [
  { wait: 90, shrink: 60, damagePerSecond: 0.4, endFraction: 0.7 },
  { wait: 75, shrink: 45, damagePerSecond: 0.8, endFraction: 0.48 },
  { wait: 60, shrink: 40, damagePerSecond: 1.6, endFraction: 0.32 },
  { wait: 45, shrink: 30, damagePerSecond: 3.2, endFraction: 0.2 },
  { wait: 30, shrink: 24, damagePerSecond: 6, endFraction: 0.12 },
  { wait: 20, shrink: 18, damagePerSecond: 12, endFraction: 0 },
] as const;

/** Meters. The last circle is about a plaza across, not the whole campus. */
export const FINAL_RADIUS_M = 36;

/** `?zoneFast=1` divides wait and shrink by this. Damage stays the same. */
export const FAST_DIVISOR = 10;

/** mulberry32. Same seed always yields the same circle centers. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smallest world-space circle that contains the play-area rectangle. */
export function circleCoveringPlanBounds(bounds: PlanBounds): Circle {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const [x, , z] = planToWorld([cx, cy] as PlanPoint);
  const halfW = (bounds.maxX - bounds.minX) / 2;
  const halfH = (bounds.maxY - bounds.minY) / 2;
  return { x, z, radius: Math.hypot(halfW, halfH) };
}

/** True when `inner` sits entirely inside `outer` (edges may touch). */
export function containsCircle(outer: Circle, inner: Circle, eps = 1e-4): boolean {
  if (inner.radius > outer.radius + eps) return false;
  const d = Math.hypot(inner.x - outer.x, inner.z - outer.z);
  return d + inner.radius <= outer.radius + eps;
}

/**
 * A smaller circle whose center is a uniform random point inside the disk
 * where it still fits. `rng` returns values in [0, 1).
 */
export function placeInside(current: Circle, radius: number, rng: () => number): Circle {
  const maxOffset = Math.max(0, current.radius - radius);
  const angle = rng() * Math.PI * 2;
  const dist = Math.sqrt(Math.max(0, rng())) * maxOffset;
  return {
    x: current.x + Math.cos(angle) * dist,
    z: current.z + Math.sin(angle) * dist,
    radius,
  };
}

export function lerpCircle(a: Circle, b: Circle, t: number): Circle {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return {
    x: a.x + (b.x - a.x) * u,
    z: a.z + (b.z - a.z) * u,
    radius: a.radius + (b.radius - a.radius) * u,
  };
}

/** Meters the point must travel to reach the safe circle. Zero when inside or on the edge. */
export function distanceToSafe(circle: Circle, point: { x: number; z: number }): number {
  const d = Math.hypot(point.x - circle.x, point.z - circle.z);
  return Math.max(0, d - circle.radius);
}

/** Health to remove this tick. Zero inside the circle, on the edge, or when dt/dps is not positive. */
export function zoneDamage(
  damagePerSecond: number,
  dt: number,
  point: { x: number; z: number },
  circle: Circle,
): number {
  if (!(damagePerSecond > 0) || !(dt > 0)) return 0;
  if (distanceToSafe(circle, point) <= 0) return 0;
  return damagePerSecond * dt;
}

function endRadius(firstRadius: number, currentRadius: number, endFraction: number, isLast: boolean): number {
  const target = isLast ? Math.min(FINAL_RADIUS_M, Math.max(12, firstRadius * 0.05)) : firstRadius * endFraction;
  let radius = Math.min(target, currentRadius * 0.92);
  if (radius >= currentRadius - 0.5) radius = currentRadius * 0.5;
  return Math.max(1, radius);
}

/** Full match: every next circle is inside the previous one. Same seed, same circles. */
export function buildZone(bounds: PlanBounds, seed: number, fast = false): ZonePhase[] {
  const first = circleCoveringPlanBounds(bounds);
  const rng = mulberry32(seed >>> 0);
  const phases: ZonePhase[] = [];
  let current = first;
  for (let i = 0; i < PHASE_TABLE.length; i++) {
    const row = PHASE_TABLE[i]!;
    const isLast = i === PHASE_TABLE.length - 1;
    const radius = endRadius(first.radius, current.radius, row.endFraction, isLast);
    const end = placeInside(current, radius, rng);
    phases.push({
      index: i,
      wait: fast ? row.wait / FAST_DIVISOR : row.wait,
      shrink: fast ? row.shrink / FAST_DIVISOR : row.shrink,
      damagePerSecond: row.damagePerSecond,
      start: current,
      end,
    });
    current = end;
  }
  return phases;
}

export function stateAt(phases: readonly ZonePhase[], elapsed: number): ZoneSnapshot {
  if (phases.length === 0) {
    const current = { x: 0, z: 0, radius: 0 };
    return { mode: 'final', phase: 0, remaining: 0, current, next: null, damagePerSecond: 0 };
  }
  let t = Math.max(0, elapsed);
  for (const p of phases) {
    if (t < p.wait) {
      return {
        mode: 'wait',
        phase: p.index,
        remaining: p.wait - t,
        current: p.start,
        next: p.end,
        damagePerSecond: p.damagePerSecond,
      };
    }
    t -= p.wait;
    if (t < p.shrink) {
      const u = p.shrink <= 0 ? 1 : t / p.shrink;
      return {
        mode: 'shrink',
        phase: p.index,
        remaining: p.shrink - t,
        current: lerpCircle(p.start, p.end, u),
        next: p.end,
        damagePerSecond: p.damagePerSecond,
      };
    }
    t -= p.shrink;
  }
  const last = phases[phases.length - 1]!;
  return {
    mode: 'final',
    phase: last.index,
    remaining: 0,
    current: last.end,
    next: null,
    damagePerSecond: last.damagePerSecond,
  };
}

/**
 * Elapsed time at the end of the stage that contains `elapsed`.
 * Wait jumps to the start of the shrink. Shrink jumps to the next phase.
 * The final circle does not move further.
 */
export function skipStage(phases: readonly ZonePhase[], elapsed: number): number {
  const total = phases.reduce((sum, p) => sum + p.wait + p.shrink, 0);
  if (elapsed >= total) return elapsed;
  let t = 0;
  const e = Math.max(0, elapsed);
  for (const p of phases) {
    const waitEnd = t + p.wait;
    if (e < waitEnd) return waitEnd;
    t = waitEnd;
    const shrinkEnd = t + p.shrink;
    if (e < shrinkEnd) return shrinkEnd;
    t = shrinkEnd;
  }
  return total;
}

/** `90` → `1:30`. Rounds up so the last moment of a second still shows that second. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(Math.max(0, seconds) - 1e-9));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function zoneTimerLabel(mode: ZoneMode, remaining: number): string {
  if (mode === 'final') return 'Final zone';
  if (mode === 'shrink') return `Zone is shrinking · ${formatClock(remaining)}`;
  return `Zone shrinking in ${formatClock(remaining)}`;
}

export function distanceLabel(meters: number): string {
  if (meters <= 0.5) return 'Inside the zone';
  return `${Math.round(meters)} m to safe zone`;
}

export function parseZoneOptions(search: string): { fast: boolean; seed: number } {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const flag = q.get('zoneFast');
  const fast = flag === '1' || flag === 'true';
  const raw = q.get('zoneSeed');
  let seed = 1;
  if (raw !== null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) seed = Math.abs(Math.trunc(n)) % 0x1_0000_0000;
  }
  return { fast, seed };
}

/** `Phase 2/6 · 0.8 HP/s outside` */
export function phaseLabel(phase: number, count: number, damagePerSecond: number): string {
  const dps = damagePerSecond >= 10 ? damagePerSecond.toFixed(0) : damagePerSecond.toFixed(1);
  return `Phase ${phase + 1}/${count} · ${dps} HP/s outside`;
}
