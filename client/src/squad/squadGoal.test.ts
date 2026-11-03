import { describe, expect, it } from 'vitest';
import type { BotZoneView } from './botZone';
import { newSquadGoal, SQUAD_GOAL, stepSquadGoal, type SquadGoalCtx } from './squadGoal';

const zone: BotZoneView = {
  mode: 'wait',
  remaining: 90,
  current: { x: 0, z: 0, radius: 400 },
  next: { x: 100, z: 0, radius: 100 },
  damagePerSecond: 1,
};
const ctx = (over: Partial<SquadGoalCtx> = {}): SquadGoalCtx => ({
  leader: { x: -200, z: 0 },
  dt: 0.1,
  zone,
  findLoot: () => null,
  foes: [{ x: 31, z: 44 }],
  ...over,
});

describe('enemy squad goal (AI-01)', () => {
  it('loots first: the leader gets a real target, not itself', () => {
    const g = stepSquadGoal(newSquadGoal(), ctx({ findLoot: () => ({ x: -190, z: 5 }) }));
    expect(g.phase).toBe('loot');
    expect(g.target).toEqual({ x: -190, z: 5 });
  });
  it('no loot left: rotates to a point inside the next circle', () => {
    const g = stepSquadGoal(newSquadGoal(), ctx());
    expect(g.phase).toBe('rotate');
    expect(g.target!.x).toBeCloseTo(100 - 100 * SQUAD_GOAL.rotateDepth);
    expect(g.target!.z).toBeCloseTo(0);
  });
  it('stops looting after the loot time even with loot around', () => {
    let g = { ...newSquadGoal(), inPhase: SQUAD_GOAL.lootS + 1 };
    g = stepSquadGoal(g, ctx({ findLoot: () => ({ x: -190, z: 5 }) }));
    expect(g.phase).toBe('rotate');
  });
  it('inside the circle: hunts roughly where the nearest squad is', () => {
    const g = stepSquadGoal({ ...newSquadGoal(), phase: 'rotate' }, ctx({ leader: { x: 100, z: 0 } }));
    expect(g.phase).toBe('hunt');
    expect(g.target).toEqual({ x: 30, z: 45 });
  });
  it('keeps a target until it arrives or it goes stale', () => {
    let g = stepSquadGoal(newSquadGoal(), ctx());
    const t = g.target;
    g = stepSquadGoal(g, ctx());
    expect(g.target).toEqual(t);
    g = stepSquadGoal({ ...g, age: SQUAD_GOAL.maxAgeS + 1 }, ctx({ leader: { x: 0, z: 0 } }));
    expect(g.age).toBe(0);
  });
  it('a shrink while hunting sends the squad back to rotating', () => {
    const hunting = { phase: 'hunt' as const, target: { x: -300, z: 0 }, inPhase: 50, age: 10 };
    const g = stepSquadGoal(hunting, ctx({ zone: { ...zone, mode: 'shrink' } }));
    expect(g.phase).toBe('rotate');
  });
});
