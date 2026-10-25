import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { initRapier } from '../player/physics';
import { castHitscan } from './weapon';

describe('hitscan', () => {
  beforeAll(async () => {
    await initRapier();
  });

  it('hits a box along the ray, misses past the max distance, and skips an excluded collider', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const box = world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(0, 0, -5));
    world.step();

    const hit = castHitscan(world, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -2 }, 20, null);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(4.5, 2);
    expect(hit!.colliderHandle).toBe(box.handle);
    expect(hit!.normal.z).toBeGreaterThan(0.5);
    expect(hit!.point.z).toBeCloseTo(-4.5, 2);

    expect(castHitscan(world, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 2, null)).toBeNull();
    expect(castHitscan(world, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 20, box)).toBeNull();
    expect(castHitscan(world, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 20, null)).toBeNull();
    world.free();
  });
});
