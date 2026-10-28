/**
 * How bots react to the shrinking zone. Numbers only.
 */
export interface ZoneCircle {
  x: number;
  z: number;
  radius: number;
}
export interface BotZoneView {
  mode: 'wait' | 'shrink' | 'final';
  remaining: number;
  current: ZoneCircle;
  next: ZoneCircle | null;
  damagePerSecond: number;
}

export const BOT_ZONE = {
  /** Start walking to the next circle this many seconds before the shrink starts. */
  rotateLeadS: 25,
  /** Aim this far inside a circle's edge so the bot isn't standing on the line. */
  marginM: 8,
};

function outside(c: ZoneCircle, p: { x: number; z: number }, margin: number): boolean {
  return Math.hypot(p.x - c.x, p.z - c.z) > Math.max(0, c.radius - margin);
}

/**
 * Where a bot should head because of the zone, or null when it can carry on.
 * Outside the current circle: always go. Before or during a shrink: get inside the next circle.
 */
export function botZoneGoal(view: BotZoneView | null, p: { x: number; z: number }): { x: number; z: number } | null {
  if (!view) return null;
  if (outside(view.current, p, 0)) {
    const t = view.next ?? view.current;
    return { x: t.x, z: t.z };
  }
  const n = view.next;
  if (!n) return null;
  const soon = view.mode === 'shrink' || view.remaining <= BOT_ZONE.rotateLeadS;
  if (soon && outside(n, p, Math.min(BOT_ZONE.marginM, n.radius * 0.5))) return { x: n.x, z: n.z };
  return null;
}

/** Zone damage a bot takes this tick: the same rule as the player. */
export function botZoneDamage(view: BotZoneView | null, p: { x: number; z: number }, dt: number, mult = 1): number {
  if (!view || !(dt > 0) || !(view.damagePerSecond > 0)) return 0;
  return outside(view.current, p, 0) ? view.damagePerSecond * dt * mult : 0;
}
