import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { describe, expect, it, beforeAll } from 'vitest';
import { World } from '../../core/world';
import { installBuilding } from './index';
import { BUILDING_MODELS } from './manifest';
import { landmarkFarLod } from '../landmarks/kit/lod';
import { classifyNode } from './nodes';

async function loadGlb(slug: string): Promise<THREE.Object3D> {
  const buf = readFileSync(fileURLToPath(new URL(`../../../public/models/buildings/${slug}.glb`, import.meta.url)));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await loader.parseAsync(ab as ArrayBuffer, '');
  return gltf.scene;
}

for (const model of BUILDING_MODELS.filter((m) => m.farOnly)) {
  describe(`farOnly install: ${model.slug}`, () => {
    const world = new World();
    let root: THREE.Object3D;
    let landmark: THREE.Group;

    beforeAll(async () => {
      await MeshoptDecoder.ready;
      landmark = new THREE.Group();
      landmark.name = model.landmarkName!;
      landmark.position.set(10, 0, 20);
      world.scene.add(landmark);
      const loaded = installBuilding(world, model, await loadGlb(model.slug));
      root = loaded.root;
      expect(loaded.farOnly).toBe(true);
      expect(loaded.colliders).toEqual([]);
      expect(loaded.doors).toEqual([]);
      expect(loaded.loot).toEqual([]);
    }, 60000);

    it('adds zero colliders and strips LOD0 / doors / loot / cols', () => {
      const names: string[] = [];
      root.traverse((o) => { if (o.name) names.push(o.name); });
      expect(names.some((n) => classifyNode(n) === 'lod' && /_LOD0$/.test(n))).toBe(false);
      expect(names.some((n) => /_LOD1$/.test(n))).toBe(true);
      expect(names.some((n) => classifyNode(n).endsWith('-col'))).toBe(false);
      expect(names.some((n) => classifyNode(n) === 'door')).toBe(false);
      expect(names.some((n) => classifyNode(n) === 'loot')).toBe(false);
      expect(world.colliders.length).toBe(0);
    });

    it('near shows the code landmark; far shows the glb LOD1', () => {
      // Force focus known via world.focus
      world.focus.set(landmark.position.x + 5, 1.7, landmark.position.z);
      // Run a few updates manually
      for (let i = 0; i < 3; i++) world.update(0.016, i * 0.016);
      expect(landmark.visible).toBe(true);
      expect(root.visible).toBe(false);

      world.focus.set(landmark.position.x + 200, 1.7, landmark.position.z);
      for (let i = 0; i < 3; i++) world.update(0.016, i * 0.016);
      expect(landmark.visible).toBe(false);
      expect(root.visible).toBe(true);
    });
  });
}

describe('landmarkFarLod helper', () => {
  it('toggles visibility at the threshold', () => {
    const world = new World();
    const landmark = new THREE.Group();
    landmark.position.set(0, 0, 0);
    const far = new THREE.Group();
    world.scene.add(landmark, far);
    landmarkFarLod(world, landmark, far, 50);
    world.focus.set(10, 0, 0);
    world.update(0.016, 0);
    expect(landmark.visible).toBe(true);
    expect(far.visible).toBe(false);
    world.focus.set(60, 0, 0);
    world.update(0.016, 0.016);
    expect(landmark.visible).toBe(false);
    expect(far.visible).toBe(true);
  });
});
