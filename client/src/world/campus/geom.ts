import * as THREE from 'three';
import type { PlanPoint } from '../../core/geo';

/** 2-D polygon helpers in PLAN coordinates (x = east, y = north, meters). */

export function signedArea(ring: readonly PlanPoint[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i]!, q = ring[(i + 1) % n]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function centroid(ring: readonly PlanPoint[]): PlanPoint {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i]!, q = ring[(i + 1) % n]!;
    const f = p[0] * q[1] - q[0] * p[1];
    a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const m = ring.reduce((s, p) => [s[0] + p[0], s[1] + p[1]] as PlanPoint, [0, 0] as PlanPoint);
    return [m[0] / ring.length, m[1] / ring.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInRing(x: number, y: number, ring: readonly PlanPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(x: number, y: number, outer: readonly PlanPoint[], holes: readonly PlanPoint[][] = []): boolean {
  if (!pointInRing(x, y, outer)) return false;
  for (const h of holes) if (pointInRing(x, y, h)) return false;
  return true;
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distToRing(px: number, py: number, ring: readonly PlanPoint[]): number {
  let d = Infinity;
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i]!, b = ring[(i + 1) % n]!;
    d = Math.min(d, distToSegment(px, py, a[0], a[1], b[0], b[1]));
  }
  return d;
}

export function bbox(ring: readonly PlanPoint[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/**
 * Remove duplicate points (closer than minLen) and nearly collinear vertices (turn < maxTurnDeg),
 * so facades get long straight edges for a regular window rhythm.
 */
export function cleanRing(ring: readonly PlanPoint[], minLen = 0.2, maxTurnDeg = 4): PlanPoint[] {
  let pts = ring.slice();
  for (let pass = 0; pass < 4; pass++) {
    const out: PlanPoint[] = [];
    const n = pts.length;
    if (n < 4) return pts;
    let changed = false;
    for (let i = 0; i < n; i++) {
      const p = pts[(i - 1 + n) % n]!, c = pts[i]!, q = pts[(i + 1) % n]!;
      const ax = c[0] - p[0], ay = c[1] - p[1], bx = q[0] - c[0], by = q[1] - c[1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la < minLen) { changed = true; continue; }
      const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) * (180 / Math.PI);
      if (lb > 1e-6 && turn < maxTurnDeg) { changed = true; continue; }
      out.push(c);
    }
    pts = out.length >= 3 ? out : pts;
    if (!changed) break;
  }
  return pts;
}

/** Outward unit normal (plan) of edge i of a ring whose outer rings are CCW and holes CW. */
export function edgeNormal(a: PlanPoint, b: PlanPoint): PlanPoint {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dy / l, -dx / l];
}

/**
 * Offset a ring along its outward normals by d (negative = inward) with mitered corners
 * (miter length clamped to `limit`·|d| for very sharp corners).
 */
export function offsetRing(ring: readonly PlanPoint[], d: number, limit = 3): PlanPoint[] {
  const n = ring.length;
  const out: PlanPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = ring[(i - 1 + n) % n]!, c = ring[i]!, q = ring[(i + 1) % n]!;
    const n1 = edgeNormal(p, c), n2 = edgeNormal(c, q);
    let mx = n1[0] + n2[0], my = n1[1] + n2[1];
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) { mx = n2[0]; my = n2[1]; } else { mx /= ml; my /= ml; }
    const cos = mx * n2[0] + my * n2[1];
    const k = Math.min(limit, 1 / Math.max(cos, 1e-3));
    out.push([c[0] + mx * d * k, c[1] + my * d * k]);
  }
  return out;
}

/** Triangulate a polygon with holes (earcut via three.js). Returns flat vertex list + indices. */
export function triangulate(outer: readonly PlanPoint[], holes: readonly PlanPoint[][] = []): { pts: PlanPoint[]; tris: number[] } {
  const contour = outer.map(([x, y]) => new THREE.Vector2(x, y));
  const hs = holes.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
  const faces = THREE.ShapeUtils.triangulateShape(contour, hs);
  const pts = [...outer, ...holes.flat()];
  const tris: number[] = [];
  for (const f of faces) tris.push(f[0]!, f[1]!, f[2]!);
  return { pts, tris };
}

/** Oriented bounding box via the longest edge direction. */
export function orientedBox(ring: readonly PlanPoint[]): { cx: number; cy: number; ux: number; uy: number; len: number; wid: number; area: number } {
  let best = 0, ux = 1, uy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i]!, b = ring[(i + 1) % n]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > best) { best = l; ux = (b[0] - a[0]) / l; uy = (b[1] - a[1]) / l; }
  }
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (const [x, y] of ring) {
    const s = x * ux + y * uy, t = -x * uy + y * ux;
    s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t);
  }
  let len = s1 - s0, wid = t1 - t0;
  const sc = (s0 + s1) / 2, tc = (t0 + t1) / 2;
  const cx = sc * ux - tc * uy, cy = sc * uy + tc * ux;
  if (wid > len) { [len, wid] = [wid, len]; [ux, uy] = [-uy, ux]; }
  return { cx, cy, ux, uy, len, wid, area: len * wid };
}
