/**
 * When a bot pulls the trigger and where it aims. Bots fire in short, slower-than-the-player
 * bursts with some spread that tightens at close range, so a fight with them is winnable.
 */
export const BOT_AIM = {
  /** Seconds between bot shots (the player's rifle is 0.15). */
  interval: 0.5,
  /** Random extra wait so a squad does not fire in sync. */
  jitter: 0.25,
  /** Shots only start inside this range (meters). */
  range: 40,
  /** Aim error in meters at 10 m; grows with distance. */
  spreadAt10: 0.45,
  /** Share of a player-weapon hit a bot shot does. */
  damageScale: 0.6,
  /** Chance a bot aims at the head instead of the chest. */
  headAimChance: 0.15,
};

/** Advance a bot's trigger timer. Returns the new timer and whether it fires this frame. */
export function botTrigger(cooldown: number, dt: number, hasTarget: boolean, distance: number, rand: () => number): { cooldown: number; fire: boolean } {
  const c = Math.max(0, cooldown - dt);
  if (!hasTarget || distance > BOT_AIM.range || c > 0) return { cooldown: c, fire: false };
  return { cooldown: BOT_AIM.interval + rand() * BOT_AIM.jitter, fire: true };
}

/** Aim point on a target standing at `feet` (downed targets are lower), with spread. */
export function botAimPoint(
  feet: { x: number; y: number; z: number },
  distance: number,
  downed: boolean,
  rand: () => number,
): { x: number; y: number; z: number } {
  const head = rand() < BOT_AIM.headAimChance;
  const y = feet.y + (downed ? (head ? 0.95 : 0.55) : head ? 1.66 : 1.25);
  const spread = BOT_AIM.spreadAt10 * Math.max(0.3, distance / 10);
  const a = rand() * Math.PI * 2;
  const r = spread * Math.sqrt(rand());
  return { x: feet.x + Math.cos(a) * r, y: y + Math.sin(a) * r, z: feet.z + Math.cos(a + 1.3) * r * 0.5 };
}
