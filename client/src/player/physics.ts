import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { collectShapes, type CollectedShapes } from './colliders';
import { PLAYER_CONFIG, type PlayerConfig } from './config';
import { jumpSpeed } from './math';

/**
 * Rapier world + kinematic capsule character. No DOM, no rendering: usable from unit tests (Node)
 * and from the game. OWNER: Player Engineer.
 *
 * rapier3d-compat is intentional: the WASM is inside the JS module, so tests do not need a
 * separate .wasm file. The player loads this module with a dynamic import, and the production
 * build puts it in its own chunk (client/vite.config.ts).
 */

let initPromise: Promise<void> | null = null;
/** Loads the Rapier WASM once (the compat build has it inlined, so no extra file to serve). */
export { RAPIER };
export function initRapier(): Promise<void> {
  // rapier3d-compat 0.21 init() takes no arguments.
  initPromise ??= RAPIER.init();
  return initPromise;
}

export interface StepResult {
  jumped: boolean;
  landed: boolean;
  /** Fall speed at landing (m/s, positive). */
  landingSpeed: number;
}

export interface PhysicsStats {
  /** Average ms per fixed step (controller + world.step), exponentially smoothed. */
  stepMs: number;
  /** Worst fixed step in the last ~2 s. */
  stepMsMax: number;
  /** Total ms spent turning meshes into colliders so far. */
  buildMs: number;
  /** ms of the most recent collider sync. */
  lastBuildMs: number;
  meshes: number;
  instances: number;
  cuboids: number;
  trimeshes: number;
  triangles: number;
}

const UP = { x: 0, y: 1, z: 0 };
const IDENTITY_ROT = { x: 0, y: 0, z: 0, w: 1 };

export class PlayerPhysics {
  readonly world: RAPIER.World;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly kcc: RAPIER.KinematicCharacterController;
  readonly cfg: PlayerConfig;
  /** Feet position (bottom of the capsule, ignoring the skin gap). */
  readonly feet = new THREE.Vector3();
  /** Previous fixed-step feet position (for render interpolation). */
  readonly prevFeet = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  /** Actual horizontal speed achieved in the last step (m/s). */
  actualSpeed = 0;
  grounded = false;
  private coyote = 0;
  private jumpBuffer = 0;
  private syncedCount = 0;
  private fallback: RAPIER.Collider[] = [];
  readonly stats: PhysicsStats = {
    stepMs: 0, stepMsMax: 0, buildMs: 0, lastBuildMs: 0,
    meshes: 0, instances: 0, cuboids: 0, trimeshes: 0, triangles: 0,
  };
  private maxWindowStart = 0;
  private readonly standHalf: number;
  private readonly crouchHalf: number;
  private currentHalf: number;
  private _crouching = false;
  private readonly ball: RAPIER.Ball;
  private readonly capsuleShape: RAPIER.Capsule;
  private readonly hit = new RAPIER.CharacterCollision();

  /** Call `await initRapier()` first. */
  constructor(spawn: THREE.Vector3, cfg: PlayerConfig = PLAYER_CONFIG) {
    this.cfg = cfg;
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = cfg.fixedDt;
    this.standHalf = Math.max(0.05, cfg.height / 2 - cfg.radius);
    this.crouchHalf = Math.max(0.05, cfg.crouchHeight / 2 - cfg.radius);
    this.currentHalf = this.standHalf;
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(this.standHalf, cfg.radius), this.body);
    this.kcc = this.world.createCharacterController(cfg.skin);
    this.kcc.setUp(UP);
    this.kcc.setSlideEnabled(true);
    this.kcc.enableAutostep(cfg.stepHeight, cfg.stepMinWidth, false);
    this.kcc.enableSnapToGround(cfg.snapDistance);
    this.kcc.setMaxSlopeClimbAngle(cfg.maxSlope);
    this.kcc.setMinSlopeSlideAngle(cfg.slideSlope);
    this.kcc.setApplyImpulsesToDynamicBodies(false);
    this.ball = new RAPIER.Ball(cfg.camProbeRadius);
    this.capsuleShape = new RAPIER.Capsule(this.standHalf, cfg.radius - 0.01);
    this.placeAt(spawn);
  }

  /** Height of the capsule centre above the feet. */
  get centerOffset(): number {
    return this.cfg.skin + this.currentHalf + this.cfg.radius;
  }

  get crouching(): boolean {
    return this._crouching;
  }

  /**
   * Shrinks or restores the capsule. Standing back up fails when the head would be inside something,
   * and the character stays crouched. Feet stay where they are.
   */
  setCrouching(on: boolean): boolean {
    if (on === this._crouching) return true;
    const next = on ? this.crouchHalf : this.standHalf;
    if (!on && !this.shapeIsFree(this.standHalf)) return false;
    this.currentHalf = next;
    this.capsuleShape.halfHeight = next;
    this.collider.setHalfHeight(next);
    this._crouching = on;
    const c = { x: this.feet.x, y: this.feet.y + this.centerOffset, z: this.feet.z };
    this.body.setTranslation(c, true);
    this.body.setNextKinematicTranslation(c);
    return true;
  }

  /** True if a standing-height capsule at the feet touches nothing. */
  private shapeIsFree(half: number): boolean {
    const savedShape = this.capsuleShape.halfHeight;
    const savedHalf = this.currentHalf;
    this.capsuleShape.halfHeight = half;
    this.currentHalf = half;
    const free = this.isFree(this.feet);
    this.capsuleShape.halfHeight = savedShape;
    this.currentHalf = savedHalf;
    return free;
  }

  private placeAt(p: THREE.Vector3): void {
    this.feet.copy(p);
    this.prevFeet.copy(p);
    const c = { x: p.x, y: p.y + this.centerOffset, z: p.z };
    this.body.setTranslation(c, true);
    this.body.setNextKinematicTranslation(c);
    this.world.step(); // moves the collider + refreshes scene queries
  }

  /** Instantly moves the character (feet position) and clears its velocity. */
  teleport(p: THREE.Vector3): void {
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.coyote = 0;
    this.placeAt(p);
  }

  /**
   * Adds colliders for meshes registered since the last call (meshes[syncedCount..]).
   * Returns the number of meshes added. Cheap no-op when nothing is new.
   */
  syncColliders(meshes: readonly THREE.Mesh[]): number {
    if (meshes.length <= this.syncedCount) return 0;
    const t0 = performance.now();
    const fresh = meshes.slice(this.syncedCount);
    this.syncedCount = meshes.length;
    const shapes = collectShapes(fresh, this.cfg.colliderCell);
    this.addShapes(shapes);
    this.world.step(); // make the new colliders visible to queries
    const ms = performance.now() - t0;
    this.stats.lastBuildMs = ms;
    this.stats.buildMs += ms;
    return fresh.length;
  }

  private addShapes(s: CollectedShapes): void {
    for (const b of s.cuboids) {
      const desc = RAPIER.ColliderDesc.cuboid(b.half[0], b.half[1], b.half[2])
        .setTranslation(b.pos[0], b.pos[1], b.pos[2])
        .setRotation({ x: b.rot[0], y: b.rot[1], z: b.rot[2], w: b.rot[3] });
      this.world.createCollider(desc);
    }
    for (const cell of s.cells.values()) {
      const verts = new Float32Array(cell.verts);
      const count = verts.length / 3;
      const idx = new Uint32Array(count);
      for (let i = 0; i < count; i++) idx[i] = i;
      const desc = RAPIER.ColliderDesc.trimesh(verts, idx);
      if (desc) {
        this.world.createCollider(desc);
        this.stats.trimeshes++;
      }
    }
    this.stats.meshes += s.meshes;
    this.stats.instances += s.instances;
    this.stats.cuboids += s.cuboids.length;
    this.stats.triangles += s.triangles;
  }

  /**
   * Adds (once) a flat ground (~1 x 1 km around `center`, top at height `y`) used when nothing walkable
   * exists under the spawn. Built from 40 m tiles: one huge box lets the capsule sink (f32 precision).
   */
  addFallbackGround(y: number, center: THREE.Vector3): void {
    if (this.fallback.length) return;
    const tile = 40;
    const n = 26;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        const x = center.x + (i - n / 2 + 0.5) * tile;
        const z = center.z + (k - n / 2 + 0.5) * tile;
        const desc = RAPIER.ColliderDesc.cuboid(tile / 2, 0.5, tile / 2).setTranslation(x, y - 0.5, z);
        this.fallback.push(this.world.createCollider(desc));
      }
    }
    this.world.step();
  }

  /** Removes the fallback ground once real geometry exists under the feet `p`. Returns true if removed. */
  maybeRemoveFallback(p: THREE.Vector3): boolean {
    if (!this.fallback.length) return false;
    const fb = new Set(this.fallback.map((c) => c.handle));
    const hit = this.world.castRay(
      new RAPIER.Ray({ x: p.x, y: p.y + 1, z: p.z }, { x: 0, y: -1, z: 0 }),
      50, true, undefined, undefined, this.collider, undefined, (c) => !fb.has(c.handle),
    );
    if (!hit) return false;
    for (const c of this.fallback) this.world.removeCollider(c, false);
    this.fallback = [];
    this.world.step();
    return true;
  }

  get hasFallbackGround(): boolean {
    return this.fallback.length > 0;
  }

  /**
   * One fixed simulation step.
   * @param wishX,wishZ desired horizontal direction (length <= 1, world XZ)
   * @param wishSpeed target speed (m/s) at full input
   * @param jumpPressed true on the step the jump key went down (edge)
   */
  step(wishX: number, wishZ: number, wishSpeed: number, jumpPressed: boolean): StepResult {
    const t0 = performance.now();
    const cfg = this.cfg;
    const dt = cfg.fixedDt;
    const res: StepResult = { jumped: false, landed: false, landingSpeed: 0 };
    this.prevFeet.copy(this.feet);

    // Horizontal: accelerate toward the target velocity.
    const tx = wishX * wishSpeed;
    const tz = wishZ * wishSpeed;
    const accel = (this.grounded ? cfg.groundAccel : cfg.airAccel) * Math.max(1, wishSpeed / cfg.runSpeed);
    let dvx = tx - this.velocity.x;
    let dvz = tz - this.velocity.z;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dl > maxDv) {
      dvx *= maxDv / dl;
      dvz *= maxDv / dl;
    }
    this.velocity.x += dvx;
    this.velocity.z += dvz;

    // Vertical: coyote time + jump buffer + gravity.
    this.coyote = this.grounded ? cfg.coyoteTime : this.coyote - dt;
    this.jumpBuffer = jumpPressed ? cfg.jumpBuffer : this.jumpBuffer - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.velocity.y = jumpSpeed(cfg.jumpHeight, cfg.gravity);
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      res.jumped = true;
    }
    if (this.grounded && !res.jumped) {
      // Standing/walking: no push into the floor (that makes Rapier's controller stutter);
      // snap-to-ground keeps us glued going down stairs and ramps.
      this.velocity.y = 0;
    } else {
      this.velocity.y = Math.max(this.velocity.y - cfg.gravity * dt, -cfg.maxFallSpeed);
    }

    const desired = { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt };
    this.kcc.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const mv = this.kcc.computedMovement();
    const wasGrounded = this.grounded;
    // While rising from a jump we are never "grounded" (Rapier reports ground within a few cm).
    this.grounded = this.velocity.y > 0 ? false : this.kcc.computedGrounded();

    this.feet.x += mv.x;
    this.feet.y += mv.y;
    this.feet.z += mv.z;

    if (this.grounded && this.velocity.y <= 0) {
      if (!wasGrounded) {
        res.landed = true;
        res.landingSpeed = -this.velocity.y;
      }
      this.velocity.y = 0;
    } else if (this.velocity.y > 0 && mv.y < desired.y * 0.5) {
      this.velocity.y = 0; // bumped head on a ceiling
    }

    // Drop the part of the velocity that pushes into walls we touched (no sticky momentum,
    // natural sliding). Floors and stair edges are ignored.
    const nCol = this.kcc.numComputedCollisions();
    for (let i = 0; i < nCol; i++) {
      const c = this.kcc.computedCollision(i, this.hit);
      if (!c) continue;
      const n = c.normal1;
      if (n.y > 0.7) continue; // floor / gentle slope
      // Low contacts are stair edges and curbs that autostep handles: keep momentum.
      if (c.witness1.y < this.feet.y + cfg.stepHeight + 0.05) continue;
      const nl = Math.hypot(n.x, n.z);
      if (nl < 1e-6) continue;
      const nx = n.x / nl;
      const nz = n.z / nl;
      const into = this.velocity.x * nx + this.velocity.z * nz;
      if (into < 0) {
        this.velocity.x -= into * nx;
        this.velocity.z -= into * nz;
      }
    }
    this.actualSpeed = Math.hypot(mv.x, mv.z) / dt;

    this.body.setNextKinematicTranslation({ x: this.feet.x, y: this.feet.y + this.centerOffset, z: this.feet.z });
    this.world.step();

    if (this.feet.y < cfg.killY) res.landed = false;

    const ms = performance.now() - t0;
    this.stats.stepMs += (ms - this.stats.stepMs) * 0.05;
    if (t0 - this.maxWindowStart > 2000) {
      this.maxWindowStart = t0;
      this.stats.stepMsMax = ms;
    } else if (ms > this.stats.stepMsMax) this.stats.stepMsMax = ms;
    return res;
  }

  /** True if a capsule standing with its feet at `p` touches nothing. */
  isFree(p: THREE.Vector3): boolean {
    let hit = false;
    this.world.intersectionsWithShape(
      { x: p.x, y: p.y + this.centerOffset, z: p.z }, IDENTITY_ROT, this.capsuleShape,
      () => { hit = true; return false; },
      undefined, undefined, this.collider,
    );
    return !hit;
  }

  /** Distance from `from` straight down to the first collider, or null. */
  groundDistance(from: THREE.Vector3, max: number): number | null {
    const hit = this.world.castRay(
      new RAPIER.Ray({ x: from.x, y: from.y, z: from.z }, { x: 0, y: -1, z: 0 }),
      max, true, undefined, undefined, this.collider,
    );
    return hit ? hit.timeOfImpact : null;
  }

  /**
   * Sweeps the camera probe sphere from `from` along unit `dir` up to `max`.
   * Returns the free distance before touching something, or null if the path is clear.
   * `staticOnly` skips moving bodies (bot capsules), e.g. for a spectate camera that starts inside a bot.
   */
  sweepSphere(from: THREE.Vector3, dir: THREE.Vector3, max: number, staticOnly = false): number | null {
    const flags = staticOnly
      ? RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
      : undefined;
    const hit = this.world.castShape(
      { x: from.x, y: from.y, z: from.z }, IDENTITY_ROT, { x: dir.x, y: dir.y, z: dir.z }, this.ball,
      0, max, true, flags, undefined, this.collider,
    );
    return hit ? hit.time_of_impact : null;
  }

  /**
   * Finds a safe standing spot at or above `p`: not overlapping geometry and with ground below.
   * Returns null if there is no ground anywhere below/above (empty world).
   */
  findSafeSpot(p: THREE.Vector3): THREE.Vector3 | null {
    const probe = new THREE.Vector3();
    const look = 4; // how far below the feet we accept ground
    for (let dy = 0; dy <= 30; dy += 0.25) {
      probe.set(p.x, p.y + dy, p.z);
      if (!this.isFree(probe)) continue;
      const from = probe.clone();
      from.y += this.centerOffset;
      const d = this.groundDistance(from, this.centerOffset + look);
      if (d !== null) {
        const ground = from.y - d;
        const spot = new THREE.Vector3(p.x, ground + 0.02, p.z);
        if (this.isFree(spot)) return spot;
        return probe;
      }
    }
    // Last resort: drop from high above onto whatever top surface exists.
    const top = new THREE.Vector3(p.x, p.y + 300, p.z);
    const d = this.groundDistance(top, 1000);
    if (d !== null) return new THREE.Vector3(p.x, top.y - d + 0.05, p.z);
    return null;
  }

  dispose(): void {
    this.world.free();
  }
}
