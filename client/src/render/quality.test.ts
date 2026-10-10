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
    expect(medium.shadowMapSize).toBeLessThan(high.shadowMapSize);
    expect(low.post).toBe(false);
    expect(high.ao).toBeGreaterThan(medium.ao);
  });
});
