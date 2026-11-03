import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { initRapier } from './physics';
import { createBotBodies } from './botBodies';
import { createBotGun, playerHitZone } from './botGun';

describe('bot rifle hitscan', () => {
  beforeAll(async () => { await initRapier(); });
  const setup = () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50).setTranslation(0, -0.5, 0));
    const player = world.createCollider(RAPIER.ColliderDesc.capsule(0.6, 0.3).setTranslation(0, 0.9, 10));
    const bodies = createBotBodies(world, player);
    const gun = createBotGun(world, bodies, player, () => 0);
    return { world, bodies, gun, player };
  };
  it('skips its own hitboxes and hits a bot head or body', () => {
    const { world, bodies, gun } = setup();
    const a = bodies.add(0, 0, 0);
    const b = bodies.add(0, 0, -8);
    world.step();
    const head = gun.fire(a, { x: 0, y: 1.55, z: 0 }, { x: 0, y: 1.66, z: -8 }, 50);
    expect(head).toMatchObject({ kind: 'bot', id: b, zone: 'head' });
    const body = gun.fire(a, { x: 0, y: 1.55, z: 0 }, { x: 0, y: 1.0, z: -8 }, 50);
    expect(body).toMatchObject({ kind: 'bot', id: b, zone: 'body' });
  });
  it('hits the player, and walls block the shot', () => {
    const { world, bodies, gun } = setup();
    const a = bodies.add(0, 0, 0);
    world.step();
    expect(gun.fire(a, { x: 0, y: 1.55, z: 0 }, { x: 0, y: 1.2, z: 10 }, 50)).toMatchObject({ kind: 'player', zone: 'body' });
    expect(gun.fire(a, { x: 0, y: 1.55, z: 0 }, { x: 0, y: 1.72, z: 10 }, 50)).toMatchObject({ kind: 'player', zone: 'head' });
    world.createCollider(RAPIER.ColliderDesc.cuboid(3, 2, 0.1).setTranslation(0, 2, 5));
    world.step();
    expect(gun.fire(a, { x: 0, y: 1.55, z: 0 }, { x: 0, y: 1.2, z: 10 }, 50)).toMatchObject({ kind: 'world' });
  });

  it('a crouched player can be headshot (CMB-11, CODE-14)', () => {
    expect(playerHitZone(1.15, 1.2)).toBe('head');
    expect(playerHitZone(0.9, 1.2)).toBe('body');
    expect(playerHitZone(1.55, 1.75)).toBe('head');
    expect(playerHitZone(1.45, 1.75)).toBe('body');
    // Real ray against a crouched capsule (1.2 m tall) with the crouch height reported.
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const player = world.createCollider(RAPIER.ColliderDesc.capsule(0.25, 0.35).setTranslation(0, 0.6, 10));
    const bodies = createBotBodies(world, player);
    const gun = createBotGun(world, bodies, player, () => 0, undefined, () => 1.2);
    const a = bodies.add(0, 0, 0);
    world.step();
    expect(gun.fire(a, { x: 0, y: 1.15, z: 0 }, { x: 0, y: 1.15, z: 10 }, 50)).toMatchObject({ kind: 'player', zone: 'head' });
    expect(gun.fire(a, { x: 0, y: 0.7, z: 0 }, { x: 0, y: 0.7, z: 10 }, 50)).toMatchObject({ kind: 'player', zone: 'body' });
  });
});
