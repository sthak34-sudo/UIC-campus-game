import * as THREE from 'three';
import type { MaterialName } from '../../render/materials';
import type { PlanPoint } from '../../core/geo';
import type { Polygon2D } from '../../core/campusData';
import { Batcher } from './batcher';
import { edgeNormal } from './geom';
import type { CampusDataExt, RoadLineExt } from './types';

/** Everything that is not a road sits on the raised "block" level (sidewalks, parkways, lawns, plazas). */
export const CURB_H = 0.15;

/**
 * Road paint. The material library has no paint material yet (requested from Graphics), so light
 * pavement stands in. Change here only.
 */
export const PAINT: MaterialName = 'roadMarking';

const SURFACE: Record<keyof CampusDataExt['surfaces'], { mat: MaterialName; y: number }> = {
  road: { mat: 'asphalt', y: 0 },
  parking: { mat: 'asphalt', y: CURB_H },
  sidewalk: { mat: 'sidewalk', y: CURB_H },
  plaza: { mat: 'plaza', y: CURB_H },
  pitch: { mat: 'grass', y: CURB_H },
  grass: { mat: 'grass', y: CURB_H },
  water: { mat: 'water', y: CURB_H - 0.1 },
};

export const STREET_KINDS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);

export interface GroundResult {
  mesh: THREE.Mesh | null;
  /** Visual-only ground beyond the play area (kept out of physics: huge triangles slow queries). */
  surroundings: THREE.Mesh | null;
  markings: THREE.Mesh | null;
  collider: THREE.Mesh | null;
}

function onBounds(a: PlanPoint, b: PlanPoint, bounds: CampusDataExt['bounds']): boolean {
  const e = 0.6;
  const same = (u: number, v: number, w: number) => Math.abs(u - w) < e && Math.abs(v - w) < e;
  return same(a[0], b[0], bounds.minX) || same(a[0], b[0], bounds.maxX) || same(a[1], b[1], bounds.minY) || same(a[1], b[1], bounds.maxY);
}

/** Curb faces along road edges (facing into the road) + water edge walls. */
function curbs(B: Batcher, polys: Polygon2D[], bounds: CampusDataExt['bounds'], yLo: number, yHi: number, mat: MaterialName, intoPoly: boolean): void {
  for (const p of polys) {
    for (const ring of [p.outer, ...p.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        if (onBounds(a, b, bounds)) continue;
        const n = edgeNormal(a, b); // outward of the polygon (holes: into the hole) given CCW outer / CW holes
        const s = intoPoly ? -1 : 1;
        B.quad(mat, a[0], yLo, -a[1], b[0], yLo, -b[1], b[0], yHi, -b[1], a[0], yHi, -a[1], s * n[0], 0, -s * n[1]);
      }
    }
  }
}

/**
 * Ground plane beyond the mapped area (neutral city concrete fading into the haze), with a hole for
 * the play area — or for the larger context area when context.json is loaded (context.ts).
 */
function surroundings(B: Batcher, bounds: CampusDataExt['bounds'], hole: CampusDataExt['bounds']): void {
  const R = 8000;
  const outer: PlanPoint[] = [[hole.minX - R, hole.minY - R], [hole.maxX + R, hole.minY - R], [hole.maxX + R, hole.maxY + R], [hole.minX - R, hole.maxY + R]];
  const h: PlanPoint[] = [[hole.minX, hole.minY], [hole.minX, hole.maxY], [hole.maxX, hole.maxY], [hole.maxX, hole.minY]];
  B.polygon('roof', outer, [h], 0, true);
  // safety floor: hides hairline gaps between surfaces and walls
  B.polygon('soil', [[hole.minX, hole.minY], [hole.maxX, hole.minY], [hole.maxX, hole.maxY], [hole.minX, hole.maxY]], [], -0.3, true);
  void bounds;
}

interface Node { x: number; y: number; segs: { line: RoadLineExt; atStart: boolean }[] }

/** Intersections = shared endpoints of 3+ street segments (Overture splits segments at junctions). */
export function findIntersections(lines: RoadLineExt[]): Node[] {
  const map = new Map<string, Node>();
  const key = (p: PlanPoint) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
  for (const l of lines) {
    if (!STREET_KINDS.has(l.kind) || l.points.length < 2) continue;
    for (const atStart of [true, false]) {
      const p = atStart ? l.points[0]! : l.points[l.points.length - 1]!;
      const k = key(p);
      let n = map.get(k);
      if (!n) map.set(k, (n = { x: p[0], y: p[1], segs: [] }));
      n.segs.push({ line: l, atStart });
    }
  }
  return [...map.values()].filter((n) => n.segs.length >= 3);
}

/** Direction (unit, plan) leaving a node along a polyline, and the point at distance d from the node. */
function along(line: RoadLineExt, atStart: boolean, d: number): { x: number; y: number; dx: number; dy: number } | null {
  const pts = atStart ? line.points : [...line.points].reverse();
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= d && l > 1e-6) {
      const t = (d - acc) / l;
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / l, dy: (b[1] - a[1]) / l };
    }
    acc += l;
  }
  return null;
}

/** Lane markings (center lines) and continental crosswalks at intersections. */
function markings(B: Batcher, lines: RoadLineExt[], nodes: Node[]): void {
  const y = 0.025;
  const nodeClear = new Map<RoadLineExt, [number, number]>(); // clear distance at start/end
  for (const n of nodes) {
    const maxW = Math.max(...n.segs.map((s) => s.line.width));
    for (const s of n.segs) {
      const c = nodeClear.get(s.line) ?? [0, 0];
      c[s.atStart ? 0 : 1] = maxW / 2 + 4.5;
      nodeClear.set(s.line, c);
    }
  }
  const strip = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
    if (l < 0.05) return;
    const nx = (-dy / l) * (w / 2), ny = (dx / l) * (w / 2);
    B.quad(PAINT, x0 + nx, y, -(y0 + ny), x1 + nx, y, -(y1 + ny), x1 - nx, y, -(y1 - ny), x0 - nx, y, -(y0 - ny), 0, 1, 0);
  };
  // center lines
  for (const l of lines) {
    if (!['primary', 'secondary', 'tertiary', 'residential'].includes(l.kind) || l.width < 7) continue;
    const major = l.kind === 'primary' || l.kind === 'secondary';
    const [c0, c1] = nodeClear.get(l) ?? [0, 0];
    let total = 0;
    for (let i = 0; i + 1 < l.points.length; i++) total += Math.hypot(l.points[i + 1]![0] - l.points[i]![0], l.points[i + 1]![1] - l.points[i]![1]);
    const dash = major ? 1e9 : 3, gap = major ? 0 : 6;
    for (let d = c0 + 1; d < total - c1 - 1; d += dash + gap) {
      const e = Math.min(d + dash, total - c1 - 1);
      const p = along(l, true, d), q = along(l, true, e);
      if (!p || !q) break;
      if (major) {
        // double solid line, follow the polyline in short pieces
        for (let s = d; s < e; s += 4) {
          const a = along(l, true, s), b = along(l, true, Math.min(s + 4, e));
          if (!a || !b) break;
          const ox = -a.dy * 0.12, oy = a.dx * 0.12;
          strip(a.x + ox, a.y + oy, b.x + ox, b.y + oy, 0.1);
          strip(a.x - ox, a.y - oy, b.x - ox, b.y - oy, 0.1);
        }
        break;
      }
      strip(p.x, p.y, q.x, q.y, 0.12);
    }
  }
  // crosswalks
  for (const n of nodes) {
    const others = n.segs.map((s) => s.line.width);
    for (const s of n.segs) {
      if (s.line.kind === 'motorway' || s.line.kind === 'trunk') continue;
      const maxOther = Math.max(...others.filter((_, i) => n.segs[i] !== s));
      const d = maxOther / 2 + 2.4;
      const p = along(s.line, s.atStart, d);
      if (!p) continue;
      const w = s.line.width;
      const px = -p.dy, py = p.dx; // across the road
      for (let t = -w / 2 + 0.45; t <= w / 2 - 0.45; t += 1.2) {
        const cx = p.x + px * t, cy = p.y + py * t;
        strip(cx - p.dx * 1.5, cy - p.dy * 1.5, cx + p.dx * 1.5, cy + p.dy * 1.5, 0.6);
      }
    }
  }
}

export function buildGround(data: CampusDataExt, outerHole: CampusDataExt['bounds'] = data.bounds): GroundResult {
  const B = new Batcher();
  for (const [kind, polys] of Object.entries(data.surfaces) as [keyof CampusDataExt['surfaces'], Polygon2D[]][]) {
    const s = SURFACE[kind];
    for (const p of polys) B.polygon(s.mat, p.outer, p.holes, s.y, true);
  }
  curbs(B, data.surfaces.road, data.bounds, 0, CURB_H, 'concrete', true);
  curbs(B, data.surfaces.water, data.bounds, CURB_H - 0.1, CURB_H, 'concreteDark', true);
  const mesh = B.toMesh('campus-ground');
  if (mesh) { mesh.receiveShadow = true; mesh.castShadow = false; }
  const S = new Batcher();
  surroundings(S, data.bounds, outerHole);
  const sur = S.toMesh('campus-ground-surroundings');
  if (sur) { sur.receiveShadow = true; sur.castShadow = false; }

  const M = new Batcher();
  markings(M, data.roadLines, findIntersections(data.roadLines));
  const mk = M.toMesh('campus-road-markings');
  if (mk) { mk.receiveShadow = true; mk.castShadow = false; }
  return { mesh, surroundings: sur, markings: mk, collider: mesh };
}
