import { describe, expect, it } from 'vitest';
import { shootBot } from './botHits';
import { createMatch } from './roster';
import { FRIENDLY_FIRE } from './balance';

const match = () =>
  createMatch(
    [
      { id: 'A', names: ['You', 'Mate'], bots: [false, true] },
      { id: 'B', names: ['E1', 'E2'], bots: [true, true] },
    ],
    1,
  );
const idOf = (s: ReturnType<typeof match>, name: string) => Object.values(s.members).find((m) => m.name === name)!.id;

describe('shootBot', () => {
  it('damages enemy bots, more on a head shot', () => {
    const s = match();
    const you = idOf(s, 'You');
    const e1 = idOf(s, 'E1');
    const body = shootBot(s, you, e1, 'body', 5);
    const head = shootBot(s, you, e1, 'head', 5);
    const hp = s.members[e1]!.combatant.health;
    expect(body.result).toBe('hit');
    expect(head.headshot).toBe(true);
    const bodyDmg = hp - body.state.members[e1]!.combatant.health;
    const headDmg = hp - head.state.members[e1]!.combatant.health;
    expect(bodyDmg).toBeGreaterThan(0);
    expect(headDmg).toBeGreaterThan(bodyDmg);
  });

  it('follows the team rules for squadmates', () => {
    const s = match();
    const r = shootBot(s, idOf(s, 'You'), idOf(s, 'Mate'), 'head', 1);
    if (FRIENDLY_FIRE) expect(r.result).not.toBe('blocked');
    else {
      expect(r.result).toBe('blocked');
      expect(r.state).toBe(s);
    }
  });

  it('knocks an enemy with a living mate, then finishes them while downed', () => {
    let s = match();
    const you = idOf(s, 'You');
    const e1 = idOf(s, 'E1');
    let downed = false;
    for (let i = 0; i < 30 && s.members[e1]!.life === 'alive'; i++) {
      const r = shootBot(s, you, e1, 'head', 2);
      s = r.state;
      if (r.result === 'downed') downed = true;
    }
    expect(downed).toBe(true);
    expect(s.members[e1]!.life).toBe('downed');
    for (let i = 0; i < 60 && s.members[e1]!.life === 'downed'; i++) s = shootBot(s, you, e1, 'body', 2).state;
    expect(s.members[e1]!.life).toBe('dead');
    expect(shootBot(s, you, e1, 'body', 2).result).toBe('blocked');
  });

  it('scales damage for weaker bot rounds', () => {
    const s = match();
    const e1 = idOf(s, 'E1');
    const hp = s.members[e1]!.combatant.health;
    const full = hp - shootBot(s, idOf(s, 'You'), e1, 'body', 5).state.members[e1]!.combatant.health;
    const weak = hp - shootBot(s, idOf(s, 'Mate'), e1, 'body', 5, 10).state.members[e1]!.combatant.health;
    expect(weak).toBeLessThan(full);
    expect(weak).toBeGreaterThan(0);
  });
});
