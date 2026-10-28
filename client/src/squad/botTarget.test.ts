import { describe, expect, it } from 'vitest';
import { muzzlePoint, pickVisibleTarget, shotOrigin } from './botTarget';

describe('bot targeting', () => {
  const c = [{ id: 'far', dist: 20 }, { id: 'near', dist: 5 }, { id: 'mid', dist: 10 }];
  it('picks the nearest foe it can see', () => {
    expect(pickVisibleTarget(c, () => true)?.id).toBe('near');
    expect(pickVisibleTarget(c, (t) => t.id !== 'near')?.id).toBe('mid');
    expect(pickVisibleTarget(c, () => false)).toBeNull();
    expect(pickVisibleTarget(c, (t) => t.id === 'far', 2)).toBeNull(); // only checks the 2 nearest
  });
  it('puts the muzzle in front of the bot and turns with it', () => {
    const m0 = muzzlePoint({ x: 0, y: 0, z: 0 }, 0);
    expect(m0.z).toBeCloseTo(0.6); expect(m0.y).toBeCloseTo(1.4);
    const m90 = muzzlePoint({ x: 0, y: 0, z: 0 }, Math.PI / 2);
    expect(m90.x).toBeCloseTo(0.6); expect(Math.abs(m90.z)).toBeCloseTo(0.22);
  });
  it('falls back to the eye when the barrel is inside a wall', () => {
    const eye = { x: 0, y: 1.55, z: 0 }, mz = { x: 0, y: 1.4, z: 0.6 };
    expect(shotOrigin(eye, mz, () => true)).toBe(mz);
    expect(shotOrigin(eye, mz, () => false)).toBe(eye);
  });
});
