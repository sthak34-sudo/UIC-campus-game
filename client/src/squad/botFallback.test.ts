import { describe, expect, it } from 'vitest';
import { createCombatant, takeDirectDamage } from '../combat/health';
import { DOWN } from './balance';
import { crawlTarget, CRAWL_STOP_M, dryRetreatTarget, DRY_RETREAT_M } from './botFallback';
import { applyDamage } from './downed';
import { offlineRoster } from './matchSetup';
import { createMatch } from './roster';

describe('dry bot (AI-13)', () => {
  it('backs away from the foe instead of charging', () => {
    const t = dryRetreatTarget({ x: 0, z: 0 }, { x: 10, z: 0 }, null);
    expect(t.x).toBeCloseTo(-DRY_RETREAT_M);
    expect(t.z).toBeCloseTo(0);
  });
  it('falls back to its leader when the leader is further from the foe', () => {
    expect(dryRetreatTarget({ x: 0, z: 0 }, { x: 10, z: 0 }, { x: -5, z: 3 })).toEqual({ x: -5, z: 3 });
    // Leader is closer to the foe: don't run into the fight.
    const t = dryRetreatTarget({ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 8, z: 0 });
    expect(t.x).toBeLessThan(0);
  });
});

describe('downed bot crawl (AI-17)', () => {
  it('crawls to the nearest alive teammate, stopping inside revive range', () => {
    let s = createMatch(offlineRoster(1), 1);
    const [a, b, c, ...rest] = s.squads.B!.members;
    const members = { ...s.members };
    for (const r of rest) members[r!] = { ...members[r!]!, pos: { x: 50, y: 0, z: 50 } };
    members[a!] = { ...members[a!]!, pos: { x: 0, y: 0, z: 0 } };
    members[b!] = { ...members[b!]!, pos: { x: 8, y: 0, z: 0 } };
    members[c!] = { ...members[c!]!, pos: { x: 3, y: 0, z: 4 } };
    s = { ...s, members };
    s = applyDamage(s, a!, 'x', takeDirectDamage(createCombatant(), 999)).state;
    expect(crawlTarget(s, a!)).toEqual({ x: 3, z: 4 });
    expect(CRAWL_STOP_M).toBeLessThan(DOWN.reviveRange);
  });
  it('no target when not downed', () => {
    const s = createMatch(offlineRoster(1), 1);
    expect(crawlTarget(s, s.squads.B!.members[0]!)).toBeNull();
  });
});
