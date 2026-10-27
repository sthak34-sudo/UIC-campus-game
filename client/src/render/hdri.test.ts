import { describe, expect, it } from 'vitest';
import { HDRI_PRESETS, parseSky, presetSunDirection } from './hdri';

describe('HDRI sky presets', () => {
  it('defaults to the overcast noon photograph and accepts the afternoon alternative', () => {
    expect(parseSky('')).toBe('kloofendal');
    expect(parseSky('?sky=bridges')).toBe('bridges');
    expect(parseSky('?sky=between_bridges')).toBe('bridges');
    expect(parseSky('?view=x&sky=procedural')).toBe('procedural');
    expect(parseSky('?sky=nope')).toBe('kloofendal');
  });

  it('stores the published sun directions', () => {
    expect([...HDRI_PRESETS.kloofendal.sunDir]).toEqual([0.80, 0.39, 0.45]);
    expect([...HDRI_PRESETS.bridges.sunDir]).toEqual([0.73, 0.24, 0.63]);
    for (const preset of Object.values(HDRI_PRESETS)) {
      const d = presetSunDirection(preset);
      expect(d.length()).toBeCloseTo(1, 5);
      expect(d.y).toBeGreaterThan(0.15);
    }
    expect(presetSunDirection(HDRI_PRESETS.bridges).y).toBeLessThan(presetSunDirection(HDRI_PRESETS.kloofendal).y);
  });
});
