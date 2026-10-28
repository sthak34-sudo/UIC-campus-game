/**
 * Solid Rapier bodies for squad bots: a kinematic capsule per bot that the player's character
 * controller collides with, plus a ground-ray probe that ignores the player and every bot (so a bot
 * never "stands" on a teammate's head, and its own capsule never hides the floor).
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type { GroundProbe } from './characterLoader';

/** Capsule roughly the size of the player's: 1.8 m tall, 0.3 m radius, feet at y. */
export const BOT_BODY_RADIUS = 0.3;
export const BOT_BODY_HALF = 0.6;
export const BOT_BODY_CENTER_Y = BOT_BODY_HALF + BOT_BODY_RADIUS;

export interface BotBodies {
  /** Adds a bot capsule with its feet at (x, y, z); returns its id. */
  add(x: number, y: number, z: number): number;
  /** Moves the capsule (applied on the next world step). Dead bots are made non-solid. */
  move(id: number, x: number, y: number, z: number, solid: boolean): void;
  /** Down ray that skips the player capsule and all bot capsules. */
  readonly probe: GroundProbe;
  readonly colliderCount: number;
  dispose(): void;
}

export function createBotBodies(world: RAPIER.World, player: RAPIER.Collider | null): BotBodies {
  const bodies = new Map<number, { rb: RAPIER.RigidBody; col: RAPIER.Collider }>();
  const skip = new Set<number>();
  if (player) skip.add(player.handle);
  let next = 0;
  const probe: GroundProbe = {
    sample(x, yFrom, z, maxDrop) {
      const hit = world.castRay(
        new RAPIER.Ray({ x, y: yFrom, z }, { x: 0, y: -1, z: 0 }),
        maxDrop, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined,
        (c) => !skip.has(c.handle),
      );
      return hit ? yFrom - hit.timeOfImpact : null;
    },
  };
  return {
    probe,
    get colliderCount() { return bodies.size; },
    add(x, y, z) {
      const rb = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + BOT_BODY_CENTER_Y, z),
      );
      const col = world.createCollider(RAPIER.ColliderDesc.capsule(BOT_BODY_HALF, BOT_BODY_RADIUS), rb);
      skip.add(col.handle);
      const id = next++;
      bodies.set(id, { rb, col });
      return id;
    },
    move(id, x, y, z, solid) {
      const b = bodies.get(id);
      if (!b) return;
      b.rb.setNextKinematicTranslation({ x, y: y + BOT_BODY_CENTER_Y, z });
      if (b.col.isEnabled() !== solid) b.col.setEnabled(solid);
    },
    dispose() {
      for (const { rb } of bodies.values()) world.removeRigidBody(rb);
      bodies.clear();
    },
  };
}
