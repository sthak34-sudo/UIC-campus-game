/**
 * Fixed-order squad step (design §3 table + §6). Pure: no three.js, no Rapier, no DOM.
 *
 * Order: sync positions / damage cancels -> revive hold start/cancel -> tickBleed
 * -> advance t -> tickRevive -> checkWipe.
 */
import { tickBleed } from './downed';
import { checkWipe } from './elimination';
import { canRevive, cancelRevive, horizontalDistance, startRevive, tickRevive } from './revive';
import { DOWN } from './balance';
import type { PlayerId, SquadEvent, SquadMatchState, SquadMember } from './types';

export interface PlayerInput {
  id: PlayerId;
  /** Hold F to revive. */
  holdRevive: boolean;
  /** Prefer this downed teammate; else the nearest valid one. */
  reviveTarget?: PlayerId | null;
  /** World position copied from physics this tick. */
  pos?: { x: number; y: number; z: number };
  /** True when this player took damage this tick (cancels their revive). */
  tookDamage?: boolean;
}

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

function findTargetBeingRevivedBy(state: SquadMatchState, reviverId: PlayerId): PlayerId | null {
  for (const m of Object.values(state.members)) {
    if (m.reviving && m.reviving.reviver === reviverId) return m.id;
  }
  return null;
}

function nearestDownedTeammate(
  state: SquadMatchState,
  reviverId: PlayerId,
): PlayerId | null {
  const reviver = state.members[reviverId];
  if (!reviver) return null;
  let best: PlayerId | null = null;
  let bestDist = Infinity;
  for (const m of Object.values(state.members)) {
    if (m.id === reviverId) continue;
    if (!canRevive(state, reviverId, m.id)) continue;
    const d = horizontalDistance(reviver, m);
    if (d < bestDist) {
      bestDist = d;
      best = m.id;
    }
  }
  return best;
}

export function step(
  state: SquadMatchState,
  inputs: readonly PlayerInput[],
  dt: number,
): { state: SquadMatchState; events: SquadEvent[] } {
  let next = state;
  const events: SquadEvent[] = [];
  const push = (r: { state: SquadMatchState; events: SquadEvent[] }) => {
    next = r.state;
    events.push(...r.events);
  };

  // 1. Sync positions.
  for (const input of inputs) {
    if (!input.pos) continue;
    const m = next.members[input.id];
    if (!m) continue;
    const updated = cloneMember(m);
    updated.pos = { ...input.pos };
    next = withMember(next, updated);
  }

  // 2. Damage interrupts: cancel any revive this player is performing.
  for (const input of inputs) {
    if (!input.tookDamage) continue;
    const targetId = findTargetBeingRevivedBy(next, input.id);
    if (targetId) push(cancelRevive(next, targetId, 'reviver-damaged'));
  }

  // 3. Range / life interrupts for in-progress revives.
  for (const m of Object.values(next.members)) {
    if (!m.reviving) continue;
    const reviver = next.members[m.reviving.reviver];
    if (!reviver || reviver.life !== 'alive') {
      push(cancelRevive(next, m.id, 'reviver-invalid'));
      continue;
    }
    if (m.life !== 'downed') {
      push(cancelRevive(next, m.id, 'target-dead'));
      continue;
    }
    if (horizontalDistance(reviver, m) > DOWN.reviveRange || Math.abs(reviver.pos.y - m.pos.y) >= 1.2) {
      push(cancelRevive(next, m.id, 'out-of-range'));
    }
  }

  // 4. Hold-F start / release cancel.
  for (const input of inputs) {
    const existing = findTargetBeingRevivedBy(next, input.id);
    if (!input.holdRevive) {
      if (existing) push(cancelRevive(next, existing, 'released'));
      continue;
    }
    if (existing) continue; // already reviving; keep going
    const preferred = input.reviveTarget ?? null;
    const targetId =
      preferred && canRevive(next, input.id, preferred)
        ? preferred
        : nearestDownedTeammate(next, input.id);
    if (targetId) push(startRevive(next, input.id, targetId));
  }

  // 5. Bleed (pauses while reviving).
  push(tickBleed(next, dt));

  // 6. Advance match clock.
  next = { ...next, t: next.t + dt };

  // 7. Complete revives whose timer is up.
  push(tickRevive(next));

  // 8. Squad wipe / match won.
  push(checkWipe(next));

  return { state: next, events };
}
