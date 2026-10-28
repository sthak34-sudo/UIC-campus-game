/**
 * Health, armor, healing, and the dummy respawn timer.
 * Numbers only. The dummy mesh and the death screen apply the result.
 */
import { COMBAT } from './balance';
import { resolveIncomingDamage, type HitZone } from './damage';

export interface Combatant {
  health: number;
  maxHealth: number;
  armor: number;
}

export function createCombatant(maxHealth = COMBAT.maxHealth, armor = 0): Combatant {
  return { health: maxHealth, maxHealth, armor: Math.max(0, armor) };
}

export function isDown(c: Combatant): boolean {
  return c.health <= 0;
}

export function healthRatio(c: Combatant): number {
  if (c.maxHealth <= 0) return 0;
  return Math.max(0, Math.min(1, c.health / c.maxHealth));
}

export interface HitOutcome {
  combatant: Combatant;
  healthDamage: number;
  armorDamage: number;
  died: boolean;
  headshot: boolean;
}

/** Applies one hitscan hit. A combatant already at 0 health is unchanged. */
/** `baseDamage` defaults to the player rifle's (bots fire weaker rounds). */
export function takeHit(c: Combatant, zone: HitZone, distance: number, baseDamage?: number): HitOutcome {
  if (c.health <= 0) {
    return { combatant: c, healthDamage: 0, armorDamage: 0, died: false, headshot: zone === 'head' };
  }
  const d = resolveIncomingDamage({ zone, distance, armor: c.armor, baseDamage });
  const health = Math.max(0, c.health - d.healthDamage);
  return {
    combatant: { ...c, health, armor: d.armorAfter },
    healthDamage: d.healthDamage,
    armorDamage: d.armorDamage,
    died: health <= 0,
    headshot: zone === 'head',
  };
}

/**
 * Damage that ignores armor. Used by the temporary H key so playtesters can
 * reach the death screen in a few presses.
 */
export function takeDirectDamage(c: Combatant, amount: number): { combatant: Combatant; died: boolean } {
  if (c.health <= 0 || amount <= 0) return { combatant: c, died: false };
  const health = Math.max(0, c.health - amount);
  return { combatant: { ...c, health }, died: health <= 0 };
}

export function healCombatant(c: Combatant, amount: number): { combatant: Combatant; healed: number } {
  if (c.health <= 0 || amount <= 0) return { combatant: c, healed: 0 };
  const health = Math.min(c.maxHealth, c.health + amount);
  return { combatant: { ...c, health }, healed: health - c.health };
}

export function addArmor(c: Combatant, amount: number): Combatant {
  if (amount <= 0) return c;
  return { ...c, armor: Math.min(COMBAT.armorCap, c.armor + amount) };
}

/** True once a downed dummy has waited long enough to stand up. */
export function dummyShouldRespawn(downFor: number, respawnAfter = COMBAT.dummyRespawn): boolean {
  return downFor >= respawnAfter;
}
