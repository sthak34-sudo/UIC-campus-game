import * as THREE from 'three';
import type { CampusData } from '../../core/campusData';
import { planToWorld } from '../../core/geo';
import type { World } from '../../core/world';
import { LANDMARK_BASE_Y } from './kit/frame';

const EYE = 1.7;
import { buildDaleyLibrary, LIB, type LibraryInfo } from './daleyLibrary';
import { buildUniversityHall, type UniversityHallInfo } from './universityHall';

/**
 * Hand-crafted landmark buildings (exterior + enterable interiors). OWNER: Landmarks Engineer.
 * Each landmark has an id that the map pipeline writes into CampusBuilding.landmark so the
 * generic campus builder skips that footprint. See README.md for the reusable "enterable building"
 * pattern and kit/ for the helpers.
 */
export const LANDMARK_IDS = ['university-hall', 'daley-library'] as const;
export type LandmarkId = (typeof LANDMARK_IDS)[number];

/** Yaw the player should face at spawn (0 = toward -Z/north; +PI/2 = toward -X/west). */
export const SPAWN_YAW = Math.PI / 2;

export interface LandmarksResult {
  universityHall?: UniversityHallInfo;
  library?: LibraryInfo;
  /** Suggested yaw at spawn (facing the library's main doors). */
  spawnYaw?: number;
}

export async function buildLandmarks(world: World, data: CampusData): Promise<LandmarksResult> {
  const out: LandmarksResult = {};
  const find = (id: LandmarkId) => data.buildings.find((b) => b.landmark === id);

  const uhB = find('university-hall');
  if (uhB) {
    const uh = buildUniversityHall(world, uhB);
    out.universityHall = uh;
    // from the green south-east of the tower (the Quad side), standing on the ground
    // standing on the Quad lawn (south edge, north of Stevenson Hall): a gap in the trees, ~100 m away
    const from = new THREE.Vector3(...planToWorld([16, 90], LANDMARK_BASE_Y + EYE));
    const lookAt = uh.lobbyCenter.clone().setY(47);
    world.addViewpoint('uh-from-quad', { position: from, target: lookAt, fov: 66 });
    const f = uh.frame;
    const local = (x: number, y: number, z: number) => {
      const c = Math.cos(f.rotY);
      const s = Math.sin(f.rotY);
      return new THREE.Vector3(f.origin.x + x * c + z * s, y, f.origin.z - x * s + z * c);
    };
    const dz = uh.eastEntranceZ;
    world.addViewpoint('uh-base', { position: local(uh.halfX + 15, 1.7, dz + 7), target: local(uh.halfX - 3, 7, dz - 1), fov: 70 });
    world.addViewpoint('uh-lobby', { position: local(uh.halfX - 3.4, 1.7, dz + 1), target: local(-2, 2.2, -12), fov: 70 });
  }

  const libB = find('daley-library');
  if (libB) {
    const lib = buildDaleyLibrary(world, libB);
    out.library = lib;
    const { ctx, toWorld } = lib;
    const F = LIB.floorY;
    const doorZ = (ctx.zk(LIB.mainDoorBay) + ctx.zk(LIB.mainDoorBay + 1)) / 2;
    // spawn on the paving between the library and the Lecture Centers, facing the main doors (west)
    world.spawn.copy(toWorld(ctx.hx + 7, F[0] + 0.1, doorZ));
    out.spawnYaw = SPAWN_YAW + lib.frame.rotY;

    // from the paved walk between the library and Lecture Center F, looking north along the east
    // facade (sun behind the camera in the afternoon)
    world.addViewpoint('library-exterior', { position: new THREE.Vector3(...planToWorld([31, -72], LANDMARK_BASE_Y + EYE)), target: toWorld(ctx.hx - 4, 7, -12), fov: 70 });
    // from the plaza south of the library, the whole Quad-side facade receding north
    world.addViewpoint('library-quad-wide', { position: new THREE.Vector3(...planToWorld([36, -117], LANDMARK_BASE_Y + EYE)), target: toWorld(ctx.hx - 6, 6, -22), fov: 75 });
    world.addViewpoint('library-entrance', { position: toWorld(ctx.hx + 2.6, 1.65, doorZ + 0.8), target: toWorld(ctx.hx - 8, 1.4, doorZ - 1.2), fov: 70 });
    world.addViewpoint('library-commons', { position: toWorld(-0.6, F[0] + 1.75, 20.6), target: toWorld(-14, F[0] + 0.8, 35), fov: 70 });
    world.addViewpoint('library-cafe', { position: toWorld(5.5, F[0] + 1.65, 25.5), target: toWorld(16, F[0] + 1.2, 35), fov: 70 });
    world.addViewpoint('library-reading-room', { position: toWorld(17.5, F[0] + 1.65, -19.2), target: toWorld(5, F[0] + 1.2, -29), fov: 70 });
    world.addViewpoint('library-special-collections', { position: toWorld(5.5, F[2] + 1.65, -41.6), target: toWorld(-9, F[2] + 1.0, -58), fov: 70 });
    world.addViewpoint('library-floor4', { position: toWorld(14, F[3] + 1.65, -16), target: toWorld(-10, F[3] + 1.0, 4), fov: 70 });
    const st = LIB.stair;
    world.addViewpoint('library-stairs', { position: toWorld(st.x0 + 7.4, F[0] + 1.7, st.z0 - 3.2), target: toWorld(st.x0 + 1.5, F[0] + 2.6, st.zEnd), fov: 70 });
    world.addViewpoint('library-stacks', { position: toWorld(-9.95, F[1] + 1.65, ctx.zk(9) + 0.2), target: toWorld(-16, F[1] + 1.1, ctx.zk(12) + 4), fov: 70 });
  }
  return out;
}
