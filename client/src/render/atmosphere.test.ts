import { describe, expect, it } from 'vitest';
import { campusSunAngles, sunDirectionWorld } from './solar';
import { computeLighting, skyRadiance, LIGHT_UNITS } from './atmosphere';

const at = (h: number) => computeLighting(sunDirectionWorld(campusSunAngles(h)));
const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('atmosphere / lighting', () => {
  it('afternoon sun is warm white and ~LIGHT_UNITS.sunAfternoon', () => {
    const L = at(14);
    expect(L.isMoon).toBe(false);
    expect(L.sunIntensity).toBeCloseTo(LIGHT_UNITS.sunAfternoon, 0);
    const [r, g, b] = L.sunColor;
    expect(r).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThanOrEqual(b);
    expect(b).toBeGreaterThan(0.6);
  });
  it('sky fill is a plausible fraction of direct light (hazy autumn)', () => {
    const L = at(14);
    const frac = lum(L.skyIrradiance) / L.directHorizontal;
    expect(frac).toBeGreaterThan(0.15);
    expect(frac).toBeLessThan(0.5);
  });
  it('horizon haze is brighter than the zenith', () => {
    const d = sunDirectionWorld(campusSunAngles(14));
    expect(lum(skyRadiance([0, 0.05, -1], d))).toBeGreaterThan(lum(skyRadiance([0, 1, 0], d)));
  });
  it('sunset turns the sun orange and exposure rises', () => {
    const day = at(14);
    const dusk = at(17.7);
    expect(dusk.sunColor[2]).toBeLessThan(0.5);
    expect(dusk.exposure).toBeGreaterThan(day.exposure);
  });
  it('night switches to moonlight with finite, bounded exposure', () => {
    const L = at(22);
    expect(L.isMoon).toBe(true);
    expect(L.sunIntensity).toBeGreaterThan(0);
    expect(Number.isFinite(L.exposure)).toBe(true);
    expect(L.exposure).toBeLessThanOrEqual(14);
    for (const v of [...L.skyIrradiance, ...L.horizonColor, ...L.groundRadiance]) expect(Number.isFinite(v)).toBe(true);
  });
});
