import { mark } from '../core/bootTimings';
import { mountClickToPlay } from './clickToPlay';
import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { World } from '../core/world';
import { CameraRig, type CameraMode } from './camera';
import { tryLoadAnimatedCharacter, type CharacterVisual, type HitDir } from './characterLoader';
import { CharacterModel } from './character';
import { PLAYER_CONFIG } from './config';
import { Emitter, type PlayerEvents } from './events';
import { PlayerHud } from './hud';
import { InputController } from './input';
import { moveDirection, yawFromDirection, type MoveInput } from './math';
import { addPerfCampusColliders } from './perfCampus';
import type { PhysicsStats } from './physics';
import { buildTestCourse } from './testCourse';

/**
 * Player character, physics (Rapier), controls and camera. OWNER: Player Engineer.
 *
 * Controls: click = capture mouse (Esc releases), mouse = look, WASD/arrows = move, Shift = run,
 * C = crouch, right mouse = aim, Space = jump, left click = fire, R = reload, Q = med kit,
 * H = practice damage, V = first/third person, mouse wheel = zoom, E = interact, F3 = debug line.
 *
 * Other modules:
 *   player.events.on('interact', ({ position, facing }) => { ... })
 *   also 'jump', 'land', 'cameraMode', 'fire', 'reload', 'debugHurt', 'useMedkit'
 *   player.setSpeedScale(2)   // optional faster pace
 *
 * URL options: `?playertest=1` builds the player test course and spawns there;
 * `?playertest=perf` adds invisible extruded campus buildings as colliders (timing probe).
 */
export interface Player {
  /** Feet position in world coords (interpolated for rendering). */
  position: THREE.Vector3;
  update(dt: number): void;
  readonly events: Emitter<PlayerEvents>;
  readonly grounded: boolean;
  readonly cameraMode: CameraMode;
  setCameraMode(mode: CameraMode): void;
  /** Multiplies walk/run speed (1 = real human pace). */
  setSpeedScale(scale: number): void;
  /** First-person eye height above feet (m). */
  setEyeHeight(h: number): void;
  /** Third-person pivot height above feet (m). */
  setCamPivotHeight(h: number): void;
  /** True while F is held (squad revive). */
  holdingRevive(): boolean;
  setAllowRun(on: boolean): void;
  /** Move the character (feet position). */
  teleport(p: THREE.Vector3): void;
  /** Adds colliders registered since the last sync now (also done automatically every frame). */
  syncColliders(): number;
  stats(): PhysicsStats;
  /** Rapier world used for movement. Combat casts shots through it. */
  readonly rapier: { world: RAPIER.World; playerCollider: RAPIER.Collider };
  /** False while the death screen is up. Plays the death animation while controls are off. */
  setControlsEnabled(enabled: boolean): void;
  /** Show or hide the rifle in the player's hands (unarmed until one is looted). */
  setArmed(armed: boolean): void;
  /** Upper-body fire clip. Combat calls this when a shot actually leaves the gun. */
  playFire(): void;
  /** World position of the held rifle's barrel tip, or null when no rifle is shown. */
  getMuzzleWorld(out: THREE.Vector3): THREE.Vector3 | null;
  /** Upper-body reload clip, timed to the gameplay reload. */
  playReload(seconds: number): void;
  /**
   * Short flinch + camera kick. There is no hit animation in the clip file.
   * `hitDir` is world-space impulse (attacker → victim).
   */
  flinch(hitDir?: HitDir): void;
  dispose(): void;
}

/** Test/debug hooks on `window.__player` (dev server or `?playertest`). */
export interface PlayerTestApi {
  getPosition(): { x: number; y: number; z: number };
  teleport(x: number, y: number, z: number): void;
  /** Overrides keyboard input; `null` gives control back. `jump: true` triggers one jump. */
  setInput(input: Partial<MoveInput> | null): void;
  isGrounded(): boolean;
  /** Horizontal speed actually achieved (m/s). */
  getSpeed(): number;
  /** Runs `seconds` of simulation immediately (fixed 60 Hz steps, current input), no rendering. */
  advance(seconds: number): void;
  /** Total simulated time (s). */
  getSimTime(): number;
  setView(yaw: number, pitch: number): void;
  getView(): { yaw: number; pitch: number };
  setCameraMode(mode: CameraMode): void;
  getCamera(): { x: number; y: number; z: number; arm: number; mode: CameraMode };
  getStats(): PhysicsStats & { fps: number; fallbackGround: boolean };
  /** Names of player events emitted so far (for tests). */
  eventLog: string[];
  /** Perf probe results (`?playertest=perf`). */
  perf?: Record<string, number>;
  /** Which figure is on screen, and the detail level it picked for the camera distance. */
  getAvatar(): { kind: 'gltf' | 'procedural'; lod: number; missingTracks: number; crouched: boolean; aiming: boolean; dead: boolean };
  setCrouch(on: boolean): void;
  setAiming(on: boolean): void;
  /** Plays the fire clip and the rifle's muzzle flash without shooting (screenshots). */
  playFire(): void;
  /** Trigger a hit reaction (screenshot / debug). */
  flinch(hitDir?: { x: number; y: number; z: number }): void;
  /** Physics ray (what bullets use): distance to the first collider, or null. Playtest only. */
  physicsRay(o: [number, number, number], d: [number, number, number], max: number): number | null;
  /**
   * Visible-mesh ray against the scene (skipping the player, dummies, sky and effects):
   * distance and mesh name, or null. Compared with `physicsRay` to find collider/mesh mismatches.
   */
  meshRay(o: [number, number, number], d: [number, number, number], max: number): { d: number; name: string; collider: boolean } | null;
  /** Ray against the registered collider meshes (three.js side): distance and mesh name, or null. */
  colliderRay(o: [number, number, number], d: [number, number, number], max: number): { d: number; name: string } | null;
}

declare global {
  interface Window {
    __player?: PlayerTestApi;
  }
}

export async function createPlayer(world: World, camera: THREE.PerspectiveCamera, dom: HTMLElement): Promise<Player> {
  const cfg = { ...PLAYER_CONFIG };
  const params = new URLSearchParams(location.search);
  const testMode = params.get('playertest');
  const perfInfo: Record<string, number> = {};

  const t0 = performance.now();
  // Rapier (~2.5 MB of inlined WASM) lives in its own chunk so the rest of the game starts loading first.
  const { initRapier, PlayerPhysics, RAPIER: RAPIER_NS } = await import('./physics');
  const RAPIER_RAY = RAPIER_NS.Ray;
  await initRapier();
  perfInfo.rapierInitMs = performance.now() - t0;

  let spawn = world.spawn.clone();
  if (testMode === '1') spawn = buildTestCourse(world).spawn;
  if (testMode === 'perf') perfInfo.perfBuildings = (await addPerfCampusColliders(world)).buildings;

  const phys = new PlayerPhysics(spawn, cfg);
  phys.syncColliders(world.colliders);
  perfInfo.initialColliderBuildMs = phys.stats.buildMs;

  // Safe spawn: not inside geometry, not below ground. Empty world -> temporary flat ground.
  const findSpawn = (): THREE.Vector3 => {
    let spot = phys.findSafeSpot(spawn);
    if (!spot) {
      phys.addFallbackGround(Math.min(0, spawn.y), spawn);
      spot = phys.findSafeSpot(spawn) ?? spawn.clone();
    }
    return spot;
  };
  phys.teleport(findSpawn());

  const events = new Emitter<PlayerEvents>();
  const eventLog: string[] = [];
  for (const type of ['interact', 'jump', 'land', 'cameraMode', 'fire', 'reload', 'debugHurt', 'useMedkit', 'useBandage'] as const) {
    events.on(type, () => {
      eventLog.push(type);
      if (eventLog.length > 200) eventLog.shift();
    });
  }

  mark('player.physics');
  const model: CharacterVisual = (await tryLoadAnimatedCharacter()) ?? new CharacterModel();
  mark('player.character');
  world.scene.add(model.root);
  const groundScratch = new THREE.Vector3();
  model.setGroundProbe({
    sample: (x, yFrom, z, maxDrop) => {
      groundScratch.set(x, yFrom, z);
      const d = phys.groundDistance(groundScratch, maxDrop);
      return d === null ? null : yFrom - d;
    },
  });
  const rig = new CameraRig(camera, cfg, phys);
  rig.yaw = initialYaw(world, phys.feet, testMode === '1');
  model.yaw = rig.yaw;
  rig.reset(phys.feet);

  const hud = new PlayerHud(dom, params.has('debug') || testMode !== null);

  const setMode = (mode: CameraMode) => {
    if (rig.mode === mode) return;
    rig.setMode(mode);
    events.emit('cameraMode', { mode });
  };
  const input = new InputController(dom, {
    onToggleView: () => setMode(rig.mode === 'third' ? 'first' : 'third'),
    onToggleDebug: () => hud.toggleDebug(),
    onInteract: () => {
      const f = rig.forward();
      events.emit('interact', { position: { x: phys.feet.x, y: phys.feet.y, z: phys.feet.z }, facing: f });
    },
    onReload: () => events.emit('reload', {}),
    onDebugHurt: () => events.emit('debugHurt', {}),
    onUseMedkit: () => events.emit('useMedkit', {}),
    onUseBandage: () => events.emit('useBandage', {}),
  });

  // Clear 'Click to play' card until the mouse is captured (clicks go through to the canvas).
  const clickToPlay = mountClickToPlay(dom);
  const position = phys.feet.clone();
  let acc = 0;
  let simTime = 0;
  let lastMoveYaw: number | null = null;
  let jumpLatch = false;
  let armed = true;
  let dead = false;
  events.on('jump', () => {
    jumpLatch = true;
  });
  events.on('land', () => {
    jumpLatch = false;
  });

  /** Fixed-step simulation of `dt` seconds of input. */
  const simulate = (dt: number, maxSteps: number) => {
    const inp = input.read();
    if (input.crouching) phys.setCrouching(true);
    else phys.setCrouching(false);
    const dir = moveDirection(inp.forward, inp.right, rig.yaw);
    const speed = (phys.crouching ? cfg.crouchSpeed : inp.run && cfg.allowRun ? cfg.runSpeed : cfg.walkSpeed) * cfg.speedScale;
    acc += dt;
    let n = 0;
    while (acc >= cfg.fixedDt && n < maxSteps) {
      const r = phys.step(dir.x, dir.z, speed, input.consumeJump());
      acc -= cfg.fixedDt;
      simTime += cfg.fixedDt;
      n++;
      const p = { x: phys.feet.x, y: phys.feet.y, z: phys.feet.z };
      if (r.jumped) events.emit('jump', { position: p });
      if (r.landed) events.emit('land', { position: p, fallSpeed: r.landingSpeed });
      if (phys.feet.y < cfg.killY) {
        phys.teleport(findSpawn());
        rig.reset(phys.feet);
      }
    }
    if (n === maxSteps && acc >= cfg.fixedDt) acc = 0; // can't keep up: drop time rather than spiral
    const h = Math.hypot(phys.velocity.x, phys.velocity.z);
    lastMoveYaw = h > 0.1 ? yawFromDirection(phys.velocity.x, phys.velocity.z) : lastMoveYaw;
  };

  const present = (dt: number) => {
    const alpha = Math.min(1, acc / cfg.fixedDt);
    position.lerpVectors(phys.prevFeet, phys.feet, alpha);
    rig.update(dt, position, phys.crouching, input.aiming && !dead);
    model.root.position.copy(position);
    const aiming = input.aiming && !dead;
    model.setFlags({
      crouch: phys.crouching,
      aiming,
      jumping: !dead && !phys.grounded && (jumpLatch || Math.abs(phys.velocity.y) > 0.08),
      dead,
      unarmed: !armed,
    });
    const face = aiming ? rig.yaw : lastMoveYaw;
    const viewDistance = camera.position.distanceTo(position);
    model.update(
      dt,
      Math.min(phys.actualSpeed, Math.hypot(phys.velocity.x, phys.velocity.z) + 0.05),
      phys.grounded,
      face,
      viewDistance,
    );
    // Hidden in first person, and when the camera is squeezed right up against the head.
    model.root.visible = rig.mode === 'third' && rig.arm > 0.45;
  };

  const update = (dt: number) => {
    if (phys.syncColliders(world.colliders) > 0 && phys.hasFallbackGround) phys.maybeRemoveFallback(phys.feet);
    if (!input.enabled) {
      input.discardFrame();
      present(dt);
      hud.tick(dt);
      return;
    }
    // Look first, so this frame's movement uses this frame's camera yaw.
    const look = input.consumeLook();
    if (look.dx || look.dy) rig.addLook(look.dx, look.dy);
    const wheel = input.consumeWheel();
    if (wheel) rig.addZoom(wheel);
    simulate(dt, cfg.maxSubsteps);
    present(dt);
    if (input.consumeFire()) events.emit('fire', {});
    hud.tick(dt);
    if (hud.debugVisible) {
      const s = phys.stats;
      const p = phys.feet;
      hud.setDebugText(
        `pos ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}  ${phys.grounded ? 'grounded' : 'airborne'}  ` +
          `${phys.actualSpeed.toFixed(2)} m/s  ${hud.fps.toFixed(0)} fps\n` +
          `physics ${s.stepMs.toFixed(2)} ms (max ${s.stepMsMax.toFixed(2)})  colliders: ${s.cuboids} boxes, ` +
          `${s.trimeshes} trimeshes, ${s.triangles} tris  build ${s.buildMs.toFixed(0)} ms  cam ${rig.mode} ${rig.arm.toFixed(2)} m` +
          (world.interiorAt(p) ? `  inside ${world.interiorAt(p)!.name}` : ''),
      );
    }
  };

  const player: Player = {
    position,
    update,
    events,
    get grounded() {
      return phys.grounded;
    },
    get cameraMode() {
      return rig.mode;
    },
    setCameraMode: setMode,
    setSpeedScale: (s) => {
      cfg.speedScale = s;
    },
    setEyeHeight: (h) => {
      cfg.eyeHeight = h;
    },
    setCamPivotHeight: (h) => {
      cfg.camPivotHeight = h;
    },
    holdingRevive: () => input.holdingRevive(),
    setAllowRun: (on) => {
      cfg.allowRun = on;
    },
    teleport: (p) => {
      phys.teleport(p);
      position.copy(p);
      rig.reset(p);
      acc = 0;
    },
    syncColliders: () => phys.syncColliders(world.colliders),
    stats: () => ({ ...phys.stats }),
    rapier: { world: phys.world, playerCollider: phys.collider },
    setArmed: (v) => {
      armed = v;
    },
    setControlsEnabled: (enabled) => {
      input.setEnabled(enabled);
      dead = !enabled;
      clickToPlay.setSuppressed(!enabled);
      if (enabled) {
        jumpLatch = false;
        input.setCrouch(false);
        phys.setCrouching(false);
      }
    },
    playFire: () => model.playFire(),
    getMuzzleWorld: (out) => model.getMuzzleWorld(out),
    playReload: (seconds) => model.playReload(seconds),
    flinch: (hitDir) => {
      model.flinch(hitDir);
      rig.kick(hitDir, 1);
    },
    dispose: () => {
      input.dispose();
      clickToPlay.dispose();
      hud.dispose();
      world.scene.remove(model.root);
      model.dispose();
      phys.dispose();
      if (window.__player === api) delete window.__player;
    },
  };

  const api: PlayerTestApi = {
    getPosition: () => ({ x: phys.feet.x, y: phys.feet.y, z: phys.feet.z }),
    teleport: (x, y, z) => player.teleport(new THREE.Vector3(x, y, z)),
    setInput: (i) => input.setOverride(i),
    isGrounded: () => phys.grounded,
    getSpeed: () => phys.actualSpeed,
    advance: (seconds) => {
      const steps = Math.round(seconds / cfg.fixedDt);
      acc = 0;
      for (let i = 0; i < steps; i++) simulate(cfg.fixedDt, 1);
      acc = 0;
      present(cfg.fixedDt);
    },
    getSimTime: () => simTime,
    setView: (yaw, pitch) => rig.setView(yaw, pitch),
    getView: () => ({ yaw: rig.yaw, pitch: rig.pitch }),
    setCameraMode: setMode,
    getCamera: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z, arm: rig.arm, mode: rig.mode }),
    getStats: () => ({ ...phys.stats, fps: hud.fps, fallbackGround: phys.hasFallbackGround }),
    eventLog,
    perf: perfInfo,
    getAvatar: () => ({
      kind: model.kind,
      lod: model.lod,
      missingTracks: model.missingTracks,
      crouched: phys.crouching,
      aiming: input.aiming,
      dead,
    }),
    setCrouch: (on) => input.setCrouch(on),
    setAiming: (on) => input.setAiming(on),
    playFire: () => model.playFire(),
    flinch: (hitDir) => player.flinch(hitDir),
    physicsRay: (o, d, max) => {
      const v = new THREE.Vector3(...d).normalize();
      const hit = phys.world.castRay(new RAPIER_RAY({ x: o[0], y: o[1], z: o[2] }, { x: v.x, y: v.y, z: v.z }), max, true, undefined, undefined, phys.collider);
      return hit ? hit.timeOfImpact : null;
    },
    colliderRay: (o, d, max) => {
      const ray = new THREE.Raycaster(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize(), 0, max);
      const h = ray.intersectObjects(world.colliders, false)[0];
      return h ? { d: h.distance, name: h.object.name } : null;
    },
    meshRay: (o, d, max) => {
      const ray = new THREE.Raycaster(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize(), 0, max);
      ray.camera = camera;
      const colliderSet = new Set<THREE.Object3D>(world.colliders);
      const targets: THREE.Object3D[] = [];
      world.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) targets.push(o); });
      const hits = ray.intersectObjects(targets, false);
      for (const h of hits) {
        let o2: THREE.Object3D | null = h.object;
        let skip = false;
        let visible = true;
        while (o2) {
          if (!o2.visible) visible = false;
          if (/player-character|combat-dummy|sky|gfx\.|combat-|loot/i.test(o2.name)) skip = true;
          o2 = o2.parent;
        }
        const m = h.object as THREE.Mesh;
        if (skip || !visible || !(m as THREE.Mesh).isMesh || (m.material as THREE.Material).transparent) continue;
        return { d: h.distance, name: h.object.name || h.object.parent?.name || '?', collider: colliderSet.has(h.object as THREE.Mesh) };
      }
      return null;
    },
  };
  if (import.meta.env.DEV || testMode !== null || params.has('test')) window.__player = api;

  present(0);
  return player;
}

/** Face the nearest registered interior (e.g. the library entrance) if one is close to the spawn. */
function initialYaw(world: World, feet: THREE.Vector3, testCourse: boolean): number {
  if (testCourse) return 0;
  if (world.spawnYaw !== undefined) return world.spawnYaw;
  let best: THREE.Vector3 | null = null;
  let bestD = 120;
  const c = new THREE.Vector3();
  for (const z of world.interiors) {
    z.box.getCenter(c);
    const d = Math.hypot(c.x - feet.x, c.z - feet.z);
    if (d < bestD && d > 0.5) {
      bestD = d;
      best = c.clone();
    }
  }
  return best ? yawFromDirection(best.x - feet.x, best.z - feet.z) : 0;
}
