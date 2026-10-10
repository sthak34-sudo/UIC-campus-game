import { describe, expect, it } from 'vitest';
import { campusSunAngles, sunDirectionWorld } from './solar';

const deg = (r: number) => (r * 180) / Math.PI;

describe('solar position (Chicago, Oct 15, CDT)', () => {
  it('peaks near 39.4° at local solar noon (~12:36 CDT, due south)', () => {
    const a = campusSunAngles(12.6);
    expect(deg(a.elevation)).toBeCloseTo(39.4, 0);
    expect(deg(a.azimuth)).toBeGreaterThan(178);
    expect(deg(a.azimuth)).toBeLessThan(182);
  });
  it('2 pm is in the south-southwest, ~36° up', () => {
    const a = campusSunAngles(14);
    expect(deg(a.elevation)).toBeGreaterThan(34);
    expect(deg(a.elevation)).toBeLessThan(38);
    expect(deg(a.azimuth)).toBeGreaterThan(200);
    expect(deg(a.azimuth)).toBeLessThan(212);
  });
  it('rises around 7:03 and sets around 18:12 (published times)', () => {
    expect(campusSunAngles(6.95).elevation).toBeLessThan(0);
    expect(campusSunAngles(7.2).elevation).toBeGreaterThan(0);
    expect(campusSunAngles(18.0).elevation).toBeGreaterThan(0);
    expect(campusSunAngles(18.4).elevation).toBeLessThan(0);
  });
  it('world direction: x = east, y = up, z = south', () => {
    const morning = sunDirectionWorld(campusSunAngles(9));
    expect(morning[0]).toBeGreaterThan(0.3); // morning sun is in the east
    const noon = sunDirectionWorld(campusSunAngles(12.6));
    expect(noon[2]).toBeGreaterThan(0.7); // south = +z
    expect(Math.hypot(...noon)).toBeCloseTo(1, 6);
  });
});
