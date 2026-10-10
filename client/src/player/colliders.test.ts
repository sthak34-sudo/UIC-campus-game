import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { boxFor, collectShapes, MAX_PIECE, tileCuboid } from './colliders';

describe('collectShapes', () => {
  it('turns a transformed BoxGeometry into a cuboid with world position, scale and rotation', () => {
    const parent = new THREE.Group();
    parent.position.set(10, 0, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4));
    m.position.set(1, 2, 3);
    m.scale.set(2, 1, 1);
    m.rotation.y = Math.PI / 2;
    parent.add(m);
    const s = collectShapes([m], 32);
    expect(s.cuboids).toHaveLength(1);
    expect(s.triangles).toBe(0);
    const c = s.cuboids[0];
    expect(c.half[0]).toBeCloseTo(2);
    expect(c.half[1]).toBeCloseTo(0.5);
    expect(c.half[2]).toBeCloseTo(2);
    expect(c.pos).toEqual([11, 2, 3].map((v) => expect.closeTo(v, 6)));
    expect(Math.abs(c.rot[1])).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('keeps a translated BoxGeometry as a cuboid at the right centre', () => {
    const g = new THREE.BoxGeometry(1, 0.17, 0.28);
    g.translate(0, 0.085, 0);
    const c = boxFor(g, new THREE.Matrix4())!;
    expect(c.pos[1]).toBeCloseTo(0.085);
  });

  it('falls back to triangles for a sheared or rotated-geometry box', () => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.rotateY(0.3); // bounding box no longer matches the parameters
    const s = collectShapes([new THREE.Mesh(g)], 32);
    expect(s.cuboids).toHaveLength(0);
    expect(s.triangles).toBe(12);
    const sheared = new THREE.Matrix4().set(1, 0.5, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    expect(boxFor(new THREE.BoxGeometry(1, 1, 1), sheared)).toBeNull();
  });

  it('applies world matrices to triangles and drops degenerate ones', () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, 1, 0, 0, 0, 0, 1, // good
      0, 0, 0, 1, 0, 0, 2, 0, 0, // degenerate (collinear)
    ], 3));
    const m = new THREE.Mesh(geom);
    m.position.set(5, 1, -2);
    const s = collectShapes([m], 32);
    expect(s.triangles).toBe(1);
    const cell = [...s.cells.values()][0];
    expect(cell.verts.slice(0, 3)).toEqual([5, 1, -2]);
  });

  it('expands every instance of an InstancedMesh (boxes -> cuboids, others -> triangles)', () => {
    const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), undefined, 3);
    const cyl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 6), undefined, 2);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 3; i++) boxes.setMatrixAt(i, m.makeTranslation(i * 3, 0, 0));
    for (let i = 0; i < 2; i++) cyl.setMatrixAt(i, m.makeTranslation(5, 0, 5 + i * 100));
    const s = collectShapes([boxes, cyl], 32);
    expect(s.instances).toBe(5);
    expect(s.cuboids.map((c) => c.pos[0])).toEqual([0, 3, 6]);
    expect(s.triangles).toBe(2 * 24); // 6 sides x 2 + 2 caps x 6
    expect(s.cells.size).toBe(2); // the two cylinders are 100 m apart -> different cells
  });

  it('splits a big merged mesh into grid cells', () => {
    const g = new THREE.PlaneGeometry(200, 200, 20, 20);
    g.rotateX(-Math.PI / 2);
    const s = collectShapes([new THREE.Mesh(g)], 50);
    expect(s.cells.size).toBe(16);
    expect(s.triangles).toBe(800);
  });

  it('tiles huge boxes so no piece exceeds MAX_PIECE (Rapier precision)', () => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(100, 1, 40));
    g.rotation.y = 0.5;
    g.position.set(7, -0.5, 3);
    const s = collectShapes([g], 48);
    expect(s.cuboids).toHaveLength(4 * 2);
    for (const c of s.cuboids) expect(Math.max(...c.half) * 2).toBeLessThanOrEqual(MAX_PIECE);
    // tiles exactly cover the original volume, centred on the original
    const cx = s.cuboids.reduce((a, c) => a + c.pos[0], 0) / s.cuboids.length;
    expect(cx).toBeCloseTo(7, 6);
    expect(tileCuboid({ half: [1, 1, 1], pos: [0, 0, 0], rot: [0, 0, 0, 1] }, 16)).toHaveLength(1);
  });

  it('subdivides huge triangles', () => {
    const g = new THREE.PlaneGeometry(256, 256, 1, 1);
    g.rotateX(-Math.PI / 2);
    const s = collectShapes([new THREE.Mesh(g)], 48);
    expect(s.triangles).toBeGreaterThan(2);
    for (const cell of s.cells.values()) {
      const v = cell.verts;
      for (let i = 0; i < v.length; i += 9) {
        const e = Math.hypot(v[i] - v[i + 3], v[i + 1] - v[i + 4], v[i + 2] - v[i + 5]);
        expect(e).toBeLessThanOrEqual(MAX_PIECE + 1e-6);
      }
    }
    // total area preserved
    let area = 0;
    for (const cell of s.cells.values()) {
      const v = cell.verts;
      for (let i = 0; i < v.length; i += 9) {
        const ux = v[i + 3] - v[i], uz = v[i + 5] - v[i + 2], wx = v[i + 6] - v[i], wz = v[i + 8] - v[i + 2];
        area += Math.abs(ux * wz - uz * wx) / 2;
      }
    }
    expect(area).toBeCloseTo(256 * 256, 3);
  });
});

