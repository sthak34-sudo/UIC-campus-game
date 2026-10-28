import { describe, expect, it } from 'vitest';
import { BOT_AIM, botAimPoint, botTrigger } from './botAim';

describe('bot trigger and aim', () => {
  it('fires at most once per interval, and only with a target in range', () => {
    const rand = () => 0;
    expect(botTrigger(0, 0.016, false, 5, rand).fire).toBe(false);
    expect(botTrigger(0, 0.016, true, BOT_AIM.range + 1, rand).fire).toBe(false);
    let c = 0;
    let shots = 0;
    for (let i = 0; i < 60; i++) {
      const t = botTrigger(c, 1 / 60, true, 10, rand);
      c = t.cooldown;
      if (t.fire) shots++;
    }
    expect(shots).toBe(Math.ceil(1 / BOT_AIM.interval));
  });
  it('aims at the chest or head, lower on a downed target, with spread growing with range', () => {
    const feet = { x: 0, y: 0, z: 0 };
    expect(botAimPoint(feet, 10, false, () => 0.99).y).toBeGreaterThan(1);
    expect(botAimPoint(feet, 10, true, () => 0.99).y).toBeLessThan(0.9);
    const err = (d: number) => {
      let m = 0;
      for (let i = 0; i < 200; i++) { const p = botAimPoint(feet, d, false, Math.random); m = Math.max(m, Math.hypot(p.x, p.z)); }
      return m;
    };
    expect(err(30)).toBeGreaterThan(err(3));
  });
});
