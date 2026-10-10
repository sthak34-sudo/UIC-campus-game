import { describe, expect, it } from 'vitest';
import type { PlanPoint } from '../../core/geo';
import { cleanRing, offsetRing, orientedBox, pointInPolygon, signedArea, triangulate } from './geom';
import { makeRng } from './rng';

const square: PlanPoint[] = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe('geom', () => {
  it('computes area and orientation', () => {
    expect(signedArea(square)).toBe(100);
    expect(signedArea([...square].reverse())).toBe(-100);
  });

  it('removes duplicate and collinear points', () => {
    const r = cleanRing([[0, 0], [5, 0.01], [10, 0], [10, 0.05], [10, 10], [0, 10]]);
    expect(r).toHaveLength(4);
  });

  it('offsets rings with mitered corners', () => {
    const out = offsetRing(square, 1);
    expect(signedArea(out)).toBeCloseTo(144, 5);
    const inn = offsetRing(square, -1);
    expect(signedArea(inn)).toBeCloseTo(64, 5);
  });

  it('triangulates polygons with holes', () => {
    const hole: PlanPoint[] = [[3, 3], [3, 7], [7, 7], [7, 3]];
    const { pts, tris } = triangulate(square, [hole]);
    let area = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const a = pts[tris[i]!]!, b = pts[tris[i + 1]!]!, c = pts[tris[i + 2]!]!;
      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    }
    expect(area).toBeCloseTo(84, 5);
    expect(pointInPolygon(5, 5, square, [hole])).toBe(false);
    expect(pointInPolygon(1, 1, square, [hole])).toBe(true);
  });

  it('finds the oriented box of a rotated rectangle', () => {
    const a = Math.PI / 6, c = Math.cos(a), s = Math.sin(a);
    const rect: PlanPoint[] = ([[0, 0], [20, 0], [20, 8], [0, 8]] as PlanPoint[]).map(([x, y]) => [x * c - y * s, x * s + y * c]);
    const o = orientedBox(rect);
    expect(o.len).toBeCloseTo(20, 5);
    expect(o.wid).toBeCloseTo(8, 5);
  });
});

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = makeRng('building-1'), b = makeRng('building-1'), c = makeRng('building-2');
    const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    for (const v of sa) expect(v >= 0 && v < 1).toBe(true);
  });
});
