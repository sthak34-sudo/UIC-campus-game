import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCombatant, takeDirectDamage, takeHit } from '../combat/health';
import { DOWN, FRIENDLY_FIRE, SQUAD_SIZE } from './balance';
import { applyDamage, applyDownedDamage, bleedRate, tickBleed } from './downed';
import { canDamage } from './friendlyFire';
import { createMatch, hasAliveTeammate, isSameSquad, teammates } from './roster';

const squadDir = dirname(fileURLToPath(import.meta.url));

/** Two squads of 4: A (player + 3 bots) vs B (4 bots). */
function sampleMatch(seed = 1) {
  return createMatch(
    [
      { id: 'A', names: ['You', 'Bot1', 'Bot2', 'Bot3'], bots: [false, true, true, true] },
      { id: 'B', names: ['E1', 'E2', 'E3', 'E4'], bots: [true, true, true, true] },
    ],
    seed,
  );
}

function idsBySquad(state: ReturnType<typeof sampleMatch>, squad: string) {
  return state.squads[squad]!.members;
}

function lethalHit() {
  // Four debug hurts of 25 = 100 health.
  let c = createCombatant();
  let outcome = takeDirectDamage(c, 100);
  return outcome;
}

describe('squad import ban', () => {
  it('no squad file imports three, rapier, or touches window', () => {
    const files = readdirSync(squadDir).filter((f: string) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);
    const banned: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(squadDir, f), 'utf8') as string;
      if (/\bfrom\s+['"]three/.test(src) || /\bthree\//.test(src)) banned.push(`${f}: three`);
      if (/@dimforge\/rapier/.test(src) || /\brapier3d/.test(src)) banned.push(`${f}: rapier`);
      if (/\bwindow\b/.test(src)) banned.push(`${f}: window`);
    }
    expect(banned).toEqual([]);
  });
});

describe('balance', () => {
  it('ships the design tunables', () => {
    expect(SQUAD_SIZE).toBe(4);
    expect(DOWN.hp).toBe(100);
    expect(DOWN.bleedPerSec).toBe(1);
    expect(DOWN.bleedMultPerKnock).toBe(1.5);
    expect(DOWN.crawlSpeed).toBe(0.9);
    expect(DOWN.reviveSeconds).toBe(6);
    expect(DOWN.reviveRange).toBe(1.8);
    expect(DOWN.reviveHealth).toBe(20);
    expect(FRIENDLY_FIRE).toBe(false);
  });
});

describe('roster', () => {
  it('builds a match with slots, bots, and full health', () => {
    const state = sampleMatch(42);
    expect(state.seed).toBe(42);
    expect(state.t).toBe(0);
    expect(state.squadsAlive).toBe(2);
    expect(Object.keys(state.members)).toHaveLength(8);
    const [you, bot1] = idsBySquad(state, 'A');
    expect(state.members[you!]!.name).toBe('You');
    expect(state.members[you!]!.isBot).toBe(false);
    expect(state.members[you!]!.slot).toBe(0);
    expect(state.members[bot1!]!.isBot).toBe(true);
    expect(state.members[bot1!]!.slot).toBe(1);
    expect(state.members[you!]!.combatant.health).toBe(100);
    expect(state.members[you!]!.life).toBe('alive');
  });

  it('lists teammates and detects same squad', () => {
    const state = sampleMatch();
    const [a0, a1] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    expect(teammates(state, a0!).map((m) => m.id).sort()).toEqual(
      idsBySquad(state, 'A').filter((id) => id !== a0).sort(),
    );
    expect(isSameSquad(state, a0!, a1!)).toBe(true);
    expect(isSameSquad(state, a0!, b0!)).toBe(false);
    expect(hasAliveTeammate(state, a0!)).toBe(true);
  });

  it('rejects empty or oversized squads', () => {
    expect(() => createMatch([{ id: 'A', names: [], bots: [] }], 1)).toThrow();
    expect(() => createMatch([{ id: 'A', names: ['a', 'b', 'c', 'd', 'e'], bots: [false, false, false, false, false] }], 1)).toThrow();
    expect(() => createMatch([{ id: 'A', names: ['a'], bots: [false, true] }], 1)).toThrow();
  });

  it('solo squad has no alive teammate', () => {
    const state = createMatch([{ id: 'A', names: ['Solo'], bots: [false] }], 1);
    const id = state.squads.A!.members[0]!;
    expect(hasAliveTeammate(state, id)).toBe(false);
    expect(teammates(state, id)).toEqual([]);
  });
});

describe('friendlyFire (3.1)', () => {
  it('blocks same-squad damage while friendly fire is off', () => {
    const state = sampleMatch();
    const [a0, a1] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    expect(FRIENDLY_FIRE).toBe(false);
    expect(canDamage(state, a0!, a1!)).toBe(false);
    expect(canDamage(state, a1!, a0!)).toBe(false);
    expect(canDamage(state, a0!, b0!)).toBe(true);
    expect(canDamage(state, b0!, a0!)).toBe(true);
  });

  it('never allows self-damage or damage to a dead player', () => {
    let state = sampleMatch();
    const [a0] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    expect(canDamage(state, a0!, a0!)).toBe(false);
    const killed = applyDamage(state, a0!, b0!, lethalHit());
    state = killed.state;
    expect(state.members[a0!]!.life).not.toBe('alive'); // downed (mates alive)
    // Downed is still a valid damage target for finishers.
    expect(canDamage(state, b0!, a0!)).toBe(true);
    const finished = applyDownedDamage(state, a0!, b0!, DOWN.hp);
    state = finished.state;
    expect(state.members[a0!]!.life).toBe('dead');
    expect(canDamage(state, b0!, a0!)).toBe(false);
  });

  it('returns false for unknown player ids', () => {
    const state = sampleMatch();
    const [a0] = idsBySquad(state, 'A');
    expect(canDamage(state, a0!, 'missing')).toBe(false);
    expect(canDamage(state, 'missing', a0!)).toBe(false);
  });

  it('is only a combat policy: zone and fall damage do not call canDamage', () => {
    // Documented contract for adapters. canDamage stays false for teammates even when they are downed.
    const state = sampleMatch();
    const [a0, a1] = idsBySquad(state, 'A');
    expect(canDamage(state, a0!, a1!)).toBe(false);
  });
});

describe('downed (3.2)', () => {
  it('lethal hit with an alive mate knocks instead of killing', () => {
    const state = sampleMatch();
    const [a0] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    const { state: next, events } = applyDamage(state, a0!, b0!, lethalHit());
    const m = next.members[a0!]!;
    expect(m.life).toBe('downed');
    expect(m.combatant.health).toBe(0);
    expect(m.downHp).toBe(DOWN.hp);
    expect(m.downedAt).toBe(0);
    expect(m.timesDowned).toBe(1);
    expect(m.killedBy).toBe(b0); // knocker remembered for bleed-out credit
    expect(events).toEqual([{ type: 'downed', id: a0, by: b0 }]);
  });

  it('lethal hit with no alive mate goes straight to dead', () => {
    const state = createMatch([{ id: 'A', names: ['Solo'], bots: [false] }], 1);
    const id = state.squads.A!.members[0]!;
    const { state: next, events } = applyDamage(state, id, null, lethalHit());
    expect(next.members[id]!.life).toBe('dead');
    expect(next.members[id]!.killedBy).toBeNull();
    expect(events).toEqual([{ type: 'killed', id, by: null }]);
  });

  it('last alive squadmate dies instead of being knocked', () => {
    let state = sampleMatch();
    const mates = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    // Knock everyone except the last.
    for (const id of mates.slice(0, 3)) {
      const r = applyDamage(state, id!, b0!, lethalHit());
      state = r.state;
      expect(state.members[id!]!.life).toBe('downed');
    }
    const last = mates[3]!;
    expect(hasAliveTeammate(state, last)).toBe(false);
    const r = applyDamage(state, last, b0!, lethalHit());
    expect(r.state.members[last]!.life).toBe('dead');
    expect(r.events).toEqual([{ type: 'killed', id: last, by: b0 }]);
  });

  it('non-lethal hits only update combatant health', () => {
    const state = sampleMatch();
    const [a0] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    const outcome = takeHit(createCombatant(), 'body', 0);
    expect(outcome.died).toBe(false);
    const { state: next, events } = applyDamage(state, a0!, b0!, outcome);
    expect(next.members[a0!]!.life).toBe('alive');
    expect(next.members[a0!]!.combatant.health).toBe(outcome.combatant.health);
    expect(events).toEqual([]);
  });

  it('enemy damage drains downHp and finish credit goes to the attacker', () => {
    let state = sampleMatch();
    const [a0] = idsBySquad(state, 'A');
    const [b0, b1] = idsBySquad(state, 'B');
    state = applyDamage(state, a0!, b0!, lethalHit()).state;
    expect(state.members[a0!]!.downHp).toBe(100);
    state = applyDownedDamage(state, a0!, b1!, 40).state;
    expect(state.members[a0!]!.life).toBe('downed');
    expect(state.members[a0!]!.downHp).toBe(60);
    const fin = applyDownedDamage(state, a0!, b1!, 60);
    expect(fin.state.members[a0!]!.life).toBe('dead');
    expect(fin.state.members[a0!]!.killedBy).toBe(b1);
    expect(fin.events).toEqual([{ type: 'killed', id: a0, by: b1 }]);
  });

  it('applyDamage is a no-op on an already-downed or dead player', () => {
    let state = sampleMatch();
    const [a0] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    state = applyDamage(state, a0!, b0!, lethalHit()).state;
    const again = applyDamage(state, a0!, b0!, lethalHit());
    expect(again.events).toEqual([]);
    expect(again.state.members[a0!]!.downHp).toBe(DOWN.hp);
    state = applyDownedDamage(state, a0!, b0!, DOWN.hp).state;
    const onDead = applyDamage(state, a0!, b0!, lethalHit());
    expect(onDead.events).toEqual([]);
  });

  it('bleed rate grows with each knock', () => {
    let state = sampleMatch();
    const [a0] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    state = applyDamage(state, a0!, b0!, lethalHit()).state;
    expect(bleedRate(state.members[a0!]!)).toBeCloseTo(1.0);
    // Simulate a revive-then-knock by resetting life and applying again.
    const revived = {
      ...state.members[a0!]!,
      life: 'alive' as const,
      combatant: createCombatant(),
      downHp: 0,
      downedAt: null,
      reviving: null,
      // timesDowned kept
    };
    state = { ...state, members: { ...state.members, [a0!]: revived } };
    state = applyDamage(state, a0!, b0!, lethalHit()).state;
    expect(state.members[a0!]!.timesDowned).toBe(2);
    expect(bleedRate(state.members[a0!]!)).toBeCloseTo(1.5);
    const r3 = {
      ...state.members[a0!]!,
      life: 'alive' as const,
      combatant: createCombatant(),
      downHp: 0,
      downedAt: null,
      reviving: null,
    };
    state = { ...state, members: { ...state.members, [a0!]: r3 } };
    state = applyDamage(state, a0!, b0!, lethalHit()).state;
    expect(bleedRate(state.members[a0!]!)).toBeCloseTo(2.25);
  });

  it('bleed drains downHp over time and kills with knocker credit', () => {
    let state = sampleMatch();
    state = { ...state, t: 10 };
    const [a0] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    state = applyDamage(state, a0!, b0!, lethalHit()).state;
    expect(state.members[a0!]!.downedAt).toBe(10);
    // 50 seconds at 1 hp/s
    let r = tickBleed(state, 50);
    expect(r.state.members[a0!]!.downHp).toBeCloseTo(50);
    expect(r.events).toEqual([]);
    r = tickBleed(r.state, 50);
    expect(r.state.members[a0!]!.life).toBe('dead');
    expect(r.state.members[a0!]!.killedBy).toBe(b0);
    expect(r.events).toEqual([{ type: 'killed', id: a0, by: b0 }]);
  });

  it('bleed pauses while a revive is in progress', () => {
    let state = sampleMatch();
    const [a0, a1] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    state = applyDamage(state, a0!, b0!, lethalHit()).state;
    const downed = {
      ...state.members[a0!]!,
      reviving: { reviver: a1!, startedAt: state.t },
    };
    state = { ...state, members: { ...state.members, [a0!]: downed } };
    const r = tickBleed(state, 30);
    expect(r.state.members[a0!]!.downHp).toBe(DOWN.hp);
    expect(r.events).toEqual([]);
  });

  it('second-knock bleed is 1.5x so a 100s baseline becomes ~66.7s', () => {
    let state = sampleMatch();
    const [a0] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    state = applyDamage(state, a0!, b0!, lethalHit()).state;
    const revived = {
      ...state.members[a0!]!,
      life: 'alive' as const,
      combatant: createCombatant(),
      downHp: 0,
      downedAt: null,
      reviving: null,
    };
    state = { ...state, members: { ...state.members, [a0!]: revived } };
    state = applyDamage(state, a0!, b0!, lethalHit()).state;
    // 1.5 hp/s * 66.666...s ~= 100
    const r = tickBleed(state, 100 / 1.5);
    expect(r.state.members[a0!]!.life).toBe('dead');
    expect(r.events[0]?.type).toBe('killed');
  });

  it('applyDownedDamage ignores non-positive amounts and non-downed targets', () => {
    const state = sampleMatch();
    const [a0] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    expect(applyDownedDamage(state, a0!, b0!, 10).events).toEqual([]);
    expect(applyDownedDamage(state, a0!, b0!, 0).events).toEqual([]);
  });

  it('zero dt bleed changes nothing', () => {
    let state = sampleMatch();
    const [a0] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    state = applyDamage(state, a0!, b0!, lethalHit()).state;
    const r = tickBleed(state, 0);
    expect(r.state.members[a0!]!.downHp).toBe(DOWN.hp);
    expect(r.events).toEqual([]);
  });

  it('alive members are untouched by tickBleed', () => {
    const state = sampleMatch();
    const r = tickBleed(state, 10);
    expect(r.state).toBe(state);
    expect(r.events).toEqual([]);
  });

  it('crawl speed and revive tunables are positive', () => {
    expect(DOWN.crawlSpeed).toBeGreaterThan(0);
    expect(DOWN.reviveSeconds).toBeGreaterThan(0);
    expect(DOWN.reviveRange).toBeGreaterThan(0);
    expect(DOWN.reviveHealth).toBeGreaterThan(0);
    expect(DOWN.reviveHealth).toBeLessThan(100);
  });

  it('all-downed squad is not eliminated in S1 (wipe is S2)', () => {
    let state = sampleMatch();
    const mates = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    for (const id of mates.slice(0, 3)) {
      state = applyDamage(state, id!, b0!, lethalHit()).state;
    }
    state = applyDamage(state, mates[3]!, b0!, lethalHit()).state;
    expect(state.squads.A!.eliminated).toBe(false);
    expect(state.members[mates[0]!]!.life).toBe('downed');
    expect(state.members[mates[3]!]!.life).toBe('dead');
  });
});
