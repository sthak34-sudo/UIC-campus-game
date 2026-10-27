/**
 * Friendly-fire policy. Pure: no three.js, no Rapier, no DOM.
 * Zone damage and fall damage do not go through canDamage; they always apply.
 */
import { FRIENDLY_FIRE } from './balance';
import { isSameSquad } from './roster';
import type { PlayerId, SquadMatchState } from './types';

/**
 * Whether attacker may deal bullet, melee or grenade damage to victim.
 * Same-squad hits are blocked while FRIENDLY_FIRE is false.
 * Missing players are treated as not damageable.
 */
export function canDamage(
  state: SquadMatchState,
  attacker: PlayerId,
  victim: PlayerId,
): boolean {
  if (attacker === victim) return false;
  const a = state.members[attacker];
  const v = state.members[victim];
  if (!a || !v) return false;
  if (v.life === 'dead') return false;
  if (!FRIENDLY_FIRE && isSameSquad(state, attacker, victim)) return false;
  return true;
}
