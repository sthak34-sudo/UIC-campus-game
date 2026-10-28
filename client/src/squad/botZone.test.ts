import { describe, expect, it } from 'vitest';
import { BOT_ZONE, botZoneDamage, botZoneGoal, type BotZoneView } from './botZone';

const view = (over: Partial<BotZoneView> = {}): BotZoneView => ({
  mode: 'wait',
  remaining: 60,
  current: { x: 0, z: 0, radius: 200 },
  next: { x: 50, z: 0, radius: 100 },
  damagePerSecond: 2,
  ...over,
});

describe('bots and the zone', () => {
  it('a bot outside the safe circle heads for the next circle and takes damage', () => {
    expect(botZoneGoal(view(), { x: -250, z: 0 })).toEqual({ x: 50, z: 0 });
    expect(botZoneDamage(view(), { x: -250, z: 0 }, 0.5)).toBeCloseTo(1);
  });
  it('inside the safe circle: no damage, and no rush while the wait is long', () => {
    expect(botZoneDamage(view(), { x: -150, z: 0 }, 0.5)).toBe(0);
    expect(botZoneGoal(view(), { x: -150, z: 0 })).toBeNull();
  });
  it('moves into the next circle shortly before and during the shrink', () => {
    expect(botZoneGoal(view({ remaining: BOT_ZONE.rotateLeadS - 1 }), { x: -150, z: 0 })).toEqual({ x: 50, z: 0 });
    expect(botZoneGoal(view({ mode: 'shrink', remaining: 40 }), { x: -150, z: 0 })).toEqual({ x: 50, z: 0 });
    // Already well inside the next circle: carry on.
    expect(botZoneGoal(view({ mode: 'shrink' }), { x: 60, z: 0 })).toBeNull();
  });
  it('final circle: only outside matters', () => {
    const f = view({ mode: 'final', next: null, current: { x: 0, z: 0, radius: 30 } });
    expect(botZoneGoal(f, { x: 10, z: 0 })).toBeNull();
    expect(botZoneGoal(f, { x: 40, z: 0 })).toEqual({ x: 0, z: 0 });
    expect(botZoneGoal(null, { x: 0, z: 0 })).toBeNull();
  });
});
