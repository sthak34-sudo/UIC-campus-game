import { describe, expect, it } from 'vitest';
import { STEER_GAP, steerStep } from './steer';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('steerStep', () => {
  it('leaves a step alone when nobody is near', () => {
    expect(steerStep({ x: 0, z: 0 }, { x: 0.1, z: 0 }, [{ x: 5, z: 5 }], 1)).toEqual({ x: 0.1, z: 0 });
  });
  it('pushes two stacked bots apart over a few frames', () => {
    let a = { x: 0, z: 0 };
    const b = { x: 0.2, z: 0 };
    for (let i = 0; i < 20; i++) a = steerStep(a, a, [b], 0.1);
    expect(dist(a, b)).toBeGreaterThanOrEqual(STEER_GAP - 1e-6);
  });
  it('separates bots standing exactly on the same spot', () => {
    const r = steerStep({ x: 1, z: 1 }, { x: 1, z: 1 }, [{ x: 1, z: 1 }], 1);
    expect(dist(r, { x: 1, z: 1 })).toBeCloseTo(STEER_GAP);
  });
  it('walks around someone in the way instead of through them', () => {
    const blocker = { x: 2, z: 0.05 };
    let p = { x: 0, z: 0 };
    let minGap = Infinity;
    for (let i = 0; i < 200; i++) {
      const step = { x: p.x + 0.05, z: p.z };
      p = steerStep(p, step, [blocker], 0.08);
      minGap = Math.min(minGap, dist(p, blocker));
    }
    expect(p.x).toBeGreaterThan(4); // got past
    expect(minGap).toBeGreaterThan(STEER_GAP * 0.8); // never walked into them
  });
  it('caps the push per call', () => {
    const r = steerStep({ x: 0, z: 0 }, { x: 0, z: 0 }, [{ x: 0.01, z: 0 }], 0.05);
    expect(dist(r, { x: 0, z: 0 })).toBeCloseTo(0.05);
  });
});
