import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { initRapier } from '../player/physics';
import { castAimedShot } from './weapon';

describe('aimed shot (camera picks the point, muzzle fires the bullet)', () => {
  beforeAll(async () => {
    await initRapier();
  });

  it('a player behind a wall corner cannot hit a target the shoulder camera sees', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    // Wall ends at x = 0.4: player muzzle at x=0 is behind it, camera at x=1.2 peeks past.
    const wall = world.createCollider(RAPIER.ColliderDesc.cuboid(2, 2, 0.1).setTranslation(-1.6, 1.5, -1));
    const target = world.createCollider(RAPIER.ColliderDesc.cuboid(0.4, 1, 0.4).setTranslation(1.2, 1.5, -10));
    world.step();
    const cam = { x: 1.2, y: 1.6, z: 3 };
    const muzzle = { x: 0, y: 1.5, z: 0 };
    const shot = castAimedShot(world, cam, { x: 0, y: 0, z: -1 }, muzzle, 100);
    expect(shot.aimPoint.z).toBeCloseTo(-9.6, 3); // camera sees the target face
    expect(shot.hit?.colliderHandle).toBe(wall.handle);
    expect(shot.hit?.colliderHandle).not.toBe(target.handle);
    expect(shot.blocked).toBe(true);
  });

  it('a normal open shot still lands on the crosshair point', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const target = world.createCollider(RAPIER.ColliderDesc.cuboid(0.4, 1, 0.4).setTranslation(1.2, 1.5, -10));
    world.step();
    const shot = castAimedShot(world, { x: 1.2, y: 1.6, z: 3 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1.5, z: 0 }, 100);
    expect(shot.blocked).toBe(false);
    expect(shot.hit?.colliderHandle).toBe(target.handle);
    expect(shot.hit!.point.x).toBeCloseTo(shot.aimPoint.x, 2);
    expect(shot.hit!.point.y).toBeCloseTo(shot.aimPoint.y, 2);
    expect(shot.hit!.point.z).toBeCloseTo(shot.aimPoint.z, 2);
  });

  it('ignores geometry behind the shooter on the camera ray, and misses cleanly into open sky', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    // Wall between camera and player (camera clipped behind a pillar) must not become the aim point.
    world.createCollider(RAPIER.ColliderDesc.cuboid(2, 2, 0.1).setTranslation(1.2, 1.5, 2));
    world.step();
    const shot = castAimedShot(world, { x: 1.2, y: 1.6, z: 3 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1.5, z: 0 }, 50);
    expect(shot.hit).toBeNull();
    expect(shot.blocked).toBe(false);
    expect(shot.aimPoint.z).toBeCloseTo(-50, 3);
  });
});
