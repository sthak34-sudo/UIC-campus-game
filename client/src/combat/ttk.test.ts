import { describe, expect, it } from 'vitest';
import { COMBAT } from './balance';
import { addArmor, createCombatant, takeHit } from './health';
import type { HitZone } from './damage';
import { BOT_AIM } from '../squad/botAim';

/** Shots and seconds (full-auto, every shot hits) to kill a fresh target. */
export function timeToKill(armor: number, distance: number, zone: HitZone = 'body', baseDamage?: number): { shots: number; seconds: number } {
  let c = armor > 0 ? addArmor(createCombatant(), armor) : createCombatant();
  for (let shots = 1; shots < 200; shots++) {
    const r = takeHit(c, zone, distance, baseDamage);
    c = r.combatant;
    if (r.died) return { shots, seconds: (shots - 1) * COMBAT.fireInterval };
  }
  throw new Error('never died');
}

describe('PUBG-like time to kill (CMB-06)', () => {
  it('matches the audit targets: 3 / 4 / 5 body shots at 0 / 50 / 100 armor', () => {
    expect(timeToKill(0, 10).shots).toBe(3);
    expect(timeToKill(50, 10).shots).toBe(4);
    expect(timeToKill(100, 10).shots).toBe(5);
    expect(timeToKill(0, 10).seconds).toBeCloseTo(0.18, 6);
    expect(timeToKill(100, 10).seconds).toBeLessThan(0.4);
  });

  it('keeps that across a campus quad (40 m) and two shots to the head', () => {
    expect(timeToKill(0, 40).shots).toBe(3);
    expect(timeToKill(100, 40).shots).toBe(5);
    expect(timeToKill(100, 10, 'head').shots).toBe(2);
  });

  it('bot rounds stay human: 5 body hits on an unarmored player', () => {
    const bot = COMBAT.baseDamage * BOT_AIM.damageScale;
    expect(timeToKill(0, 10, 'body', bot).shots).toBe(5);
  });
});
