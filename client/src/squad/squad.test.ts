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
    const files = readdirSync(squadDir).filter((f: string) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'adapter.ts');
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

import { checkWipe } from './elimination';
import { canRevive, cancelRevive, horizontalDistance, startRevive, tickRevive } from './revive';
import { nextTarget, spectateTargets } from './spectate';
import { step, type PlayerInput } from './step';
import { mulberry32 } from '../zone/zoneLogic';

function place(state: ReturnType<typeof sampleMatch>, id: string, x: number, y: number, z: number) {
  const m = state.members[id]!;
  return {
    ...state,
    members: {
      ...state.members,
      [id]: { ...m, pos: { x, y, z }, combatant: { ...m.combatant }, reviving: m.reviving ? { ...m.reviving } : null },
    },
  };
}

function knock(state: ReturnType<typeof sampleMatch>, victim: string, by: string) {
  return applyDamage(state, victim, by, lethalHit()).state;
}

describe('revive (3.3)', () => {
  it('canRevive requires same squad, alive reviver, downed target, range and height', () => {
    let state = sampleMatch();
    const [a0, a1] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    state = knock(state, a0!, b0!);
    state = place(state, a0!, 0, 0, 0);
    state = place(state, a1!, 1, 0, 0);
    expect(canRevive(state, a1!, a0!)).toBe(true);

    // enemy cannot revive
    expect(canRevive(state, b0!, a0!)).toBe(false);
    // too far
    state = place(state, a1!, 5, 0, 0);
    expect(canRevive(state, a1!, a0!)).toBe(false);
    // height
    state = place(state, a1!, 1, 2, 0);
    expect(canRevive(state, a1!, a0!)).toBe(false);
  });

  it('rejects a second reviver on the same target and a busy reviver', () => {
    let state = sampleMatch();
    const [a0, a1, a2] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    state = knock(state, a0!, b0!);
    state = place(state, a0!, 0, 0, 0);
    state = place(state, a1!, 1, 0, 0);
    state = place(state, a2!, 1.2, 0, 0);
    state = startRevive(state, a1!, a0!).state;
    expect(canRevive(state, a2!, a0!)).toBe(false); // target already taken
    // knock another mate and try the same reviver
    state = knock(state, a2!, b0!);
    state = place(state, a2!, 2, 0, 0);
    expect(canRevive(state, a1!, a2!)).toBe(false); // reviver busy
  });

  it('completes after reviveSeconds with reviveHealth and keeps timesDowned and armor', () => {
    let state = sampleMatch();
    const [a0, a1] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    state = knock(state, a0!, b0!);
    expect(state.members[a0!]!.timesDowned).toBe(1);
    // Armor is kept across the knock; set it on the downed combatant for the revive check.
    state = {
      ...state,
      members: {
        ...state.members,
        [a0!]: {
          ...state.members[a0!]!,
          combatant: { ...state.members[a0!]!.combatant, armor: 40 },
          pos: { ...state.members[a0!]!.pos },
          reviving: null,
        },
      },
    };
    state = place(state, a0!, 0, 0, 0);
    state = place(state, a1!, 1, 0, 0);
    state = startRevive(state, a1!, a0!).state;
    // Advance clock to just under, then over
    state = { ...state, t: state.t + DOWN.reviveSeconds - 0.01 };
    expect(tickRevive(state).events).toEqual([]);
    state = { ...state, t: state.t + 0.02 };
    const r = tickRevive(state);
    expect(r.events).toEqual([{ type: 'revived', id: a0, by: a1 }]);
    const m = r.state.members[a0!]!;
    expect(m.life).toBe('alive');
    expect(m.combatant.health).toBe(DOWN.reviveHealth);
    expect(m.combatant.armor).toBe(40);
    expect(m.timesDowned).toBe(1);
    expect(m.downedAt).toBeNull();
    expect(m.reviving).toBeNull();
  });

  it('cancelRevive clears progress and each interrupt reason works via step', () => {
    let state = sampleMatch();
    const [a0, a1] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    state = knock(state, a0!, b0!);
    state = place(state, a0!, 0, 0, 0);
    state = place(state, a1!, 1, 0, 0);
    state = startRevive(state, a1!, a0!).state;
    const c = cancelRevive(state, a0!, 'released');
    expect(c.events[0]).toEqual({ type: 'reviveCancelled', id: a0, reason: 'released' });
    expect(c.state.members[a0!]!.reviving).toBeNull();

    // release via step
    state = startRevive(state, a1!, a0!).state;
    const r1 = step(state, [{ id: a1!, holdRevive: false }], 0.1);
    expect(r1.events.some((e) => e.type === 'reviveCancelled' && e.reason === 'released')).toBe(true);

    // out of range
    state = sampleMatch();
    state = knock(state, a0!, b0!);
    state = place(state, a0!, 0, 0, 0);
    state = place(state, a1!, 1, 0, 0);
    state = startRevive(state, a1!, a0!).state;
    const r2 = step(state, [{ id: a1!, holdRevive: true, pos: { x: 10, y: 0, z: 0 } }], 0.1);
    expect(r2.events.some((e) => e.type === 'reviveCancelled' && e.reason === 'out-of-range')).toBe(true);

    // reviver damaged
    state = sampleMatch();
    state = knock(state, a0!, b0!);
    state = place(state, a0!, 0, 0, 0);
    state = place(state, a1!, 1, 0, 0);
    state = startRevive(state, a1!, a0!).state;
    const r3 = step(state, [{ id: a1!, holdRevive: true, tookDamage: true }], 0.1);
    expect(r3.events.some((e) => e.type === 'reviveCancelled' && e.reason === 'reviver-damaged')).toBe(true);
  });

  it('bleed pauses while a revive is in progress', () => {
    let state = sampleMatch();
    const [a0, a1] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    state = knock(state, a0!, b0!);
    state = place(state, a0!, 0, 0, 0);
    state = place(state, a1!, 1, 0, 0);
    state = startRevive(state, a1!, a0!).state;
    const before = state.members[a0!]!.downHp;
    const r = tickBleed(state, 5);
    expect(r.state.members[a0!]!.downHp).toBe(before);
  });

  it('horizontalDistance uses the XZ plane', () => {
    let state = sampleMatch();
    const [a0, a1] = idsBySquad(state, 'A');
    state = place(state, a0!, 0, 10, 0);
    state = place(state, a1!, 3, 0, 4);
    expect(horizontalDistance(state.members[a0!]!, state.members[a1!]!)).toBeCloseTo(5);
  });
});

describe('elimination (3.4)', () => {
  it('wipes an all-downed squad, converts downed to dead, sets placement', () => {
    let state = sampleMatch();
    const mates = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    for (const id of mates) state = knock(state, id!, b0!);
    // last one with no alive mate dies straight; force all downed for wipe path:
    // re-build: knock 3, then manually set 4th downed
    state = sampleMatch();
    for (const id of mates.slice(0, 3)) state = knock(state, id!, b0!);
    // 4th still alive - knock with a temporary mate alive already done for first 3
    // Make the 4th downed by giving them a fake alive mate then... actually after 3 downed,
    // 4th lethal -> dead. So set all four downed manually for wipe test:
    state = sampleMatch();
    const members = { ...state.members };
    for (const id of mates) {
      const m = members[id!]!;
      members[id!] = {
        ...m,
        life: 'downed',
        downHp: 50,
        downedAt: 0,
        timesDowned: 1,
        killedBy: b0!,
        combatant: { ...m.combatant, health: 0 },
        reviving: null,
        pos: { ...m.pos },
      };
    }
    state = { ...state, members };
    const r = checkWipe(state);
    expect(r.state.squads.A!.eliminated).toBe(true);
    expect(r.state.squads.A!.placement).toBe(2);
    expect(r.state.squadsAlive).toBe(1);
    expect(r.events.some((e) => e.type === 'squadWiped' && e.squad === 'A' && e.placement === 2)).toBe(true);
    expect(r.events.some((e) => e.type === 'matchWon' && e.squad === 'B')).toBe(true);
    for (const id of mates) {
      expect(r.state.members[id!]!.life).toBe('dead');
      expect(r.state.members[id!]!.killedBy).toBe(b0);
    }
  });

  it('placement order is correct across 3 squads', () => {
    let state = createMatch(
      [
        { id: 'A', names: ['A1', 'A2'], bots: [true, true] },
        { id: 'B', names: ['B1', 'B2'], bots: [true, true] },
        { id: 'C', names: ['C1', 'C2'], bots: [true, true] },
      ],
      7,
    );
    const downAll = (sid: string) => {
      const members = { ...state.members };
      for (const id of state.squads[sid]!.members) {
        const m = members[id]!;
        members[id] = {
          ...m,
          life: 'downed' as const,
          downHp: 10,
          downedAt: state.t,
          timesDowned: 1,
          killedBy: 'x',
          combatant: { ...m.combatant, health: 0 },
          reviving: null,
          pos: { ...m.pos },
        };
      }
      state = { ...state, members };
    };
    downAll('A');
    let r = checkWipe(state);
    state = r.state;
    expect(state.squads.A!.placement).toBe(3);
    downAll('C');
    r = checkWipe(state);
    state = r.state;
    expect(state.squads.C!.placement).toBe(2);
    expect(r.events.some((e) => e.type === 'matchWon' && e.squad === 'B')).toBe(true);
  });
});

describe('spectate (3.5)', () => {
  it('orders alive first then by slot; empty when wiped', () => {
    let state = sampleMatch();
    const [a0, a1, a2, a3] = idsBySquad(state, 'A');
    const [b0] = idsBySquad(state, 'B');
    state = knock(state, a1!, b0!);
    state = knock(state, a2!, b0!);
    // a0 dead
    state = {
      ...state,
      members: {
        ...state.members,
        [a0!]: {
          ...state.members[a0!]!,
          life: 'dead',
          combatant: { ...state.members[a0!]!.combatant, health: 0 },
          reviving: null,
          pos: { ...state.members[a0!]!.pos },
        },
      },
    };
    // from a0: targets should be a3 (alive), then a1, a2 (downed by slot)
    const targets = spectateTargets(state, a0!);
    expect(targets[0]).toBe(a3);
    expect(targets.slice(1)).toEqual([a1, a2]);

    // wipe A
    const members = { ...state.members };
    for (const id of [a1, a2, a3]) {
      members[id!] = { ...members[id!]!, life: 'dead', reviving: null, pos: { ...members[id!]!.pos }, combatant: { ...members[id!]!.combatant } };
    }
    state = {
      ...state,
      members,
      squads: { ...state.squads, A: { ...state.squads.A!, eliminated: true, placement: 2 } },
      squadsAlive: 1,
    };
    expect(spectateTargets(state, a0!)).toEqual([]);
  });

  it('nextTarget cycles forward and backward', () => {
    const t = ['a', 'b', 'c'];
    expect(nextTarget(t, null, 1)).toBe('a');
    expect(nextTarget(t, 'a', 1)).toBe('b');
    expect(nextTarget(t, 'c', 1)).toBe('a');
    expect(nextTarget(t, 'a', -1)).toBe('c');
    expect(nextTarget([], null, 1)).toBeNull();
  });
});

describe('step determinism and sim', () => {
  it('same seed and inputs give identical state (snapshot)', () => {
    const run = () => {
      let state = sampleMatch(99);
      const [a0, a1] = idsBySquad(state, 'A');
      const [b0] = idsBySquad(state, 'B');
      state = knock(state, a0!, b0!);
      state = place(state, a0!, 0, 0, 0);
      state = place(state, a1!, 1, 0, 0);
      const inputs: PlayerInput[] = [
        { id: a1!, holdRevive: true, pos: { x: 1, y: 0, z: 0 } },
        { id: a0!, holdRevive: false, pos: { x: 0, y: 0, z: 0 } },
      ];
      for (let i = 0; i < 70; i++) state = step(state, inputs, 0.1).state;
      return state;
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(a.members[idsBySquad(a, 'A')[0]!]!.life).toBe('alive');
    expect(a.members[idsBySquad(a, 'A')[0]!]!.combatant.health).toBe(DOWN.reviveHealth);
  });

  it('1000-step random sim never has downed in a wiped squad or negative hp', () => {
    const rng = mulberry32(12345);
    let state = createMatch(
      [
        { id: 'A', names: ['A0', 'A1', 'A2', 'A3'], bots: [true, true, true, true] },
        { id: 'B', names: ['B0', 'B1', 'B2', 'B3'], bots: [true, true, true, true] },
        { id: 'C', names: ['C0', 'C1'], bots: [true, true] },
      ],
      12345,
    );
    // Spread positions
    let i = 0;
    for (const id of Object.keys(state.members)) {
      state = place(state, id, (i % 5) * 2, 0, Math.floor(i / 5) * 2);
      i++;
    }
    for (let stepI = 0; stepI < 1000; stepI++) {
      // Random knocks / finishes / revives
      const ids = Object.keys(state.members);
      const attacker = ids[Math.floor(rng() * ids.length)]!;
      const victim = ids[Math.floor(rng() * ids.length)]!;
      if (attacker !== victim && state.members[attacker]!.life === 'alive' && state.members[victim]!.life === 'alive') {
        if (rng() < 0.15) state = applyDamage(state, victim, attacker, lethalHit()).state;
      }
      if (state.members[victim]?.life === 'downed' && rng() < 0.1) {
        state = applyDownedDamage(state, victim, attacker, 40).state;
      }
      const inputs: PlayerInput[] = ids.map((id) => {
        const m = state.members[id]!;
        return {
          id,
          holdRevive: m.life === 'alive' && rng() < 0.3,
          pos: {
            x: m.pos.x + (rng() - 0.5) * 0.4,
            y: m.pos.y,
            z: m.pos.z + (rng() - 0.5) * 0.4,
          },
        };
      });
      state = step(state, inputs, 0.2).state;

      for (const m of Object.values(state.members)) {
        expect(m.combatant.health).toBeGreaterThanOrEqual(0);
        expect(m.downHp).toBeGreaterThanOrEqual(0);
        const squad = state.squads[m.squad]!;
        if (squad.eliminated) {
          expect(m.life).not.toBe('downed');
        }
      }
    }
  });
});
