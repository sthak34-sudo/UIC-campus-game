/**
 * Movement tiers (CMB-08, CMB-10). Pure: no three.js or Rapier, so it is unit-tested.
 * Jog by default, Shift sprints forward, crouch is slower, aiming down sights slows you, and
 * backward / strafing are a bit slower than forward. Aiming or holding the trigger (armed)
 * breaks a sprint, so you can never shoot or aim while sprinting.
 */
import type { PlayerConfig } from './config';

export interface MoveIntent {
  /** -1 (back) .. 1 (forward) */
  forward: number;
  /** -1 (left) .. 1 (right) */
  right: number;
  /** Shift held. */
  run: boolean;
  crouched: boolean;
  /** Right mouse held (and alive). */
  aiming: boolean;
  /** Fire held with a gun in hand. */
  firing: boolean;
  /** False while downed / crawling. */
  allowRun: boolean;
}

type MoveCfg = Pick<
  PlayerConfig,
  'jogSpeed' | 'sprintSpeed' | 'crouchSpeed' | 'backwardMult' | 'strafeMult' | 'adsMoveMult' | 'speedScale'
>;

/** True when this input sprints: Shift, moving forward, standing, not aiming, not shooting. */
export function sprintActive(i: MoveIntent): boolean {
  return i.run && i.allowRun && !i.crouched && !i.aiming && !i.firing && i.forward > 0.1;
}

/**
 * Direction multiplier: 1 straight ahead, `strafeMult` sideways, `backwardMult` straight back,
 * blended by the angle of the input in between.
 */
export function directionScale(forward: number, right: number, cfg: Pick<PlayerConfig, 'backwardMult' | 'strafeMult'>): number {
  const len = Math.hypot(forward, right);
  if (len < 1e-6) return 1;
  const f = forward / len;
  const side = Math.abs(right) / len;
  if (f >= 0) return 1 + (cfg.strafeMult - 1) * side;
  return cfg.strafeMult + (cfg.backwardMult - cfg.strafeMult) * -f;
}

/** Target ground speed (m/s) and whether this frame counts as sprinting. */
export function moveSpeed(i: MoveIntent, cfg: MoveCfg): { speed: number; sprinting: boolean } {
  const sprinting = sprintActive(i);
  const base = i.crouched ? cfg.crouchSpeed : sprinting ? cfg.sprintSpeed : cfg.jogSpeed;
  const ads = i.aiming ? cfg.adsMoveMult : 1;
  return { speed: base * directionScale(i.forward, i.right, cfg) * ads * cfg.speedScale, sprinting };
}

/** Rifle is up: not sprinting and the sprint-to-fire delay has passed. */
export function fireReady(sprinting: boolean, sinceSprint: number, cfg: Pick<PlayerConfig, 'sprintToFire'>): boolean {
  return !sprinting && sinceSprint >= cfg.sprintToFire - 1e-9;
}

/** A fire tap is held this long (s) waiting for the rifle to come up after a sprint. */
export const TAP_BUFFER = 0.4;

export interface TapBuffer {
  pending: boolean;
  /** Seconds since the buffered tap. */
  age: number;
}

/**
 * Fire-tap buffer (CMB-08 follow-up). A tap while the rifle is lowered (sprinting, or inside the
 * 0.15 s sprint-to-fire delay) is kept, ends the sprint like a held trigger does, and fires the
 * moment the rifle is ready. Call once per frame after movement, with `tapped` = a click arrived
 * this frame and `ready` = the rifle is up now. `fire` = emit the shot now.
 */
export function stepTapBuffer(b: TapBuffer, tapped: boolean, ready: boolean, dt: number): TapBuffer & { fire: boolean } {
  const pending = b.pending || tapped;
  if (!pending) return { pending: false, age: 0, fire: false };
  if (ready) return { pending: false, age: 0, fire: true };
  const age = tapped ? 0 : b.age + dt;
  if (age > TAP_BUFFER) return { pending: false, age: 0, fire: false };
  return { pending: true, age, fire: false };
}
