import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { World } from '../../core/world';
import { installBuilding } from './index';
import { BUILDING_MODELS } from './manifest';

// Playtest issue P1: the visible LOD meshes were re-parented to the glb scene and lost the glb
// root's placement, so every building drew ~100 m away from its own colliders (walk through
// visible walls, invisible walls on empty lots, bullets through buildings).

async function loadGlb(slug: string): Promise<THREE.Object3D> {
  const buf = readFileSync(fileURLToPath(new URL(`../../../public/models/buildings/${slug}.glb`, import.meta.url)));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  return gltf.scene;
}

const worldBox = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

describe('building LOD meshes sit on their colliders', () => {
  beforeAll(async () => { await MeshoptDecoder.ready; });
  for (const model of BUILDING_MODELS.filter((m) => !m.farOnly)) {
    it(model.slug, async () => {
      const world = new World();
      const b = installBuilding(world, model.slug, await loadGlb(model.slug));
      b.root.updateMatrixWorld(true);
      const walls = b.colliders.find((c) => c.name.endsWith('_walls_col'))!;
      expect(walls).toBeTruthy();
      const lods: THREE.LOD[] = [];
      b.root.traverse((o) => { if ((o as THREE.LOD).isLOD) lods.push(o as THREE.LOD); });
      expect(lods.length).toBeGreaterThan(0);
      const vis = new THREE.Box3();
      for (const l of lods) vis.union(worldBox(l.levels[0]!.object));
      const col = worldBox(walls);
      const vc = vis.getCenter(new THREE.Vector3()), cc = col.getCenter(new THREE.Vector3());
      expect(Math.hypot(vc.x - cc.x, vc.z - cc.z)).toBeLessThan(3);
      // Same footprint (within 12 m: canopies and plazas overhang the wall hull; the bug was ~100 m).
      expect(Math.abs(vis.min.x - col.min.x)).toBeLessThan(12);
      expect(Math.abs(vis.max.x - col.max.x)).toBeLessThan(12);
      expect(Math.abs(vis.min.z - col.min.z)).toBeLessThan(12);
      expect(Math.abs(vis.max.z - col.max.z)).toBeLessThan(12);
    });
  }
});
