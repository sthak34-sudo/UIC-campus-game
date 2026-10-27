/**
 * Squad bot bodies: the same animated character (and starter rifle) as the player, planted on the
 * ground with a downward raycast (the Rapier probe lives in adapter.ts, the only squad file allowed engine imports) for both the body height and foot IK. Falls back to the old capsule
 * when the character file is missing.
 */
import type { GroundProbe } from '../player/characterLoader';

/** How far above / below the bot's current height we look for a floor each frame (m). */
export const BOT_SNAP_LIFT_M = 0.6;
export const BOT_SNAP_DROP_M = 1.2;

/**
 * New feet height for a bot standing at (x, y, z): the floor under it within the snap range,
 * or the old height when there is none (bots never fall through the map).
 */
export function snapBotY(probe: GroundProbe | null, x: number, y: number, z: number): number {
  if (!probe) return y;
  const g = probe.sample(x, y + BOT_SNAP_LIFT_M, z, BOT_SNAP_LIFT_M + BOT_SNAP_DROP_M);
  return g === null ? y : g;
}
