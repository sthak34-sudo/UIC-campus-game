import { describe, expect, it } from 'vitest';
import { COMBAT } from './balance';
import { applyReload, canFire, canReload, distanceFalloff, resolveIncomingDamage, zoneMultiplier } from './damage';

describe('damage math', () => {
  it('locks the milestone rules: headshots are 2x and dummies wait 5s', () => {
    expect(COMBAT.headshotMultiplier).toBe(2);
    expect(COMBAT.dummyRespawn).toBe(5);
    expect(zoneMultiplier('head')).toBe(2);
    expect(zoneMultiplier('body')).toBe(1);
  });

  it('does full damage up close and half damage at the far end of falloff', () => {
    expect(distanceFalloff(0)).toBe(1);
    expect(distanceFalloff(-10)).toBe(1);
    expect(distanceFalloff(COMBAT.falloffStart)).toBe(1);
    expect(distanceFalloff(COMBAT.falloffEnd)).toBe(COMBAT.falloffMin);
    expect(distanceFalloff(COMBAT.falloffEnd + 40)).toBe(COMBAT.falloffMin);
    const mid = (COMBAT.falloffStart + COMBAT.falloffEnd) / 2;
    expect(distanceFalloff(mid)).toBeCloseTo(1 - (1 - COMBAT.falloffMin) * 0.5, 6);
  });

  it('applies a point-blank body shot and a double headshot before armor', () => {
    const body = resolveIncomingDamage({ zone: 'body', distance: 0, armor: 0 });
    const head = resolveIncomingDamage({ zone: 'head', distance: 0, armor: 0 });
    expect(body.raw).toBe(COMBAT.baseDamage);
    expect(body.healthDamage).toBe(COMBAT.baseDamage);
    expect(body.armorDamage).toBe(0);
    expect(head.raw).toBe(COMBAT.baseDamage * 2);
    expect(head.healthDamage).toBe(COMBAT.baseDamage * 2);
  });

  it('lets armor soak half the hit, and no more armor than the target has', () => {
    const vested = resolveIncomingDamage({ zone: 'body', distance: 0, armor: 100 });
    expect(vested.armorDamage).toBeCloseTo(COMBAT.baseDamage * 0.5, 6);
    expect(vested.healthDamage).toBeCloseTo(COMBAT.baseDamage * 0.5, 6);
    expect(vested.armorAfter).toBeCloseTo(100 - COMBAT.baseDamage * 0.5, 6);

    const scrap = resolveIncomingDamage({ zone: 'body', distance: 0, armor: 5 });
    expect(scrap.armorDamage).toBe(5);
    expect(scrap.healthDamage).toBeCloseTo(COMBAT.baseDamage - 5, 6);
    expect(scrap.armorAfter).toBe(0);
  });

  it('halves a far body shot', () => {
    const far = resolveIncomingDamage({ zone: 'body', distance: 100, armor: 0 });
    expect(far.healthDamage).toBeCloseTo(COMBAT.baseDamage * COMBAT.falloffMin, 6);
  });

  it('gates the fire rate, empty magazines, reloads, and being down', () => {
    const base = { now: 1, lastShotAt: -1, mag: 30, reloading: false, hasGun: true, alive: true };
    expect(canFire(base)).toBe(true);
    expect(canFire({ ...base, lastShotAt: 1 - COMBAT.fireInterval / 2 })).toBe(false);
    expect(canFire({ ...base, lastShotAt: 1 - COMBAT.fireInterval })).toBe(true);
    expect(canFire({ ...base, mag: 0 })).toBe(false);
    expect(canFire({ ...base, reloading: true })).toBe(false);
    expect(canFire({ ...base, hasGun: false })).toBe(false);
    expect(canFire({ ...base, alive: false })).toBe(false);
  });

  it('moves reserve rounds into the magazine and refuses a full mag or an empty reserve', () => {
    expect(canReload(30, 10)).toBe(false);
    expect(canReload(10, 0)).toBe(false);
    expect(applyReload(30, 10)).toEqual({ mag: 30, reserve: 10 });
    expect(applyReload(10, 5)).toEqual({ mag: 15, reserve: 0 });
    expect(applyReload(0, 100)).toEqual({ mag: COMBAT.magSize, reserve: 100 - COMBAT.magSize });
  });
});
