import { describe, expect, it } from 'vitest';
import { buildZone } from '../zone/zoneLogic';
import { CAMPUS_LOOT, campusLootKind, campusLootSpots,
  insideZone, pointInRing, samplePolygon, type PlanPolygon } from './campusLoot';

function seeded(seed: number) {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const square = (cx: number, cy: number, h: number): PlanPolygon => ({
  outer: [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]],
});
// A 10x10 grid of 30 m plazas across a 600 m campus.
const plazas: PlanPolygon[] = [];
for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) plazas.push(square(-300 + i * 60, -300 + j * 60, 15));

describe('campus ground loot', () => {
  it('samples points inside polygons (plan y north -> world z south)', () => {
    const pts = samplePolygon(square(100, 50, 5), 5, seeded(3));
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) expect(pointInRing(p.x, -p.z, square(100, 50, 5).outer)).toBe(true);
  });
  it('spreads rifles, ammo and bandages across campus on walkable floor, spaced apart', () => {
    const spots = campusLootSpots(plazas, { floorAt: () => 0.2, spawn: { x: 0, z: 0 } }, seeded(7));
    expect(spots.length).toBeGreaterThan(30);
    expect(spots.length).toBeLessThanOrEqual(CAMPUS_LOOT.count);
    const kinds = new Set(spots.map((s) => s.kind));
    expect(kinds).toEqual(new Set(['gun', 'ammo', 'bandage']));
    for (const s of spots) {
      expect(s.once).toBe(true);
      expect(s.position.y).toBe(0.2);
      expect(Math.hypot(s.position.x, s.position.z)).toBeGreaterThanOrEqual(CAMPUS_LOOT.spawnClearM);
    }
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++) {
        const a = spots[i]!.position, b = spots[j]!.position;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(CAMPUS_LOOT.spacingM);
      }
    // Both halves of campus get loot.
    expect(spots.some((s) => s.position.x < -100)).toBe(true);
    expect(spots.some((s) => s.position.x > 100)).toBe(true);
  });
  it('skips spots with no walkable floor (roofs, canopies, holes)', () => {
    const spots = campusLootSpots(plazas, { floorAt: (x) => (x < 0 ? null : 0), spawn: { x: 999, z: 999 } }, seeded(2));
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) expect(s.position.x).toBeGreaterThanOrEqual(0);
  });
  it('uses the configured kind shares', () => {
    expect(campusLootKind(0)).toBe('gun');
    expect(campusLootKind(CAMPUS_LOOT.gunShare + 0.01)).toBe('ammo');
    expect(campusLootKind(0.99)).toBe('bandage');
  });
  it('keeps every pickup inside the zone circle, away from its edge', () => {
    const zone = { x: 0, z: 0, radius: 150 };
    const spots = campusLootSpots(plazas, { floorAt: () => 0, spawn: { x: 999, z: 999 }, zone }, seeded(3));
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) expect(Math.hypot(s.position.x, s.position.z)).toBeLessThanOrEqual(zone.radius - CAMPUS_LOOT.zoneMarginM);
  });
  it('insideZone respects the margin', () => {
    expect(insideZone({ x: 0, z: 0, radius: 20 }, { x: 15, z: 0 })).toBe(true);
    expect(insideZone({ x: 0, z: 0, radius: 20 }, { x: 15, z: 0 }, 10)).toBe(false);
  });
});

describe('loot and the seeded zone', () => {
  it('campus loot sits inside the first shrink circle of the same seed', () => {
    const bounds = { minX: -400, minY: -300, maxX: 400, maxY: 300 };
    for (const seed of [1, 2, 99]) {
      const first = buildZone(bounds, seed)[0]!.end;
      const spots = campusLootSpots([square(0, 0, 350)], { zone: first, floorAt: () => 0, spawn: { x: 9999, z: 9999 } }, seeded(seed));
      expect(spots.length).toBeGreaterThan(0);
      for (const s of spots) expect(insideZone(first, s.position, CAMPUS_LOOT.zoneMarginM)).toBe(true);
    }
  });
});
