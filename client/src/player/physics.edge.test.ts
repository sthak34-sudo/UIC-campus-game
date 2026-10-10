import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { World } from '../core/world';
import { PLAYER_CONFIG } from './config';
import { initRapier, PlayerPhysics } from './physics';
import { buildTestCourse, COURSE, coursePoint } from './testCourse';

function walk(phys: PlayerPhysics, dx: number, dz: number, speed: number, seconds: number) {
  const n = Math.round(seconds / PLAYER_CONFIG.fixedDt);
  for (let i = 0; i < n; i++) phys.step(dx, dz, speed, false);
}
const settle = (phys: PlayerPhysics) => walk(phys, 0, 0, 0, 0.5);

const flatWorld = () => {
  const world = new World();
  const g = new THREE.Mesh(new THREE.BoxGeometry(200, 1, 200));
  g.position.y = -0.5;
  world.addCollider(g);
  return world;
};

const course = () => {
  const world = new World();
  const c = buildTestCourse(world);
  const phys = new PlayerPhysics(c.spawn);
  phys.syncColliders(world.colliders);
  return phys;
};

describe('player physics edge cases', () => {
  beforeAll(async () => {
    await initRapier();
  });

  it('lands on a zero-thickness triangle floor after a long fall (no tunnelling)', () => {
    const world = new World();
    const geom = new THREE.PlaneGeometry(20, 20, 3, 3);
    geom.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(geom);
    floor.position.y = 10;
    world.addCollider(floor);
    const phys = new PlayerPhysics(new THREE.Vector3(0.3, 60, 0.2));
    phys.syncColliders(world.colliders);
    walk(phys, 0, 0, 0, 5);
    expect(phys.grounded).toBe(true);
    expect(phys.feet.y).toBeGreaterThan(9.95);
    expect(phys.feet.y).toBeLessThan(10.08);
  });

  it('climbs stairs via an invisible ramp hidden under the steps', () => {
    const world = flatWorld();
    const len = 3.36;
    const rise = 2.04;
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, Math.hypot(len, rise)));
    ramp.visible = false;
    ramp.rotation.x = Math.atan2(rise, len);
    ramp.position.set(0, rise / 2 - 0.05, -10 - len / 2);
    world.addCollider(ramp);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, rise, 4));
    top.position.set(0, rise / 2, -10 - len - 2);
    world.addCollider(top);
    const phys = new PlayerPhysics(new THREE.Vector3(0, 0, -8));
    phys.syncColliders(world.colliders);
    settle(phys);
    walk(phys, 0, -1, PLAYER_CONFIG.walkSpeed, 6);
    expect(phys.feet.y).toBeGreaterThan(rise - 0.06);
  });

  it('climbs the course stair at mission speed (2x run)', () => {
    const phys = course();
    const x = (COURSE.stairX[0] + COURSE.stairX[1]) / 2;
    phys.teleport(coursePoint(x, 0, -16));
    settle(phys);
    walk(phys, 0, -1, PLAYER_CONFIG.runSpeed * 2, 1.6);
    expect(phys.feet.y).toBeGreaterThan(COURSE.floor2 - 0.05);
  });

  it('runs down the stair at 2x speed staying on the steps (snap to ground)', () => {
    const phys = course();
    const x = (COURSE.stairX[0] + COURSE.stairX[1]) / 2;
    phys.teleport(coursePoint(x, COURSE.floor2 + 0.05, -26));
    settle(phys);
    let airborneSteps = 0;
    for (let i = 0; i < 90; i++) {
      phys.step(0, 1, PLAYER_CONFIG.runSpeed * 2, false);
      if (!phys.grounded) airborneSteps++;
    }
    expect(phys.feet.y).toBeLessThan(0.05);
    expect(airborneSteps).toBeLessThan(10);
  });

  it('does not climb a 0.3 m ledge or a 60 degree slope', () => {
    const world = flatWorld();
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 4));
    ledge.position.set(0, 0.15, -6);
    world.addCollider(ledge);
    const steep = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 8));
    steep.rotation.x = (60 * Math.PI) / 180;
    steep.position.set(10, 1, -6);
    world.addCollider(steep);
    const phys = new PlayerPhysics(new THREE.Vector3(0, 0, 0));
    phys.syncColliders(world.colliders);
    settle(phys);
    walk(phys, 0, -1, PLAYER_CONFIG.runSpeed, 3);
    expect(phys.feet.y).toBeLessThan(0.05);
    phys.teleport(new THREE.Vector3(10, 0, 0));
    settle(phys);
    walk(phys, 0, -1, PLAYER_CONFIG.runSpeed, 3);
    expect(phys.feet.y).toBeLessThan(0.6);
  });

  it('slides along a wall when walking into it at an angle', () => {
    const world = flatWorld();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 3, 0.3));
    wall.position.set(0, 1.5, -3);
    world.addCollider(wall);
    const phys = new PlayerPhysics(new THREE.Vector3(0, 0, -2));
    phys.syncColliders(world.colliders);
    settle(phys);
    const d = Math.SQRT1_2;
    walk(phys, d, -d, PLAYER_CONFIG.walkSpeed, 3);
    expect(phys.feet.z).toBeGreaterThan(-3 + 0.15 + PLAYER_CONFIG.radius - 0.02);
    expect(phys.feet.x).toBeGreaterThan(2.4); // ~cos45 * 1.4 * 3 = 2.97 along the wall
  });

  it('adds and later removes the fallback ground for an empty world', () => {
    const world = new World();
    const phys = new PlayerPhysics(new THREE.Vector3(0, 2, 0));
    phys.syncColliders(world.colliders);
    expect(phys.findSafeSpot(new THREE.Vector3(0, 2, 0))).toBeNull();
    phys.addFallbackGround(0, new THREE.Vector3());
    const spot = phys.findSafeSpot(new THREE.Vector3(0, 2, 0))!;
    expect(spot.y).toBeLessThan(0.1);
    const g = new THREE.Mesh(new THREE.BoxGeometry(50, 1, 50));
    g.position.y = -0.5;
    world.addCollider(g);
    phys.syncColliders(world.colliders);
    expect(phys.maybeRemoveFallback(new THREE.Vector3())).toBe(true);
    expect(phys.hasFallbackGround).toBe(false);
  });
});
