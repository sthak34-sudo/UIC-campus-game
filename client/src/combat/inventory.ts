/**
 * What the player is carrying. Pure functions: callers pass the current
 * inventory and receive the next one. The server can do the same later.
 */
import { COMBAT } from './balance';
import { applyReload, canReload } from './damage';

export type LootKind = 'gun' | 'ammo' | 'medkit' | 'armor' | 'bandage';

export interface Inventory {
  hasGun: boolean;
  mag: number;
  reserve: number;
  medkits: number;
  bandages: number;
}

/** Practice loadout: a rifle and two magazines of reserve, no med kits yet. */
export function startingInventory(): Inventory {
  return {
    hasGun: true,
    mag: COMBAT.magSize,
    reserve: COMBAT.startingReserve,
    medkits: 0,
    bandages: 0,
  };
}

export function emptyInventory(): Inventory {
  return { hasGun: false, mag: 0, reserve: 0, medkits: 0, bandages: 0 };
}

function clampReserve(n: number): number {
  return Math.max(0, Math.min(COMBAT.reserveCap, n));
}

/**
 * Adds a picked-up item. Armor is worn, not carried in this object:
 * callers apply `armor` via `addArmor` on the combatant. This function still
 * accepts `armor` and returns the inventory unchanged so one pickup path
 * covers every crate.
 */
export function grantLoot(inv: Inventory, kind: LootKind): Inventory {
  switch (kind) {
    case 'gun':
      if (!inv.hasGun) return { ...inv, hasGun: true, mag: COMBAT.magSize, reserve: clampReserve(inv.reserve) };
      return { ...inv, reserve: clampReserve(inv.reserve + COMBAT.magSize) };
    case 'ammo':
      return { ...inv, reserve: clampReserve(inv.reserve + COMBAT.ammoPickup) };
    case 'medkit':
      return { ...inv, medkits: Math.min(COMBAT.medkitCap, inv.medkits + 1) };
    case 'bandage':
      return { ...inv, bandages: Math.min(COMBAT.bandageCap, inv.bandages + 1) };
    case 'armor':
      return inv;
  }
}

export function spendRound(inv: Inventory): Inventory {
  if (inv.mag <= 0) return inv;
  return { ...inv, mag: inv.mag - 1 };
}

export function finishReload(inv: Inventory): Inventory {
  if (!canReload(inv.mag, inv.reserve)) return inv;
  const next = applyReload(inv.mag, inv.reserve);
  return { ...inv, mag: next.mag, reserve: next.reserve };
}

export function pullMedkit(inv: Inventory): { inventory: Inventory; ok: boolean } {
  if (inv.medkits <= 0) return { inventory: inv, ok: false };
  return { inventory: { ...inv, medkits: inv.medkits - 1 }, ok: true };
}

export function pullBandage(inv: Inventory): { inventory: Inventory; ok: boolean } {
  if (inv.bandages <= 0) return { inventory: inv, ok: false };
  return { inventory: { ...inv, bandages: inv.bandages - 1 }, ok: true };
}

export function lootLabel(kind: LootKind): string {
  switch (kind) {
    case 'gun':
      return 'Rifle';
    case 'ammo':
      return 'Ammo';
    case 'medkit':
      return 'Med kit';
    case 'armor':
      return 'Armor';
    case 'bandage':
      return 'Bandage';
  }
}

export function pickupPrompt(kind: LootKind): string {
  return `Press E to pick up ${lootLabel(kind).toLowerCase()}`;
}

/** E can reach a crate. Horizontal distance, plus a limit so a crate on another floor doesn't count. */
export function canReachPickup(
  feet: { x: number; y: number; z: number },
  item: { x: number; y: number; z: number },
  range = COMBAT.pickupRange,
): boolean {
  if (Math.abs(feet.y - item.y) > 2) return false;
  const dx = feet.x - item.x;
  const dz = feet.z - item.z;
  return dx * dx + dz * dz <= range * range;
}
