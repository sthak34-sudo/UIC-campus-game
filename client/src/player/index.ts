import type * as THREE from 'three';
import type { World } from '../core/world';

/**
 * Player character, physics (Rapier), controls and camera. OWNER: Player Engineer.
 */
export interface Player {
  /** Feet position in world coords. */
  position: THREE.Vector3;
  update(dt: number): void;
}

export async function createPlayer(world: World, _camera: THREE.PerspectiveCamera, _dom: HTMLElement): Promise<Player> {
  return { position: world.spawn.clone(), update: () => {} };
}
