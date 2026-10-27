import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { World } from '../core/world';
import { PLAYER_CONFIG } from './config';
import { initRapier, PlayerPhysics } from './physics';
import { BOT_BODY_RADIUS, createBotBodies } from './botBodies';
import { snapBotY } from '../squad/botBody';

const flat = () => {
  const world = new World();
  const g = new THREE.Mesh(new THREE.BoxGeometry(200, 1, 200));
  g.position.y = -0.5;
  world.addCollider(g);
  const phys = new PlayerPhysics(new THREE.Vector3(0, 0, 0));
  phys.syncColliders(world.colliders);
  return phys;
};
const walk = (phys: PlayerPhysics, dz: number, s: number) => {
  for (let i = 0; i < Math.round(s / PLAYER_CONFIG.fixedDt); i++) phys.step(0, dz, PLAYER_CONFIG.runSpeed, false);
};

describe('bot physics bodies', () => {
  beforeAll(async () => { await initRapier(); });

  it('stops the player walking through a bot, and lets them pass once the bot is dead', () => {
    const phys = flat();
    const bots = createBotBodies(phys.world, phys.collider);
    const id = bots.add(0, 0, -3);
    walk(phys, -1, 0.3);
    walk(phys, -1, 2);
    // Blocked in front of the capsule: player radius + bot radius from its centre.
    expect(phys.feet.z).toBeGreaterThan(-3 + BOT_BODY_RADIUS + 0.2);
    bots.move(id, 0, 0, -3, false);
    walk(phys, -1, 2);
    expect(phys.feet.z).toBeLessThan(-4);
    bots.dispose();
  });

  it('ground rays ignore other bots and the player', () => {
    const phys = flat();
    const bots = createBotBodies(phys.world, phys.collider);
    bots.add(2, 0, 0);
    phys.world.step();
    // A bot right on top of another bot's spot still finds the floor, not the head.
    expect(snapBotY(bots.probe, 2, 0.2, 0)).toBeCloseTo(0, 2);
    // Ray straight through the player capsule also reaches the floor.
    expect(bots.probe.sample(phys.feet.x, 2, phys.feet.z, 5)).toBeCloseTo(0, 2);
    bots.dispose();
    expect(bots.colliderCount).toBe(0);
  });
});
