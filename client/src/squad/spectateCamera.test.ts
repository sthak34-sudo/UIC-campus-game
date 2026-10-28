import { describe, expect, it } from 'vitest';
import { SPECTATE_LOOK_Y, SPECTATE_MIN_ARM, spectateCamera } from './spectate';

const t = { x: 10, y: 0, z: -3 };
const off = { x: 4.5, y: 2.4, z: 5.5 };
const full = Math.hypot(4.5, 2.4 - SPECTATE_LOOK_Y, 5.5);

describe('spectate camera collision', () => {
  it('sits at the full offset when nothing is in the way', () => {
    const c = spectateCamera(t, off, () => null, null, 1 / 60);
    expect(c.arm).toBeCloseTo(full);
    expect(c.pos.x).toBeCloseTo(14.5);
    expect(c.pos.y).toBeCloseTo(2.4);
    expect(c.pos.z).toBeCloseTo(2.5);
    expect(c.look).toEqual({ x: 10, y: SPECTATE_LOOK_Y, z: -3 });
  });
  it('a wall 3 m out pulls the camera in front of it at once, from the target look point', () => {
    let from: unknown = null;
    const c = spectateCamera(t, off, (f, _d, max) => { from = f; expect(max).toBeCloseTo(full); return 3; }, full, 1 / 60);
    expect(from).toEqual({ x: 10, y: SPECTATE_LOOK_Y, z: -3 });
    expect(c.arm).toBeLessThan(3);
    expect(c.arm).toBeGreaterThan(2.9);
  });
  it('never closer than the minimum arm, and eases back out once clear', () => {
    const tight = spectateCamera(t, off, () => 0, full, 1 / 60);
    expect(tight.arm).toBeCloseTo(SPECTATE_MIN_ARM);
    const next = spectateCamera(t, off, () => null, tight.arm, 1 / 60);
    expect(next.arm).toBeGreaterThan(tight.arm);
    expect(next.arm).toBeLessThan(full);
  });
});
