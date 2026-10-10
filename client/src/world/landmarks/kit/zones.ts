import * as THREE from 'three';
import type { World } from '../../../core/world';
import { localToWorld, type LocalFrame } from './frame';
import type { Rect } from './rects';

/**
 * Register an interior volume (local rect x [y0, y1]) as world-space InteriorZone boxes.
 * InteriorZone boxes are axis-aligned in WORLD space while buildings are slightly rotated, so the
 * rect is cut into `segments` slices along its long side; each slice's world AABB then overshoots
 * the walls by only a few centimeters.
 */
export function addInteriorVolume(world: World, f: LocalFrame, id: string, name: string, r: Rect, y0: number, y1: number, segments?: number): THREE.Box3[] {
  const long = Math.max(r.x1 - r.x0, r.z1 - r.z0);
  const n = segments ?? Math.max(1, Math.ceil((long * Math.abs(Math.sin(f.rotY))) / 0.5));
  const boxes: THREE.Box3[] = [];
  const alongZ = r.z1 - r.z0 >= r.x1 - r.x0;
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const b = (i + 1) / n;
    const sub: Rect = alongZ
      ? { x0: r.x0, x1: r.x1, z0: r.z0 + (r.z1 - r.z0) * a, z1: r.z0 + (r.z1 - r.z0) * b }
      : { x0: r.x0 + (r.x1 - r.x0) * a, x1: r.x0 + (r.x1 - r.x0) * b, z0: r.z0, z1: r.z1 };
    const box = new THREE.Box3();
    for (const [x, z] of [[sub.x0, sub.z0], [sub.x1, sub.z0], [sub.x1, sub.z1], [sub.x0, sub.z1]] as const) {
      box.expandByPoint(localToWorld(f, x, y0, z));
      box.expandByPoint(localToWorld(f, x, y1, z));
    }
    world.addInterior({ id, name, box });
    boxes.push(box);
  }
  return boxes;
}
