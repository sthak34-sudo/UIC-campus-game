/**
 * Bot rifles: a real Rapier hitscan from a bot's eyes toward an aim point. Walls, buildings and
 * other bots block the bullet like they block the player's, and the ray skips the shooter's own
 * hitboxes. Reports what was hit so the squad rules can apply the damage.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type { BotBodies, BotHitZone } from './botBodies';

/** Player hits above this height (from the feet) count as head shots. */
export const PLAYER_NECK_Y = 1.5;

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
  onShot?: (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) => void,
): BotGun {
  return {
    fire(shooter, origin, target, maxDistance) {
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const dz = target.z - origin.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-6) return null;
      const dir = { x: dx / len, y: dy / len, z: dz / len };
      const hit = world.castRay(
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
      onShot?.(origin, point);
      if (!hit) return null;
      if (player && hit.collider.handle === player.handle) {
        const zone: BotHitZone = point.y - playerFeetY() >= PLAYER_NECK_Y ? 'head' : 'body';
        return { kind: 'player', zone, distance: t, point };
      }
      const b = bodies.lookup(hit.collider.handle, point.y);
      if (b) return { kind: 'bot', id: b.id, zone: b.zone, distance: t, point };
      return { kind: 'world', distance: t, point };
    },
  };
}
