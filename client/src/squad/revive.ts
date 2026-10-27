/**
 * Revive rules (design 3.3). Pure: no three.js, no Rapier, no DOM.
 */
import { DOWN } from './balance';
import { isSameSquad } from './roster';
import type { PlayerId, SquadEvent, SquadMatchState, SquadMember } from './types';

const MAX_DY = 1.2;

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

/** Horizontal distance in the XZ plane (y is height). */
export function horizontalDistance(a: SquadMember, b: SquadMember): number {
  const dx = a.pos.x - b.pos.x;
  const dz = a.pos.z - b.pos.z;
  return Math.hypot(dx, dz);
}

/** True when the reviver is already marked as reviving someone. */
function isReviverBusy(state: SquadMatchState, reviverId: PlayerId): boolean {
  for (const m of Object.values(state.members)) {
    if (m.reviving && m.reviving.reviver === reviverId) return true;
  }
  return false;
}

/**
 * canRevive: same squad, reviver alive, target downed, in range, not already taken,
 * and the reviver is not already reviving someone else.
 */
export function canRevive(
  state: SquadMatchState,
  reviverId: PlayerId,
  targetId: PlayerId,
): boolean {
  const reviver = state.members[reviverId];
  const target = state.members[targetId];
  if (!reviver || !target) return false;
  if (!isSameSquad(state, reviverId, targetId)) return false;
  if (reviver.life !== 'alive') return false;
  if (target.life !== 'downed') return false;
  if (target.reviving) return false;
  if (isReviverBusy(state, reviverId)) return false;
  if (horizontalDistance(reviver, target) > DOWN.reviveRange) return false;
  if (Math.abs(reviver.pos.y - target.pos.y) >= MAX_DY) return false;
  return true;
}

/** Begin a revive. No-op when canRevive is false. */
export function startRevive(
  state: SquadMatchState,
  reviverId: PlayerId,
  targetId: PlayerId,
): { state: SquadMatchState; events: SquadEvent[] } {
  if (!canRevive(state, reviverId, targetId)) return { state, events: [] };
  const target = cloneMember(state.members[targetId]!);
  target.reviving = { reviver: reviverId, startedAt: state.t };
  return { state: withMember(state, target), events: [] };
}

/**
 * Cancel an in-progress revive on the target. Progress is lost (no partial credit).
 */
export function cancelRevive(
  state: SquadMatchState,
  targetId: PlayerId,
  reason: string,
): { state: SquadMatchState; events: SquadEvent[] } {
  const target = state.members[targetId];
  if (!target || !target.reviving) return { state, events: [] };
  const next = cloneMember(target);
  next.reviving = null;
  return {
    state: withMember(state, next),
    events: [{ type: 'reviveCancelled', id: targetId, reason }],
  };
}

/**
 * Advance revive timers. Completes when state.t - startedAt >= reviveSeconds.
 * Call after the match clock has been advanced for this tick.
 */
export function tickRevive(
  state: SquadMatchState,
): { state: SquadMatchState; events: SquadEvent[] } {
  let nextState = state;
  const events: SquadEvent[] = [];

  for (const id of Object.keys(state.members)) {
    const m = nextState.members[id]!;
    if (m.life !== 'downed' || !m.reviving) continue;
    const { reviver, startedAt } = m.reviving;
    if (state.t - startedAt < DOWN.reviveSeconds) continue;

    const reviverMember = nextState.members[reviver];
    // Safety: if the reviver is gone or not alive, cancel instead of completing.
    if (!reviverMember || reviverMember.life !== 'alive') {
      const cancelled = cloneMember(m);
      cancelled.reviving = null;
      nextState = withMember(nextState, cancelled);
      events.push({ type: 'reviveCancelled', id, reason: 'reviver-invalid' });
      continue;
    }

    const next = cloneMember(m);
    next.life = 'alive';
    next.combatant = { ...next.combatant, health: DOWN.reviveHealth };
    next.downHp = 0;
    next.downedAt = null;
    next.reviving = null;
    // timesDowned is NOT reset.
    nextState = withMember(nextState, next);
    events.push({ type: 'revived', id, by: reviver });
  }

  return { state: nextState, events };
}
