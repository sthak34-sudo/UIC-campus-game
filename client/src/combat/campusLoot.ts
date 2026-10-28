/**
 * Ground loot scattered across campus for a match: rifles, ammo and bandages on sidewalks and
 * plazas (sensible, walkable spots), spaced apart. Engine-free: the floor check is passed in.
 */
import type { LootKind } from './inventory';
import type { LootSpot } from './range';

export const CAMPUS_LOOT = {
  /** Most outdoor pickups placed per match. */
  count: 56,
  /** Pickups keep at least this far apart (m). */
  spacingM: 28,
  /** Keep the spawn area clear (the starter rifle already lies there) (m). */
  spawnClearM: 12,
  /** Stay this far inside the zone circle's edge (m). */
  zoneMarginM: 10,
  /** Share of each kind (rest is bandages). */
  gunShare: 0.22,
  ammoShare: 0.4,
} as const;

/** Plan point: x east, y north (meters). World is x, -y. */
export type PlanPt = readonly [number, number];
export interface PlanPolygon {
  outer: readonly PlanPt[];
}

export function pointInRing(x: number, y: number, ring: readonly PlanPt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A few random points inside a polygon (rejection-sampled in its bounding box). */
export function samplePolygon(poly: PlanPolygon, n: number, rng: () => number): { x: number; z: number }[] {
  const ring = poly.outer;
  if (ring.length < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const out: { x: number; z: number }[] = [];
  for (let tries = 0; tries < n * 12 && out.length < n; tries++) {
    const x = minX + rng() * (maxX - minX);
    const y = minY + rng() * (maxY - minY);
    if (pointInRing(x, y, ring)) out.push({ x, z: -y });
  }
  return out;
}

/** Loot kind for the i-th placed pickup, in the configured shares. */
export function campusLootKind(r: number): LootKind {
  if (r < CAMPUS_LOOT.gunShare) return 'gun';
  if (r < CAMPUS_LOOT.gunShare + CAMPUS_LOOT.ammoShare) return 'ammo';
  return 'bandage';
}

export interface CampusLootEnv {
  /** Walkable floor height at (x, z) (ground, not a roof or canopy), or null if none. */
  floorAt(x: number, z: number): number | null;
  spawn: { x: number; z: number };
  /** Keep pickups inside this circle (world x/z, m), `zoneMarginM` in from its edge. */
  zone?: { x: number; z: number; radius: number };
}

/**
 * Pick spread-out outdoor loot spots on sidewalks / plazas. Shuffles candidates so each match
 * differs; skips spots near spawn, too close to each other, or with no walkable floor.
 */
/** True when (x, z) is at least `margin` m inside the circle. */
export function insideZone(zone: { x: number; z: number; radius: number }, p: { x: number; z: number }, margin = 0): boolean {
  return Math.hypot(p.x - zone.x, p.z - zone.z) <= zone.radius - margin;
}

export function campusLootSpots(
  polygons: readonly PlanPolygon[],
  env: CampusLootEnv,
  rng: () => number = Math.random,
  count: number = CAMPUS_LOOT.count,
): LootSpot[] {
  const cands: { x: number; z: number }[] = [];
  for (const p of polygons) cands.push(...samplePolygon(p, 2, rng));
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cands[i], cands[j]] = [cands[j]!, cands[i]!];
  }
  const out: LootSpot[] = [];
  const s2 = CAMPUS_LOOT.spacingM ** 2;
  for (const c of cands) {
    if (out.length >= count) break;
    if (Math.hypot(c.x - env.spawn.x, c.z - env.spawn.z) < CAMPUS_LOOT.spawnClearM) continue;
    if (out.some((o) => (o.position.x - c.x) ** 2 + (o.position.z - c.z) ** 2 < s2)) continue;
    if (env.zone && !insideZone(env.zone, c, CAMPUS_LOOT.zoneMarginM)) continue;
    const y = env.floorAt(c.x, c.z);
    if (y === null) continue;
    out.push({ kind: campusLootKind(rng()), position: { x: c.x, y, z: c.z }, once: true });
  }
  return out;
}
