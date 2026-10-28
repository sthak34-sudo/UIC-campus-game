import { describe, expect, it } from 'vitest';
import { createMatch } from './roster';
import { applyDamage } from './downed';
import { takeDirectDamage } from '../combat/health';
import { checkWipe } from './elimination';
import { localPlacementLine, localSquadWon, offlineRoster } from './matchSetup';
import { spectateTargets, nextTarget } from './spectate';

describe('offlineRoster', () => {
  it('builds player squad only when enemySquads is 0', () => {
    expect(offlineRoster(0)).toEqual([
      { id: 'A', names: ['You', 'Bot1', 'Bot2', 'Bot3'], bots: [false, true, true, true] },
    ]);
  });

  it('adds N enemy squads of 4 bots (clamped)', () => {
    const r = offlineRoster(2);
    expect(r).toHaveLength(3);
    expect(r[1]!.id).toBe('B');
    expect(r[2]!.id).toBe('C');
    expect(r[1]!.bots.every(Boolean)).toBe(true);
    expect(r[1]!.names).toHaveLength(4);
    expect(offlineRoster(99)).toHaveLength(5); // A + 4
    expect(offlineRoster(-1)).toHaveLength(1);
  });
});

describe('localPlacementLine', () => {
  it('formats win and place lines', () => {
    expect(localPlacementLine(null, 3, false)).toBeNull();
    expect(localPlacementLine(null, 1, true)).toBe('Victory! Your squad wins.');
    expect(localPlacementLine(2, 1, false)).toMatch(/#2nd place/);
    expect(localPlacementLine(3, 2, false)).toMatch(/#3rd place/);
  });
});

describe('S5 offline match (3 squads)', () => {
  it('ends with a winner and placements', () => {
    let state = createMatch(offlineRoster(2), 1);
    expect(state.squadsAlive).toBe(3);

    // Wipe B then C then leave A: wipe by killing everyone in B and C.
    for (const squadId of ['B', 'C'] as const) {
      for (const id of state.squads[squadId]!.members) {
        const m = state.members[id]!;
        const outcome = takeDirectDamage(m.combatant, 999);
        // No alive mates left after we kill them one by one from alive->dead when last.
        const r = applyDamage(state, id, 'p0', outcome);
        state = r.state;
      }
      const w = checkWipe(state);
      state = w.state;
    }
    expect(state.squads.B!.eliminated).toBe(true);
    expect(state.squads.C!.eliminated).toBe(true);
    expect(state.squads.A!.eliminated).toBe(false);
    // A wins when only one remains.
    const win = checkWipe(state);
    state = win.state;
    // checkWipe fires matchWon when squadsAlive hits 1 after a wipe.
    expect(state.squadsAlive).toBe(1);
  });

  it('spectate only cycles living or downed teammates', () => {
    let state = createMatch(offlineRoster(2), 1);
    const you = 'p0';
    // Kill you; knock one mate; leave others.
    {
      const mate = state.squads.A!.members[1]!;
      const outcome = takeDirectDamage(state.members[mate]!.combatant, 999);
      state = applyDamage(state, mate, 'enemy', outcome).state;
    }
    {
      // Force you dead with no alive-mate check: kill all other mates first except one downed.
      // Simpler: set you dead via finishing after knock with a living mate.
      const outcome = takeDirectDamage(state.members[you]!.combatant, 999);
      state = applyDamage(state, you, 'enemy', outcome).state;
      // If downed, finish
      if (state.members[you]!.life === 'downed') {
        // drain downHp via applyDamage path - use elimination style by wiping mates... 
        // Directly mark dead for spectate test:
        state = {
          ...state,
          members: {
            ...state.members,
            [you]: { ...state.members[you]!, life: 'dead', downHp: 0 },
          },
        };
      }
    }
    const targets = spectateTargets(state, you);
    expect(targets.length).toBeGreaterThan(0);
    for (const id of targets) {
      const life = state.members[id]!.life;
      expect(life === 'alive' || life === 'downed').toBe(true);
      expect(state.members[id]!.squad).toBe('A');
    }
    // Cycle wraps
    const a = nextTarget(targets, null, 1);
    const b = nextTarget(targets, a, 1);
    expect(a).not.toBeNull();
    expect(targets).toContain(b!);
    // Enemy ids never appear
    for (const id of state.squads.B!.members) {
      expect(targets).not.toContain(id);
    }
  });
});

describe('no instant victory', () => {
  it('?squad=bots brings 3 enemy squads of 4 by default; ?enemySquads=N overrides; solo has none', async () => {
    const { parseSquadOptions } = await import('./adapter');
    expect(parseSquadOptions('?squad=bots').enemySquads).toBe(3);
    expect(parseSquadOptions('?squad=bots&enemySquads=1').enemySquads).toBe(1);
    expect(parseSquadOptions('?squad=bots&enemySquads=0').enemySquads).toBe(0);
    expect(parseSquadOptions('').enemySquads).toBe(0);
    const r = offlineRoster(3);
    expect(r.length).toBe(4);
    expect(r.slice(1).every((s) => s.names.length === 4 && s.bots.every(Boolean))).toBe(true);
  });
  it('is not a win at the start, nor with no enemies at all; only once every other squad is out', () => {
    const start = createMatch(offlineRoster(3), 1);
    expect(localSquadWon(start, 'A')).toBe(false);
    const lone = createMatch(offlineRoster(0), 1);
    expect(localSquadWon(lone, 'A')).toBe(false);
    const ended = { ...start, squads: Object.fromEntries(Object.entries(start.squads).map(([k, s]) => [k, k === 'A' ? s : { ...s, eliminated: true }])) };
    expect(localSquadWon(ended, 'A')).toBe(true);
  });
});

describe('lone squad', () => {
  it('never emits matchWon when there are no enemy squads', () => {
    const { events } = checkWipe(createMatch(offlineRoster(0), 1));
    expect(events.some((e) => e.type === 'matchWon')).toBe(false);
  });
});
