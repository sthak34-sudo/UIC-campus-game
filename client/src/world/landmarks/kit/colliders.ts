import * as THREE from 'three';
import type { World } from '../../../core/world';

/**
 * ColliderSet: invisible box meshes registered with `world.addCollider`.
 *
 * Contract for the Player Engineer:
 * - every collider is a THREE.Mesh with a BoxGeometry (unscaled; sizes are baked in the geometry),
 *   `visible = false`, positioned/rotated by its matrixWorld (only yaw + pitch rotations are used).
 * - `userData.collider` = { kind: 'box', size: [sx, sy, sz], tag } so a cuboid collider can be made
 *   directly (half extents = size / 2) instead of a trimesh.
 * - tag 'stair-ramp' marks the hidden smooth ramps under every stair flight (the visible steps are
 *   NOT colliders), 'floor' walkable slabs, 'wall', 'rail', 'furniture', 'column'.
 */
export type ColliderTag = 'floor' | 'wall' | 'stair-ramp' | 'landing' | 'rail' | 'furniture' | 'column' | 'solid';

const INVISIBLE = new THREE.MeshBasicMaterial({ visible: false });

export class ColliderSet {
  readonly meshes: THREE.Mesh[] = [];

  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, tag: ColliderTag, rot: { rotY?: number; rotX?: number } = {}): THREE.Mesh | null {
    if (sx <= 1e-3 || sy <= 1e-3 || sz <= 1e-3) return null;
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), INVISIBLE);
    m.position.set(cx, cy, cz);
    m.rotation.set(rot.rotX ?? 0, rot.rotY ?? 0, 0, 'YXZ');
    m.visible = false;
    m.name = `collider:${tag}`;
    m.userData.collider = { kind: 'box', size: [sx, sy, sz], tag };
    this.meshes.push(m);
    return m;
  }

  boxMinMax(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tag: ColliderTag): THREE.Mesh | null {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), tag);
  }

  /** Add all collider meshes under `parent` (call after the parent is placed), then register them. */
  register(world: World, parent: THREE.Object3D): void {
    const holder = new THREE.Group();
    holder.name = 'colliders';
    parent.add(holder);
    for (const m of this.meshes) holder.add(m);
    parent.updateWorldMatrix(true, true);
    for (const m of this.meshes) world.addCollider(m);
  }

  count(tag?: ColliderTag): number {
    return tag ? this.meshes.filter((m) => m.userData.collider.tag === tag).length : this.meshes.length;
  }
}

/**
 * A box whose TOP face runs exactly through the two points (zA, yA) -> (zB, yB) in the y/z plane,
 * spanning x0..x1. Used for stair ramps and sloped rails/soffits. Returns center + rotation.
 */
export function slopedBox(x0: number, x1: number, zA: number, yA: number, zB: number, yB: number, thickness: number) {
  const dz = zB - zA;
  const dy = yB - yA;
  const len = Math.hypot(dz, dy);
  const rotY = dz >= 0 ? 0 : Math.PI;
  const pitch = Math.atan2(dy, Math.abs(dz));
  // up normal of the slope (in z/y), pointing to +y
  const nz = dz >= 0 ? -dy / len : dy / len;
  const ny = Math.abs(dz) / len;
  return {
    cx: (x0 + x1) / 2,
    cy: (yA + yB) / 2 - (ny * thickness) / 2,
    cz: (zA + zB) / 2 - (nz * thickness) / 2,
    sx: Math.abs(x1 - x0),
    sy: thickness,
    sz: len,
    rotY,
    rotX: -pitch,
    pitch,
  };
}
