import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { initRapier } from './physics';
import { createWallProbe, WALL_PROBE_RADIUS } from './wallProbe';

describe('wall probe', () => {
  beforeAll(async () => { await initRapier(); });
  it('finds walls, ignores low steps and skipped colliders (people)', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50).setTranslation(0, -0.5, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 1.5, 3).setTranslation(4, 1.5, 0)); // wall
    world.createCollider(RAPIER.ColliderDesc.cuboid(3, 0.085, 0.15).setTranslation(0, 0.085, -2)); // 17 cm step
    const person = world.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.3).setTranslation(0, 0.9, 3));
    world.step();
    const probe = createWallProbe(world, (h) => h === person.handle);
    expect(probe.clear(0, 0, 0, 1, 0, 10)).toBeCloseTo(4 - 0.1 - WALL_PROBE_RADIUS, 1);
    expect(probe.clear(0, 0, 0, 0, -1, 5)).toBe(5);
    expect(probe.clear(0, 0, 0, 0, 1, 5)).toBe(5);
    expect(probe.clear(0, 0, 0, -1, 0, 5)).toBe(5);
    // Standing spots: free in the open and on the step, not inside the wall; people are skipped.
    expect(probe.free(0, 0, 0)).toBe(true);
    expect(probe.free(4, 0, 0)).toBe(false);
    expect(probe.free(0, 0, -2)).toBe(true);
    expect(probe.free(0, 0, 3)).toBe(true);
  });
});
