import * as THREE from 'three';
import type { World } from '../core/world';
import { CameraRig, type CameraMode } from './camera';
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
 * Space = jump, V = first/third person, mouse wheel = zoom, E = interact, F3 = debug line.
 *
 * Other modules:
 *   player.events.on('interact', ({ position, facing }) => { ... })   // also 'jump', 'land', 'cameraMode'
 *   player.setSpeedScale(2)   // missions: ~2x real speed
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
  /** Move the character (feet position). */
  teleport(p: THREE.Vector3): void;
  /** Adds colliders registered since the last sync now (also done automatically every frame). */
  syncColliders(): number;
  stats(): PhysicsStats;
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
}

declare global {
  interface Window {
    __player?: PlayerTestApi;
  }
}

export async function createPlayer(world: World, camera: THREE.PerspectiveCamera, dom: HTMLElement): Promise<Player> {
  const cfg = PLAYER_CONFIG;
  const params = new URLSearchParams(location.search);
  const testMode = params.get('playertest');
  const perfInfo: Record<string, number> = {};

  const t0 = performance.now();
  // Rapier (~2.5 MB of inlined WASM) lives in its own chunk so the rest of the game starts loading first.
  const { initRapier, PlayerPhysics } = await import('./physics');
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
  for (const type of ['interact', 'jump', 'land', 'cameraMode'] as const) {
    events.on(type, () => {
      eventLog.push(type);
      if (eventLog.length > 200) eventLog.shift();
    });
  }

  const model = new CharacterModel();
  world.scene.add(model.root);
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
  });

  const position = phys.feet.clone();
  let acc = 0;
  let simTime = 0;
  let lastMoveYaw: number | null = null;

  /** Fixed-step simulation of `dt` seconds of input. */
  const simulate = (dt: number, maxSteps: number) => {
    const inp = input.read();
    const dir = moveDirection(inp.forward, inp.right, rig.yaw);
    const speed = (inp.run ? cfg.runSpeed : cfg.walkSpeed) * cfg.speedScale;
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
    rig.update(dt, position);
    model.root.position.copy(position);
    model.update(dt, Math.min(phys.actualSpeed, Math.hypot(phys.velocity.x, phys.velocity.z) + 0.05), phys.grounded, lastMoveYaw);
    // Hidden in first person, and when the camera is squeezed right up against the head.
    model.root.visible = rig.mode === 'third' && rig.arm > 0.45;
  };

  const update = (dt: number) => {
    if (phys.syncColliders(world.colliders) > 0 && phys.hasFallbackGround) phys.maybeRemoveFallback(phys.feet);
    // Look first, so this frame's movement uses this frame's camera yaw.
    const look = input.consumeLook();
    if (look.dx || look.dy) rig.addLook(look.dx, look.dy);
    const wheel = input.consumeWheel();
    if (wheel) rig.addZoom(wheel);
    simulate(dt, cfg.maxSubsteps);
    present(dt);
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
    teleport: (p) => {
      phys.teleport(p);
      position.copy(p);
      rig.reset(p);
      acc = 0;
    },
    syncColliders: () => phys.syncColliders(world.colliders),
    stats: () => ({ ...phys.stats }),
    dispose: () => {
      input.dispose();
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
