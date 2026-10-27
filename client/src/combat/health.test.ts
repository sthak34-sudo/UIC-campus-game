import { describe, expect, it } from 'vitest';
import { COMBAT } from './balance';
import {
  addArmor, createCombatant, dummyShouldRespawn, healCombatant, healthRatio, isDown, takeDirectDamage, takeHit,
} from './health';

describe('health', () => {
  it('starts full and reports a ratio', () => {
    const c = createCombatant();
    expect(c.health).toBe(100);
    expect(isDown(c)).toBe(false);
    expect(healthRatio(c)).toBe(1);
  });

  it('kills with two point-blank headshots and does not go below zero', () => {
    const first = takeHit(createCombatant(), 'head', 0);
    expect(first.died).toBe(false);
    expect(first.headshot).toBe(true);
    expect(first.combatant.health).toBeCloseTo(100 - COMBAT.baseDamage * 2, 6);
    const second = takeHit(first.combatant, 'head', 0);
    expect(second.died).toBe(true);
    expect(second.combatant.health).toBe(0);
    const extra = takeHit(second.combatant, 'body', 0);
    expect(extra.combatant).toBe(second.combatant);
    expect(extra.healthDamage).toBe(0);
  });

  it('drops armor and health together on a body shot', () => {
    const vested = addArmor(createCombatant(), 50);
    expect(vested.armor).toBe(50);
    const hit = takeHit(vested, 'body', 0);
    expect(hit.armorDamage).toBeCloseTo(COMBAT.baseDamage * 0.5, 6);
    expect(hit.combatant.health).toBeCloseTo(100 - COMBAT.baseDamage * 0.5, 6);
    expect(hit.combatant.armor).toBeCloseTo(50 - COMBAT.baseDamage * 0.5, 6);
  });

  it('lets the debug hurt key ignore armor and reach a death in four presses', () => {
    let c = addArmor(createCombatant(), 100);
    let died = false;
    for (let i = 0; i < 3; i++) {
      const r = takeDirectDamage(c, COMBAT.debugHurt);
      c = r.combatant;
      died = r.died;
      expect(c.armor).toBe(100);
      expect(died).toBe(false);
    }
    const last = takeDirectDamage(c, COMBAT.debugHurt);
    expect(last.died).toBe(true);
    expect(last.combatant.health).toBe(0);
    expect(takeDirectDamage(last.combatant, 25).combatant.health).toBe(0);
  });

  it('heals up to max and does not heal a downed combatant', () => {
    const hurt = takeDirectDamage(createCombatant(), 40).combatant;
    const healed = healCombatant(hurt, COMBAT.medkitHeal);
    expect(healed.healed).toBe(40);
    expect(healed.combatant.health).toBe(100);
    const down = takeDirectDamage(createCombatant(), 100).combatant;
    expect(healCombatant(down, 50)).toEqual({ combatant: down, healed: 0 });
  });

  it('respawns a dummy only after 5 seconds', () => {
    expect(dummyShouldRespawn(4.99)).toBe(false);
    expect(dummyShouldRespawn(5)).toBe(true);
    expect(dummyShouldRespawn(5, 5)).toBe(true);
  });

  it('caps armor at 100', () => {
    expect(addArmor(createCombatant(100, 80), 50).armor).toBe(100);
  });
});
