import type * as THREE from 'three';
import type { World } from '../../../core/world';
import { getFocusTracker } from './focus';
import type { LocalFrame } from './frame';
import type { Rect } from './rects';

export interface LodLevel {
  /** Everything furnishing this floor (merged furniture, books...). */
  group: THREE.Object3D;
  /** Floor level and the next floor level (local y). */
  y0: number;
  y1: number;
  /** Visible from OUTSIDE when the focus is closer than this to the building (m). 0 = never. */
  outsideDistance?: number;
}

/**
 * Interior level-of-detail: furniture and books are only drawn when they can matter.
 * - focus inside the building: the current floor and the floors directly above/below (stairwell views)
 * - focus outside: only levels with `outsideDistance` (e.g. a glazed ground floor) within that distance
 * Lights and the building shell are NOT managed here (toggling lights recompiles shaders).
 */
export function interiorLod(world: World, f: LocalFrame, footprint: Rect, levels: LodLevel[], margin = 2): void {
  const tracker = getFocusTracker(world);
  const c = Math.cos(f.rotY);
  const s = Math.sin(f.rotY);
  world.onUpdate(() => {
    if (!tracker.known()) return;
    const p = tracker.position;
    const dx = p.x - f.origin.x;
    const dz = p.z - f.origin.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const ly = p.y - f.origin.y;
    const ox = Math.max(footprint.x0 - lx, 0, lx - footprint.x1);
    const oz = Math.max(footprint.z0 - lz, 0, lz - footprint.z1);
    const dist = Math.hypot(ox, oz);
    const top = levels[levels.length - 1].y1;
    const inside = dist <= margin && ly > levels[0].y0 - 1 && ly < top + 1;
    let cur = -1;
    if (inside) {
      cur = levels.findIndex((L) => ly >= L.y0 - 0.5 && ly < L.y1 - 0.5);
      if (cur < 0) cur = ly < levels[0].y0 ? 0 : levels.length - 1;
    }
    levels.forEach((L, i) => {
      L.group.visible = inside ? Math.abs(i - cur) <= 1 : dist < (L.outsideDistance ?? 0);
    });
  });
}

/**
 * Far shell swap for UH / Daley: up close the code landmark draws; past `farDistance` it hides and
 * the Atlas glb LOD1 shows. Colliders stay on the landmark (physics is independent of visibility).
 */
export function landmarkFarLod(
  world: World,
  landmark: THREE.Object3D,
  farShell: THREE.Object3D,
  farDistance: number,
): void {
  const tracker = getFocusTracker(world);
  const center = landmark.position.clone();
  farShell.visible = false;
  landmark.visible = true;
  world.onUpdate(() => {
    if (!tracker.known()) return;
    const far = tracker.position.distanceTo(center) >= farDistance;
    landmark.visible = !far;
    farShell.visible = far;
  });
}
