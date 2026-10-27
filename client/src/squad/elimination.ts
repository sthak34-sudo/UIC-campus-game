/**
 * Squad wipe / elimination (design 3.4). Pure: no three.js, no Rapier, no DOM.
 */
import type { SquadEvent, SquadMatchState, SquadMember } from './types';

function cloneMember(m: SquadMember): SquadMember {
  return {
    ...m,
    combatant: { ...m.combatant },
    reviving: m.reviving ? { ...m.reviving } : null,
    pos: { ...m.pos },
  };
}

/**
 * After each step: any squad whose members are all downed or dead is wiped.
 * Downed members become dead (kill credit stays with their knocker).
 * placement = squadsAlive before the decrement. Last squad standing wins.
 */
export function checkWipe(
  state: SquadMatchState,
): { state: SquadMatchState; events: SquadEvent[] } {
  let nextState = state;
  const events: SquadEvent[] = [];

  // Snapshot squad ids so we process a stable order.
  const squadIds = Object.keys(nextState.squads).sort();

  for (const sid of squadIds) {
    const squad = nextState.squads[sid]!;
    if (squad.eliminated) continue;
    const members = squad.members.map((id) => nextState.members[id]!).filter(Boolean);
    if (members.length === 0) continue;
    const allOut = members.every((m) => m.life === 'downed' || m.life === 'dead');
    if (!allOut) continue;

    const placement = nextState.squadsAlive;
    const membersMap = { ...nextState.members };
    for (const m of members) {
      if (m.life === 'downed') {
        const dead = cloneMember(m);
        dead.life = 'dead';
        dead.downHp = 0;
        dead.downedAt = null;
        dead.reviving = null;
        // killedBy stays as the knocker (design 3.4).
        membersMap[dead.id] = dead;
        events.push({ type: 'killed', id: dead.id, by: dead.killedBy });
      }
    }
    const squads = {
      ...nextState.squads,
      [sid]: { ...squad, eliminated: true, placement },
    };
    nextState = {
      ...nextState,
      members: membersMap,
      squads,
      squadsAlive: nextState.squadsAlive - 1,
    };
    events.push({ type: 'squadWiped', squad: sid, placement });
  }

  // Last squad standing wins.
  if (nextState.squadsAlive === 1) {
    const winner = Object.values(nextState.squads).find((s) => !s.eliminated);
    if (winner) {
      events.push({ type: 'matchWon', squad: winner.id });
    }
  }

  return { state: nextState, events };
}
