/**
 * Shot and reload math. No three.js, no Rapier, no DOM.
 * A future authoritative server can run these functions and send the result to clients.
 */
import { COMBAT } from './balance';

export type HitZone = 'head' | 'body';

export function zoneMultiplier(zone: HitZone): number {
  return zone === 'head' ? COMBAT.headshotMultiplier : 1;
}

/** 1 at close range, falling to `falloffMin` at `falloffEnd`. Negative distances count as 0. */
export function distanceFalloff(distance: number): number {
  const d = Math.max(0, distance);
  const { falloffStart, falloffEnd, falloffMin } = COMBAT;
  if (d <= falloffStart) return 1;
  if (d >= falloffEnd) return falloffMin;
  const t = (d - falloffStart) / (falloffEnd - falloffStart);
  return 1 - (1 - falloffMin) * t;
}

export interface ResolvedDamage {
  /** Damage before armor. */
  raw: number;
  healthDamage: number;
  armorDamage: number;
  armorAfter: number;
}

/**
 * Turns a hit into health damage and armor damage.
 * Armor soaks `armorMitigation` of the raw hit, but never more armor than the target has.
 */
export function resolveIncomingDamage(input: {
  zone: HitZone;
  distance: number;
  armor: number;
  baseDamage?: number;
}): ResolvedDamage {
  const base = input.baseDamage ?? COMBAT.baseDamage;
  const raw = base * zoneMultiplier(input.zone) * distanceFalloff(input.distance);
  const armor = Math.max(0, input.armor);
  const soaked = Math.min(armor, raw * COMBAT.armorMitigation);
  return {
    raw,
    healthDamage: raw - soaked,
    armorDamage: soaked,
    armorAfter: armor - soaked,
  };
}

export function canFire(input: {
  now: number;
  /** Negative when no shot has been fired yet. */
  lastShotAt: number;
  mag: number;
  reloading: boolean;
  hasGun: boolean;
  alive: boolean;
}): boolean {
  if (!input.alive || !input.hasGun || input.reloading || input.mag <= 0) return false;
  if (input.lastShotAt < 0) return true;
  return input.now - input.lastShotAt >= COMBAT.fireInterval - 1e-6;
}

export function canReload(mag: number, reserve: number): boolean {
  return mag < COMBAT.magSize && reserve > 0;
}

/** Moves rounds from reserve into the magazine. No-op when a reload is impossible. */
export function applyReload(mag: number, reserve: number): { mag: number; reserve: number } {
  if (!canReload(mag, reserve)) return { mag, reserve };
  const load = Math.min(COMBAT.magSize - mag, reserve);
  return { mag: mag + load, reserve: reserve - load };
}
