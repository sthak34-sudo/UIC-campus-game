import { describe, expect, it } from 'vitest';
import { addDamage, addKills, damageBetween, finish, formatSurvival, killsBy, newStats, placementText, summarize } from './matchStats';

describe('match-end stats', () => {
  it('counts damage and kills until the match ends, then freezes', () => {
    let s = newStats(10);
    s = addDamage(s, 25);
    s = addDamage(s, -5);
    s = addKills(s, killsBy([{ type: 'killed', by: 'me' }, { type: 'killed', by: 'bot' }, { type: 'downed', by: 'me' }], 'me'));
    s = finish(s, 135);
    s = addDamage(addKills(s, 3), 99);
    expect(summarize(s, 999, 'wiped', 3, 4)).toEqual({ title: 'Squad eliminated', placement: '#3 of 4 squads', kills: 1, damage: 25, survival: '2:05' });
  });
  it('damage of a hit counts health, armor and downed health', () => {
    expect(damageBetween({ health: 100, armor: 20 }, { health: 80, armor: 5 })).toBe(35);
    expect(damageBetween({ health: 0, armor: 0, downHp: 50 }, { health: 0, armor: 0, downHp: 30 })).toBe(20);
    expect(damageBetween({ health: 10, armor: 0 }, { health: 20, armor: 0 })).toBe(0);
  });
  it('placement and titles for win, wipe and solo death', () => {
    expect(placementText(null, 4, 'won')).toBe('#1 of 4 squads');
    expect(placementText(2, 4, 'wiped')).toBe('#2 of 4 squads');
    expect(placementText(null, 1, 'died')).toBe('Solo practice');
    expect(summarize(newStats(0), 61, 'won', null, 4).title).toBe('Victory!');
    expect(summarize(newStats(0), 61, 'died', null, 1).title).toBe('You died');
  });
  it('formats survival time', () => {
    expect(formatSurvival(0)).toBe('0:00');
    expect(formatSurvival(59.9)).toBe('0:59');
    expect(formatSurvival(3725)).toBe('1:02:05');
  });
});
