/**
 * Build and query squad match state. Pure: no three.js, no Rapier, no DOM.
 */
import { createCombatant } from '../combat/health';
import { SQUAD_SIZE } from './balance';
import type { PlayerId, Squad, SquadId, SquadMatchState, SquadMember } from './types';

export interface SquadSpec {
  id: SquadId;
  /** Display names in slot order. Length 1 to SQUAD_SIZE. */
  names: string[];
  /** Parallel to names: true when that slot is a bot. */
  bots: boolean[];
}

/** Builds a fresh match. Slot order follows the names array. */
export function createMatch(squads: SquadSpec[], seed: number): SquadMatchState {
  const members: Record<PlayerId, SquadMember> = {};
  const squadMap: Record<SquadId, Squad> = {};
  let playerOrdinal = 0;

  for (const spec of squads) {
    if (spec.names.length === 0 || spec.names.length > SQUAD_SIZE) {
      throw new Error(`squad ${spec.id}: need 1 to ${SQUAD_SIZE} names`);
    }
    if (spec.bots.length !== spec.names.length) {
      throw new Error(`squad ${spec.id}: bots length must match names`);
    }
    const ids: PlayerId[] = [];
    for (let slot = 0; slot < spec.names.length; slot++) {
      const id: PlayerId = `p${playerOrdinal++}`;
      ids.push(id);
      members[id] = {
        id,
        squad: spec.id,
        slot: slot as 0 | 1 | 2 | 3,
        name: spec.names[slot]!,
        isBot: spec.bots[slot]!,
        life: 'alive',
        combatant: createCombatant(),
        downHp: 0,
        downedAt: null,
        timesDowned: 0,
        reviving: null,
        pos: { x: 0, y: 0, z: 0 },
        killedBy: null,
      };
    }
    squadMap[spec.id] = {
      id: spec.id,
      members: ids,
      eliminated: false,
      placement: null,
    };
  }

  return {
    t: 0,
    seed,
    members,
    squads: squadMap,
    squadsAlive: squads.length,
  };
}

export function teammates(state: SquadMatchState, id: PlayerId): SquadMember[] {
  const me = state.members[id];
  if (!me) return [];
  const squad = state.squads[me.squad];
  if (!squad) return [];
  return squad.members
    .filter((mid) => mid !== id)
    .map((mid) => state.members[mid]!)
    .filter(Boolean);
}

export function isSameSquad(state: SquadMatchState, a: PlayerId, b: PlayerId): boolean {
  const ma = state.members[a];
  const mb = state.members[b];
  if (!ma || !mb) return false;
  return ma.squad === mb.squad;
}

/** True when at least one other squadmate is currently alive. */
export function hasAliveTeammate(state: SquadMatchState, id: PlayerId): boolean {
  return teammates(state, id).some((m) => m.life === 'alive');
}
