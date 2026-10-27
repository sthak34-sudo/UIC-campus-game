import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { World } from '../../core/world';
import { PLAYER_CONFIG } from '../../player/config';
import { initRapier, PlayerPhysics } from '../../player/physics';
import { installBuilding, type LoadedBuilding } from './index';
import type { CampusData } from '../../core/campusData';
import { planToWorld } from '../../core/geo';
import { BUILDING_MODELS } from './manifest';

const data = Object.values(import.meta.glob('../../../public/data/campus.json', { eager: true, import: 'default' }))[0] as CampusData;

// Real player physics walks through every door marker of each building glb:
// from 2.5 m outside, along the door's inward axis, to 2.5 m inside.

async function loadGlb(slug: string): Promise<THREE.Object3D> {
  const buf = readFileSync(fileURLToPath(new URL(`../../../public/models/buildings/${slug}.glb`, import.meta.url)));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await loader.parseAsync(ab as ArrayBuffer, '');
  return gltf.scene;
}

for (const model of BUILDING_MODELS) {
  describe(`walk test: ${model.slug}`, () => {
    const world = new World();
    let b: LoadedBuilding;
    const rings = data.buildings.filter((cb) => model.replaces.includes(cb.id) || (!!cb.buildingId && model.replaces.includes(cb.buildingId)))
      .map((cb) => cb.footprint.outer.map((pt) => { const [x, , z] = planToWorld(pt); return { x, z }; }));
    const inFootprint = (p: THREE.Vector3) => rings.some((r) => {
      let c = false;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[i]!, q = r[j]!;
        if ((a.z > p.z) !== (q.z > p.z) && p.x < ((q.x - a.x) * (p.z - a.z)) / (q.z - a.z) + a.x) c = !c;
      }
      return c;
    });
    beforeAll(async () => {
      await initRapier();
      await MeshoptDecoder.ready;
      b = installBuilding(world, model.slug, await loadGlb(model.slug));
      // flat ground around the building (the campus ground is not built in this test)
      const ground = new THREE.Mesh(new THREE.BoxGeometry(600, 0.2, 600));
      ground.position.copy(b.root.position).setY(-0.1);
      world.addCollider(ground);
      world.scene.updateMatrixWorld(true);
    }, 120000);

    it('registers colliders and hides them', () => {
      expect(b.colliders.length).toBeGreaterThanOrEqual(2);
      for (const c of b.colliders) expect(c.visible).toBe(false);
      expect(b.doors.length).toBeGreaterThan(0);
    });

    it('builds a THREE.LOD per group', () => {
      const lods: THREE.LOD[] = [];
      b.root.traverse((o) => { if ((o as THREE.LOD).isLOD) lods.push(o as THREE.LOD); });
      expect(lods.length).toBeGreaterThan(0);
      for (const l of lods) expect(l.levels.length).toBe(2);
    });

    it('door +X points into the building (3 m inward is inside the OSM footprint, 3 m outward is not)', () => {
      expect(rings.length).toBeGreaterThan(0);
      const wrong: string[] = [];
      for (const d of b.doors) {
        const inward = d.inward.clone().setY(0).normalize();
        const inside = inFootprint(d.position.clone().addScaledVector(inward, 3));
        const outside = inFootprint(d.position.clone().addScaledVector(inward, -3));
        if (!inside || outside) wrong.push(`${d.name} inside=${inside} outside=${outside}`);
      }
      expect(wrong).toEqual([]);
    });

    it('every door can be walked through', () => {
      const stuck: string[] = [];
      for (const d of b.doors) {
        const inward = d.inward.clone().setY(0).normalize();
        const start = d.position.clone().addScaledVector(inward, -2.5).setY(0.1);
        const end = d.position.clone().addScaledVector(inward, 2.5);
        const phys = new PlayerPhysics(start);
        phys.syncColliders(world.colliders);
        for (let i = 0; i < 20; i++) phys.step(0, 0, 0, false);
        let t = 0;
        for (;;) {
          const dx = end.x - phys.feet.x, dz = end.z - phys.feet.z, dist = Math.hypot(dx, dz);
          if (dist < 0.3) break;
          t += PLAYER_CONFIG.fixedDt;
          if (t > 8) { stuck.push(`${d.name} (${d.part}) stuck at ${phys.feet.x.toFixed(1)}, ${phys.feet.z.toFixed(1)}`); break; }
          phys.step(dx / dist, dz / dist, PLAYER_CONFIG.walkSpeed, false);
        }
      }
      expect(stuck).toEqual([]);
    }, 120000);

    it('walls block 1 m beside both edges of every door (strict)', () => {
      const leaks: string[] = [];
      let skipped = 0;
      for (const d of b.doors) {
        const inward = d.inward.clone().setY(0).normalize();
        for (const sign of [1, -1]) {
          const side = new THREE.Vector3(-inward.z, 0, inward.x).multiplyScalar(sign * (d.width / 2 + 1.0));
          const start = d.position.clone().add(side).addScaledVector(inward, -2.5).setY(0.1);
          const end = d.position.clone().add(side).addScaledVector(inward, 2.5);
          if (!inFootprint(end) || inFootprint(start)) { skipped++; continue; } // past a building corner, not a wall
          const phys = new PlayerPhysics(start);
          phys.syncColliders(world.colliders);
          for (let i = 0; i < 20; i++) phys.step(0, 0, 0, false);
          for (let t = 0; t < 4; t += PLAYER_CONFIG.fixedDt) {
            const dx = end.x - phys.feet.x, dz = end.z - phys.feet.z, dist = Math.hypot(dx, dz);
            if (dist < 0.3) break;
            phys.step(dx / dist, dz / dist, PLAYER_CONFIG.walkSpeed, false);
          }
          if (phys.feet.distanceTo(end) <= 1.5) leaks.push(`${d.name} ${sign > 0 ? 'left' : 'right'} side open near ${start.x.toFixed(1)}, ${start.z.toFixed(1)}`);
        }
      }
      if (skipped) console.log(`[walk] ${model.slug}: ${skipped} of ${b.doors.length * 2} door sides past a corner, skipped`);
      expect(leaks).toEqual([]);
      expect(skipped).toBeLessThanOrEqual(Math.ceil(b.doors.length / 2)); // at most a quarter of sides may sit past a corner
    }, 120000);
  });
}
