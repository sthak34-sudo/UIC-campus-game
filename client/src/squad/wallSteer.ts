/**
 * Turn a bot's planned step away from walls. Looks a little ahead along the step; if that is
 * blocked, fans out to one side (the side it chose last time, so it does not dither at a corner)
 * and takes the closest-to-wanted open direction, then tries the other side. If every
 * direction is blocked it keeps whichever goes furthest.
 */

/** Free distance along (dx, dz) from the bot, up to `max`. */
export type ClearFn = (dx: number, dz: number, max: number) => number;

export const WALL_LOOKAHEAD = 1.2;
const FAN_DEG = [0, 25, 50, 75, 100, 130];

export function avoidWalls(
  from: { x: number; z: number },
  to: { x: number; z: number },
  clear: ClearFn,
  side: 1 | -1 = 1,
  lookahead = WALL_LOOKAHEAD,
): { x: number; z: number; side: 1 | -1; blocked: boolean } {
  const mx = to.x - from.x;
  const mz = to.z - from.z;
  const step = Math.hypot(mx, mz);
  if (step < 1e-6) return { x: to.x, z: to.z, side, blocked: false };
  const ux = mx / step;
  const uz = mz / step;
  let best = { d: -1, x: to.x, z: to.z, side };
  // The side chosen last time first, all the way round, then the other side.
  for (const s of [side, -side as 1 | -1]) {
    for (const deg of FAN_DEG) {
      if (deg === 0 && s !== side) continue;
      const a = (deg * Math.PI * s) / 180;
      const dx = ux * Math.cos(a) - uz * Math.sin(a);
      const dz = ux * Math.sin(a) + uz * Math.cos(a);
      const d = clear(dx, dz, lookahead);
      const move = Math.min(step, Math.max(0, d - 0.05));
      const cand = { d, x: from.x + dx * move, z: from.z + dz * move, side: (deg === 0 ? side : s) as 1 | -1 };
      if (d >= lookahead) return { x: cand.x, z: cand.z, side: cand.side, blocked: deg !== 0 };
      if (d > best.d) best = cand;
    }
  }
  return { x: best.x, z: best.z, side: best.side, blocked: true };
}
