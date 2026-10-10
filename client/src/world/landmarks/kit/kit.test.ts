import { describe, expect, it } from 'vitest';
import { MeshBatch } from './batch';
import { ColliderSet } from './colliders';
import { rect, rectArea, rectMinusHoles, rectsOverlap } from './rects';
import { switchbackStair } from './stairs';
import { buildWall, wallPieces } from './walls';

describe('rects', () => {
  it('rectMinusHoles covers exactly outer minus holes, without overlaps', () => {
    const outer = rect(-10, 10, -20, 20);
    const holes = [rect(-3, 2, 4, 9), rect(5, 12, -25, -15)];
    const parts = rectMinusHoles(outer, holes);
    const area = parts.reduce((s, r) => s + rectArea(r), 0);
    expect(area).toBeCloseTo(rectArea(outer) - 5 * 5 - 5 * 5, 6);
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) expect(rectsOverlap(parts[i], parts[j])).toBe(false);
    for (const p of parts) for (const h of holes) expect(rectsOverlap(p, h)).toBe(false);
    expect(parts.length).toBeLessThan(8);
  });
});

describe('walls', () => {
  it('splits a wall around openings and leaves doorways free of colliders', () => {
    const { solid } = wallPieces(10, [{ at: 3, width: 2, bottom: 0, top: 2.4, door: true }]);
    expect(solid).toEqual([[0, 2], [4, 10]]);
    const b = new MeshBatch();
    const c = new ColliderSet();
    buildWall(b, c, { a: [0, 0], b: [10, 0], y0: 0, y1: 3, thickness: 0.2, mat: 'concrete', openings: [{ at: 3, width: 2, bottom: 0, top: 2.4, door: true }, { at: 7, width: 1, bottom: 1, top: 2, glass: 'glass' }] });
    // colliders: two solid parts + lintel over the door; nothing inside the doorway below 2.4 m
    expect(c.count('wall')).toBe(3);
    for (const m of c.meshes) {
      const [sx, sy] = m.userData.collider.size as number[];
      const x0 = m.position.x - sx / 2;
      const x1 = m.position.x + sx / 2;
      const y0 = m.position.y - sy / 2;
      if (x1 > 2.01 && x0 < 3.99) expect(y0).toBeGreaterThanOrEqual(2.4 - 1e-6);
    }
  });
});

describe('stairs', () => {
  it('builds a switchback stair with legal steps, a hole for the upper slab and ramp colliders', () => {
    const b = new MeshBatch();
    const c = new ColliderSet();
    const s = switchbackStair(b, c, { x0: 0, z0: 0, dir: 1, y0: 0, y1: 4.2, flightWidth: 1.6, stepMat: 'concrete', structureMat: 'concrete', railMat: 'metal' });
    expect(s.rise).toBeLessThanOrEqual(0.18);
    expect(s.risers * s.rise).toBeCloseTo(4.2, 6);
    expect(c.count('stair-ramp')).toBe(2);
    expect(s.hole.x1 - s.hole.x0).toBeCloseTo(3.4, 6);
    expect(s.landingY).toBeCloseTo(s.rise * Math.ceil(s.risers / 2), 6);
    // works in the other direction too
    const s2 = switchbackStair(b, c, { x0: 0, z0: 0, dir: -1, y0: 0, y1: 3.5, flightWidth: 1.5, stepMat: 'concrete', structureMat: 'concrete', railMat: 'metal' });
    expect(s2.hole.z1).toBeCloseTo(0, 6);
    expect(s2.hole.z0).toBeLessThan(-3);
  });
});
