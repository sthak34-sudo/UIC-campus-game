import { describe, expect, it } from 'vitest';
import { angleDiff, BOT_SENSE, canNotice, newAcquire, reactionDelay, stepAcquire, turnToward } from './botSense';

const o = { x: 0, z: 0 };
describe('field of view (AI-03)', () => {
  it('sees ahead, not behind', () => {
    // yaw 0 looks along +z.
    expect(canNotice(0, o, { x: 0, z: 10 }, false)).toBe(true);
    expect(canNotice(0, o, { x: 10, z: 10 }, false)).toBe(true); // 45 degrees off
    expect(canNotice(0, o, { x: 10, z: 0 }, false)).toBe(false); // 90 degrees off
    expect(canNotice(0, o, { x: 0, z: -10 }, false)).toBe(false);
  });
  it('a hit or a heard shot lets it notice from behind; someone touching close is felt', () => {
    expect(canNotice(0, o, { x: 0, z: -10 }, true)).toBe(true);
    expect(canNotice(0, o, { x: 0, z: -2 }, false)).toBe(true);
  });
  it('turns at most 300 degrees per second, the short way round', () => {
    expect(turnToward(0, Math.PI, 0.1)).toBeCloseTo((30 * Math.PI) / 180);
    expect(turnToward(0, 0.1, 0.1)).toBeCloseTo(0.1);
    expect(turnToward(3, -3, 0.01)).toBeGreaterThan(3); // across +-pi
    expect(Math.abs(angleDiff(3, -3))).toBeCloseTo(2 * Math.PI - 6);
  });
});

describe('reaction time (AI-02)', () => {
  it('0.25 to 0.6 s up close, longer far away and at the edge of view', () => {
    expect(reactionDelay(10, 0, 0)).toBeCloseTo(0.25);
    expect(reactionDelay(10, 0, 0.9999)).toBeCloseTo(0.6, 3);
    expect(reactionDelay(BOT_SENSE.rangeM, 0, 0)).toBeCloseTo(0.25 + BOT_SENSE.farExtraS);
    expect(reactionDelay(10, BOT_SENSE.fovDeg / 2, 0)).toBeCloseTo(0.25 + BOT_SENSE.edgeExtraS);
  });
  it('does not fire the frame it first sees a target', () => {
    let a = newAcquire();
    let r = stepAcquire(a, 'p0', 10, 0, 1 / 30, () => 0);
    expect(r.ready).toBe(false);
    let t = 0;
    while (!r.ready && t < 2) {
      a = r.a;
      r = stepAcquire(a, 'p0', 10, 0, 1 / 30, () => 0);
      t += 1 / 30;
    }
    expect(t).toBeGreaterThanOrEqual(0.25 - 1e-6);
    expect(t).toBeLessThan(0.3);
    // A different target starts over.
    expect(stepAcquire(r.a, 'p5', 10, 0, 1 / 30, () => 0).ready).toBe(false);
  });
});
