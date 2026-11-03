/**
 * What a bot does when it can't fight (AI-13) or is downed (AI-17). Pure: no three.js, no DOM.
 */
import { DOWN } from './balance';
import type { PlayerId, SquadMatchState } from './types';

type P = { x: number; z: number };

/** How far a dry bot backs off from the foe (m). */
export const DRY_RETREAT_M = 14;

/**
 * Where a bot with no rounds left should go instead of charging: towards its leader when the
 * leader is further from the foe than the bot, else straight away from the foe.
 */
export function dryRetreatTarget(pos: P, foe: P, leader: P | null): P {
  const dFoe = Math.hypot(pos.x - foe.x, pos.z - foe.z);
  if (leader && Math.hypot(leader.x - foe.x, leader.z - foe.z) > dFoe + 1) return { x: leader.x, z: leader.z };
  const len = dFoe || 1;
  const ux = dFoe > 1e-3 ? (pos.x - foe.x) / len : 1;
  const uz = dFoe > 1e-3 ? (pos.z - foe.z) / len : 0;
  return { x: pos.x + ux * DRY_RETREAT_M, z: pos.z + uz * DRY_RETREAT_M };
}

/** A downed bot crawls to the nearest alive teammate (AI-17), or stays put with none. */
export function crawlTarget(state: SquadMatchState, id: PlayerId): P | null {
  const me = state.members[id];
  if (!me || me.life !== 'downed') return null;
  let best: { p: P; d: number } | null = null;
  for (const mid of state.squads[me.squad]?.members ?? []) {
    if (mid === id) continue;
    const m = state.members[mid];
    if (!m || m.life !== 'alive') continue;
    const d = Math.hypot(m.pos.x - me.pos.x, m.pos.z - me.pos.z);
    if (!best || d < best.d) best = { p: { x: m.pos.x, z: m.pos.z }, d };
  }
  return best ? best.p : null;
}

/** Stop this close to the teammate: inside revive range so they can pick you up. */
export const CRAWL_STOP_M = DOWN.reviveRange * 0.6;
