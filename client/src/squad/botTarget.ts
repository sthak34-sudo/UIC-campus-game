/**
 * Picking who a bot shoots, and where its bullets start. Pure math: the sight check is passed in.
 */
type V3 = { x: number; y: number; z: number };

/** How many of the nearest foes a bot checks for line of sight each frame. */
export const SIGHT_CHECKS = 3;
/** Eye and chest heights used for sight lines (standing / downed). */
export const EYE_Y = 1.55;
export function chestY(downed: boolean): number { return downed ? 0.55 : 1.25; }
/** Rifle barrel tip relative to the bot's feet, facing +z before yaw: right, up, forward. */
export const MUZZLE = { right: 0.22, up: 1.4, forward: 0.6 };

/** The nearest candidate the bot can see (checks at most `maxChecks`, nearest first). */
export function pickVisibleTarget<T extends { dist: number }>(
  candidates: T[],
  canSee: (c: T) => boolean,
  maxChecks = SIGHT_CHECKS,
): T | null {
  const sorted = [...candidates].sort((a, b) => a.dist - b.dist);
  for (let i = 0; i < Math.min(maxChecks, sorted.length); i++) if (canSee(sorted[i]!)) return sorted[i]!;
  return null;
}

/** World position of the rifle barrel for a bot with feet at `feet` facing `yaw` (rotation.y). */
export function muzzlePoint(feet: V3, yaw: number): V3 {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  // Right of facing (+z forward, yaw 0) is -x.
  const rx = -fz, rz = fx;
  return {
    x: feet.x + fx * MUZZLE.forward + rx * MUZZLE.right,
    y: feet.y + MUZZLE.up,
    z: feet.z + fz * MUZZLE.forward + rz * MUZZLE.right,
  };
}

/** Start shots at the barrel, unless the barrel is poking through a wall: then use the eye. */
export function shotOrigin(eye: V3, muzzle: V3, clear: (a: V3, b: V3) => boolean): V3 {
  return clear(eye, muzzle) ? muzzle : eye;
}
