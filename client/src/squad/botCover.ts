/**
 * AI-04 (first pass): bots stop charging, hold a fighting range, crouch while shooting from a
 * standstill, and duck behind cover to reload or when hurt. Pure: no three.js, no DOM.
 */
type P = { x: number; z: number };

export const BOT_COVER = {
  /** Hold this far from the foe while shooting instead of walking up to 4 m (m). */
  holdM: 10,
  /** Look for cover at these distances around the bot (m)... */
  radii: [2.5, 4.5, 6.5] as const,
  /** ...in this many directions. */
  dirs: 12,
  /** Take cover below this share of max health. */
  hurtShare: 0.5,
  /** Keep a cover spot this long before looking again (s). */
  keepS: 3,
  /** Crouch to shoot only beyond this range (m). Up close, stand and fight. */
  crouchBeyondM: 8,
  /** Crouched eye/muzzle are this much lower than standing (m). */
  crouchDropM: 0.6,
};

/** Should a fighting bot head for cover? While reloading, or hurt. */
export function wantsCover(reloading: boolean, health: number, maxHealth: number): boolean {
  return reloading || health < maxHealth * BOT_COVER.hurtShare;
}

/** Spots around the bot to try, nearest rings first. */
export function coverCandidates(pos: P): P[] {
  const out: P[] = [];
  for (const r of BOT_COVER.radii) {
    for (let i = 0; i < BOT_COVER.dirs; i++) {
      const a = (i / BOT_COVER.dirs) * Math.PI * 2;
      out.push({ x: pos.x + Math.cos(a) * r, z: pos.z + Math.sin(a) * r });
    }
  }
  return out;
}

/**
 * The best cover spot: free to stand on, hidden from the foe, and not closer to the foe than the
 * bot is now. Nearest wins. `hidden` and `free` are the world checks (rays) from the adapter.
 */
export function pickCover(pos: P, foe: P, cands: readonly P[], free: (p: P) => boolean, hidden: (p: P) => boolean): P | null {
  const dFoe = Math.hypot(pos.x - foe.x, pos.z - foe.z);
  let best: P | null = null;
  let bestD = Infinity;
  for (const c of cands) {
    if (Math.hypot(c.x - foe.x, c.z - foe.z) < dFoe - 1) continue;
    const d = Math.hypot(c.x - pos.x, c.z - pos.z);
    if (d >= bestD) continue;
    if (!free(c) || !hidden(c)) continue;
    best = c;
    bestD = d;
  }
  return best;
}

/** Crouch to shoot: standing still (holding range), not right on top of the foe. */
export function shouldCrouch(moving: boolean, foeDist: number): boolean {
  return !moving && foeDist > BOT_COVER.crouchBeyondM;
}
