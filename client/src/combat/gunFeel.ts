/**
 * Gun feel math: full-auto timing, recoil, spread cone, bloom and an honest crosshair size.
 * Pure functions. No three.js, no Rapier, no DOM (CMB-02, CMB-03).
 */
import { COMBAT, GUN_FEEL } from './balance';

const DEG = Math.PI / 180;

export interface Stance {
  crouched: boolean;
  /** Horizontal speed in m/s. */
  speed: number;
  airborne: boolean;
  aiming: boolean;
}

/** Half-angle of the shot cone in degrees for this stance, plus the current bloom. */
export function spreadDegrees(s: Stance, bloom: number): number {
  const g = GUN_FEEL;
  let cone = s.crouched ? g.spreadCrouch : g.spreadStand;
  if (s.speed > g.spreadMoveMinSpeed) {
    const t = Math.min(1, (s.speed - g.spreadMoveMinSpeed) / (g.spreadMoveFullSpeed - g.spreadMoveMinSpeed));
    cone += g.spreadMove * t;
  }
  if (s.airborne) cone += g.spreadAir;
  cone += Math.max(0, bloom);
  return s.aiming ? cone * g.spreadAdsMult : cone;
}

/** Bloom after one more shot (degrees). */
export function addBloom(bloom: number): number {
  return Math.min(GUN_FEEL.bloomMax, Math.max(0, bloom) + GUN_FEEL.bloomPerShot);
}

/** Bloom shrinking back toward zero over `dt` seconds. */
export function decayBloom(bloom: number, dt: number): number {
  const b = bloom * Math.exp(-Math.max(0, dt) / GUN_FEEL.bloomDecay);
  return b < 1e-4 ? 0 : b;
}

/** Recoil for one shot, in degrees: pitch is always up, yaw is random either side. `rand` is in [0, 1). */
export function recoilKick(aiming: boolean, rand: () => number): { pitch: number; yaw: number } {
  const pitch = aiming ? GUN_FEEL.recoilPitchAds : GUN_FEEL.recoilPitchHip;
  return { pitch, yaw: (rand() * 2 - 1) * GUN_FEEL.recoilYaw };
}

/**
 * Accumulated recoil offset (radians, positive is up). While shooting it only grows; `sinceShot`
 * seconds after the last shot it eases back toward the aim point at `recoilRecovery` deg/s.
 */
export function recoverRecoil(recoil: number, dt: number, sinceShot: number): number {
  if (recoil === 0 || sinceShot < GUN_FEEL.recoilRecoveryDelay) return recoil;
  const step = GUN_FEEL.recoilRecovery * DEG * dt;
  if (Math.abs(recoil) <= step) return 0;
  return recoil - Math.sign(recoil) * step;
}

/** Adds a kick to the recoil offset (radians), capped at `recoilMax`. */
export function addRecoil(recoil: number, kickRad: number): number {
  const max = GUN_FEEL.recoilMax * DEG;
  return Math.max(-max, Math.min(max, recoil + kickRad));
}

/**
 * When the player pulls the mouse down (`dPitch` > 0 looks down) while the view is kicked up,
 * that pull uses up the recoil first. The screen moves the same either way; it only means the
 * later recovery does not drag the view below where the player pulled it.
 */
export function absorbRecoil(recoil: number, dPitch: number): { recoil: number; dPitch: number } {
  if (recoil <= 0 || dPitch <= 0) return { recoil, dPitch };
  const used = Math.min(recoil, dPitch);
  return { recoil: recoil - used, dPitch: dPitch - used };
}

type V3 = { x: number; y: number; z: number };

/**
 * A direction inside a cone of `halfAngleRad` around unit `dir`, uniform over the cone's disc.
 * `u1`, `u2` are uniform random numbers in [0, 1).
 */
export function coneDirection(dir: V3, halfAngleRad: number, u1: number, u2: number): V3 {
  if (halfAngleRad <= 0) return { x: dir.x, y: dir.y, z: dir.z };
  // Two axes perpendicular to dir.
  const up = Math.abs(dir.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let ax = { x: dir.y * up.z - dir.z * up.y, y: dir.z * up.x - dir.x * up.z, z: dir.x * up.y - dir.y * up.x };
  const al = Math.hypot(ax.x, ax.y, ax.z);
  ax = { x: ax.x / al, y: ax.y / al, z: ax.z / al };
  const bx = { x: dir.y * ax.z - dir.z * ax.y, y: dir.z * ax.x - dir.x * ax.z, z: dir.x * ax.y - dir.y * ax.x };
  const r = Math.tan(halfAngleRad) * Math.sqrt(u1);
  const a = u2 * Math.PI * 2;
  const ox = Math.cos(a) * r;
  const oy = Math.sin(a) * r;
  const v = { x: dir.x + ax.x * ox + bx.x * oy, y: dir.y + ax.y * ox + bx.y * oy, z: dir.z + ax.z * ox + bx.z * oy };
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/**
 * Pixels from screen centre to where a shot at the cone's edge lands, for a camera with vertical
 * field of view `fovDeg` drawn `viewportHeight` pixels tall. Crosshair arms sit at this gap, so
 * every shot lands inside the crosshair.
 */
export function crosshairGapPx(spreadDeg: number, fovDeg: number, viewportHeight: number): number {
  const half = Math.tan((fovDeg * DEG) / 2);
  if (half <= 0 || viewportHeight <= 0) return 0;
  return (Math.tan(Math.max(0, spreadDeg) * DEG) / half) * (viewportHeight / 2);
}

/**
 * Time to stamp as the shot time. A shot that continues a held spray keeps the exact rhythm
 * (previous shot + interval) instead of the frame time, so frame rate does not slow full-auto.
 */
export function shotTime(now: number, lastShotAt: number, interval: number = COMBAT.fireInterval): number {
  if (lastShotAt < 0) return now;
  const due = lastShotAt + interval;
  return now - due < interval ? due : now;
}

/** Most shots a held trigger may fire in one long frame (low frame rates). */
export const MAX_SHOTS_PER_FRAME = 3;
