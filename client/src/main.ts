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
  await buildLandmarks(world, data);

  const view = params.get('view');
  const hourParam = params.get('hour');
  const player = view ? null : await createPlayer(world, camera, container);

  const vp = view ? world.viewpoints.get(view) : undefined;
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
  const loop = () => {
    const dt = Math.min(clock.getDelta(), 0.1);
    player?.update(dt);
    world.update(dt, clock.elapsedTime);
    const focus = player ? player.position : camera.position;
    gfx.setFocus(focus, !!world.interiorAt(focus));
    gfx.render(camera);
    if (++frames === 3) window.__ready = true;
    requestAnimationFrame(loop);
  };
  loop();
}

start().catch((e) => {
  console.error(e);
  document.getElementById('loading')!.textContent = `Error: ${e}`;
});
