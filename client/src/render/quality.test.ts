import { describe, expect, it } from 'vitest';
import { parseQuality, DEFAULT_QUALITY, QUALITY_PRESETS } from './quality';

describe('quality presets', () => {
  it('parses ?quality=', () => {
    expect(parseQuality('?quality=low').name).toBe('low');
    expect(parseQuality('?view=x&quality=medium').name).toBe('medium');
    expect(parseQuality('').name).toBe(DEFAULT_QUALITY);
    expect(parseQuality('?quality=ultra').name).toBe(DEFAULT_QUALITY);
  });
  it('presets get heavier from low to high', () => {
    const { low, medium, high } = QUALITY_PRESETS;
    expect(low.shadowMapSize).toBeLessThan(medium.shadowMapSize);
    expect(medium.shadowMapSize).toBe(2048);
    expect(high.shadowMapSize).toBe(2048);
    expect(low.cascades).toBeLessThan(high.cascades);
    expect(low.post).toBe(false);
    expect(low.ao).toBe(0);
    expect(low.bloom).toBe(false);
    expect(high.ao).toBeGreaterThan(medium.ao);
  });
});
