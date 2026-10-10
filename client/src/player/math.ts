// Pure helper math for the player (no three.js / Rapier objects) so it can be unit-tested.

export interface MoveInput {
  /** -1 (back) .. 1 (forward) */
  forward: number;
  /** -1 (left) .. 1 (right) */
  right: number;
  run: boolean;
  jump: boolean;
}

export const NO_INPUT: Readonly<MoveInput> = { forward: 0, right: 0, run: false, jump: false };

/**
 * World-space XZ direction for a move input relative to camera yaw.
 * Yaw follows three.js: yaw 0 looks toward -Z (north); positive yaw turns left (toward -X).
 * Returns a vector of length <= 1 (diagonals are normalised, analog input keeps its magnitude).
 */
export function moveDirection(forward: number, right: number, yaw: number): { x: number; z: number } {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  let x = -s * forward + c * right;
  let z = -c * forward - s * right;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  return { x, z };
}

/** Yaw (three.js convention) that faces along the XZ direction (dx, dz). */
export function yawFromDirection(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** Wraps an angle to [-PI, PI). */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

/** Turns `from` toward `to` by at most `maxStep` radians, the short way round. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const d = wrapAngle(to - from);
  if (Math.abs(d) <= maxStep) return wrapAngle(to);
  return wrapAngle(from + Math.sign(d) * maxStep);
}

/** Frame-rate independent exponential smoothing factor. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Moves `current` toward `target` by at most `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/**
 * Spring-arm length for the follow camera.
 * - `desired`: arm length the player chose (zoom).
 * - `hit`: distance along the arm to the first obstacle (sphere sweep), or null if clear.
 * - `current`: length used last frame.
 * The arm snaps IN immediately (never shows the inside of a wall) and eases back OUT.
 */
export function springArm(
  desired: number,
  hit: number | null,
  current: number,
  dt: number,
  opts: { hardMin: number; returnRate: number; margin?: number },
): number {
  const margin = opts.margin ?? 0.05;
  const limit = hit === null ? desired : clamp(hit - margin, opts.hardMin, desired);
  if (limit <= current) return limit; // pull in instantly
  const next = current + (limit - current) * damp(opts.returnRate, dt);
  return Math.min(next, limit);
}

/** Initial vertical speed to reach `height` under `gravity`. */
export function jumpSpeed(height: number, gravity: number): number {
  return Math.sqrt(2 * gravity * height);
}

// --- walk-cycle animation ------------------------------------------------------------------------

export interface LimbPose {
  /** Thigh swing (rad, + = forward). */
  leftHip: number;
  rightHip: number;
  /** Knee bend (rad, >= 0). */
  leftKnee: number;
  rightKnee: number;
  /** Shoulder swing (rad, + = forward). */
  leftShoulder: number;
  rightShoulder: number;
  /** Elbow bend (rad, >= 0). */
  leftElbow: number;
  rightElbow: number;
  /** Vertical body bob (m). */
  bob: number;
  /** Forward lean of the torso (rad). */
  lean: number;
}

/** Stride length (one full cycle = two steps) for a horizontal speed. */
export function strideLength(speed: number): number {
  // ~1.45 m per cycle at walk, longer when running.
  return clamp(1.1 + speed * 0.25, 1.1, 2.6);
}

/**
 * Advances the walk-cycle phase (0..1, one full left+right cycle) for a frame.
 */
export function advancePhase(phase: number, speed: number, dt: number): number {
  const p = phase + (speed * dt) / strideLength(speed);
  return p - Math.floor(p);
}

/**
 * Limb angles for a walk-cycle phase. `speed` in m/s; 0 gives a neutral standing pose.
 * Legs and arms swing in opposition; amplitude grows with speed (walk -> run).
 */
export function walkPose(phase: number, speed: number, airborne = false): LimbPose {
  if (airborne) {
    return {
      leftHip: 0.45, rightHip: -0.15, leftKnee: 0.9, rightKnee: 0.4,
      leftShoulder: -0.5, rightShoulder: 0.6, leftElbow: 0.6, rightElbow: 0.6,
      bob: 0, lean: 0.05,
    };
  }
  const t = clamp(speed / 4.5, 0, 1); // 0 = still, ~0.31 = walk, 1 = run
  const moving = clamp(speed / 0.6, 0, 1); // fades the cycle in from standing
  const a = phase * Math.PI * 2;
  const s = Math.sin(a);
  const legAmp = (0.38 + 0.4 * t) * moving;
  const armAmp = (0.28 + 0.6 * t) * moving;
  const kneeAmp = (0.5 + 0.9 * t) * moving;
  // Knee bends most while the leg swings forward (recovery phase).
  const lk = Math.max(0, Math.sin(a + Math.PI / 2)) * kneeAmp + 0.05;
  const rk = Math.max(0, Math.sin(a + Math.PI + Math.PI / 2)) * kneeAmp + 0.05;
  return {
    leftHip: s * legAmp,
    rightHip: -s * legAmp,
    leftKnee: lk,
    rightKnee: rk,
    leftShoulder: -s * armAmp,
    rightShoulder: s * armAmp,
    leftElbow: 0.15 + (0.2 + 1.0 * t) * moving,
    rightElbow: 0.15 + (0.2 + 1.0 * t) * moving,
    bob: Math.abs(Math.cos(a)) * (0.025 + 0.05 * t) * moving,
    lean: 0.18 * t * moving,
  };
}
