/**
 * Spectate target ordering (design 3.5). Pure: no three.js, no Rapier, no DOM.
 */
import { springArm } from '../player/math';
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

export interface Vec3 { x: number; y: number; z: number }
/** Spectate camera looks at this height above the target's feet. */
export const SPECTATE_LOOK_Y = 1.2;
/** Closest the spectate camera gets to the look point when a wall is in the way (m). */
export const SPECTATE_MIN_ARM = 0.6;

/**
 * Spectate camera with the follow camera's spring arm: a sphere is swept from the look point
 * toward the wanted spot (`offset` from the target's feet); a wall pulls the camera in instantly,
 * and it eases back out once clear. `prevArm` is last frame's arm (null on a new target).
 */
export function spectateCamera(
  target: Vec3,
  offset: Vec3,
  sweep: (from: Vec3, dir: Vec3, max: number) => number | null,
  prevArm: number | null,
  dt: number,
): { pos: Vec3; look: Vec3; arm: number } {
  const look = { x: target.x, y: target.y + SPECTATE_LOOK_Y, z: target.z };
  const v = { x: offset.x, y: offset.y - SPECTATE_LOOK_Y, z: offset.z };
  const len = Math.hypot(v.x, v.y, v.z);
  const dir = { x: v.x / len, y: v.y / len, z: v.z / len };
  const hit = sweep(look, dir, len);
  const arm = springArm(len, hit, prevArm ?? len, dt, { hardMin: SPECTATE_MIN_ARM, returnRate: 4 });
  return { pos: { x: look.x + dir.x * arm, y: look.y + dir.y * arm, z: look.z + dir.z * arm }, look, arm };
}
