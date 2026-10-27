import * as THREE from 'three';
import type { PlayerConfig } from './config';
import { clamp, damp, springArm } from './math';

/** Collision queries the camera needs (implemented by PlayerPhysics). */
export interface CameraCollision {
  /** Free distance for a sphere moving from `from` along unit `dir`, or null when clear up to `max`. */
  sweepSphere(from: THREE.Vector3, dir: THREE.Vector3, max: number): number | null;
}

export type CameraMode = 'third' | 'first';

/**
 * Third-person over-the-shoulder follow camera with a collision spring arm, plus first-person.
 * Yaw follows three.js (0 = looking north / -Z). Pitch > 0 looks DOWN (camera above the player).
 */
export class CameraRig {
  yaw = 0;
  pitch = 0.22;
  mode: CameraMode = 'third';
  /** Player-chosen arm length (mouse wheel). */
  zoom: number;
  /** Arm length actually used this frame (shortened by walls). */
  arm: number;
  /** Smoothed follow point (feet). */
  private readonly follow = new THREE.Vector3();
  private initialised = false;
  private readonly head = new THREE.Vector3();
  private readonly pivot = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  /** 0 standing, 1 crouched. Smoothed so the view does not pop. */
  private crouch = 0;
  /** Procedural hit reaction: additive look kick that eases out. */
  private kickYaw = 0;
  private kickPitch = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly cfg: PlayerConfig,
    private readonly collision: CameraCollision,
  ) {
    this.zoom = cfg.camDistance;
    this.arm = cfg.camDistance;
  }

  addLook(dx: number, dy: number): void {
    const s = this.cfg.mouseSensitivity;
    this.yaw -= dx * s;
    this.pitch += dy * s;
    this.clampPitch();
  }

  addZoom(deltaY: number): void {
    this.zoom = clamp(this.zoom * Math.exp(deltaY * 0.001), this.cfg.camMinDistance, this.cfg.camMaxDistance);
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.clampPitch();
  }

  setView(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = pitch;
    this.clampPitch();
  }

  /**
   * Camera punch from a hit. `hitDir` is world-space direction of the impulse (attacker → victim).
   * The view kicks opposite the hit so you feel the shove.
   */
  kick(hitDir?: { x: number; y: number; z: number }, strength = 1): void {
    const s = Math.min(1.5, Math.max(0.25, strength));
    if (hitDir && (hitDir.x || hitDir.z)) {
      // Project onto camera right / up.
      const forwardX = -Math.sin(this.yaw);
      const forwardZ = -Math.cos(this.yaw);
      const rightX = Math.cos(this.yaw);
      const rightZ = -Math.sin(this.yaw);
      const side = hitDir.x * rightX + hitDir.z * rightZ;
      const along = hitDir.x * forwardX + hitDir.z * forwardZ;
      this.kickYaw += -side * 0.12 * s;
      this.kickPitch += -along * 0.08 * s - Math.max(0, hitDir.y) * 0.05 * s;
    } else {
      this.kickPitch += 0.1 * s;
      this.kickYaw += (Math.random() - 0.5) * 0.06 * s;
    }
  }

  private clampPitch(): void {
    const c = this.cfg;
    this.pitch = this.mode === 'first' ? clamp(this.pitch, c.fpPitchMin, c.fpPitchMax) : clamp(this.pitch, c.camPitchMin, c.camPitchMax);
  }

  /** Snap the follow point (after teleports). */
  reset(feet: THREE.Vector3): void {
    this.follow.copy(feet);
    this.initialised = true;
  }

  /** Unit XZ vector the camera looks along. */
  forward(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  update(dt: number, feet: THREE.Vector3, crouching = false): void {
    const c = this.cfg;
    this.crouch += ((crouching ? 1 : 0) - this.crouch) * damp(8, dt);
    if (!this.initialised) this.reset(feet);
    // Follow: tight horizontally, softer vertically so stair steps don't jolt the view.
    const kh = damp(c.camFollowRate, dt);
    const kv = damp(this.mode === 'first' ? 20 : 10, dt);
    this.follow.x += (feet.x - this.follow.x) * kh;
    this.follow.z += (feet.z - this.follow.z) * kh;
    this.follow.y += (feet.y - this.follow.y) * kv;
    if (this.follow.distanceToSquared(feet) > 25) this.follow.copy(feet); // teleport / respawn

    // Ease kick back to zero.
    this.kickYaw *= Math.exp(-12 * dt);
    this.kickPitch *= Math.exp(-12 * dt);
    if (Math.abs(this.kickYaw) < 1e-4) this.kickYaw = 0;
    if (Math.abs(this.kickPitch) < 1e-4) this.kickPitch = 0;
    this.euler.set(-(this.pitch + this.kickPitch), this.yaw + this.kickYaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);

    const stance = c.crouchHeight / c.height;
    const eye = c.eyeHeight + (c.eyeHeight * stance - c.eyeHeight) * this.crouch;
    const pivotH = c.camPivotHeight + (c.camPivotHeight * stance - c.camPivotHeight) * this.crouch;
    if (this.mode === 'first') {
      this.camera.position.set(this.follow.x, this.follow.y + eye, this.follow.z);
      this.arm = 0;
      return;
    }

    // Head point is inside the capsule, so it is always free.
    this.head.set(this.follow.x, this.follow.y + pivotH, this.follow.z);
    // Shoulder offset (to the right), shortened if a wall is right there.
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let shoulder = c.camShoulder;
    const sh = this.collision.sweepSphere(this.head, this.right, shoulder);
    if (sh !== null) shoulder = Math.max(0, sh - 0.03);
    this.pivot.copy(this.head).addScaledVector(this.right, shoulder);
    // Arm direction: behind and above (pitch) the pivot.
    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const hit = this.collision.sweepSphere(this.pivot, this.dir, this.zoom);
    if (this.arm <= 0) this.arm = this.zoom;
    this.arm = springArm(this.zoom, hit, this.arm, dt, { hardMin: c.camHardMin, returnRate: c.camReturnRate });
    this.camera.position.copy(this.pivot).addScaledVector(this.dir, this.arm);
  }
}
