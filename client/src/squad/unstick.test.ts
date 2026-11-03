import { describe, expect, it } from 'vitest';
import { planRoute } from './routePlan';
import { newWatchdog, spiralFree, stepWatchdog, UNSTICK, unstickSpot } from './unstick';

describe('start spots (AI-06)', () => {
  it('keeps a free spot as it is', () => {
    expect(spiralFree({ x: 1, z: 2 }, () => true)).toEqual({ x: 1, z: 2 });
  });
  it('moves a blocked spot to the nearest free cell', () => {
    // A 3 m box of wall around the origin.
    const ok = (x: number, z: number) => Math.abs(x) > 1.5 || Math.abs(z) > 1.5;
    const p = spiralFree({ x: 0, z: 0 }, ok)!;
    expect(ok(p.x, p.z)).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeLessThan(2.4);
  });
  it('gives up when nothing is free in range', () => {
    expect(spiralFree({ x: 0, z: 0 }, () => false)).toBeNull();
  });
});

describe('stuck watchdog (AI-06, AI-07)', () => {
  it('fires after 8 s without progress, not before', () => {
    let w = newWatchdog();
    const goal = { x: 300, z: 0 };
    let fired = -1;
    for (let i = 1; i <= 100; i++) {
      const r = stepWatchdog(w, { x: 0, z: Math.sin(i) * 0.3 }, goal, 0.1);
      w = r.w;
      if (r.fire && fired < 0) fired = i * 0.1;
    }
    expect(fired).toBeGreaterThanOrEqual(UNSTICK.watchdogS - 0.11);
    expect(fired).toBeLessThan(UNSTICK.watchdogS + 0.35);
  });
  it('does not fire while the bot gets closer, or when it stands still on purpose', () => {
    let w = newWatchdog();
    for (let i = 0; i < 200; i++) {
      const r = stepWatchdog(w, { x: i * 0.15, z: 0 }, { x: 300, z: 0 }, 0.1);
      expect(r.fire).toBe(false);
      w = r.w;
    }
    for (let i = 0; i < 200; i++) expect(stepWatchdog(w, { x: 0, z: 0 }, null, 0.1).fire).toBe(false);
  });

  it('regression at the recorded spot (-18.3, -11): a pocket deeper than the planner reach still gets out', () => {
    // Recorded in the audit (realA): p1 and p2 stuck 10 to 12 s at (-18.3, -11) on their way to a goal
    // 301 m away. Model the dead end as a long walled corridor open only at the far (west) end,
    // so the planner (24 m reach) finds no way round and the watchdog has to step in.
    const at = { x: -18.3, z: -11 };
    const goal = { x: at.x + 301, z: at.z };
    const ok = (x: number, z: number) => {
      const dx = x - at.x;
      const dz = z - at.z;
      const inCorridor = dx < 2 && dx > -60 && Math.abs(dz) < 2;
      const wall = !inCorridor && dx < 3 && dx > -61 && Math.abs(dz) < 3;
      return !wall;
    };
    // The planner can't see past its 24 m reach: whatever it returns stays inside the corridor.
    const plan = planRoute(at, goal, ok);
    for (const p of plan ?? []) expect(p.x - at.x).toBeLessThan(3);
    let w = newWatchdog();
    let fire = false;
    for (let t = 0; t < UNSTICK.watchdogS + 0.5 && !fire; t += 1 / 30) ({ w, fire } = stepWatchdog(w, at, goal, 1 / 30));
    expect(fire).toBe(true);
    const spot = unstickSpot(at, goal, ok)!;
    expect(ok(spot.x, spot.z)).toBe(true);
    // Outside the corridor walls, on the goal side.
    expect(spot.x - at.x).toBeGreaterThanOrEqual(3);
  });
});
