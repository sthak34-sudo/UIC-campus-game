import { describe, expect, it } from 'vitest';
import { createCombatant, takeDirectDamage } from '../combat/health';
import { DOWN } from './balance';
import { applyDamage, applyZoneDamage } from './downed';
import { checkWipe } from './elimination';
import { localPlacementLine, localSquadWon, offlineRoster } from './matchSetup';
import { placementText } from '../match/matchStats';
import { createMatch } from './roster';
import type { SquadMatchState } from './types';

const knockAll = (s: SquadMatchState, squad: string, leaveDownHp?: number) => {
  for (const id of s.squads[squad]!.members) {
    s = applyDamage(s, id, 'zone', takeDirectDamage(createCombatant(), 999)).state;
    if (leaveDownHp != null && s.members[id]!.life === 'downed') {
      s = { ...s, members: { ...s.members, [id]: { ...s.members[id]!, downHp: leaveDownHp } } };
    }
  }
  return s;
};

describe('checkWipe tie rule (AI-15)', () => {
  it('every squad wiped in one step: no matchWon, nobody sees Victory', () => {
    let s = createMatch(offlineRoster(3), 1);
    for (const q of ['A', 'B', 'C', 'D']) s = knockAll(s, q);
    const w = checkWipe(s);
    expect(w.events.some((e) => e.type === 'matchWon')).toBe(false);
    expect(w.state.squadsAlive).toBe(0);
    expect(localSquadWon(w.state, 'A')).toBe(false);
    // Equal knock health (all dead): they share 1st, read as "no survivors", not a win.
    for (const q of ['A', 'B', 'C', 'D']) expect(w.state.squads[q]!.placement).toBe(1);
    expect(placementText(1, 4, 'wiped')).toMatch(/No survivors/);
    expect(localPlacementLine(1, 0, false)).toMatch(/No survivors/);
  });
  it('same-step wipe: more knock health left places better', () => {
    let s = createMatch(offlineRoster(2), 1);
    // A: downed mates on full knock health; B: downed mates nearly bled out; C stays alive.
    s = knockAll(s, 'B', 10);
    const [a0, a1, a2, a3] = s.squads.A!.members;
    s = applyDamage(s, a0!, 'x', takeDirectDamage(createCombatant(), 999)).state; // downed (mates alive)
    for (const id of [a1!, a2!, a3!]) s = applyDamage(s, id, 'x', takeDirectDamage(createCombatant(), 999)).state;
    const w = checkWipe(s);
    expect(w.state.squadsAlive).toBe(1);
    const pa = w.state.squads.A!.placement!, pb = w.state.squads.B!.placement!;
    expect(pa).toBe(2);
    expect(pb).toBe(3);
    expect(w.events.some((e) => e.type === 'matchWon' && e.squad === 'C')).toBe(true);
  });
});

describe('zone damage on downed bots (AI-14)', () => {
  it('drains knock health and finishes with zone credit', () => {
    let s = createMatch(offlineRoster(1), 1);
    const id = s.squads.B!.members[0]!;
    s = applyDamage(s, id, 'x', takeDirectDamage(createCombatant(), 999)).state;
    expect(s.members[id]!.life).toBe('downed');
    const r = applyZoneDamage(s, id, 30);
    expect(r.state.members[id]!.downHp).toBeCloseTo(DOWN.hp - 30);
    const fin = applyZoneDamage(r.state, id, 999);
    expect(fin.state.members[id]!.life).toBe('dead');
    expect(fin.events).toEqual([{ type: 'killed', id, by: 'zone' }]);
  });
  it('alive members still take normal damage', () => {
    const s = createMatch(offlineRoster(1), 1);
    const id = s.squads.B!.members[0]!;
    const r = applyZoneDamage(s, id, 10);
    expect(r.state.members[id]!.combatant.health).toBeLessThan(100);
  });
});
