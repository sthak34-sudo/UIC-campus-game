import * as THREE from 'three';
import type { World } from '../../../core/world';
import { MeshBatch, type MatKey } from './batch';
import { getFocusTracker } from './focus';

export interface SlidingDoorOpts {
  /** Center of the doorway on the floor, in the parent's local frame (x, z). */
  center: [number, number];
  /** Floor level (y) in the parent's local frame. */
  y: number;
  /** Yaw of the door plane: leaves slide along the rotated local x axis. */
  rotY: number;
  /** Clear opening width when open (m). Team rule: >= 1.2. */
  clearWidth: number;
  /** Width of the hole in the wall the leaves must cover when closed (default clearWidth). */
  holeWidth?: number;
  /** Clear height (m). Team rule: >= 2.3. */
  height: number;
  glass?: MatKey;
  frame?: MatKey;
  /** Open when the player/camera is closer than this (m). */
  radius?: number;
  /** Seconds for a full open/close. */
  duration?: number;
}

export interface SlidingDoor {
  group: THREE.Group;
  /** 0 = closed, 1 = open. */
  readonly openness: () => number;
}

/**
 * Automatic sliding glass doors (two leaves). There is deliberately NO collider on the leaves:
 * the doorway is always passable for physics; the doors simply open when you approach, like real
 * automatic doors. (Static colliders cannot move, and a locked/closed door must never trap players.)
 */
export function slidingDoors(world: World, parent: THREE.Object3D, o: SlidingDoorOpts): SlidingDoor {
  const glass = o.glass ?? 'glass';
  const frame = o.frame ?? 'windowFrame';
  const hole = o.holeWidth ?? o.clearWidth;
  const leafW = hole / 2 + 0.04;
  const h = o.height;
  const group = new THREE.Group();
  group.name = 'sliding-doors';
  group.position.set(o.center[0], o.y, o.center[1]);
  group.rotation.y = o.rotY;
  parent.add(group);

  const leaves: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const b = new MeshBatch();
    const fw = 0.05;
    b.box(glass, 0, h / 2, 0, leafW - 2 * fw, h - 2 * fw, 0.02);
    b.box(frame, -leafW / 2 + fw / 2, h / 2, 0, fw, h, 0.05);
    b.box(frame, leafW / 2 - fw / 2, h / 2, 0, fw, h, 0.05);
    b.box(frame, 0, fw / 2, 0, leafW, fw, 0.05);
    b.box(frame, 0, h - fw / 2, 0, leafW, fw, 0.05);
    const leaf = b.build('door-leaf');
    leaf.position.x = (side * hole) / 4;
    leaf.userData.closedX = leaf.position.x;
    leaf.userData.side = side;
    for (const m of leaf.children) m.matrixAutoUpdate = true;
    group.add(leaf);
    leaves.push(leaf);
  }

  const tracker = getFocusTracker(world);
  const radius = o.radius ?? 4.0;
  const duration = o.duration ?? 0.7;
  const worldCenter = new THREE.Vector3();
  let haveCenter = false;
  let t = 0;
  let snapped = false;
  world.onUpdate((dt) => {
    if (!haveCenter) {
      group.updateWorldMatrix(true, false);
      worldCenter.set(0, 1, 0).applyMatrix4(group.matrixWorld);
      haveCenter = true;
    }
    if (!tracker.known()) return;
    const p = tracker.position;
    const near = Math.hypot(p.x - worldCenter.x, p.z - worldCenter.z) < radius && Math.abs(p.y - worldCenter.y) < 3;
    const target = near ? 1 : 0;
    if (!snapped) {
      t = target;
      snapped = true;
    } else {
      const step = dt / duration;
      t = target > t ? Math.min(target, t + step) : Math.max(target, t - step);
    }
    const e = t * t * (3 - 2 * t);
    for (const leaf of leaves) leaf.position.x = leaf.userData.closedX + leaf.userData.side * e * (leafW - 0.06);
  });
  return { group, openness: () => t };
}
