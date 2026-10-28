import { describe, expect, it } from 'vitest';
import { FALL_BLEND_S, LAND_SHOW_S, fallShare, landWeight } from './airAnim';

describe('jump / fall / land', () => {
  it('stays on the take-off clip early, then hands off to the fall loop before it ends', () => {
    expect(fallShare(0.1, 1.33)).toBe(0);
    expect(fallShare(1.33 * 0.85 + FALL_BLEND_S, 1.33)).toBe(1);
    // Fully on the fall loop before the take-off clip would clamp.
    expect(fallShare(1.33, 1.33)).toBeGreaterThan(0.5);
    expect(fallShare(10, 1.33)).toBe(1);
  });
  it('plays the land clip briefly and fades it out', () => {
    expect(landWeight(0)).toBe(1);
    expect(landWeight(LAND_SHOW_S * 0.75)).toBeCloseTo(0.5);
    expect(landWeight(LAND_SHOW_S)).toBe(0);
    expect(landWeight(-1)).toBe(0);
  });
});
