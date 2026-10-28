import { describe, expect, it } from 'vitest';
import { COMBAT } from '../combat/balance';
import { BOT_LOOT, botCanShoot, botDry, maybeStartReload, spendRound, stepBotReload, botSafe, botWants, canGrab, grantBotLoot, leaveForHuman, lootInReach, shouldBandage, starterKit } from './botLoot';

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
    expect(k.ammo).toBe(BOT_LOOT.startReserve + BOT_LOOT.ammoPerPickup);
    k = grantBotLoot(k, 'gun');
    expect(k.ammo).toBe(BOT_LOOT.startReserve + 2 * BOT_LOOT.ammoPerPickup);
    const noGun = grantBotLoot({ ...starterKit(), rifles: 0, mag: 0 }, 'gun');
    expect(noGun.rifles).toBe(1);
    expect(noGun.mag).toBe(COMBAT.magSize);
    k = grantBotLoot(k, 'bandage');
    expect(k.bandages).toBe(BOT_LOOT.startBandages + 1);
    expect(grantBotLoot({ ...k, bandages: COMBAT.bandageCap }, 'bandage').bandages).toBe(COMBAT.bandageCap);
  });
  it('bandages only when hurt, carrying one, and no foe seen recently', () => {
    const k = { ...starterKit(), bandages: 1 };
    expect(shouldBandage(40, starterKit(), 99)).toBe(false);
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
  it('bots start like the player: no bandages, a full magazine and one spare', () => {
    const k = starterKit();
    expect(k.bandages).toBe(0);
    expect(k.mag).toBe(COMBAT.magSize);
    expect(k.ammo).toBe(BOT_LOOT.startReserve);
    expect(botCanShoot(k)).toBe(true);
  });
  it('shooting spends rounds, an empty magazine reloads from spares, then the bot runs dry', () => {
    let k = starterKit();
    let shots = 0;
    for (let t = 0; t < 1000; t++) {
      k = maybeStartReload(k, false);
      k = stepBotReload(k, 0.1).kit;
      if (botCanShoot(k)) {
        k = spendRound(k);
        shots++;
      }
    }
    expect(shots).toBe(COMBAT.magSize + BOT_LOOT.startReserve);
    expect(botDry(k)).toBe(true);
    expect(botCanShoot(k)).toBe(false);
    expect(maybeStartReload(k, true).reloading).toBe(0);
    // Picking up ammo gets it going again.
    k = grantBotLoot(k, 'ammo');
    k = maybeStartReload(k, false);
    expect(k.reloading).toBeCloseTo(COMBAT.reloadTime);
    expect(botCanShoot(k)).toBe(false);
    const r = stepBotReload(k, COMBAT.reloadTime + 0.01);
    expect(r.done).toBe(true);
    expect(r.kit.mag).toBe(BOT_LOOT.ammoPerPickup);
    expect(r.kit.ammo).toBe(0);
  });
  it('calm bots top up a low magazine; in a fight they wait until it is empty', () => {
    const low = { ...starterKit(), mag: 10 };
    expect(maybeStartReload(low, true).reloading).toBeGreaterThan(0);
    expect(maybeStartReload(low, false).reloading).toBe(0);
    expect(maybeStartReload({ ...starterKit(), mag: 20 }, true).reloading).toBe(0);
  });
});
