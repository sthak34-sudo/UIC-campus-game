import { describe, expect, it } from 'vitest';
import { hemisphereFill, SHADE_FILL } from './shadeFill';

describe('low-tier shade fill', () => {
  it('lifts outdoor shade on the low tier in daylight only', () => {
    expect(hemisphereFill(false, 0, 1)).toBeCloseTo(SHADE_FILL.lowTierOutdoor);
    expect(hemisphereFill(false, 0, 0)).toBe(0);
    expect(hemisphereFill(true, 0, 1)).toBe(0);
  });
  it('keeps the original interior fill indoors and stays soft', () => {
    expect(hemisphereFill(true, 1, 1)).toBeCloseTo(0.25);
    expect(hemisphereFill(false, 1, 1)).toBeCloseTo(0.25);
    expect(SHADE_FILL.lowTierOutdoor).toBeLessThan(1);
  });
});
