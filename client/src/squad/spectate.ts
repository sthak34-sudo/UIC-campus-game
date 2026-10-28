/**
 * Spectate target ordering (design 3.5). Pure: no three.js, no Rapier, no DOM.
 */
import type { PlayerId, SquadMatchState } from './types';

/**
 * Ordered spectate targets for a viewer: same-squad mates who are alive or downed,
 * alive first, then by slot. Empty when the squad is wiped (or the viewer has no squad).
 */
export function spectateTargets(state: SquadMatchState, viewerId: PlayerId): PlayerId[] {
  const viewer = state.members[viewerId];
  if (!viewer) return [];
  const squad = state.squads[viewer.squad];
  if (!squad || squad.eliminated) return [];

  const candidates = squad.members
    .filter((id) => id !== viewerId)
    .map((id) => state.members[id]!)
    .filter((m) => m && (m.life === 'alive' || m.life === 'downed'));

  candidates.sort((a, b) => {
    if (a.life !== b.life) return a.life === 'alive' ? -1 : 1;
    return a.slot - b.slot;
  });
  return candidates.map((m) => m.id);
}

/**
 * Cycle through targets. dir > 0 goes forward, dir < 0 goes backward.
 * If current is missing, returns the first (or last when going backward).
 */
export function nextTarget(
  targets: readonly PlayerId[],
  current: PlayerId | null,
  dir: number,
): PlayerId | null {
  if (targets.length === 0) return null;
  if (current === null || !targets.includes(current)) {
    return dir < 0 ? targets[targets.length - 1]! : targets[0]!;
  }
  const i = targets.indexOf(current);
  const step = dir < 0 ? -1 : 1;
  const next = (i + step + targets.length) % targets.length;
  return targets[next]!;
}

/** Banner text while spectating a teammate, e.g. "Spectating Bot1 (1/2) · ← / → switch". */
export function spectateLabel(name: string, index: number, count: number): string {
  const cycle = count > 1 ? ' · ← / → switch' : '';
  return `Spectating ${name} (${index + 1}/${count})${cycle}`;
}
