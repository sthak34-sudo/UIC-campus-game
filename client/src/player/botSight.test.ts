import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { initRapier } from './physics';
import { createBotSight } from './botSight';

describe('bot sight', () => {
  beforeAll(async () => { await initRapier(); });
  it('walls block sight, people do not', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 2, 2).setTranslation(5, 2, 0));
    const person = world.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.3).setTranslation(3, 0.9, 4));
    world.step();
    const sight = createBotSight(world, (h) => h === person.handle);
    expect(sight.clear({ x: 0, y: 1.5, z: 0 }, { x: 10, y: 1.2, z: 0 })).toBe(false);
    expect(sight.clear({ x: 0, y: 1.5, z: 4 }, { x: 10, y: 1.2, z: 4 })).toBe(true);
    expect(sight.clear({ x: 0, y: 1.5, z: 0 }, { x: 4, y: 1.2, z: 0 })).toBe(true); // stops short of the wall
  });
});
