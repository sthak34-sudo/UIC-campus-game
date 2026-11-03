import { describe, expect, it } from 'vitest';
import { muzzleHeight, muzzlePoint, MUZZLE_HEIGHT } from './weapon';
import { canFire } from './damage';
import { PLAYER_CONFIG } from '../player/config';

describe('crouched muzzle height (CMB-12)', () => {
  it('is 1.4 standing and scales with the crouched capsule', () => {
    expect(muzzleHeight(PLAYER_CONFIG.height)).toBeCloseTo(MUZZLE_HEIGHT, 6);
    expect(muzzleHeight(PLAYER_CONFIG.crouchHeight)).toBeCloseTo(0.96, 6);
    expect(muzzleHeight(PLAYER_CONFIG.crouchHeight)).toBeLessThan(PLAYER_CONFIG.crouchHeight);
  });
  it('muzzlePoint uses it (default stays standing)', () => {
    const f = { x: 0, y: 2, z: 0 };
    expect(muzzlePoint(f, { x: 0, y: 0, z: -1 }).y).toBeCloseTo(3.4, 6);
    expect(muzzlePoint(f, { x: 0, y: 0, z: -1 }, 1.2).y).toBeCloseTo(2.96, 6);
  });
});

describe('no firing while sprinting (CMB-08)', () => {
  const base = { now: 1, lastShotAt: -1, mag: 30, reloading: false, hasGun: true, alive: true };
  it('canFire refuses while the rifle is lowered', () => {
    expect(canFire(base)).toBe(true);
    expect(canFire({ ...base, ready: false })).toBe(false);
    expect(canFire({ ...base, ready: true })).toBe(true);
  });
});
