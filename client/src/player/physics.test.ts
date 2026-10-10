import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { World } from '../core/world';
import { PLAYER_CONFIG } from './config';
import { initRapier, PlayerPhysics } from './physics';
import { buildTestCourse, COURSE, coursePoint } from './testCourse';

// Real Rapier (WASM) in Node: proves the character controller handles the test course.

function setup() {
  const world = new World();
  const course = buildTestCourse(world);
  const phys = new PlayerPhysics(course.spawn);
  phys.syncColliders(world.colliders);
  return { world, phys, course };
}

/** Runs `seconds` of fixed steps walking along (dx, dz) at `speed`. */
function walk(phys: PlayerPhysics, dx: number, dz: number, speed: number, seconds: number, jumpAt = -1) {
  const n = Math.round(seconds / PLAYER_CONFIG.fixedDt);
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    phys.step(dx, dz, speed, i === jumpAt);
    maxY = Math.max(maxY, phys.feet.y);
  }
  return { maxY };
}

function settle(phys: PlayerPhysics) {
  walk(phys, 0, 0, 0, 0.5);
}

describe('player physics on the test course', () => {
  beforeAll(async () => {
    await initRapier();
  });

  it('builds colliders from boxes, trimeshes and instances', () => {
    const { phys } = setup();
    expect(phys.stats.cuboids).toBeGreaterThan(15);
    expect(phys.stats.trimeshes).toBeGreaterThan(0);
    expect(phys.stats.instances).toBe(11);
  });

  it('spawns grounded on the ground', () => {
    const { phys } = setup();
    settle(phys);
    expect(phys.grounded).toBe(true);
    expect(phys.feet.y).toBeGreaterThan(-0.05);
    expect(phys.feet.y).toBeLessThan(0.1);
  });

  it('walks the expected distance in 5 s', () => {
    const { phys } = setup();
    phys.teleport(coursePoint(0, 0, 4));
    settle(phys);
    const start = phys.feet.clone();
    walk(phys, 1, 0, PLAYER_CONFIG.walkSpeed, 5); // east, open ground
    const d = phys.feet.distanceTo(start);
    expect(d).toBeGreaterThan(PLAYER_CONFIG.walkSpeed * 5 - 0.4);
    expect(d).toBeLessThan(PLAYER_CONFIG.walkSpeed * 5 + 0.05);
  });

  it('stops at a wall', () => {
    const { phys } = setup();
    phys.teleport(coursePoint(-6, 0, 0));
    settle(phys);
    walk(phys, -1, 0, PLAYER_CONFIG.runSpeed, 4);
    const x = phys.feet.x - 1200;
    expect(x).toBeGreaterThan(COURSE.wallX + 0.15 + PLAYER_CONFIG.radius - 0.05);
    expect(x).toBeLessThan(COURSE.wallX + 0.15 + PLAYER_CONFIG.radius + 0.1);
  });

  it('jumps and lands again', () => {
    const { phys } = setup();
    settle(phys);
    const y0 = phys.feet.y;
    const { maxY } = walk(phys, 0, 0, 0, 2, 0);
    expect(maxY - y0).toBeGreaterThan(PLAYER_CONFIG.jumpHeight * 0.85);
    expect(phys.grounded).toBe(true);
    expect(Math.abs(phys.feet.y - y0)).toBeLessThan(0.03);
  });

  it('walks through the doorway into the room', () => {
    const { phys } = setup();
    settle(phys);
    walk(phys, 0, -1, PLAYER_CONFIG.walkSpeed, 9); // north through the door
    expect(phys.feet.z).toBeLessThan(COURSE.room.maxZ - 1.5);
    expect(Math.abs(phys.feet.x - 1200)).toBeLessThan(0.3);
  });

  it('climbs the 12-step stair (boxes) to the 2nd floor', () => {
    const { phys } = setup();
    const x = (COURSE.stairX[0] + COURSE.stairX[1]) / 2;
    phys.teleport(coursePoint(x, 0, -17.5));
    settle(phys);
    walk(phys, 0, -1, PLAYER_CONFIG.walkSpeed, 6);
    expect(phys.feet.y).toBeGreaterThan(COURSE.floor2 - 0.05);
    expect(phys.feet.z - 0).toBeLessThan(COURSE.slabEdgeZ - 0.3);
    expect(phys.grounded).toBe(true);
  });

  it('climbs the stair while running', () => {
    const { phys } = setup();
    const x = (COURSE.stairX[0] + COURSE.stairX[1]) / 2;
    phys.teleport(coursePoint(x, 0, -17.5));
    settle(phys);
    walk(phys, 0, -1, PLAYER_CONFIG.runSpeed, 2.5);
    expect(phys.feet.y).toBeGreaterThan(COURSE.floor2 - 0.05);
  });

  it('comes back down the stair', () => {
    const { phys } = setup();
    const x = (COURSE.stairX[0] + COURSE.stairX[1]) / 2;
    phys.teleport(coursePoint(x, COURSE.floor2 + 0.05, -26));
    settle(phys);
    walk(phys, 0, 1, PLAYER_CONFIG.walkSpeed, 9);
    expect(phys.feet.y).toBeLessThan(0.1);
    expect(phys.feet.z).toBeGreaterThan(-20);
  });

  it('climbs the merged-trimesh stair', () => {
    const { phys } = setup();
    const z = (COURSE.stairsB.z[0] + COURSE.stairsB.z[1]) / 2;
    phys.teleport(coursePoint(COURSE.stairsB.startX + 2, 0, z));
    settle(phys);
    walk(phys, -1, 0, PLAYER_CONFIG.walkSpeed, 6);
    expect(phys.feet.y).toBeGreaterThan(COURSE.stairsB.platformTop - 0.05);
  });

  it('steps up the curb', () => {
    const { phys } = setup();
    phys.teleport(coursePoint(5, 0, 0));
    settle(phys);
    walk(phys, 1, 0, PLAYER_CONFIG.walkSpeed, 3);
    expect(phys.feet.y).toBeGreaterThan(COURSE.curb.height - 0.03);
    expect(phys.feet.x - 1200).toBeGreaterThan(COURSE.curb.minX + 0.5);
  });

  it('is stopped by instanced bollards', () => {
    const { phys } = setup();
    phys.teleport(coursePoint(21, 0, 0));
    settle(phys);
    walk(phys, 1, 0, PLAYER_CONFIG.runSpeed, 3);
    // may wedge into a 0.6 m gap between two bollards, but never passes the row
    expect(phys.feet.x - 1200).toBeLessThan(COURSE.bollardX - 0.15);
  });

  it('walks up the ramp', () => {
    const { phys } = setup();
    phys.teleport(coursePoint(0, 0, 5));
    settle(phys);
    walk(phys, 0, 1, PLAYER_CONFIG.walkSpeed, 12);
    expect(phys.feet.y).toBeGreaterThan(COURSE.ramp.rise - 0.05);
  });

  it('lands on the thin 2nd-floor slab when dropped from above', () => {
    const { phys } = setup();
    phys.teleport(coursePoint(0, COURSE.floor2 + 1.2, -27));
    walk(phys, 0, 0, 0, 2);
    expect(phys.grounded).toBe(true);
    expect(phys.feet.y).toBeGreaterThan(COURSE.floor2 - 0.05);
    expect(phys.feet.y).toBeLessThan(COURSE.floor2 + 0.08);
  });

  it('cannot jump up through the slab from below (head hits it)', () => {
    const { phys } = setup();
    phys.teleport(coursePoint(0, 0, -27));
    settle(phys);
    walk(phys, 0, 0, 0, 2, 0);
    expect(phys.feet.y).toBeLessThan(0.1);
  });

  it('finds a safe spot when the spawn is inside geometry or below ground', () => {
    const { phys } = setup();
    // inside a stair block
    const x = (COURSE.stairX[0] + COURSE.stairX[1]) / 2;
    const s1 = phys.findSafeSpot(coursePoint(x, 0.5, -23.7))!;
    expect(s1).not.toBeNull();
    expect(phys.isFree(s1)).toBe(true);
    expect(s1.y).toBeGreaterThan(COURSE.floor2 - 0.1);
    // below the ground plane
    const s2 = phys.findSafeSpot(coursePoint(30, -2, 30))!;
    expect(s2.y).toBeGreaterThan(-0.05);
    expect(s2.y).toBeLessThan(0.3);
  });

  it('syncs colliders added later', () => {
    const { world, phys } = setup();
    const before = phys.stats.cuboids;
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    m.position.set(1300, 0.5, 0);
    world.addCollider(m);
    expect(phys.syncColliders(world.colliders)).toBe(1);
    expect(phys.stats.cuboids).toBe(before + 1);
    expect(phys.syncColliders(world.colliders)).toBe(0);
  });
});
