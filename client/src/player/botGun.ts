/**
 * Bot rifles: a real Rapier hitscan from a bot's eyes toward an aim point. Walls, buildings and
 * other bots block the bullet like they block the player's, and the ray skips the shooter's own
 * hitboxes. Reports what was hit so the squad rules can apply the damage.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type { BotBodies, BotHitZone } from './botBodies';

/** Standing player hits above this height (from the feet) count as head shots. */
export const PLAYER_NECK_Y = 1.5;
/** Neck as a share of the current body height (1.5 / 1.75), so a crouched player has a head too (CMB-11, CODE-14). */
export const PLAYER_NECK_FRACTION = 0.86;

/** Head or body for a hit `hitAboveFeet` meters above the feet of a body `bodyHeight` tall. */
export function playerHitZone(hitAboveFeet: number, bodyHeight: number): BotHitZone {
  return hitAboveFeet >= PLAYER_NECK_FRACTION * bodyHeight ? 'head' : 'body';
}

export type BotShotHit =
  | { kind: 'bot'; id: number; zone: BotHitZone; distance: number; point: { x: number; y: number; z: number } }
  | { kind: 'player'; zone: BotHitZone; distance: number; point: { x: number; y: number; z: number } }
  | { kind: 'world'; distance: number; point: { x: number; y: number; z: number } };

export interface BotGun {
  /** Fire from `origin` toward `target`. `shooter` is the firing bot's body id. */
  fire(shooter: number, origin: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, maxDistance: number): BotShotHit | null;
}

export function createBotGun(
  world: RAPIER.World,
  bodies: BotBodies,
  player: RAPIER.Collider | null,
  playerFeetY: () => number,
  /** Called for every shot with where it started and where it stopped (for tracers and sound). */
  /** `normal` is set when the bullet hit the world (a wall, the ground), for impact effects. */
  onShot?: (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, normal?: { x: number; y: number; z: number }) => void,
  /** The player's current capsule height (1.75 standing, 1.2 crouched). */
  playerHeight: () => number = () => 1.75,
): BotGun {
  return {
    fire(shooter, origin, target, maxDistance) {
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const dz = target.z - origin.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-6) return null;
      const dir = { x: dx / len, y: dy / len, z: dz / len };
      const hit = world.castRayAndGetNormal(
        new RAPIER.Ray(origin, dir),
        maxDistance,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        undefined,
        (c) => bodies.lookup(c.handle)?.id !== shooter,
      );
      const t = hit ? hit.timeOfImpact : maxDistance;
      const point = { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t };
      if (!hit) { onShot?.(origin, point); return null; }
      if (player && hit.collider.handle === player.handle) {
        onShot?.(origin, point);
        const zone = playerHitZone(point.y - playerFeetY(), playerHeight());
        return { kind: 'player', zone, distance: t, point };
      }
      const b = bodies.lookup(hit.collider.handle, point.y);
      if (b) { onShot?.(origin, point); return { kind: 'bot', id: b.id, zone: b.zone, distance: t, point }; }
      onShot?.(origin, point, { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z });
      return { kind: 'world', distance: t, point };
    },
  };
}
