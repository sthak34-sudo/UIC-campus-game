/**
 * Line-of-sight checks for bots: a Rapier ray that walls, buildings and props block, but people
 * (bots and the player) do not, so a bot can still see a foe standing behind a teammate.
 */
import RAPIER from '@dimforge/rapier3d-compat';

export interface BotSight {
  /** True when nothing solid (other than people) is between the two points. */
  clear(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): boolean;
}

export function createBotSight(world: RAPIER.World, isPerson: (handle: number) => boolean): BotSight {
  return {
    clear(from, to) {
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-6) return true;
      const hit = world.castRay(
        new RAPIER.Ray(from, { x: dx / len, y: dy / len, z: dz / len }),
        len, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined,
        (c) => !isPerson(c.handle),
      );
      return hit == null;
    },
  };
}
