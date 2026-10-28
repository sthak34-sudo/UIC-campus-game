import { describe, expect, it } from 'vitest';
import { ENEMY_SPAWN, inSpawnGrace, memberOffset, pickEnemySquadSpots, SPAWN_GRACE_S, validEnemySpot, type EnemySpawnEnv } from './enemySpawn';

const player = { x: 0, y: 0, z: 0 };
const flat = (over: Partial<EnemySpawnEnv> = {}): EnemySpawnEnv => ({
  groundAt: () => 0,
  blocked: () => true,
  zone: { x: 0, z: 0, radius: 600 },
  ...over,
});

function seeded(seed: number) {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('enemy squad spawns', () => {
  it('varies squad distances between about 150 and 400 m', () => {
    const dists = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      for (const s of pickEnemySquadSpots(player, 3, flat(), seeded(seed))) {
        const d = Math.hypot(s.x, s.z);
        expect(d).toBeGreaterThanOrEqual(150);
        expect(d).toBeLessThanOrEqual(400);
        dists.add(Math.round(d));
      }
    }
    // Several different rings get used, not just the nearest one.
    expect(dists.size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...dists) - Math.min(...dists)).toBeGreaterThan(150);
  });
  it('places 3 squads at least 150 m away, spread apart', () => {
    const spots = pickEnemySquadSpots(player, 3, flat());
    expect(spots).toHaveLength(3);
    for (const s of spots) expect(Math.hypot(s.x, s.z)).toBeGreaterThanOrEqual(ENEMY_SPAWN.minDistM);
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++)
        expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z)).toBeGreaterThanOrEqual(ENEMY_SPAWN.squadSpacingM);
  });
  it('never picks a spot the player can see', () => {
    // Only spots with x < -100 are hidden.
    const spots = pickEnemySquadSpots(player, 3, flat({ blocked: (_a, b) => b.x < -100 }));
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) expect(s.x).toBeLessThan(-100);
    expect(pickEnemySquadSpots(player, 3, flat({ blocked: () => false }))).toHaveLength(0);
  });
  it('rejects roofs, missing ground and spots outside the zone', () => {
    expect(validEnemySpot(player, { x: 200, z: 0 }, flat({ groundAt: () => 12 }))).toBeNull();
    expect(validEnemySpot(player, { x: 200, z: 0 }, flat({ groundAt: () => null }))).toBeNull();
    expect(validEnemySpot(player, { x: 200, z: 0 }, flat({ zone: { x: 0, z: 0, radius: 180 } }))).toBeNull();
    expect(validEnemySpot(player, { x: 100, z: 0 }, flat())).toBeNull();
    expect(validEnemySpot(player, { x: 200, z: 0 }, flat())).toEqual({ x: 200, y: 0, z: 0 });
    const spots = pickEnemySquadSpots(player, 3, flat({ zone: { x: 0, z: 0, radius: 250 } }));
    for (const s of spots) expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(250 - ENEMY_SPAWN.zoneMarginM);
  });
  it('keeps squad members in a tight cluster', () => {
    for (let s = 0; s < 4; s++) expect(Math.hypot(memberOffset(s).x, memberOffset(s).z)).toBeLessThanOrEqual(ENEMY_SPAWN.memberSpreadM + 1e-9);
  });
  it('has a short grace period at the start', () => {
    expect(SPAWN_GRACE_S).toBeGreaterThanOrEqual(3);
    expect(SPAWN_GRACE_S).toBeLessThanOrEqual(10);
    expect(inSpawnGrace(0)).toBe(true);
    expect(inSpawnGrace(SPAWN_GRACE_S - 0.1)).toBe(true);
    expect(inSpawnGrace(SPAWN_GRACE_S)).toBe(false);
  });
});
