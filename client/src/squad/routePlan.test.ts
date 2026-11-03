import { describe, expect, it } from 'vitest';
import { avoidWalls } from './wallSteer';
import { followRoute, newRouteState, planRoute, straightClear, type RouteState } from './routePlan';

// A U-shaped dead end opening to -x, with the goal behind its back wall.
const boxes = [
  { x0: 1.8, x1: 2.2, z0: -3.2, z1: 3.2 },
  { x0: -3, x1: 2.2, z0: 2.8, z1: 3.2 },
  { x0: -3, x1: 2.2, z0: -3.2, z1: -2.8 },
];
const R = 0.35;
export const isFree = (x: number, z: number) =>
  !boxes.some((b) => x > b.x0 - R && x < b.x1 + R && z > b.z0 - R && z < b.z1 + R);
const clearFrom = (p: { x: number; z: number }) => (dx: number, dz: number, max: number) => {
  const l = Math.hypot(dx, dz);
  for (let t = 0.05; t <= max; t += 0.05) if (!isFree(p.x + (dx / l) * t, p.z + (dz / l) * t)) return t - 0.05;
  return max;
};

const walk = (useRoutes: boolean) => {
  let p = { x: 0, z: 0 };
  const goal = { x: 8, z: 0 };
  let side: 1 | -1 = 1;
  let rs: RouteState = newRouteState();
  let plans = 0;
  for (let k = 0; k < 1500; k++) {
    const dt = 1 / 60;
    const d = Math.hypot(goal.x - p.x, goal.z - p.z);
    if (d < 0.5) return { arrived: true, frames: k, plans };
    const st = Math.min(0.06, d);
    let want = { x: p.x + ((goal.x - p.x) / d) * st, z: p.z + ((goal.z - p.z) / d) * st };
    if (useRoutes) {
      const f = followRoute(rs, p, want, goal, dt, (a, b) => planRoute(a, b, isFree));
      rs = f.rs; want = f.to; if (f.planned) plans++;
    }
    const w = avoidWalls(p, want, clearFrom(p), side);
    side = w.side;
    p = { x: w.x, z: w.z };
  }
  return { arrived: false, frames: 1500, plans };
};

describe('route planning', () => {
  it('finds a way out of a dead end to a goal behind it', () => {
    const path = planRoute({ x: 0, z: 0 }, { x: 8, z: 0 }, isFree)!;
    expect(path).not.toBeNull();
    const last = path[path.length - 1]!;
    expect(Math.hypot(last.x - 8, last.z)).toBeLessThan(0.8);
    let at = { x: 0, z: 0 };
    for (const w of path) { expect(straightClear(at, w, isFree)).toBe(true); at = w; }
    expect(path.length).toBeLessThan(8); // smoothed, not one point per cell
  });
  it('returns null when boxed in', () => {
    expect(planRoute({ x: 0, z: 0 }, { x: 8, z: 0 }, (x, z) => Math.hypot(x, z) < 0.5)).toBeNull();
  });
  it('wall steering alone stays stuck in the U; with route planning the bot gets out', () => {
    expect(walk(false).arrived).toBe(false);
    const r = walk(true);
    expect(r.arrived).toBe(true);
    expect(r.plans).toBeGreaterThanOrEqual(1);
  });
  it('does not plan while the bot is making progress', () => {
    let rs = newRouteState();
    let p = { x: 0, z: 0 };
    for (let k = 0; k < 120; k++) {
      const want = { x: p.x + 0.05, z: 0 };
      const f = followRoute(rs, p, want, { x: 50, z: 0 }, 1 / 60, () => { throw new Error('planned'); });
      rs = f.rs; p = f.to;
    }
    expect(rs.path).toBeNull();
  });
});

describe('AI-08 planner cost', () => {
  it('heap pops in f order', async () => {
    const { MinHeap } = await import('./routePlan');
    const hp = new MinHeap();
    for (const f of [5, 1, 4, 2, 3, 0.5]) hp.push({ i: 0, j: 0, f });
    const out: number[] = [];
    while (hp.size) out.push(hp.pop()!.f);
    expect(out).toEqual([0.5, 1, 2, 3, 4, 5]);
  });
  it('unreachable goal stops at the node cap and stays fast', async () => {
    const { planRoute, ROUTE } = await import('./routePlan');
    expect(ROUTE.maxNodes).toBeLessThanOrEqual(1500);
    // Goal sealed inside a ring wall: the search must give up, not scan for long.
    let calls = 0;
    const free = (x: number, z: number) => { calls++; const r = Math.hypot(x - 10, z); return !(r > 2 && r < 3); };
    const t0 = performance.now();
    planRoute({ x: 0, z: 0 }, { x: 10, z: 0 }, free);
    const ms = performance.now() - t0;
    expect(calls).toBeLessThan(ROUTE.maxNodes * 9 + 10);
    expect(ms).toBeLessThan(50);
  });
  it('gate: one plan per frame, failed plans wait', async () => {
    const { createPlanGate } = await import('./routePlan');
    const g = createPlanGate(1, 1.5);
    let runs = 0;
    expect(g.plan('a', 0, () => { runs++; return null; })).toBeNull();
    expect(g.plan('b', 0, () => { runs++; return [1]; })).toBeNull(); // budget used this frame
    g.newFrame();
    expect(g.plan('b', 0, () => { runs++; return [1]; })).toEqual([1]);
    g.newFrame();
    expect(g.plan('a', 1, () => { runs++; return [1]; })).toBeNull(); // still cooling down
    g.newFrame();
    expect(g.plan('a', 1.6, () => { runs++; return [1]; })).toEqual([1]);
    expect(runs).toBe(3);
  });
});
