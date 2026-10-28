import { describe, expect, it } from 'vitest';
import { COMBAT } from './balance';
import { channelLabel, healAmount, healBlocked, startHeal, stepHeal } from './heal';
import { emptyInventory, grantLoot, pullBandage } from './inventory';

describe('bandage healing', () => {
  it('channels for a few seconds then heals 15, never above 75', () => {
    let ch = startHeal('bandage');
    expect(ch.left).toBe(COMBAT.bandageChannel);
    let done = false;
    let t = 0;
    while (!done) {
      const r = stepHeal(ch, 0.1);
      t += 0.1;
      done = r.done;
      if (r.channel) ch = r.channel;
    }
    expect(t).toBeCloseTo(COMBAT.bandageChannel, 1);
    expect(healAmount('bandage', 40, 100)).toBe(15);
    expect(healAmount('bandage', 70, 100)).toBe(5);
    expect(healAmount('bandage', 80, 100)).toBe(0);
    expect(healAmount('medkit', 80, 100)).toBe(20);
  });
  it('explains when an item cannot be used', () => {
    expect(healBlocked('bandage', 50, 0)).toBe('No bandage');
    expect(healBlocked('bandage', 75, 2)).toMatch(/only heal to 75/);
    expect(healBlocked('bandage', 50, 2)).toBeNull();
    expect(healBlocked('medkit', 100, 1)).toBe('Already at full health');
  });
  it('shows a countdown while channelling', () => {
    expect(channelLabel({ item: 'bandage', left: 2.04 })).toBe('Bandaging… 2.0s');
  });
  it('bandages are looted into and pulled from the inventory', () => {
    let inv = emptyInventory();
    expect(inv.bandages).toBe(0);
    inv = grantLoot(inv, 'bandage');
    inv = grantLoot(inv, 'bandage');
    expect(inv.bandages).toBe(2);
    for (let i = 0; i < 20; i++) inv = grantLoot(inv, 'bandage');
    expect(inv.bandages).toBe(COMBAT.bandageCap);
    const p = pullBandage(inv);
    expect(p.ok).toBe(true);
    expect(p.inventory.bandages).toBe(COMBAT.bandageCap - 1);
    expect(pullBandage(emptyInventory()).ok).toBe(false);
  });
});
