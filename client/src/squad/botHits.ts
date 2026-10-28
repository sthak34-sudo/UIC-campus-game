/**
 * The local player's bullets hitting a squad bot. Follows the same team rules as every other
 * damage source (`canDamage`: no same-squad hits while friendly fire is off), uses the normal
 * head/body multiplier and range falloff, and knocks / finishes through the downed rules.
 */
import { resolveIncomingDamage, type HitZone } from '../combat/damage';
import { takeHit } from '../combat/health';
import { applyDamage, applyDownedDamage } from './downed';
import { canDamage } from './friendlyFire';
import type { PlayerId, SquadEvent, SquadMatchState } from './types';

export type BotHitResult = 'blocked' | 'hit' | 'downed' | 'killed';

export function shootBot(
  state: SquadMatchState,
  attackerId: PlayerId,
  victimId: PlayerId,
  zone: HitZone,
  distance: number,
): { state: SquadMatchState; events: SquadEvent[]; result: BotHitResult; headshot: boolean } {
  const headshot = zone === 'head';
  const victim = state.members[victimId];
  if (!victim || !canDamage(state, attackerId, victimId)) {
    return { state, events: [], result: 'blocked', headshot };
  }
  const r =
    victim.life === 'downed'
      ? applyDownedDamage(state, victimId, attackerId, resolveIncomingDamage({ zone, distance, armor: 0 }).healthDamage)
      : applyDamage(state, victimId, attackerId, takeHit(victim.combatant, zone, distance));
  const after = r.state.members[victimId]!;
  const result: BotHitResult =
    after.life === 'dead' ? 'killed' : after.life === 'downed' && victim.life !== 'downed' ? 'downed' : 'hit';
  return { ...r, result, headshot };
}
