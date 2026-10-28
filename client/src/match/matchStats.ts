/**
 * Match-end numbers: kills, damage dealt, survival time, placement text. Pure: no DOM, no three.
 */
export interface MatchStats {
  kills: number;
  damage: number;
  startS: number;
  /** Set once when the match ends for you; survival time freezes there. */
  endS: number | null;
}

export type MatchEndReason = 'won' | 'wiped' | 'died';

export function newStats(nowS: number): MatchStats {
  return { kills: 0, damage: 0, startS: nowS, endS: null };
}

export function addDamage(s: MatchStats, amount: number): MatchStats {
  if (s.endS != null || !(amount > 0)) return s;
  return { ...s, damage: s.damage + amount };
}

export function addKills(s: MatchStats, n: number): MatchStats {
  if (s.endS != null || n <= 0) return s;
  return { ...s, kills: s.kills + n };
}

/** Kills credited to `me` in a batch of squad events. */
export function killsBy(events: readonly { type: string; by?: string | null }[], me: string): number {
  return events.filter((e) => e.type === 'killed' && e.by === me).length;
}

/** Damage done by one hit: health + armor + downed health lost. */
export function damageBetween(
  before: { health: number; armor: number; downHp?: number },
  after: { health: number; armor: number; downHp?: number },
): number {
  const sum = (v: typeof before) => Math.max(0, v.health) + Math.max(0, v.armor) + Math.max(0, v.downHp ?? 0);
  return Math.max(0, sum(before) - sum(after));
}

export function finish(s: MatchStats, nowS: number): MatchStats {
  return s.endS != null ? s : { ...s, endS: nowS };
}

export function survivalSeconds(s: MatchStats, nowS: number): number {
  return Math.max(0, (s.endS ?? nowS) - s.startS);
}

/** `125` → `2:05`, `3725` → `1:02:05`. */
export function formatSurvival(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = (t % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function endTitle(reason: MatchEndReason): string {
  return reason === 'won' ? 'Victory!' : reason === 'wiped' ? 'Squad eliminated' : 'You died';
}

/** `#2 of 4 squads`. Solo play with no other squads reads `Solo practice`. */
export function placementText(placement: number | null, squads: number, reason: MatchEndReason): string {
  if (reason === 'won') return `#1 of ${squads} squads`;
  if (squads <= 1 || placement == null) return 'Solo practice';
  return `#${placement} of ${squads} squads`;
}

export interface MatchSummary {
  title: string;
  placement: string;
  kills: number;
  damage: number;
  survival: string;
}

export function summarize(s: MatchStats, nowS: number, reason: MatchEndReason, placement: number | null, squads: number): MatchSummary {
  return {
    title: endTitle(reason),
    placement: placementText(placement, squads, reason),
    kills: s.kills,
    damage: Math.round(s.damage),
    survival: formatSurvival(survivalSeconds(s, nowS)),
  };
}
