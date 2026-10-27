import { describe, expect, it } from 'vitest';
import { botIntent, stepToward, type BotWorldView } from './bots';
import { applyDamage } from './downed';
import { createMatch } from './roster';
import { createCombatant, takeDirectDamage } from '../combat/health';
import { DOWN } from './balance';

const view = (over: Partial<BotWorldView> = {}): BotWorldView => ({
  leaderId: 'p0',
  enemyVisible: false,
  nearestEnemyId: null,
  inZoneDanger: false,
  zoneCenter: { x: 0, z: 0 },
  ...over,
});

function squadBots() {
  return createMatch(
    [{ id: 'A', names: ['You', 'Bot1', 'Bot2'], bots: [false, true, true] }],
    1,
  );
}

function lethal() {
  return takeDirectDamage(createCombatant(), 100);
}

describe('botIntent', () => {
  it('follows the leader when nothing else is urgent', () => {
    const state = squadBots();
    expect(botIntent(state, 'p1', view())).toEqual({
      type: 'follow',
      target: 'p0',
      spacing: 6,
    });
  });

  it('moves into the zone when in danger', () => {
    const state = squadBots();
    expect(botIntent(state, 'p1', view({ inZoneDanger: true, zoneCenter: { x: 10, z: -4 } }))).toEqual({
      type: 'moveTo',
      x: 10,
      z: -4,
    });
  });

  it('revives a downed mate in range when no enemy is visible', () => {
    let state = squadBots();
    state = applyDamage(state, 'p2', 'enemy', lethal()).state;
    state = {
      ...state,
      members: {
        ...state.members,
        p1: { ...state.members.p1!, pos: { x: 0.5, y: 0, z: 0 } },
        p2: { ...state.members.p2!, pos: { x: 0, y: 0, z: 0 } },
      },
    };
    expect(state.members.p2!.life).toBe('downed');
    expect(botIntent(state, 'p1', view())).toEqual({ type: 'revive', target: 'p2' });
  });

  it('shoots a visible enemy instead of reviving', () => {
    let state = squadBots();
    state = applyDamage(state, 'p2', 'enemy', lethal()).state;
    state = {
      ...state,
      members: {
        ...state.members,
        p1: { ...state.members.p1!, pos: { x: 0.5, y: 0, z: 0 } },
        p2: { ...state.members.p2!, pos: { x: 0, y: 0, z: 0 } },
      },
    };
    expect(
      botIntent(state, 'p1', view({ enemyVisible: true, nearestEnemyId: 'enemy' })),
    ).toEqual({ type: 'shoot', target: 'enemy' });
  });

  it('idles when the bot is not alive', () => {
    let state = squadBots();
    state = {
      ...state,
      members: {
        ...state.members,
        p1: { ...state.members.p1!, life: 'dead' as const, downHp: 0 },
      },
    };
    expect(botIntent(state, 'p1', view())).toEqual({ type: 'idle' });
  });
});

describe('stepToward', () => {
  it('stops at the spacing distance', () => {
    const r = stepToward({ x: 0, z: 0 }, { x: 10, z: 0 }, 5, 1, 6);
    expect(r.x).toBeCloseTo(4, 5);
    expect(r.moved).toBe(true);
  });

  it('does not overshoot when already close', () => {
    const r = stepToward({ x: 0, z: 0 }, { x: 1, z: 0 }, 5, 1, 0);
    expect(r.x).toBeCloseTo(1, 5);
  });
});

describe('DOWN crawl', () => {
  it('exposes crawl speed for the player adapter', () => {
    expect(DOWN.crawlSpeed).toBe(0.9);
  });
});
