import * as THREE from 'three';
import type { World } from '../../../core/world';

/**
 * Where is the player? `World` has no player position yet (requested from the Tech Lead as
 * `world.focus`). Until then we use the position of the camera that last rendered the scene,
 * captured by an invisible probe mesh (frustumCulled = false, draws nothing). In first/third person
 * the camera is within a few meters of the player, which is good enough for doors and interior LOD.
 */
export interface FocusTracker {
  /** Latest focus position in world coordinates (camera or player). */
  readonly position: THREE.Vector3;
  /** True once a real position has been observed. */
  known(): boolean;
}

const trackers = new WeakMap<World, FocusTracker>();

export function getFocusTracker(world: World): FocusTracker {
  let t = trackers.get(world);
  if (t) return t;
  const position = new THREE.Vector3(1e9, 1e9, 1e9);
  let seen = false;
  const w = world as World & { focus?: THREE.Vector3 };

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  const probe = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  probe.name = 'landmarks:focus-probe';
  probe.frustumCulled = false;
  probe.onBeforeRender = (_r, _s, camera) => {
    if (w.focus instanceof THREE.Vector3) return;
    position.setFromMatrixPosition(camera.matrixWorld);
    seen = true;
  };
  world.scene.add(probe);
  world.onUpdate(() => {
    if (w.focus instanceof THREE.Vector3) {
      position.copy(w.focus);
      seen = true;
    }
  });
  t = { position, known: () => seen };
  trackers.set(world, t);
  return t;
}
