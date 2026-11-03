import { describe, expect, it } from 'vitest';
import { takeDirectDamage, createCombatant } from '../combat/health';
import { DOWN } from './balance';
import { applyDamage } from './downed';
import { startRevive } from './revive';
import { reviveStatus } from './reviveUi';
import { createMatch } from './roster';
import { pingDistanceLabel, pingTarget } from './pings';
import type { SquadMatchState } from './types';

function match(): { s: SquadMatchState; me: string; bot: string } {
  let s = createMatch([
    { id: 'A', names: ['You', 'Bot1', 'Bot2', 'Bot3'], bots: [false, true, true, true] },
    { id: 'B', names: ['E1', 'E2', 'E3', 'E4'], bots: [true, true, true, true] },
  ], 1);
  const [me, bot] = s.squads.A!.members as [string, string];
  const members = { ...s.members };
  for (const id of Object.keys(members)) members[id] = { ...members[id]!, pos: { x: 50, y: 0, z: 50 } };
  members[me] = { ...members[me]!, pos: { x: 0, y: 0, z: 0 } };
  members[bot] = { ...members[bot]!, pos: { x: 1, y: 0, z: 0 } };
  s = { ...s, members };
  return { s, me, bot };
}
const knock = (s: SquadMatchState, id: string) => applyDamage(s, id, 'x', takeDirectDamage(createCombatant(), 999)).state;

describe('revive / downed status (UI-01, UI-02)', () => {
  it('nothing to say when nobody is down', () => {
    const { s, me } = match();
    expect(reviveStatus(s, me)).toBeNull();
  });
  it('prompt "Hold F to revive X" in range, then a 6 s progress bar', () => {
    const { s, me, bot } = match();
    const k = knock(s, bot);
    expect(reviveStatus(k, me)).toEqual({ kind: 'prompt', text: 'Hold F to revive Bot1', bar: null });
    const r = startRevive(k, me, bot).state;
    const st = (reviveStatus({ ...r, t: r.t + DOWN.reviveSeconds / 2 }, me))!;
    expect(st.kind).toBe('reviving');
    expect(st.bar).toBeCloseTo(0.5);
    const victim = reviveStatus({ ...r, t: r.t + 3 }, bot)!;
    expect(victim.text).toBe('Being revived by You');
  });
  it('downed banner: plain words with a bleed-out bar, no "knock hp"', () => {
    const { s, me } = match();
    const k = knock(s, me);
    const st = reviveStatus(k, me)!;
    expect(st.text).toBe('You are down. Crawl to cover, wait for a teammate');
    expect(st.text).not.toMatch(/knock hp/);
    expect(st.bar).toBeCloseTo(1);
  });
  it('no prompt when out of range', () => {
    const { s, me, bot } = match();
    const k = knock(s, bot);
    const far = { ...k, members: { ...k.members, [bot]: { ...k.members[bot]!, pos: { x: 5, y: 0, z: 0 } } } };
    expect(reviveStatus(far, me)).toBeNull();
  });
});

describe('ping at aim point (UI-03)', () => {
  const feet = { x: 0, y: 0, z: 0 };
  it('uses the camera ray hit', () => {
    const p = pingTarget({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: -1 }, 25, feet, 300);
    expect(p).toEqual({ x: 0, y: 2, z: -25 });
  });
  it('no hit but aiming down: lands on the ground plane', () => {
    const p = pingTarget({ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: -1 }, null, feet, 300);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-2);
  });
  it('sky: falls back to the feet', () => {
    expect(pingTarget({ x: 0, y: 2, z: 0 }, { x: 0, y: 1, z: -1 }, null, feet, 300)).toEqual(feet);
  });
  it('distance label', () => expect(pingDistanceLabel(41.6)).toBe('42 m'));
});
