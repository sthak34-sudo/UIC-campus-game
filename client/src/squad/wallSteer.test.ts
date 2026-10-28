import { describe, expect, it } from 'vitest';
import { avoidWalls, type ClearFn } from './wallSteer';

/** A wall along x = wx from z = z0..z1 (thin), seen from a bot at `p`. */
const wallClear = (p: { x: number; z: number }, wx: number, z0: number, z1: number, r = 0.35): ClearFn => (dx, dz, max) => {
  // Like a shape cast that ignores a wall it starts touching while moving away: first entry counts.
  let wasIn = true;
  for (let t = 0; t <= max; t += 0.02) {
    const x = p.x + dx * t;
    const z = p.z + dz * t;
    const inside = Math.abs(x - wx) < r && z > z0 - r && z < z1 + r;
    if (inside && (!wasIn || t > 0.1)) return t;
    if (t === 0 && inside && Math.abs(p.x + dx * 0.02 - wx) < Math.abs(p.x - wx)) return 0;
    wasIn = inside;
  }
  return max;
};

describe('avoidWalls', () => {
  it('leaves an open step alone', () => {
    const r = avoidWalls({ x: 0, z: 0 }, { x: 0.1, z: 0 }, () => 99);
    expect(r).toMatchObject({ x: 0.1, z: 0, blocked: false });
  });
  it('walks around a wall to reach a goal behind it', () => {
    let p = { x: 0, z: 0 };
    let side: 1 | -1 = 1;
    const goal = { x: 6, z: 0 };
    for (let i = 0; i < 400 && Math.hypot(goal.x - p.x, goal.z - p.z) > 0.2; i++) {
      const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
      const k = Math.min(0.05, d) / d;
      const r = avoidWalls(p, { x: p.x + dx * k, z: p.z + dz * k }, wallClear(p, 3, -1.5, 1.5), side);
      side = r.side;
      // Never inside the wall.
      expect(Math.abs(r.x - 3) < 0.3 && r.z > -1.5 && r.z < 1.5).toBe(false);
      p = r;
    }
    expect(Math.hypot(goal.x - p.x, goal.z - p.z)).toBeLessThan(0.25);
  });
  it('stops short instead of walking into a dead end', () => {
    const r = avoidWalls({ x: 0, z: 0 }, { x: 0.1, z: 0 }, () => 0);
    expect(r.blocked).toBe(true);
    expect(Math.hypot(r.x, r.z)).toBe(0);
  });
});
