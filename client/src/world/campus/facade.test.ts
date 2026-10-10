import { describe, expect, it } from 'vitest';
import type { PlanPoint } from '../../core/geo';
import { Batcher } from './batcher';
import { buildVolume, floorLevels, type FacadeContext } from './facade';
import { makeRng } from './rng';
import { chooseStyle, makeStyle } from './styles';
import type { CampusBuildingExt } from './types';

function building(over: Partial<CampusBuildingExt> & { outer?: PlanPoint[] } = {}): CampusBuildingExt {
  const outer = over.outer ?? [[0, 0], [30, 0], [30, 12], [0, 12]];
  return {
    id: 'test', name: null, kind: null, height: 12, minHeight: 0, floors: null, heightSource: 'lidar',
    footprint: { outer, holes: [] }, ...over,
  };
}

const open: FacadeContext = { coverAt: () => 0, streetDist: () => 10 };

function bounds(B: Batcher) {
  let minY = Infinity, maxY = -Infinity, nan = false;
  for (const b of B.bufs.values()) {
    for (let i = 0; i < b.nv; i++) {
      const y = b.pos[i * 3 + 1]!;
      if (!Number.isFinite(y)) nan = true;
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return { minY, maxY, nan };
}

describe('style choice', () => {
  it('maps UIC buildings, rowhouses and garages to the right styles', () => {
    expect(chooseStyle(building({ kind: 'university', name: 'Grant Hall', height: 11 }), 900, 0, 0)).toBe('brutalist');
    expect(chooseStyle(building({ kind: 'house', height: 10 }), 180, -300, -300)).toBe('rowhouse');
    expect(chooseStyle(building({ kind: 'parking', name: 'Harrison Street Parking Structure', height: 13 }), 5000, 0, 0)).toBe('garage');
    expect(chooseStyle(building({ kind: 'university', name: 'Academic and Residential Complex', height: 34 }), 1500, 0, 300)).toBe('curtain');
    expect(chooseStyle(building({ kind: 'garage', height: 3 }), 40, 0, 0)).toBe('shed');
  });
});

describe('facade generator', () => {
  it('builds a Brutalist block with windows, parapet and roof inside its height', () => {
    const b = building({ kind: 'university', name: 'Test Hall', height: 16.5 });
    const st = makeStyle('brutalist', makeRng('s'), b);
    const B = new Batcher();
    const res = buildVolume(B, b, st, makeRng('v'), open, { door: true, rooftop: true });
    const { minY, maxY, nan } = bounds(B);
    expect(nan).toBe(false);
    expect(minY).toBeGreaterThanOrEqual(-1e-6);
    expect(maxY).toBeLessThanOrEqual(16.5 + 1e-6);
    expect(B.bufs.get('glass')!.ni).toBeGreaterThan(0);
    expect(B.bufs.get('roof')!.ni).toBeGreaterThan(0);
    expect(res.floors.length).toBeGreaterThanOrEqual(3);
    expect(res.doors.length).toBe(1);
    expect(res.roofY).toBeLessThan(16.5);
  });

  it('is deterministic for the same seed', () => {
    const b = building({ kind: 'house', height: 10 });
    const run = () => {
      const B = new Batcher();
      buildVolume(B, b, makeStyle('rowhouse', makeRng('x'), b), makeRng('y'), open, { door: true, rooftop: false });
      return B.vertexCount;
    };
    expect(run()).toBe(run());
  });

  it('leaves party walls blank when a taller neighbor covers them', () => {
    const b = building({ kind: 'house', height: 10 });
    const st = makeStyle('rowhouse', makeRng('x'), b);
    const free = new Batcher(), covered = new Batcher();
    buildVolume(free, b, st, makeRng('y'), open, { door: false, rooftop: false });
    // everything east of x = 29.5 is covered by a 12 m neighbor
    const ctx: FacadeContext = { coverAt: (x) => (x > 29.5 ? 12 : 0), streetDist: () => 10 };
    buildVolume(covered, b, st, makeRng('y'), ctx, { door: false, rooftop: false });
    expect(covered.bufs.get('glass')!.ni).toBeLessThan(free.bufs.get('glass')!.ni);
  });

  it('builds pitched roofs up to the ridge', () => {
    const b = building({ kind: 'house', height: 11, roofShape: 'gabled', roofHeight: 3 });
    const B = new Batcher();
    buildVolume(B, b, makeStyle('rowhouse', makeRng('x'), b), makeRng('y'), open, { door: true, rooftop: false });
    const { maxY } = bounds(B);
    expect(maxY).toBeCloseTo(11, 5);
  });

  it('spaces floors realistically', () => {
    const st = makeStyle('brutalist', makeRng('s'), building());
    const f = floorLevels(0, 48, st, 13, true);
    expect(f).toHaveLength(13);
    for (let i = 1; i < f.length; i++) expect(f[i]! - f[i - 1]!).toBeGreaterThan(2.6);
  });
});
