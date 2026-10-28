import { describe, expect, it } from 'vitest';
import { COMBAT } from './balance';
import { canReachPickup, emptyInventory, finishReload, grantLoot, lootLabel, pullMedkit, spendRound, startingInventory } from './inventory';

describe('inventory', () => {
  it('starts the practice round with a rifle and reserve ammo', () => {
    const inv = startingInventory();
    expect(inv).toEqual({ hasGun: true, mag: COMBAT.magSize, reserve: COMBAT.startingReserve, medkits: 0, bandages: 0 });
  });

  it('does not mutate the inventory you pass in', () => {
    const inv = startingInventory();
    const next = grantLoot(inv, 'ammo');
    expect(inv.reserve).toBe(COMBAT.startingReserve);
    expect(next.reserve).toBe(COMBAT.startingReserve + COMBAT.ammoPickup);
  });

  it('gives a rifle to an empty inventory and extra reserve when you already have one', () => {
    const armed = grantLoot(emptyInventory(), 'gun');
    expect(armed).toEqual({ hasGun: true, mag: COMBAT.magSize, reserve: 0, medkits: 0, bandages: 0 });
    const more = grantLoot(startingInventory(), 'gun');
    expect(more.hasGun).toBe(true);
    expect(more.mag).toBe(COMBAT.magSize);
    expect(more.reserve).toBe(COMBAT.startingReserve + COMBAT.magSize);
  });

  it('caps med kits and reserve ammo', () => {
    const full = grantLoot({ ...startingInventory(), medkits: COMBAT.medkitCap }, 'medkit');
    expect(full.medkits).toBe(COMBAT.medkitCap);
    const stuffed = grantLoot({ ...startingInventory(), reserve: COMBAT.reserveCap - 10 }, 'ammo');
    expect(stuffed.reserve).toBe(COMBAT.reserveCap);
  });

  it('leaves the inventory alone for armor, which is worn instead of carried', () => {
    const inv = startingInventory();
    expect(grantLoot(inv, 'armor')).toEqual(inv);
  });

  it('spends one round and reloads from reserve', () => {
    const shot = spendRound(startingInventory());
    expect(shot.mag).toBe(COMBAT.magSize - 1);
    expect(spendRound({ ...shot, mag: 0 }).mag).toBe(0);
    const reloaded = finishReload(shot);
    expect(reloaded.mag).toBe(COMBAT.magSize);
    expect(reloaded.reserve).toBe(COMBAT.startingReserve - 1);
    expect(finishReload(startingInventory())).toEqual(startingInventory());
    const dry = finishReload({ hasGun: true, mag: 10, reserve: 0, medkits: 0, bandages: 0 });
    expect(dry).toEqual({ hasGun: true, mag: 10, reserve: 0, medkits: 0, bandages: 0 });
  });

  it('pulls one med kit', () => {
    const inv = grantLoot(grantLoot(startingInventory(), 'medkit'), 'medkit');
    const pulled = pullMedkit(inv);
    expect(pulled.ok).toBe(true);
    expect(pulled.inventory.medkits).toBe(1);
    expect(pullMedkit(startingInventory()).ok).toBe(false);
  });

  it('names crates and checks pickup reach on the ground plane', () => {
    expect(lootLabel('medkit')).toBe('Med kit');
    const feet = { x: 0, y: 0, z: 0 };
    expect(canReachPickup(feet, { x: 2, y: 0.2, z: 0 })).toBe(true);
    expect(canReachPickup(feet, { x: 3, y: 0, z: 0 })).toBe(false);
    expect(canReachPickup(feet, { x: 0, y: 3, z: 0 })).toBe(false);
  });
});
