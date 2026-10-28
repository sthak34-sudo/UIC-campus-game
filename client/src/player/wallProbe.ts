/**
 * "How far can a bot walk this way before it bumps a wall?" A ball the width of a bot body is swept
 * along the ground at waist height. People (the player and bots) are skipped; the separate steering
 * already handles them. Low steps and kerbs pass under the ball.
 */
import RAPIER from '@dimforge/rapier3d-compat';

/** Ball radius (a little wider than the bot capsule) and its height above the feet. */
export const WALL_PROBE_RADIUS = 0.35;
export const WALL_PROBE_Y = 0.8;

export interface WallProbe {
  /** Free distance (up to `max`) from feet (x, y, z) along the flat direction (dx, dz). */
  clear(x: number, y: number, z: number, dx: number, dz: number, max: number): number;
  /** True when a bot could stand at feet (x, y, z) without its waist being inside a wall. */
  free(x: number, y: number, z: number): boolean;
}

export function createWallProbe(world: RAPIER.World, skip: (handle: number) => boolean): WallProbe {
  const ball = new RAPIER.Ball(WALL_PROBE_RADIUS);
  const rot = { x: 0, y: 0, z: 0, w: 1 };
  return {
    clear(x, y, z, dx, dz, max) {
      const len = Math.hypot(dx, dz);
      if (len < 1e-6 || max <= 0) return max;
      const hit = world.castShape(
        { x, y: y + WALL_PROBE_Y, z },
        rot,
        { x: dx / len, y: 0, z: dz / len },
        ball,
        0,
        max,
        false,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        undefined,
        (c) => !skip(c.handle),
      );
      return hit ? Math.max(0, hit.time_of_impact) : max;
    },
    free(x, y, z) {
      const c = world.intersectionWithShape(
        { x, y: y + WALL_PROBE_Y, z }, rot, ball, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined, undefined, undefined, (col) => !skip(col.handle),
      );
      return c == null;
    },
  };
}
