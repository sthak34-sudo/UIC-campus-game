/**
 * Jump / fall / land timing. The take-off clip plays once; if the character is still in the air
 * when it is nearly over, it hands off to a looping fall clip, so a long drop never freezes on the
 * last take-off frame. A landing after a long enough fall plays a short one-shot land clip.
 */

/** Hand off to the fall loop at this fraction of the take-off clip. */
export const FALL_HANDOFF = 0.85;
/** Seconds of fall blend-in. */
export const FALL_BLEND_S = 0.25;
/** Only falls longer than this get a landing clip (hops just snap back to the run). */
export const LAND_MIN_AIR_S = 0.45;
/** Seconds of the landing clip shown, fading out over the second half. */
export const LAND_SHOW_S = 0.45;

/** Share of the air pose that is the fall loop (0 = take-off clip, 1 = fall loop). */
export function fallShare(airTime: number, takeoffDur: number): number {
  const start = Math.max(0.2, takeoffDur * FALL_HANDOFF);
  return Math.min(1, Math.max(0, (airTime - start) / FALL_BLEND_S));
}

/** Weight of the landing clip `t` seconds after touchdown. */
export function landWeight(t: number): number {
  if (t < 0 || t >= LAND_SHOW_S) return 0;
  const half = LAND_SHOW_S / 2;
  return t < half ? 1 : 1 - (t - half) / half;
}
