import { describe, expect, it } from 'vitest';
import { COMBAT, GUN_FEEL } from './balance';
import { canFire } from './damage';
import {
  absorbRecoil, addBloom, addRecoil, coneDirection, crosshairGapPx, decayBloom, MAX_SHOTS_PER_FRAME,
  recoilKick, recoverRecoil, shotTime, spreadDegrees,
} from './gunFeel';

const still = { crouched: false, speed: 0, airborne: false, aiming: false };
const DEG = Math.PI / 180;

/** Same loop combat runs each frame while the trigger is held. */
function holdTrigger(seconds: number, fps: number, mag = 1000): number {
  let t = 0;
  let last = -1;
  let shots = 0;
  const dt = 1 / fps;
  for (let f = 0; f * dt < seconds - 1e-9; f++) {
    for (let i = 0; i < MAX_SHOTS_PER_FRAME; i++) {
      if (!canFire({ now: t, lastShotAt: last, mag: mag - shots, reloading: false, hasGun: true, alive: true })) break;
      last = shotTime(t, last);
      shots++;
    }
    t += dt;
  }
  return shots;
}

describe('full-auto (CMB-02)', () => {
  it('fires N shots in N x fireInterval seconds while held, at 60 and 144 fps', () => {
    for (const fps of [60, 144]) {
      const n = 20;
      const shots = holdTrigger(n * COMBAT.fireInterval, fps);
      expect(Math.abs(shots - n)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps pace at a low 20 fps by firing catch-up shots', () => {
    const shots = holdTrigger(30 * COMBAT.fireInterval, 20);
    expect(Math.abs(shots - 30)).toBeLessThanOrEqual(1);
  });

  it('stops at an empty magazine', () => {
    expect(holdTrigger(10, 60, 30)).toBe(30);
  });

  it('stamps a fresh click at the click time, not a stale rhythm', () => {
    expect(shotTime(5, -1)).toBe(5);
    expect(shotTime(5, 1)).toBe(5);
    expect(shotTime(1 + COMBAT.fireInterval + 0.01, 1)).toBeCloseTo(1 + COMBAT.fireInterval, 9);
  });

  it('uses the M416-like rate', () => {
    expect(60 / COMBAT.fireInterval).toBeGreaterThan(650);
  });
});

describe('spread cone (CMB-03)', () => {
  it('matches the audit starting numbers', () => {
    expect(spreadDegrees(still, 0)).toBeCloseTo(1.2);
    expect(spreadDegrees({ ...still, crouched: true }, 0)).toBeCloseTo(0.8);
    expect(spreadDegrees({ ...still, speed: 4.5 }, 0)).toBeCloseTo(2.2);
    expect(spreadDegrees({ ...still, airborne: true }, 0)).toBeCloseTo(3.7);
    expect(spreadDegrees({ ...still, aiming: true }, 0)).toBeCloseTo(0.3);
  });

  it('grows with speed and ignores tiny drift', () => {
    expect(spreadDegrees({ ...still, speed: 0.2 }, 0)).toBeCloseTo(1.2);
    const slow = spreadDegrees({ ...still, speed: 1.4 }, 0);
    expect(slow).toBeGreaterThan(1.2);
    expect(slow).toBeLessThan(2.2);
  });

  it('blooms per shot, caps, and decays back', () => {
    let b = 0;
    for (let i = 0; i < 100; i++) b = addBloom(b);
    expect(b).toBe(GUN_FEEL.bloomMax);
    expect(spreadDegrees(still, b)).toBeCloseTo(1.2 + GUN_FEEL.bloomMax);
    for (let i = 0; i < 120; i++) b = decayBloom(b, 1 / 60);
    expect(b).toBeLessThan(0.02);
  });

  it('keeps every shot inside the cone and uses all of it', () => {
    const dir = { x: 0.3, y: -0.1, z: -0.95 };
    const l = Math.hypot(dir.x, dir.y, dir.z);
    const d = { x: dir.x / l, y: dir.y / l, z: dir.z / l };
    const half = 2 * DEG;
    let widest = 0;
    let s = 1;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const v = coneDirection(d, half, rnd(), rnd());
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 9);
      const ang = Math.acos(Math.min(1, v.x * d.x + v.y * d.y + v.z * d.z));
      expect(ang).toBeLessThanOrEqual(half + 1e-6);
      widest = Math.max(widest, ang);
    }
    expect(widest).toBeGreaterThan(half * 0.95);
    expect(coneDirection(d, 0, 0.5, 0.5)).toEqual(d);
    // Straight up still works.
    const up = coneDirection({ x: 0, y: 1, z: 0 }, half, 1, 0.25);
    expect(Math.acos(up.y)).toBeCloseTo(half, 6);
  });
});

describe('honest crosshair (CMB-03)', () => {
  it('puts the arms where a shot on the cone edge lands on screen', () => {
    // 60 degree vertical FOV, 720 px tall: tan(1.2deg)/tan(30deg) * 360.
    const gap = crosshairGapPx(1.2, 60, 720);
    expect(gap).toBeCloseTo((Math.tan(1.2 * DEG) / Math.tan(30 * DEG)) * 360, 6);
    expect(gap).toBeGreaterThan(12);
    expect(gap).toBeLessThan(14);
    expect(crosshairGapPx(2.4, 60, 720)).toBeGreaterThan(gap * 1.9);
    expect(crosshairGapPx(1.2, 60, 1440)).toBeCloseTo(gap * 2, 6);
    expect(crosshairGapPx(0, 60, 720)).toBe(0);
  });
});

describe('recoil (CMB-03)', () => {
  it('kicks up every shot, less when aiming, with small random yaw', () => {
    expect(recoilKick(false, () => 0.5)).toEqual({ pitch: GUN_FEEL.recoilPitchHip, yaw: 0 });
    expect(recoilKick(true, () => 0.5).pitch).toBe(GUN_FEEL.recoilPitchAds);
    expect(Math.abs(recoilKick(false, () => 0).yaw)).toBeCloseTo(GUN_FEEL.recoilYaw);
    expect(Math.abs(recoilKick(false, () => 0.999).yaw)).toBeLessThanOrEqual(GUN_FEEL.recoilYaw);
  });

  it('climbs during a spray and recovers afterwards', () => {
    let r = 0;
    let since = 0;
    for (let i = 0; i < 10; i++) {
      r = addRecoil(r, GUN_FEEL.recoilPitchHip * DEG);
      since = 0;
      for (let f = 0; f < 5; f++) {
        since += 1 / 60;
        r = recoverRecoil(r, 1 / 60, since);
      }
    }
    expect(r / DEG).toBeCloseTo(4.5, 5);
    for (let f = 0; f < 120; f++) {
      since += 1 / 60;
      r = recoverRecoil(r, 1 / 60, since);
    }
    expect(r).toBe(0);
  });

  it('caps the pile-up and lets a downward pull use it up', () => {
    let r = 0;
    for (let i = 0; i < 100; i++) r = addRecoil(r, 1 * DEG);
    expect(r / DEG).toBeCloseTo(GUN_FEEL.recoilMax);
    const part = absorbRecoil(0.1, 0.04);
    expect(part.recoil).toBeCloseTo(0.06, 9);
    expect(part.dPitch).toBe(0);
    const over = absorbRecoil(0.1, 0.25);
    expect(over.recoil).toBe(0);
    expect(over.dPitch).toBeCloseTo(0.15);
    expect(absorbRecoil(0.1, -0.2)).toEqual({ recoil: 0.1, dPitch: -0.2 });
  });
});
