import { describe, expect, it } from 'vitest';
import { PLAYER_CONFIG } from './config';
import { directionScale, fireReady, moveSpeed, sprintActive, type MoveIntent } from './movement';

const cfg = { ...PLAYER_CONFIG, speedScale: 1 };
const base: MoveIntent = { forward: 1, right: 0, run: false, crouched: false, aiming: false, firing: false, allowRun: true };

describe('movement tiers (CMB-08)', () => {
  it('jogs at 4.7 by default and sprints at 6.3 with Shift', () => {
    expect(moveSpeed(base, cfg)).toEqual({ speed: 4.7, sprinting: false });
    expect(moveSpeed({ ...base, run: true }, cfg)).toEqual({ speed: 6.3, sprinting: true });
  });
  it('crouch is 2.7 and never sprints', () => {
    expect(moveSpeed({ ...base, crouched: true, run: true }, cfg)).toEqual({ speed: 2.7, sprinting: false });
  });
  it('aiming or holding the trigger breaks a sprint', () => {
    expect(sprintActive({ ...base, run: true, aiming: true })).toBe(false);
    expect(sprintActive({ ...base, run: true, firing: true })).toBe(false);
    expect(moveSpeed({ ...base, run: true, firing: true }, cfg).speed).toBeCloseTo(4.7);
  });
  it('sprint is forward only and off while crawling', () => {
    expect(sprintActive({ ...base, run: true, forward: 0, right: 1 })).toBe(false);
    expect(sprintActive({ ...base, run: true, forward: -1 })).toBe(false);
    expect(sprintActive({ ...base, run: true, allowRun: false })).toBe(false);
  });
  it('backward is x0.8 and strafe x0.9', () => {
    expect(directionScale(-1, 0, cfg)).toBeCloseTo(0.8);
    expect(directionScale(0, 1, cfg)).toBeCloseTo(0.9);
    expect(directionScale(1, 0, cfg)).toBe(1);
    expect(moveSpeed({ ...base, forward: -1 }, cfg).speed).toBeCloseTo(4.7 * 0.8);
    const diag = directionScale(Math.SQRT1_2, Math.SQRT1_2, cfg);
    expect(diag).toBeGreaterThan(0.9);
    expect(diag).toBeLessThan(1);
  });
  it('aiming down sights moves at x0.7 (CMB-10)', () => {
    expect(moveSpeed({ ...base, aiming: true }, cfg).speed).toBeCloseTo(4.7 * 0.7);
    expect(moveSpeed({ ...base, aiming: true, crouched: true }, cfg).speed).toBeCloseTo(2.7 * 0.7);
  });
  it('speedScale still applies (downed crawl)', () => {
    expect(moveSpeed(base, { ...cfg, speedScale: 0.2 }).speed).toBeCloseTo(4.7 * 0.2);
  });
  it('the rifle is only ready a moment after the sprint ends', () => {
    expect(fireReady(true, 10, cfg)).toBe(false);
    expect(fireReady(false, 0.05, cfg)).toBe(false);
    expect(fireReady(false, cfg.sprintToFire, cfg)).toBe(true);
  });
});
