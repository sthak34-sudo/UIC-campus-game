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
import { castHitscan } from '../../combat/weapon';

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

/** Buildings that ship `_stairNN_col` meshes. farOnly shells (UH, Daley) are excluded
 * from this walk suite; Daley's playable stairs live in the landmark tests.
 * Counts match Atlas meta.json collider keys.
 */
const EXPECTED_STAIRS: Readonly<Record<string, number>> = {
  'student-center-east': 2,
  'douglass-hall': 1,
  'grant-hall': 1,
  'lincoln-hall': 1,
  'architecture-design-studios': 2,
};

for (const model of BUILDING_MODELS.filter((m) => !m.farOnly)) {
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

    /** A spot on top of each roof collider (downward raycast onto that mesh, nearest its bbox centre). */
    const roofSpots = (): { name: string; p: THREE.Vector3 }[] => {
      const out: { name: string; p: THREE.Vector3 }[] = [];
      for (const roof of b.colliders.filter((c) => /_roof\d{2}_col$/.test(c.name))) {
        const box = new THREE.Box3().setFromObject(roof);
        const c = box.getCenter(new THREE.Vector3());
        const ray = new THREE.Raycaster();
        const mat = roof.material as THREE.Material;
        const side = mat.side; mat.side = THREE.DoubleSide;
        let found: THREE.Vector3 | null = null;
        const sx = box.max.x - box.min.x, sz = box.max.z - box.min.z;
        for (let r = 0; r <= 6 && !found; r++) for (let k = 0; k < Math.max(1, r * 8) && !found; k++) {
          const a = (k / Math.max(1, r * 8)) * Math.PI * 2;
          const o = new THREE.Vector3(c.x + Math.cos(a) * sx * r / 14, box.max.y + 5, c.z + Math.sin(a) * sz * r / 14);
          ray.set(o, new THREE.Vector3(0, -1, 0));
          const h = ray.intersectObject(roof, false)[0];
          if (h) found = h.point.clone();
        }
        mat.side = side;
        if (found) out.push({ name: roof.name, p: found });
      }
      return out;
    };

    it('ships walkable roof colliders (Rev 5) and a player standing on one stays on it', () => {
      const spots = roofSpots();
      expect(spots.length, `${model.slug} roof colliders`).toBeGreaterThan(0);
      const fell: string[] = [];
      for (const { name, p } of spots) {
        const phys = new PlayerPhysics(p.clone().setY(p.y + 0.3));
        phys.syncColliders(world.colliders);
        for (let i = 0; i < 120; i++) phys.step(0, 0, 0, false);
        for (let i = 0; i < 30; i++) phys.step(1, 0, PLAYER_CONFIG.walkSpeed, false); // a half-second stroll
        for (let i = 0; i < 30; i++) phys.step(-1, 0, PLAYER_CONFIG.walkSpeed, false);
        for (let i = 0; i < 60; i++) phys.step(0, 0, 0, false);
        if (phys.feet.y < p.y - 0.5) fell.push(`${name}: top ${p.y.toFixed(2)} feet ${phys.feet.y.toFixed(2)}`);
      }
      expect(fell).toEqual([]);
    }, 120000);

    it('roofs block shots fired upward from below', () => {
      const leaks: string[] = [];
      for (const { name, p } of roofSpots()) {
        const phys = new PlayerPhysics(new THREE.Vector3(p.x, 400, p.z));
        phys.syncColliders(world.colliders);
        const origin = { x: p.x, y: p.y - 1.5, z: p.z };
        const hit = castHitscan(phys.world, origin, { x: 0, y: 1, z: 0 }, 50, phys.collider);
        if (!hit || hit.point.y > p.y + 0.05) leaks.push(`${name}: shot from y=${origin.y.toFixed(1)} ${hit ? `hit at ${hit.point.y.toFixed(2)}` : 'went through'}`);
      }
      expect(leaks).toEqual([]);
    });

    it('registers colliders and hides them', () => {
      expect(b.colliders.length).toBeGreaterThanOrEqual(2);
      for (const c of b.colliders) expect(c.visible).toBe(false);
      expect(b.doors.length).toBeGreaterThan(0);
    });

    it('builds a THREE.LOD per group with the planned swap distances', () => {
      const lods: THREE.LOD[] = [];
      b.root.traverse((o) => { if ((o as THREE.LOD).isLOD) lods.push(o as THREE.LOD); });
      expect(lods.length).toBeGreaterThan(0);
      for (const l of lods) expect(l.levels.length).toBe(2);
      const distances = lods.map((l) => l.levels[1]!.distance).sort((a, b) => a - b);
      if (model.slug === 'student-center-east') {
        // low SCE block at 120 m, tower at 160 m
        expect(distances).toEqual([120, 160]);
      } else {
        for (const d of distances) expect(d).toBe(120);
      }
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

    it('expected stairs exist and each climbs to above 2.5 m', () => {
      const stairs = b.colliders.filter((c) => /_stair\d{2}_col$/.test(c.name));
      const expected = EXPECTED_STAIRS[model.slug] ?? 0;
      expect(stairs.length, `${model.slug} stair count`).toBe(expected);
      if (expected === 0) return;
      const failed: string[] = [];
      for (const stair of stairs) {
        const g = stair.geometry as THREE.BufferGeometry;
        const pos = g.attributes.position!;
        const v = new THREE.Vector3();
        let minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(stair.matrixWorld);
          minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
        }
        // average the low and high ends so we walk the center of the ramp, not a corner vertex
        const lows: THREE.Vector3[] = [], highs: THREE.Vector3[] = [];
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(stair.matrixWorld);
          if (v.y <= minY + 0.15) lows.push(v.clone());
          if (v.y >= maxY - 0.15) highs.push(v.clone());
        }
        const avg = (arr: THREE.Vector3[]) => arr.reduce((a, pt) => a.add(pt), new THREE.Vector3()).multiplyScalar(1 / arr.length);
        const low = avg(lows), high = avg(highs);
        const dir = high.clone().sub(low).setY(0);
        if (dir.lengthSq() < 1e-4) { failed.push(`${stair.name}: no horizontal run`); continue; }
        dir.normalize();
        const start = low.clone().setY(0.15);
        const end = high.clone().addScaledVector(dir, 0.5);
        const phys = new PlayerPhysics(start);
        phys.syncColliders(world.colliders);
        for (let i = 0; i < 30; i++) phys.step(0, 0, 0, false);
        let t = 0;
        for (;;) {
          const dx = end.x - phys.feet.x, dz = end.z - phys.feet.z, dist = Math.hypot(dx, dz);
          if (dist < 0.3) break;
          t += PLAYER_CONFIG.fixedDt;
          if (t > 25) { failed.push(`${stair.name}: stuck at y=${phys.feet.y.toFixed(2)} after 25s`); break; }
          phys.step(dx / dist, dz / dist, PLAYER_CONFIG.walkSpeed, false);
        }
        if (phys.feet.y <= 2.5) failed.push(`${stair.name}: ended at y=${phys.feet.y.toFixed(2)} (need > 2.5)`);
      }
      expect(failed).toEqual([]);
    }, 120000);
  });
}
