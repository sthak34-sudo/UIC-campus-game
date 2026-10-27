import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildGroundGun, LootField } from './loot';

// Label sprites draw on a canvas; tests run without a DOM, so give them a no-op 2D context.
const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
(globalThis as unknown as { document: unknown }).document ??= {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
};

function fakeRifle(): THREE.Object3D {
  const g = new THREE.Group();
  // Rifle-ish: long along -Z, taller than wide.
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.9), new THREE.MeshStandardMaterial()));
  return g;
}

describe('guns as ground loot', () => {
  it('lays the rifle on its side resting on the floor', () => {
    const gun = buildGroundGun(fakeRifle(), 0);
    gun.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gun);
    expect(box.min.y).toBeGreaterThanOrEqual(0);
    expect(box.min.y).toBeLessThan(0.01);
    expect(box.max.y - box.min.y).toBeLessThan(0.08);
    expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeGreaterThan(0.8);
  });

  it('keeps ground guns still, can be taken, and never disposes the shared rifle model', () => {
    const scene = new THREE.Scene();
    const tpl = fakeRifle();
    const mesh = tpl.children[0] as THREE.Mesh;
    let disposed = false;
    mesh.geometry.addEventListener('dispose', () => { disposed = true; });
    const field = new LootField(scene, [{ kind: 'gun', position: { x: 0, y: 1, z: 0 } }], tpl);
    const g = scene.getObjectByName('combat-loot-gun')!;
    field.update(3);
    expect(g.position.y).toBe(1);
    expect(g.rotation.y).toBe(0);
    const near = field.nearest({ x: 0.3, y: 1, z: 0 }, 3);
    expect(near?.kind).toBe('gun');
    expect(field.take(near!.index, 3)).toBe('gun');
    field.dispose(scene);
    expect(disposed).toBe(false);
  });
});
