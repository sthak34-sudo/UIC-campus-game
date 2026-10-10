import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CampusData } from '../core/campusData';
import { World } from '../core/world';
import { PLAYER_CONFIG } from '../player/config';
import { initRapier, PlayerPhysics } from '../player/physics';
import { LIB } from '../world/landmarks/daleyLibrary';
import { buildLandmarks } from '../world/landmarks';

// Integration test (Tech Lead): the REAL player physics walks from the spawn point on the Quad,
// through the library's main doors, and up the real staircase to the top floor.

const data = Object.values(import.meta.glob('../../public/data/campus.json', { eager: true, import: 'default' }))[0] as CampusData;

/** Steer toward each waypoint at walking speed; returns legs that took too long. */
function follow(phys: PlayerPhysics, pts: THREE.Vector3[], speed: number) {
  const stuck: string[] = [];
  for (const [i, p] of pts.entries()) {
    let t = 0;
    for (;;) {
      const dx = p.x - phys.feet.x;
      const dz = p.z - phys.feet.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) break;
      t += PLAYER_CONFIG.fixedDt;
      if (t > 30) {
        stuck.push(`waypoint ${i} (${p.x.toFixed(1)}, ${p.z.toFixed(1)}): stuck at (${phys.feet.x.toFixed(2)}, ${phys.feet.y.toFixed(2)}, ${phys.feet.z.toFixed(2)})`);
        return stuck;
      }
      phys.step(dx / d, dz / d, speed, false);
    }
  }
  return stuck;
}

describe('integration: walk into Daley Library and upstairs', () => {
  beforeAll(async () => {
    await initRapier();
  });

  for (const [label, speed] of [['walking', PLAYER_CONFIG.walkSpeed], ['running', PLAYER_CONFIG.runSpeed]] as const) {
    it(`reaches the top floor ${label}`, async () => {
      const world = new World();
      const res = await buildLandmarks(world, data);
      // stand-in for the campus ground (the Map module provides the real one)
      const ground = new THREE.Mesh(new THREE.BoxGeometry(400, 1, 400));
      ground.position.set(0, -0.5, 0);
      world.addCollider(ground);
      world.scene.updateMatrixWorld(true);

      const phys = new PlayerPhysics(world.spawn.clone());
      phys.syncColliders(world.colliders);
      for (let i = 0; i < 30; i++) phys.step(0, 0, 0, false);
      expect(phys.grounded).toBe(true);

      const { ctx, toWorld } = res.library!;
      const S = LIB.stair;
      const st = ctx.stairs[0];
      const xa = (st.flightA[0] + st.flightA[1]) / 2;
      const xb = (st.flightB[0] + st.flightB[1]) / 2;
      const zLand = S.zEnd - 0.9;
      const path = [toWorld(ctx.hx + 1, 0, 0), toWorld(10, 0, 0.5), toWorld(xa, 0, 2.5)];
      const F = LIB.floorY;
      for (let i = 0; i < F.length - 1; i++)
        path.push(toWorld(xa, 0, S.z0 - 0.6), toWorld(xa, 0, zLand), toWorld(xb, 0, zLand), toWorld(xb, 0, S.z0 - 0.8), toWorld(xa, 0, S.z0 - 0.8));

      const stuck = follow(phys, path, speed);
      expect(stuck).toEqual([]);
      expect(phys.feet.y).toBeGreaterThan(F[F.length - 1] - 0.3);
      expect(world.interiorAt(phys.feet.clone().add(new THREE.Vector3(0, 0.5, 0)))?.id).toBe('daley-library');
    }, 60000);
  }
});
