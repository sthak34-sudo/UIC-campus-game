import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildParapets, PARAPET_HEIGHT } from './parapets';

const slab = (x0: number, x1: number, z0: number, z1: number, top: number, scale = 1) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry((x1 - x0) / scale, 0.3 / scale, (z1 - z0) / scale));
  m.scale.setScalar(scale);
  m.position.set((x0 + x1) / 2, top - 0.15, (z0 + z1) / 2);
  m.updateMatrixWorld(true);
  return m;
};
const covered = (ps: THREE.Mesh[], x: number, z: number) =>
  ps.some((p) => new THREE.Box3().setFromObject(p).expandByScalar(0.01).containsPoint(new THREE.Vector3(x, new THREE.Box3().setFromObject(p).min.y + 0.5, z)));

describe('roof parapets', () => {
  it('rings a lone roof (node-scaled like Atlas colliders) with a 1.1 m lip on all four sides', () => {
    const ps = buildParapets([slab(0, 10, 0, 6, 20, 5)]);
    const bb = new THREE.Box3(); ps.forEach((p) => bb.expandByObject(p));
    expect(bb.max.y - bb.min.y).toBeCloseTo(PARAPET_HEIGHT, 2);
    expect(bb.min.y).toBeCloseTo(20, 2);
    for (const [x, z] of [[5, 0.05], [5, 5.95], [0.05, 3], [9.95, 3]] as const) expect(covered(ps, x, z), `${x},${z}`).toBe(true);
  });

  it('leaves a gap only onto a neighbouring walkable roof at about the same height', () => {
    const a = slab(0, 10, 0, 6, 20), b = slab(10, 16, 0, 3, 20.5), low = slab(-6, 0, 0, 6, 15);
    const ps = buildParapets([a, b, low]);
    expect(covered(ps, 9.95, 1.5)).toBe(false); // a -> b, 0.5 m step: open
    expect(covered(ps, 9.95, 4.5)).toBe(true); // rest of that edge: closed
    expect(covered(ps, 0.05, 3)).toBe(true); // 5 m drop onto `low`: closed
  });

  it('opens onto a stair collider that lands on the roof', () => {
    const roof = slab(0, 10, 0, 6, 20);
    const stair = slab(4, 6, -3, 0, 19.8);
    const ps = buildParapets([roof], [stair]);
    expect(covered(ps, 5, 0.05)).toBe(false);
    expect(covered(ps, 2, 0.05)).toBe(true);
  });
});
