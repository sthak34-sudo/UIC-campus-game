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
/** Head hit zone: a ball at about head height (same as the practice dummies). */
export const BOT_HEAD_RADIUS = 0.18;
export const BOT_HEAD_Y = 1.66;
/** Downed (crawling / kneeling) bots get a shorter body: about 1.1 m tall, head lowered to match. */
export const BOT_DOWNED_HALF = 0.25;
export const BOT_DOWNED_HEAD_Y = 0.95;
/** Hits on the body capsule above this height (from the feet) also count as head shots. */
export const BOT_NECK_Y = 1.5;
export const BOT_DOWNED_NECK_Y = 0.8;

export type BotBodyMode = 'stand' | 'downed' | 'off';
export type BotHitZone = 'head' | 'body';

export interface BotBodies {
  /** Adds a bot capsule with its feet at (x, y, z); returns its id. */
  add(x: number, y: number, z: number): number;
  /**
   * Moves the capsule (applied on the next world step). `true`/'stand' is a full-height body,
   * 'downed' a crouched-height one, and `false`/'off' turns the colliders off (dead bots).
   */
  move(id: number, x: number, y: number, z: number, mode: boolean | BotBodyMode): void;
  /** Which bot and hit zone a collider handle belongs to, if any. */
  lookup(handle: number, hitY?: number): { id: number; zone: BotHitZone } | undefined;
  /** Down ray that skips the player capsule and all bot capsules. */
  readonly probe: GroundProbe;
  readonly colliderCount: number;
  dispose(): void;
}

export function createBotBodies(world: RAPIER.World, player: RAPIER.Collider | null): BotBodies {
  const bodies = new Map<number, { rb: RAPIER.RigidBody; col: RAPIER.Collider; head: RAPIER.Collider; mode: BotBodyMode; feetY: number }>();
  const byHandle = new Map<number, { id: number; zone: BotHitZone }>();
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
      const head = world.createCollider(
        RAPIER.ColliderDesc.ball(BOT_HEAD_RADIUS).setTranslation(0, BOT_HEAD_Y - BOT_BODY_CENTER_Y, 0),
        rb,
      );
      skip.add(col.handle);
      skip.add(head.handle);
      const id = next++;
      bodies.set(id, { rb, col, head, mode: 'stand', feetY: y });
      byHandle.set(col.handle, { id, zone: 'body' });
      byHandle.set(head.handle, { id, zone: 'head' });
      return id;
    },
    lookup(handle, hitY) {
      const hit = byHandle.get(handle);
      if (!hit || hit.zone === 'head' || hitY == null) return hit;
      // The 1.8 m body capsule wraps the head ball, so its top counts as head too.
      const b = bodies.get(hit.id)!;
      const neck = b.mode === 'downed' ? BOT_DOWNED_NECK_Y : BOT_NECK_Y;
      return hitY - b.feetY >= neck ? { id: hit.id, zone: 'head' } : hit;
    },
    move(id, x, y, z, mode) {
      const b = bodies.get(id);
      if (!b) return;
      const m: BotBodyMode = mode === true ? 'stand' : mode === false ? 'off' : mode;
      if (m !== b.mode && m !== 'off') {
        const half = m === 'downed' ? BOT_DOWNED_HALF : BOT_BODY_HALF;
        b.col.setHalfHeight(half);
        // Keep the body's feet on the ground: shift the shape down inside the body.
        b.col.setTranslationWrtParent({ x: 0, y: half - BOT_BODY_HALF, z: 0 });
        const headY = m === 'downed' ? BOT_DOWNED_HEAD_Y : BOT_HEAD_Y;
        b.head.setTranslationWrtParent({ x: 0, y: headY - BOT_BODY_CENTER_Y, z: 0 });
      }
      b.rb.setNextKinematicTranslation({ x, y: y + BOT_BODY_CENTER_Y, z });
      const solid = m !== 'off';
      if (b.col.isEnabled() !== solid) b.col.setEnabled(solid);
      if (b.head.isEnabled() !== solid) b.head.setEnabled(solid);
      if (m !== 'off') b.mode = m;
      b.feetY = y;
    },
    dispose() {
      for (const { rb } of bodies.values()) world.removeRigidBody(rb);
      bodies.clear();
      byHandle.clear();
    },
  };
}
