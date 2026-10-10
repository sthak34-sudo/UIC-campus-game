import * as THREE from 'three';
import type { World } from '../core/world';
import { getMaterial } from '../render/materials';

/**
 * Player test course (only built with URL `?playertest=1`, and by unit tests).
 * Far east of the campus so it never overlaps real buildings. OWNER: Player Engineer.
 *
 * Layout around ORIGIN (world axes: -Z = north = "forward" at camera yaw 0):
 *   north : room 12 x 16 m with a 1.4 m doorway, 12-step stair (0.17 rise / 0.28 run, solid boxes)
 *           up to a thin (0.15 m) 2nd-floor slab, railing, roof
 *   west  : free-standing wall (x = -12)
 *   east  : 0.15 m curb (x 8..20), then a row of instanced bollards at x = 24
 *   south : wedge ramp 0 -> 1.5 m (z 8..18, ~8.5 deg) onto a platform
 *   s-west: 12-step stair built as ONE merged triangle mesh (trimesh path) up to a 2.04 m platform
 */
export const COURSE_ORIGIN = new THREE.Vector3(1200, 0, 0);

export const COURSE = {
  spawn: new THREE.Vector3(0, 0, -4),
  room: { minX: -6, maxX: 6, minZ: -30, maxZ: -14, wall: 0.3, height: 5.2 },
  door: { width: 1.4, height: 2.2 },
  stepRise: 0.17,
  stepRun: 0.28,
  steps: 12,
  /** Top of the 2nd-floor slab (= 12 x 0.17). */
  floor2: 2.04,
  slabThickness: 0.15,
  /** 2nd floor covers z in [room.minZ, slabEdgeZ]. */
  slabEdgeZ: -23.5,
  stairX: [4.3, 5.7] as const,
  wallX: -12,
  curb: { minX: 8, maxX: 20, minZ: -6, maxZ: 6, height: 0.15 },
  bollardX: 24,
  ramp: { minX: -2, maxX: 2, startZ: 8, endZ: 18, rise: 1.5, platformEndZ: 24 },
  stairsB: { z: [12, 14] as const, startX: -14, platformTop: 2.04 },
} as const;

/** Course point (relative) -> world position. */
export function coursePoint(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(COURSE_ORIGIN.x + x, COURSE_ORIGIN.y + y, COURSE_ORIGIN.z + z);
}

export interface CourseInfo {
  spawn: THREE.Vector3;
  group: THREE.Group;
}

export function buildTestCourse(world: World): CourseInfo {
  const g = new THREE.Group();
  g.name = 'player-test-course';
  g.position.copy(COURSE_ORIGIN);
  world.scene.add(g);

  const solid = (mesh: THREE.Mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    mesh.updateWorldMatrix(true, false);
    world.addCollider(mesh);
    return mesh;
  };
  /** Axis-aligned box from min/max corners (course coords). */
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return solid(m);
  };

  // Ground: a subdivided plane (exercises the trimesh path and internal triangle edges).
  const groundGeom = new THREE.PlaneGeometry(120, 120, 24, 24);
  groundGeom.rotateX(-Math.PI / 2);
  solid(new THREE.Mesh(groundGeom, getMaterial('plaza')));
  const grid = new THREE.GridHelper(120, 120, 0x444444, 0x777777);
  grid.position.y = 0.005;
  g.add(grid);

  // --- Room with doorway, stairs, 2nd-floor slab, roof ---------------------------------------
  const R = COURSE.room;
  const W = R.wall;
  const wallMat = getMaterial('concrete');
  const hd = COURSE.door.width / 2;
  // front wall (south side, z = maxZ) with a doorway centred on x = 0
  box(R.minX, 0, R.maxZ - W, -hd, R.height, R.maxZ, wallMat);
  box(hd, 0, R.maxZ - W, R.maxX, R.height, R.maxZ, wallMat);
  box(-hd, COURSE.door.height, R.maxZ - W, hd, R.height, R.maxZ, wallMat);
  // back + side walls
  box(R.minX, 0, R.minZ, R.maxX, R.height, R.minZ + W, wallMat);
  box(R.minX, 0, R.minZ, R.minX + W, R.height, R.maxZ, wallMat);
  box(R.maxX - W, 0, R.minZ, R.maxX, R.height, R.maxZ, wallMat);
  // roof
  box(R.minX, R.height, R.minZ, R.maxX, R.height + 0.25, R.maxZ, getMaterial('roof'));
  // 2nd-floor slab (thin) over the back of the room
  const top = COURSE.floor2;
  box(R.minX + W, top - COURSE.slabThickness, R.minZ + W, R.maxX - W, top, COURSE.slabEdgeZ, getMaterial('interiorFloor'));
  // railing along the slab edge, open where the stair arrives
  box(R.minX + W, top, COURSE.slabEdgeZ - 0.08, COURSE.stairX[0] - 0.1, top + 1.0, COURSE.slabEdgeZ, getMaterial('metal'));
  // stair: 12 solid boxes, step i top = i * rise, last step meets the slab edge
  const [sx0, sx1] = COURSE.stairX;
  const stairMat = getMaterial('concreteDark');
  for (let i = 1; i <= COURSE.steps; i++) {
    const zNear = COURSE.slabEdgeZ + (COURSE.steps - i + 1) * COURSE.stepRun;
    const zFar = zNear - COURSE.stepRun;
    box(sx0, 0, zFar, sx1, i * COURSE.stepRise, zNear, stairMat);
  }
  // a desk on the ground floor (furniture collider)
  box(-4.5, 0, -18, -2.5, 0.75, -17, getMaterial('wood'));

  // --- West wall ----------------------------------------------------------------------------
  box(COURSE.wallX - 0.15, 0, -8, COURSE.wallX + 0.15, 3, 8, wallMat);

  // --- East curb + instanced bollards ---------------------------------------------------------
  const C = COURSE.curb;
  box(C.minX, 0, C.minZ, C.maxX, C.height, C.maxZ, getMaterial('sidewalk'));
  const bollardGeom = new THREE.CylinderGeometry(0.15, 0.15, 1.0, 12);
  bollardGeom.translate(0, 0.5, 0);
  const nB = 11;
  const bollards = new THREE.InstancedMesh(bollardGeom, getMaterial('metal'), nB);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < nB; i++) bollards.setMatrixAt(i, mtx.makeTranslation(COURSE.bollardX, 0, -4.5 + i * 0.9));
  bollards.instanceMatrix.needsUpdate = true;
  solid(bollards);

  // --- South ramp (wedge, trimesh) + platform -------------------------------------------------
  const RA = COURSE.ramp;
  solid(new THREE.Mesh(wedgeGeometry(RA.minX, RA.maxX, RA.startZ, RA.endZ, RA.rise), getMaterial('sidewalk')));
  box(RA.minX, 0, RA.endZ, RA.maxX, RA.rise, RA.platformEndZ, getMaterial('concrete'));

  // --- South-west stair as one merged triangle mesh, rising toward -X --------------------------
  const SB = COURSE.stairsB;
  const run = COURSE.stepRun * COURSE.steps;
  const profile = new THREE.Shape();
  profile.moveTo(0, 0);
  for (let i = 1; i <= COURSE.steps; i++) {
    profile.lineTo((i - 1) * COURSE.stepRun, i * COURSE.stepRise);
    profile.lineTo(i * COURSE.stepRun, i * COURSE.stepRise);
  }
  profile.lineTo(run + 4, SB.platformTop);
  profile.lineTo(run + 4, 0);
  profile.lineTo(0, 0);
  const stairGeom = new THREE.ExtrudeGeometry(profile, { depth: SB.z[1] - SB.z[0], bevelEnabled: false });
  // rotate 180 deg about Y: shape x -> world -x (rising westward), extrude z -> world -z
  stairGeom.rotateY(Math.PI);
  stairGeom.translate(SB.startX, 0, SB.z[1]);
  solid(new THREE.Mesh(stairGeom, stairMat));

  world.addInterior({
    id: 'player-test-room',
    name: 'Player test room',
    box: new THREE.Box3(coursePoint(R.minX, 0, R.minZ), coursePoint(R.maxX, R.height, R.maxZ)),
  });
  world.addViewpoint('player-course', {
    position: coursePoint(14, 9, 12),
    target: coursePoint(0, 1, -10),
  });

  const spawn = coursePoint(COURSE.spawn.x, COURSE.spawn.y, COURSE.spawn.z);
  return { spawn, group: g };
}

/** Solid wedge: floor-level at z0, `rise` high at z1, spanning x0..x1. */
function wedgeGeometry(x0: number, x1: number, z0: number, z1: number, rise: number): THREE.BufferGeometry {
  const v = [
    [x0, 0, z0], [x1, 0, z0], [x0, 0, z1], [x1, 0, z1], [x0, rise, z1], [x1, rise, z1],
  ];
  const tris = [
    [0, 4, 1], [1, 4, 5], // slope (normal up/-z)
    [2, 3, 4], [3, 5, 4], // back face (z1)
    [0, 1, 2], [1, 3, 2], // bottom
    [0, 2, 4], // left side
    [1, 5, 3], // right side
  ];
  const pos: number[] = [];
  for (const t of tris) for (const i of t) pos.push(...v[i]);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.computeVertexNormals();
  return geom;
}
