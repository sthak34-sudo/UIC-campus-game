import { describe, expect, it } from 'vitest';
import { emptyInventory, grantLoot } from './inventory';
import { practiceLayout } from './range';
import { canFire } from './damage';

describe('PUBG-style unarmed start', () => {
  it('starts with no rifle and cannot fire', () => {
    const inv = emptyInventory();
    expect(inv.hasGun).toBe(false);
    expect(canFire({ now: 1, lastShotAt: -1, mag: inv.mag, reloading: false, hasGun: inv.hasGun, alive: true, downed: false } as never)).toBe(false);
  });

  it('picking up the ground rifle arms the player with a full magazine', () => {
    const inv = grantLoot(emptyInventory(), 'gun');
    expect(inv.hasGun).toBe(true);
    expect(inv.mag).toBeGreaterThan(0);
  });

  it('always puts a rifle on the ground within a few steps of the spawn', () => {
    for (const yaw of [0, 1.2, -2.5, Math.PI]) {
      const spawn = { x: 10, y: 2, z: -4 };
      const gun = practiceLayout(spawn, yaw).loot.find((l) => l.kind === 'gun')!;
      const d = Math.hypot(gun.position.x - spawn.x, gun.position.z - spawn.z);
      expect(d).toBeLessThan(5);
      expect(gun.position.y).toBe(spawn.y);
    }
  });
});

describe('starter rifle in view', () => {
  it('lies a couple of steps in front of where the player actually stands, at their floor height', async () => {
    const { starterRifleSpot } = await import('./range');
    for (const yaw of [0, 1.2, -2.5, Math.PI]) {
      const feet = { x: 27, y: 0.2, z: 35 };
      const g = starterRifleSpot(feet, yaw);
      const dx = g.x - feet.x, dz = g.z - feet.z;
      const d = Math.hypot(dx, dz);
      expect(d).toBeGreaterThan(1);
      expect(d).toBeLessThan(3);
      // In front: positive along the facing direction (-sin yaw, -cos yaw), i.e. on screen.
      expect((dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / d).toBeGreaterThan(0.9);
      expect(g.y).toBe(feet.y);
    }
  });
});
