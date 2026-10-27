import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installTileLod } from './index';
import { BUILDING_FAR_M, BUILDING_HIDE_M } from './index';

function box(x: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
  m.position.set(x, 5, 0);
  m.updateMatrixWorld();
  return m;
}

describe('tile LOD', () => {
  it('detailed near, shell past 700 m, hidden only past 1900 m; no-shell tiles stay detailed', () => {
    let cb: (dt: number) => void = () => {};
    const world = { focus: new THREE.Vector3(), onUpdate: (f: (dt: number) => void) => { cb = f; } };
    const xs = [100, 1000, 2500];
    const tiles = xs.map((x) => ({ near: box(x), far: box(x) as THREE.Object3D | null }));
    const bare = { near: box(1000), far: null };
    installTileLod(world as never, [...tiles, bare], BUILDING_FAR_M, BUILDING_HIDE_M);
    cb(1);
    expect(tiles.map((t) => [t.near.visible, t.far!.visible])).toEqual([[true, false], [false, true], [false, false]]);
    expect(bare.near.visible).toBe(true);
  });
});
