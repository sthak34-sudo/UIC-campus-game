import { debugKeysEnabled, helpText } from './debug/debugKeys';
import { createPerfOverlay } from './debug/perfOverlay';
import { inSpawnGrace } from './squad/enemySpawn';
import { prefetchLateChunks, SHADER_WARM_CAP_MS, withTimeout } from './boot/warm';
import * as THREE from 'three';
import type { CampusData } from './core/campusData';
import { World } from './core/world';
import { createRenderer } from './render/renderer';
import { buildCampus } from './world/campus';
import { buildLandmarks } from './world/landmarks';
import { createPlayer } from './player';
import { mark, publishReady as publishStatus, type UicStatus } from './core/bootTimings';

function publishReady(quality: string, reason: 'frames' | 'fallback'): void {
  publishStatus(window, { bootMs: window.__bootMs ?? 0, quality, reason });
}

import {
  clearLoadingUi,
  failLoading,
  initLoadingUi,
  loadElapsedMs,
  setLoadProgress,
} from './boot/loading';

// URL options (used by tools/screenshot):
//   ?view=<viewpoint name>  freeze the camera at a registered viewpoint (no player control)
//   ?hour=<0-24>            time of day
//   ?zoneFast=1             safe-zone timers run at 10× (damage per second stays the same)
//   ?zoneSeed=<number>      picks where the circles land. Default is 1.
//   ?squad=bots|solo        only ?squad=bots enables bots; missing/solo = main. ?bleedFast=1 speeds bleed/revive.
//                           ?enemySquads=N (0-4) adds enemy bot squads (S5). O wipes your squad (placement).
//                           Squad HUD (S4): P ping (Q is medkit), K/J knock, L heal-all, hold F revive.
//                           Spectate (S5): Left/Right cycle living/downed teammates after you die.
//   ?quality=low|medium|high  default is auto (medium, or low on software/weak GPUs)
declare global {
  interface Window {
    __ready?: boolean;
    __viewpoints?: string[];
    __bootMs?: number;
    __quality?: string;
    /** Prod-safe, read-only: true once playable. No setters or cheats are exposed. */
    readonly __uicReady?: boolean;
    readonly __uicStatus?: UicStatus;
  }
}

async function start(): Promise<void> {
  initLoadingUi();
  const params = new URLSearchParams(location.search);
  const helpEl = document.getElementById('help');
  if (helpEl) helpEl.textContent = helpText(helpEl.textContent ?? '', debugKeysEnabled(location.search));
  const container = document.getElementById('app')!;
  setLoadProgress(0.05, 'Starting renderer…');
  const world = new World();
  const gfx = createRenderer(container, world);
  window.__quality = gfx.quality.name;
  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 5000);

  mark('renderer');
  // Start fetching the combat/zone/squad chunks now so they overlap the campus build.
  const late = prefetchLateChunks();
  setLoadProgress(0.12, 'Downloading map…');
  const data: CampusData = await (await fetch(`${import.meta.env.BASE_URL}data/campus.json`)).json();
  mark('campus.json');
  setLoadProgress(0.28, 'Building campus…');
  await buildCampus(world, data);
  mark('campus');
  setLoadProgress(0.48, 'Loading landmarks…');
  const landmarks = await buildLandmarks(world, data);
  // Atlas's building glbs (they replace procedural footprints listed in world/buildings/manifest.ts).
  mark('landmarks');
  setLoadProgress(0.58, 'Loading buildings…');
  const { buildBuildingModels } = await import('./world/buildings');
  const buildings = await buildBuildingModels(world);
  if (landmarks.spawnYaw !== undefined) world.spawnYaw = landmarks.spawnYaw;

  const view = params.get('view');
  const hourParam = params.get('hour');
  mark('buildings');
  setLoadProgress(0.68, 'Spawning player…');
  const player = view ? null : await createPlayer(world, camera, container);

  // B6: glb loot_spawn markers -> floor-snapped crates for the existing loot spawner.
  mark('player');
  setLoadProgress(0.78, 'Physics…');
  const { collectBuildingLootMarkers, snapLootToFloor, walkableFloorAt, warnDroppedLoot } = await import('./world/buildings/lootSpawns');
  const { buildingLootSpots } = await import('./combat/buildingLoot');
  const { initRapier, PlayerPhysics } = await import('./player/physics');
  await initRapier();
  const lootPhys = player
    ? player.rapier.world
    : (() => {
        const phys = new PlayerPhysics(world.spawn.clone());
        phys.syncColliders(world.colliders);
        phys.world.step();
        return phys.world;
      })();
  if (player) {
    player.syncColliders();
    player.rapier.world.step();
  }
  const rawMarkers = collectBuildingLootMarkers(buildings);
  const snapped = snapLootToFloor(lootPhys, rawMarkers);
  warnDroppedLoot(snapped.dropped);
  // Match ground loot: building floors (glb markers) plus rifles / ammo / bandages on sidewalks and plazas.
  const { campusLootSpots, insideZone, CAMPUS_LOOT } = await import('./combat/campusLoot');
  // Same zone the match will run (same seed); loot stays inside its first safe circle.
  const { buildZone, parseZoneOptions } = await import('./zone/zoneLogic');
  const zoneOpts = parseZoneOptions(location.search);
  const zonePhases = buildZone(data.bounds, zoneOpts.seed, zoneOpts.fast);
  const firstSafe = zonePhases[0]!.end;
  const campusLoot = campusLootSpots([...data.surfaces.plaza, ...data.surfaces.sidewalk], {
    zone: firstSafe,
    floorAt: (x, z) => walkableFloorAt(lootPhys, x, z),
    spawn: { x: world.spawn.x, z: world.spawn.z },
  });
  console.info(`[loot] ${campusLoot.length} campus pickups, ${snapped.kept.length} building pickups`);
  // Building loot too: only floors inside the first shrink circle get pickups.
  const zoneBuildingLoot = snapped.kept.filter((m) => insideZone(firstSafe, m, CAMPUS_LOOT.zoneMarginM));
  console.info(`[loot] ${zoneBuildingLoot.length}/${snapped.kept.length} building pickups inside the first shrink circle`);
  const extraLoot = [...buildingLootSpots(zoneBuildingLoot), ...campusLoot];
  // Viewpoints aimed at the first kept marker in lecture centers / SCE.
  const lecturePool = snapped.kept.filter((m) => m.slug === 'quad-lecture-centers');
  // Prefer a mid-list marker so the camera is not jammed against a wall/door.
  const lecture = lecturePool[Math.min(4, Math.max(0, lecturePool.length - 1))];
  const sce = snapped.kept.find((m) => m.slug === 'student-center-east');
  if (lecture) {
    world.addViewpoint('b6-lecture-loot', {
      position: new THREE.Vector3(lecture.x + 4.5, lecture.y + 2.4, lecture.z + 3.8),
      target: new THREE.Vector3(lecture.x, lecture.y + 0.4, lecture.z),
      fov: 58,
      hour: 14,
    });
  }
  if (sce) {
    world.addViewpoint('b6-sce-loot', {
      position: new THREE.Vector3(sce.x - 2.8, sce.y + 1.7, sce.z + 3.0),
      target: new THREE.Vector3(sce.x, sce.y + 0.35, sce.z),
      fov: 55,
      hour: 14,
    });
  }

  // Combat (dummies, loot, HUD) registers the combat-range viewpoint, so it runs before the camera locks.
  mark('physics+loot');
  setLoadProgress(0.88, 'Combat & squads…');
  const { mountCombat } = await late.combat;
  const combat = await mountCombat({ world, player, camera, dom: container, extraLoot });
  const { mountZone } = await late.zone;
  // Grace counts game time (frame dt), same clock as the bot-fire grace in squad/adapter.ts.
  let zoneGameS = 0;
  world.onUpdate((dt) => {
    zoneGameS += dt;
  });
  const zone = mountZone({
    world,
    player,
    bounds: data.bounds,
    search: location.search,
    phases: zonePhases,
    // Spawn grace: the zone can't hurt anyone in the first few seconds.
    applyDamage: (amount) => {
      if (!inSpawnGrace(zoneGameS)) combat.applyZoneDamage(amount);
    },
  });
  // Squads (S3+S4): bots + downed/revive + HUD. Default/missing/?squad=solo = main solo behavior.
  const { mountSquad } = await late.squad;
  mountSquad({ world, player, camera, combat, search: location.search, zone });

  const vp = view ? world.viewpoints.get(view) : undefined;
  world.focus.copy(player ? player.position : (vp?.position ?? camera.position));
  if (view && !vp) console.error(`Unknown viewpoint "${view}". Known: ${[...world.viewpoints.keys()].join(', ')}`);
  if (vp) {
    camera.position.copy(vp.position);
    camera.lookAt(vp.target);
    if (vp.fov) camera.fov = vp.fov;
    camera.updateProjectionMatrix();
  }
  gfx.setTimeOfDay(hourParam ? Number(hourParam) : (vp?.hour ?? 14));
  window.__viewpoints = [...world.viewpoints.keys()];

  addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    gfx.resize(container.clientWidth, container.clientHeight);
  });

  mark('combat+zone+squad');
  // Compile shaders behind the loading screen (capped) instead of freezing on the first frame.
  setLoadProgress(0.95, 'Preparing shaders…');
  const warm = await withTimeout(gfx.renderer.compileAsync(world.scene, camera), SHADER_WARM_CAP_MS);
  mark(`shaders(${warm})`);
  setLoadProgress(1, 'Almost ready…');
  clearLoadingUi();
  window.__bootMs = Math.round(loadElapsedMs());
  console.info(`[boot] playable after ${window.__bootMs} ms (quality=${gfx.quality.name})`);
  const clock = new THREE.Clock();
  let frames = 0;
  let gfxReady = false;
  void gfx.ready.then(() => (gfxReady = true));
  // Soft fallback: if gfx.ready stalls (ReadPixels / soft GL), mark playable anyway.
  // Do not wait on frames — the render loop itself may be frozen by a GPU readback.
  const readyFallback = setTimeout(() => {
    if (!window.__ready) {
      gfxReady = true;
      window.__ready = true;
      mark('first-frames');
      publishReady(gfx.quality.name, 'fallback');
      console.warn('[boot] gfx.ready timed out; marking playable anyway');
    }
  }, 5_000);
  const perf = createPerfOverlay(gfx.renderer);
  const loop = () => {
    const dt = Math.min(clock.getDelta(), 0.1);
    player?.update(dt);
    const focus = world.focus.copy(player ? player.position : camera.position);
    world.update(dt, clock.elapsedTime);
    gfx.setFocus(focus, !!world.interiorAt(focus));
    perf.begin();
    gfx.render(camera);
    perf.end();
    frames++;
    // Ready = the spawn view has been drawn once AND the renderer's textures/environment
    // are loaded. (Waiting for 3 frames cost ~2 extra full frames on software GL.)
    if (!window.__ready && frames >= 1 && gfxReady) {
      window.__ready = true;
      mark('first-frames');
      publishReady(gfx.quality.name, 'frames');
      clearTimeout(readyFallback);
    }
    // Screenshot mode: stop once ready so the headless (software) renderer is idle for the capture.
    if (view && window.__ready) return;
    requestAnimationFrame(loop);
  };
  loop();
}

start().catch((e) => {
  console.error(e);
  failLoading(String(e));
});
