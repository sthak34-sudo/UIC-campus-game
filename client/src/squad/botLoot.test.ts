import { describe, expect, it } from 'vitest';
import { COMBAT } from '../combat/balance';
import { BOT_LOOT, botSafe, botWants, canGrab, grantBotLoot, leaveForHuman, lootInReach, shouldBandage, starterKit } from './botLoot';

describe('bot loot and bandaging', () => {
  it('bots want rifles, ammo and bandages only', () => {
    const k = starterKit();
    expect(botWants('gun', k)).toBe(true);
    expect(botWants('ammo', k)).toBe(true);
    expect(botWants('bandage', k)).toBe(true);
    expect(botWants('medkit', k)).toBe(false);
    expect(botWants('armor', k)).toBe(false);
    expect(botWants('bandage', { ...k, bandages: COMBAT.bandageCap })).toBe(false);
  });
  it('pickups fill the kit', () => {
    let k = starterKit();
    k = grantBotLoot(k, 'ammo');
    expect(k.ammo).toBe(BOT_LOOT.ammoPerPickup);
    k = grantBotLoot(k, 'gun');
    expect(k.ammo).toBe(2 * BOT_LOOT.ammoPerPickup);
    expect(grantBotLoot({ rifles: 0, ammo: 0, bandages: 0 }, 'gun').rifles).toBe(1);
    k = grantBotLoot(k, 'bandage');
    expect(k.bandages).toBe(BOT_LOOT.startBandages + 1);
    expect(grantBotLoot({ ...k, bandages: COMBAT.bandageCap }, 'bandage').bandages).toBe(COMBAT.bandageCap);
  });
  it('bandages only when hurt, carrying one, and no foe seen recently', () => {
    const k = starterKit();
    expect(shouldBandage(40, k, BOT_LOOT.safeS)).toBe(true);
    expect(shouldBandage(40, k, BOT_LOOT.safeS - 0.1)).toBe(false);
    expect(shouldBandage(COMBAT.bandageMaxHealth, k, 99)).toBe(false);
    expect(shouldBandage(40, { ...k, bandages: 0 }, 99)).toBe(false);
    expect(botSafe(0)).toBe(false);
  });
  it('loot must be near the bot and (for teammates) near the leader', () => {
    expect(lootInReach({ x: 0, z: 0 }, { x: 10, z: 0 }, null)).toBe(true);
    expect(lootInReach({ x: 0, z: 0 }, { x: 13, z: 0 }, null)).toBe(false);
    expect(lootInReach({ x: 0, z: 0 }, { x: 10, z: 0 }, { x: -15, z: 0 })).toBe(false);
    expect(canGrab({ x: 0, z: 0 }, { x: 1, z: 0 })).toBe(true);
    expect(canGrab({ x: 0, z: 0 }, { x: 2, z: 0 })).toBe(false);
  });
  it('teammates leave the human their rifle and anything at their feet', () => {
    const human = { pos: { x: 0, z: 0 }, hasGun: false };
    expect(leaveForHuman('gun', { x: 50, z: 0 }, human)).toBe(true);
    expect(leaveForHuman('gun', { x: 50, z: 0 }, { ...human, hasGun: true })).toBe(false);
    expect(leaveForHuman('ammo', { x: 3, z: 0 }, human)).toBe(true);
    expect(leaveForHuman('ammo', { x: 10, z: 0 }, human)).toBe(false);
    expect(leaveForHuman('gun', { x: 1, z: 0 }, null)).toBe(false);
  });
});
