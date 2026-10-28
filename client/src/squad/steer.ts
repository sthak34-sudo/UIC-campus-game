/**
 * Local steering for squad bots: keep a personal-space gap from other bots and the player, and
 * slide sideways around someone standing in the way instead of walking into them. Pure maths on
 * x/z so it can be tested without the engine.
 */

export interface Flat {
  x: number;
  z: number;
}

/** Centre-to-centre gap bots try to keep (two 0.3 m capsules plus some room). */
export const STEER_GAP = 0.9;

/**
 * Adjust a bot's planned step `from -> to` so it keeps `gap` from every point in `others`.
 * `maxPush` caps how far one call may shove the bot sideways (keeps it smooth frame to frame).
 */
export function steerStep(from: Flat, to: Flat, others: readonly Flat[], maxPush: number, gap = STEER_GAP): Flat {
  let x = to.x;
  let z = to.z;
  const mx = to.x - from.x;
  const mz = to.z - from.z;
  const moving = Math.hypot(mx, mz) > 1e-6;
  let px = 0;
  let pz = 0;
  for (const o of others) {
    let dx = x - o.x;
    let dz = z - o.z;
    let d = Math.hypot(dx, dz);
    if (d >= gap) continue;
    if (d < 1e-4) {
      // Exactly on top: pick a stable sideways direction from the move (or +x).
      dx = moving ? -mz : 1;
      dz = moving ? mx : 0;
      d = Math.hypot(dx, dz);
      dx /= d;
      dz /= d;
      d = 0;
    } else {
      dx /= d;
      dz /= d;
    }
    const overlap = gap - d;
    px += dx * overlap;
    pz += dz * overlap;
    if (moving) {
      // Walking into them: add a sideways slide so the bot goes around, not just stops.
      const ahead = -(mx * dx + mz * dz);
      if (ahead > 0) {
        let sx = -dz;
        let sz = dx;
        if (sx * mx + sz * mz < 0) {
          sx = -sx;
          sz = -sz;
        }
        const k = overlap * 0.5;
        px += sx * k;
        pz += sz * k;
      }
    }
  }
  const p = Math.hypot(px, pz);
  if (p > maxPush && p > 0) {
    px *= maxPush / p;
    pz *= maxPush / p;
  }
  x += px;
  z += pz;
  return { x, z };
}
