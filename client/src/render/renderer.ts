import * as THREE from 'three';
import type { World } from '../core/world';

/**
 * Renderer, sky, sun, shadows, post-processing. OWNER: Graphics Engineer.
 * Stub: basic lights so other modules can be developed and screenshotted.
 */
export interface GameRenderer {
  renderer: THREE.WebGLRenderer;
  render(camera: THREE.PerspectiveCamera): void;
  resize(w: number, h: number): void;
  /** Called every frame with the player/camera position so lighting can follow (shadows, interiors). */
  setFocus(p: THREE.Vector3, inside: boolean): void;
  /** Hour of day 0-24 (sun position). */
  setTimeOfDay(hour: number): void;
}

export function createRenderer(container: HTMLElement, world: World): GameRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = world.scene;
  scene.background = new THREE.Color(0xbcd3e8);
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b6250, 1.2));
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
  sun.position.set(-300, 500, 250);
  scene.add(sun);

  return {
    renderer,
    render: (camera) => renderer.render(scene, camera),
    resize: (w, h) => renderer.setSize(w, h),
    setFocus: () => {},
    setTimeOfDay: () => {},
  };
}
