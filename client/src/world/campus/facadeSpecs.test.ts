import { describe, expect, it } from 'vitest';
import { MATERIAL_NAMES } from '../../render/materials';
import type { PlanPoint } from '../../core/geo';
import { Batcher } from './batcher';
import { buildVolume, type FacadeContext } from './facade';
import { FACADE_SPECS, findFacadeSpec } from './facadeSpecs';
import { applyFeature, type FeatureName } from './features';
import { mat, PLANNED_MATERIALS } from './mat';
import { makeRng } from './rng';
import { makeStyle, type WinType } from './styles';
import type { CampusBuildingExt } from './types';

const open: FacadeContext = { coverAt: () => 0, streetDist: () => 10 };

function building(name: string, h = 12, outer: PlanPoint[] = [[0, 0], [40, 0], [40, 16], [0, 16]]): CampusBuildingExt {
  return { id: name, name, kind: 'university', height: h, minHeight: 0, floors: null, heightSource: 'lidar', footprint: { outer, holes: [] } };
}

function finite(B: Batcher): boolean {
  for (const b of B.bufs.values()) for (let i = 0; i < b.nv * 3; i++) if (!Number.isFinite(b.pos[i]!)) return false;
  return true;
}

describe('facade materials', () => {
  it('maps every planned material to a real library material', () => {
    for (const k of Object.keys(PLANNED_MATERIALS) as (keyof typeof PLANNED_MATERIALS)[]) {
      expect(MATERIAL_NAMES).toContain(mat(k));
    }
    expect(mat('concrete')).toBe('concrete');
  });
});

describe('facade specs (docs/research/facades.md)', () => {
  it('finds buildings by their Overture name', () => {
    expect(findFacadeSpec('Lecture Center C')?.features).toContain('butterflyColonnade');
    expect(findFacadeSpec('Burnham Hall')?.style?.upperType).toBe('grille');
    expect(findFacadeSpec('Henry Hall')?.style?.upperType).toBe('gallery');
    expect(findFacadeSpec('Nonexistent Hall')).toBeUndefined();
    const names = FACADE_SPECS.flatMap((s) => s.names);
    expect(new Set(names).size).toBe(names.length); // no duplicates
  });

  for (const t of ['punched', 'blockI', 'gallery', 'grille', 'glazed', 'none'] as WinType[]) {
    it(`frame mode with ${t} windows stays inside the building envelope`, () => {
      const b = building(`t-${t}`, 13);
      const st = { ...makeStyle('brutalist', makeRng('s'), b), frameBays: true, groundType: t, upperType: t };
      const B = new Batcher();
      const res = buildVolume(B, b, st, makeRng('v'), open, { door: true, rooftop: false });
      expect(finite(B)).toBe(true);
      expect(B.vertexCount).toBeGreaterThan(100);
      expect(res.doors.length).toBe(1); // a door is always cut, whatever the window type
      // nothing pokes more than the pier/band/cornice projection outside the footprint
      for (const buf of B.bufs.values()) {
        for (let i = 0; i < buf.nv; i++) {
          const x = buf.pos[i * 3]!, z = buf.pos[i * 3 + 2]!;
          expect(x).toBeGreaterThan(-1.2); expect(x).toBeLessThan(41.2);
          expect(-z).toBeGreaterThan(-1.2); expect(-z).toBeLessThan(17.2);
        }
      }
    });
  }

  for (const f of ['butterflyColonnade', 'twistedPylons', 'scissorStairs', 'doubleStair', 'porch', 'aluminumFins', 'roofPV'] as FeatureName[]) {
    it(`feature ${f} adds finite geometry`, () => {
      const b = building(`f-${f}`, f === 'aluminumFins' || f === 'scissorStairs' ? 30 : 14, [[0, 0], [60, 0], [60, 24], [0, 24]]);
      const B = new Batcher(), C = new Batcher();
      const rng = makeRng('f');
      const res = buildVolume(B, b, makeStyle('brutalist', rng, b), rng, open, { door: false, rooftop: false });
      const before = B.vertexCount;
      applyFeature(f, { B, C, v: b, res, rng, ctx: open });
      expect(B.vertexCount).toBeGreaterThan(before);
      expect(finite(B) && finite(C)).toBe(true);
    });
  }
});
