import * as THREE from 'three';
import type { PlanPoint } from '../../../core/geo';
import { planToWorld } from '../../../core/geo';

/**
 * Building-local frame. Every landmark is modelled in its own tidy frame:
 *   local x = across the building (≈ east), local z = along the long axis (≈ south), y = up,
 * centered on the footprint's best-fit rectangle. The frame is then yawed by a small angle to match
 * the real footprint (Chicago's street grid is ~1° off true north in our plan coordinates).
 */
export interface LocalFrame {
  /** World position of the local origin (y = 0). */
  origin: THREE.Vector3;
  /** Yaw (radians) applied to the building group. */
  rotY: number;
  /** Half extents of the fitted rectangle (local x, local z). */
  halfX: number;
  halfZ: number;
}

export interface FittedRect extends LocalFrame {
  /** Footprint vertices expressed in the local frame as (x, z). */
  local: [number, number][];
}

/**
 * Height of a landmark's local y = 0 in the world. The campus ground (sidewalks, grass, plazas) is
 * raised to the curb height (world/campus/ground.ts CURB_H = 0.15 m), so landmarks sit on that level.
 */
export const LANDMARK_BASE_Y = 0.15;

/** Convert plan (x east, y north) to the frame's local (x, z). */
export function planToLocal(f: LocalFrame, p: PlanPoint): [number, number] {
  const [wx, , wz] = planToWorld(p);
  const dx = wx - f.origin.x;
  const dz = wz - f.origin.z;
  const c = Math.cos(f.rotY);
  const s = Math.sin(f.rotY);
  // inverse of Ry(rotY): local = Ry(-rotY) * world
  return [dx * c - dz * s, dx * s + dz * c];
}

/** Local (x, y, z) to world. */
export function localToWorld(f: LocalFrame, x: number, y: number, z: number): THREE.Vector3 {
  const c = Math.cos(f.rotY);
  const s = Math.sin(f.rotY);
  return new THREE.Vector3(f.origin.x + x * c + z * s, f.origin.y + y, f.origin.z - x * s + z * c);
}

/**
 * Fit an oriented rectangle to a footprint ring. Candidate orientations come from every edge
 * (folded into [-45°, 45°] around world axes); the one with the smallest area wins.
 * The long side is mapped to local z.
 */
export function fitFootprint(ring: PlanPoint[]): FittedRect {
  const pts = ring.map((p) => planToWorld(p)).map(([x, , z]) => [x, z] as [number, number]);
  let best: { area: number; a: number; minx: number; maxx: number; minz: number; maxz: number } | null = null;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    if (Math.hypot(x1 - x0, z1 - z0) < 1) continue;
    let a = Math.atan2(-(z1 - z0), x1 - x0); // yaw that maps local +x onto this edge
    while (a > Math.PI / 4) a -= Math.PI / 2;
    while (a < -Math.PI / 4) a += Math.PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const [x, z] of pts) {
      const lx = x * c - z * s;
      const lz = x * s + z * c;
      minx = Math.min(minx, lx); maxx = Math.max(maxx, lx);
      minz = Math.min(minz, lz); maxz = Math.max(maxz, lz);
    }
    const area = (maxx - minx) * (maxz - minz);
    if (!best || area < best.area - 1e-6) best = { area, a, minx, maxx, minz, maxz };
  }
  if (!best) throw new Error('degenerate footprint');
  let { a } = best;
  let hx = (best.maxx - best.minx) / 2;
  let hz = (best.maxz - best.minz) / 2;
  let clx = (best.minx + best.maxx) / 2;
  let clz = (best.minz + best.maxz) / 2;
  if (hx > hz) {
    // make local z the long axis: rotate the frame by 90° (local' = Ry(-90°)·local = (-z, x))
    a += Math.PI / 2;
    [hx, hz] = [hz, hx];
    [clx, clz] = [-clz, clx];
  }
  const c = Math.cos(a);
  const s = Math.sin(a);
  const origin = new THREE.Vector3(clx * c + clz * s, LANDMARK_BASE_Y, -clx * s + clz * c);
  const frame: LocalFrame = { origin, rotY: a, halfX: hx, halfZ: hz };
  return { ...frame, local: ring.map((p) => planToLocal(frame, p)) };
}
