import * as THREE from 'three';

/**
 * The shared "world" every module plugs into. Owned by the Tech Lead; change only via review.
 *
 * - Add visible things to `scene`.
 * - Register anything the player must not walk through with `addCollider` (static meshes;
 *   the player module turns them into physics colliders). Walkable floors, stairs and ramps
 *   must be registered too — the player stands on colliders.
 * - Register per-frame logic with `onUpdate`.
 * - Register named camera viewpoints with `addViewpoint` (used for screenshots/tests).
 * - Register interiors with `addInterior` so the renderer can switch lighting when the player is inside.
 */
export interface Viewpoint {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov?: number;
  /** Optional sun time-of-day hint for screenshots (0-24). */
  hour?: number;
}

export interface InteriorZone {
  id: string;
  name: string;
  /** World-space box that counts as "inside". */
  box: THREE.Box3;
}

export type UpdateFn = (dt: number, elapsed: number) => void;

export class World {
  readonly scene = new THREE.Scene();
  readonly colliders: THREE.Mesh[] = [];
  readonly viewpoints = new Map<string, Viewpoint>();
  readonly interiors: InteriorZone[] = [];
  /** Where the player starts (world coords). */
  spawn = new THREE.Vector3(0, 2, 0);
  /** Optional facing direction at spawn (radians, three.js yaw around +Y; 0 = looking toward -Z / north). */
  spawnYaw?: number;
  /** Where the action is: the player's feet (or the camera in screenshot mode). Updated by main.ts every frame. */
  readonly focus = new THREE.Vector3();
  private updates: UpdateFn[] = [];

  addCollider(mesh: THREE.Mesh): void {
    mesh.updateWorldMatrix(true, false);
    this.colliders.push(mesh);
  }

  onUpdate(fn: UpdateFn): void {
    this.updates.push(fn);
  }

  update(dt: number, elapsed: number): void {
    for (const fn of this.updates) fn(dt, elapsed);
  }

  addViewpoint(name: string, vp: Viewpoint): void {
    this.viewpoints.set(name, vp);
  }

  addInterior(zone: InteriorZone): void {
    this.interiors.push(zone);
  }

  interiorAt(p: THREE.Vector3): InteriorZone | undefined {
    return this.interiors.find((z) => z.box.containsPoint(p));
  }
}
