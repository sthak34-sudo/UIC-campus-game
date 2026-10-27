/**
 * Downed state, bleed-out and finish damage. Pure: no three.js, no Rapier, no DOM.
 */
import type { HitOutcome } from '../combat/health';
import { DOWN } from './balance';
import { hasAliveTeammate } from './roster';
import type { PlayerId, SquadEvent, SquadMatchState, SquadMember } from './types';

function cloneMember(m: SquadMember): SquadMember {
  return {
    ...m,
    combatant: { ...m.combatant },
    reviving: m.reviving ? { ...m.reviving } : null,
    pos: { ...m.pos },
  };
}

function withMember(state: SquadMatchState, m: SquadMember): SquadMatchState {
  return { ...state, members: { ...state.members, [m.id]: m } };
}

/** Bleed rate for a downed member. Grows with each knock. */
export function bleedRate(m: SquadMember): number {
  if (m.life !== 'downed' || m.timesDowned <= 0) return 0;
  return DOWN.bleedPerSec * Math.pow(DOWN.bleedMultPerKnock, m.timesDowned - 1);
}

/**
 * Apply a combat HitOutcome to an alive (or already-zero-health) victim.
 * A lethal hit becomes downed when a squadmate is alive; otherwise the victim dies.
 * Solo squads (no alive mate) go straight to dead, matching the old single-player behavior.
 */
/** Minimal hit result: full HitOutcome from takeHit, or {combatant, died} from takeDirectDamage. */
export type DamageOutcome = Pick<HitOutcome, 'combatant' | 'died'> | HitOutcome;

export function applyDamage(
  state: SquadMatchState,
  victimId: PlayerId,
  attackerId: PlayerId | null,
  outcome: DamageOutcome,
): { state: SquadMatchState; events: SquadEvent[] } {
  const victim = state.members[victimId];
  if (!victim || victim.life === 'dead') {
    return { state, events: [] };
  }

  // Already downed: HitOutcome from takeHit is a no-op on health 0. Use applyDownedDamage instead.
  if (victim.life === 'downed') {
    return { state, events: [] };
  }

  const next = cloneMember(victim);
  next.combatant = outcome.combatant;

  if (!outcome.died) {
    return { state: withMember(state, next), events: [] };
  }

  // Lethal hit.
  if (hasAliveTeammate(state, victimId)) {
    next.life = 'downed';
    next.combatant = { ...next.combatant, health: 0 };
    next.downHp = DOWN.hp;
    next.downedAt = state.t;
    next.timesDowned += 1;
    next.reviving = null;
    // Remember the knocker so bleed-out / wipe credit can go to them.
    next.killedBy = attackerId;
    return {
      state: withMember(state, next),
      events: [{ type: 'downed', id: victimId, by: attackerId }],
    };
  }

  next.life = 'dead';
  next.combatant = { ...next.combatant, health: 0 };
  next.downHp = 0;
  next.downedAt = null;
  next.reviving = null;
  next.killedBy = attackerId;
  return {
    state: withMember(state, next),
    events: [{ type: 'killed', id: victimId, by: attackerId }],
  };
}

/**
 * Enemy damage against a downed player. No armor, no headshot mult.
 * downHp <= 0 finishes them; kill credit goes to the attacker.
 */
export function applyDownedDamage(
  state: SquadMatchState,
  victimId: PlayerId,
  attackerId: PlayerId | null,
  amount: number,
): { state: SquadMatchState; events: SquadEvent[] } {
  const victim = state.members[victimId];
  if (!victim || victim.life !== 'downed' || amount <= 0) {
    return { state, events: [] };
  }
  const next = cloneMember(victim);
  next.downHp = Math.max(0, next.downHp - amount);
  if (next.downHp > 0) {
    return { state: withMember(state, next), events: [] };
  }
  next.life = 'dead';
  next.downHp = 0;
  next.downedAt = null;
  next.reviving = null;
  next.killedBy = attackerId;
  return {
    state: withMember(state, next),
    events: [{ type: 'killed', id: victimId, by: attackerId }],
  };
}

/**
 * Bleed downed players. Pauses while a revive is in progress.
 * Returns updated state and kill events for anyone who bled out.
 */
export function tickBleed(
  state: SquadMatchState,
  dt: number,
): { state: SquadMatchState; events: SquadEvent[] } {
  if (dt <= 0) return { state, events: [] };
  let nextState = state;
  const events: SquadEvent[] = [];

  for (const id of Object.keys(state.members)) {
    const m = nextState.members[id]!;
    if (m.life !== 'downed') continue;
    if (m.reviving) continue; // bleed pauses during revive
    const rate = bleedRate(m);
    if (rate <= 0) continue;
    const updated = cloneMember(m);
    updated.downHp = Math.max(0, updated.downHp - rate * dt);
    if (updated.downHp > 0) {
      nextState = withMember(nextState, updated);
      continue;
    }
    updated.life = 'dead';
    updated.downHp = 0;
    updated.downedAt = null;
    updated.reviving = null;
    // Bleed-out: credit stays with the knocker stored in killedBy.
    nextState = withMember(nextState, updated);
    events.push({ type: 'killed', id, by: updated.killedBy });
  }

  return { state: nextState, events };
}
