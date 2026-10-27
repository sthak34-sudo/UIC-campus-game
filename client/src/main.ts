import * as THREE from 'three';
import type { CampusData } from './core/campusData';
import { World } from './core/world';
import { createRenderer } from './render/renderer';
import { buildCampus } from './world/campus';
import { buildLandmarks } from './world/landmarks';
import { createPlayer } from './player';

// URL options (used by tools/screenshot):
//   ?view=<viewpoint name>  freeze the camera at a registered viewpoint (no player control)
//   ?hour=<0-24>            time of day
//   ?zoneFast=1             safe-zone timers run at 10× (damage per second stays the same)
//   ?zoneSeed=<number>      picks where the circles land. Default is 1.
//   ?squad=bots|solo        only ?squad=bots enables bots; missing/solo = main. ?bleedFast=1 speeds bleed/revive.
//                           Squad HUD (S4): P ping (Q is medkit), K/J knock, L heal-all, hold F revive.
declare global {
  interface Window {
    __ready?: boolean;
    __viewpoints?: string[];
  }
}

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const container = document.getElementById('app')!;
  const world = new World();
  const gfx = createRenderer(container, world);
  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 5000);

  const data: CampusData = await (await fetch(`${import.meta.env.BASE_URL}data/campus.json`)).json();
  await buildCampus(world, data);
  const landmarks = await buildLandmarks(world, data);
  // Atlas's building glbs (they replace procedural footprints listed in world/buildings/manifest.ts).
  const { buildBuildingModels } = await import('./world/buildings');
  await buildBuildingModels(world);
  if (landmarks.spawnYaw !== undefined) world.spawnYaw = landmarks.spawnYaw;

  const view = params.get('view');
  const hourParam = params.get('hour');
  const player = view ? null : await createPlayer(world, camera, container);
  // Combat (dummies, loot, HUD) registers the combat-range viewpoint, so it runs before the camera locks.
  const { mountCombat } = await import('./combat');
  const combat = mountCombat({ world, player, camera, dom: container });
  const { mountZone } = await import('./zone');
  const zone = mountZone({
    world,
    player,
    bounds: data.bounds,
    search: location.search,
    applyDamage: (amount) => combat.applyZoneDamage(amount),
  });
  // Squads (S3+S4): bots + downed/revive + HUD. Default/missing/?squad=solo = main solo behavior.
  const { mountSquad } = await import('./squad/adapter');
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

  document.getElementById('loading')!.remove();
  const clock = new THREE.Clock();
  let frames = 0;
  let gfxReady = false;
  void gfx.ready.then(() => (gfxReady = true));
  const loop = () => {
    const dt = Math.min(clock.getDelta(), 0.1);
    player?.update(dt);
    const focus = world.focus.copy(player ? player.position : camera.position);
    world.update(dt, clock.elapsedTime);
    gfx.setFocus(focus, !!world.interiorAt(focus));
    gfx.render(camera);
    frames++;
    // Ready = a few frames rendered AND the renderer's textures/environment are loaded.
    if (!window.__ready && frames >= 3 && gfxReady) window.__ready = true;
    // Screenshot mode: stop once ready so the headless (software) renderer is idle for the capture.
    if (view && window.__ready) return;
    requestAnimationFrame(loop);
  };
  loop();
}

start().catch((e) => {
  console.error(e);
  document.getElementById('loading')!.textContent = `Error: ${e}`;
});
