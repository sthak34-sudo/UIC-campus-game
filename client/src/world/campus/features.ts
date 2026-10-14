import type { MaterialName } from '../../render/materials';
import type { PlanPoint } from '../../core/geo';
import type { Batcher } from './batcher';
import { Edge, ringBand, type FacadeContext, type VolumeResult } from './facade';
import { distToRing, edgeNormal, orientedBox, pointInPolygon } from './geom';
import { mat } from './mat';
import type { Rng } from './rng';
import type { CampusBuildingExt } from './types';

/**
 * Signature details that make individual UIC buildings recognizable (docs/research/facades.md).
 * Each feature adds geometry to the building batcher `B` and solid parts to the collider batcher `C`.
 */
export type FeatureName =
  | 'butterflyColonnade' // Lecture Centers: 45°-twisted columns with flared capitals + granite roof edge
  | 'twistedPylons' // SEL: giant 45°-rotated concrete pylons
  | 'scissorStairs' // SEO: open concrete scissor-stair towers at both ends
  | 'doubleStair' // SCE: double semicircular stair to a second-floor entrance
  | 'porch' // Hull-House: columned porch
  | 'aluminumFins' // ARC tower: folded aluminum fins
  | 'roofPV'; // reclad Lincoln / Douglas / Grant: rooftop solar

export interface FeatureInput {
  B: Batcher;
  C: Batcher;
  v: CampusBuildingExt;
  res: VolumeResult;
  rng: Rng;
  ctx: FacadeContext;
}

type Vec3 = [number, number, number];

/** Outer edges (world frame) that are exposed (not against a neighbor) and at least minLen long. */
function exposedEdges(f: FeatureInput, minLen: number): Edge[] {
  const out: Edge[] = [];
  const r = f.res.outer;
  for (let i = 0; i < r.length; i++) {
    const a = r[i]!, b = r[(i + 1) % r.length]!;
    const n = edgeNormal(a, b);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < minLen) continue;
    const mx = (a[0] + b[0]) / 2 + n[0] * 1.5, my = (a[1] + b[1]) / 2 + n[1] * 1.5;
    if (f.ctx.coverAt(mx, my, f.v.id) > 2) continue;
    out.push(new Edge(a[0], -a[1], b[0], -b[1], n));
  }
  return out;
}

/** Square column of side `a` rotated 45° to the edge (a "diamond" in plan). */
function diamond(B: Batcher, m: MaterialName, E: Edge, cx: number, cz: number, a: number, y0: number, y1: number): void {
  const c = Math.SQRT1_2;
  const ux = (E.tx + E.nx) * c, uz = (E.tz + E.nz) * c;
  B.box(m, cx, cz, ux, uz, a, a, y0, y1);
}

/** Flared capital: frustum from a small diamond (side a0 at y0) to a big one (side a1 at y1). */
function capital(B: Batcher, m: MaterialName, E: Edge, cx: number, cz: number, a0: number, a1: number, y0: number, y1: number): void {
  const c = Math.SQRT1_2;
  const u: [number, number] = [(E.tx + E.nx) * c, (E.tz + E.nz) * c];
  const w: [number, number] = [-u[1], u[0]];
  const corner = (s: number, i: number, y: number): Vec3 => {
    const sx = i === 0 || i === 3 ? -1 : 1, sy = i < 2 ? -1 : 1;
    return [cx + (u[0] * sx + w[0] * sy) * s / 2, y, cz + (u[1] * sx + w[1] * sy) * s / 2];
  };
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const p0 = corner(a0, i, y0), p1 = corner(a0, j, y0), p2 = corner(a1, j, y1), p3 = corner(a1, i, y1);
    const mx = (p0[0] + p1[0] + p2[0] + p3[0]) / 4 - cx, mz = (p0[2] + p1[2] + p2[2] + p3[2]) / 4 - cz;
    const l = Math.hypot(mx, mz) || 1;
    const k = (a1 - a0) / 2 / Math.max(0.01, y1 - y0);
    const nl = Math.hypot(1, k);
    B.quad(m, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], mx / l / nl, -k / nl, mz / l / nl);
  }
}

/** Box between two 3-D points (center line), `w` wide horizontally and `t` thick. */
function beam(B: Batcher, m: MaterialName, a: Vec3, b: Vec3, w: number, t: number): void {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(...d) || 1;
  const dn: Vec3 = [d[0] / L, d[1] / L, d[2] / L];
  let sx = -dn[2], sz = dn[0];
  const sl = Math.hypot(sx, sz) || 1;
  sx /= sl; sz /= sl;
  const side: Vec3 = [sx, 0, sz];
  const up: Vec3 = [dn[1] * side[2] - dn[2] * side[1], dn[2] * side[0] - dn[0] * side[2], dn[0] * side[1] - dn[1] * side[0]];
  if (up[1] < 0) { up[0] = -up[0]; up[1] = -up[1]; up[2] = -up[2]; }
  const P = (p: Vec3, s: number, u: number): Vec3 => [p[0] + side[0] * s * w / 2 + up[0] * u * t / 2, p[1] + up[1] * u * t / 2, p[2] + side[2] * s * w / 2 + up[2] * u * t / 2];
  const faces: [number, number, number, number, Vec3][] = [
    [1, 1, -1, 1, up], [-1, -1, 1, -1, [-up[0], -up[1], -up[2]]], [1, -1, 1, 1, side], [-1, 1, -1, -1, [-side[0], 0, -side[2]]],
  ];
  for (const [s0, u0, s1, u1, n] of faces) {
    const p0 = P(a, s0, u0), p1 = P(b, s0, u0), p2 = P(b, s1, u1), p3 = P(a, s1, u1);
    B.quad(m, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], n[0], n[1], n[2]);
  }
}

/** Lecture Centers: ring of twisted butterfly columns carrying a thick granite roof edge. */
function butterflyColonnade(f: FeatureInput): void {
  const o = 2.2, y0 = f.v.minHeight, top = f.res.roofY;
  const bandBot = top - 0.75;
  ringBand(f.B, mat('granite'), f.res.outer, bandBot, top, o + 0.6, f.res.outer.map(() => 0));
  for (const E of exposedEdges(f, 6)) {
    const n = Math.max(1, Math.round(E.L / 6.5));
    for (let k = 0; k < n; k++) {
      const s = ((k + 0.5) * E.L) / n;
      const cx = E.x(s, -o), cz = E.z(s, -o);
      diamond(f.B, 'concrete', E, cx, cz, 0.55, y0, bandBot - 1.3);
      capital(f.B, 'concrete', E, cx, cz, 0.55, 1.7, bandBot - 1.3, bandBot);
      f.C.box('concrete', cx, cz, 1, 0, 0.6, 0.6, y0, bandBot);
    }
  }
}

/** SEL: giant concrete pylons rotated 45°, standing just outside the brick walls. */
function twistedPylons(f: FeatureInput): void {
  const y0 = f.v.minHeight, top = f.v.height + 1.2;
  for (const E of exposedEdges(f, 18)) {
    const n = Math.max(1, Math.round(E.L / 14));
    for (let k = 0; k < n; k++) {
      const s = ((k + 0.5) * E.L) / n;
      const cx = E.x(s, -0.9), cz = E.z(s, -0.9);
      diamond(f.B, 'concrete', E, cx, cz, 1.5, y0, top);
      f.C.box('concrete', cx, cz, 1, 0, 1.6, 1.6, y0, top);
    }
  }
}

/** SEO: open concrete scissor-stair towers at both ends of the slab, flights crossing as an X. */
function scissorStairs(f: FeatureInput): void {
  const o = orientedBox(f.res.outer);
  const floors = f.res.floors, top = f.res.roofY;
  for (const sgn of [-1, 1]) {
    // tower center just outside the short face
    const cxp = o.cx + o.ux * sgn * (o.len / 2 + 2.3), cyp = o.cy + o.uy * sgn * (o.len / 2 + 2.3);
    const ux = o.ux, uz = -o.uy; // world, along the slab
    const vx = -uz, vz = ux; // world, across
    const cx = cxp, cz = -cyp;
    const P = (du: number, dv: number, y: number): Vec3 => [cx + ux * du + vx * dv, y, cz + uz * du + vz * dv];
    // corner posts
    for (const du of [-2.0, 2.0]) for (const dv of [-2.6, 2.6]) {
      const p = P(du, dv, 0);
      f.B.box('concrete', p[0], p[2], ux, uz, 0.45, 0.45, f.v.minHeight, top + 0.6);
    }
    for (let i = 0; i < floors.length; i++) {
      const yb = floors[i]!, yt = i + 1 < floors.length ? floors[i + 1]! : top;
      // landings at both ends + edge beam
      for (const dv of [-2.2, 2.2]) {
        const p = P(0, dv, 0);
        f.B.box('concrete', p[0], p[2], ux, uz, 4.0, 1.0, yb - 0.25, yb, true);
      }
      if (yt - yb < 2) continue;
      // the two crossing flights (scissor)
      beam(f.B, 'concrete', P(0.9, -1.7, yb), P(0.9, 1.7, yt), 1.3, 0.25);
      beam(f.B, 'concrete', P(-0.9, 1.7, yb), P(-0.9, -1.7, yt), 1.3, 0.25);
      // guard rail lines
      beam(f.B, 'metal', P(1.55, -1.7, yb + 1.0), P(1.55, 1.7, yt + 1.0), 0.05, 0.05);
      beam(f.B, 'metal', P(-1.55, 1.7, yb + 1.0), P(-1.55, -1.7, yt + 1.0), 0.05, 0.05);
    }
    // roof slab of the tower
    const p = P(0, 0, 0);
    f.B.box('concrete', p[0], p[2], ux, uz, 4.5, 5.7, top + 0.3, top + 0.6, true);
    f.C.box('concrete', p[0], p[2], ux, uz, 4.5, 5.7, f.v.minHeight, top + 0.6);
  }
}

/** Pick the exposed edge whose outward normal points most along plan direction (dx, dy). */
function edgeFacing(f: FeatureInput, dx: number, dy: number, minLen: number): Edge | null {
  let best: Edge | null = null, bs = -Infinity;
  for (const E of exposedEdges(f, minLen)) {
    const s = E.nx * dx + -E.nz * dy + E.L * 0.002;
    if (s > bs) { bs = s; best = E; }
  }
  return best;
}

/** SCE: double semicircular stair rising from the plaza to a second-floor entrance landing. */
function doubleStair(f: FeatureInput): void {
  const E = edgeFacing(f, -1, 0, 16); // the campus (west) side
  if (!E) return;
  const H = Math.min(f.res.floors[1] ?? 4.5, 6);
  const R = 5.5, dl = 3.0, mid = E.L / 2, y0 = f.v.minHeight;
  const m: MaterialName = 'concrete';
  // landing slab on two piers
  E.box(f.B, m, mid - R - 0.8, mid + R + 0.8, H - 0.35, H, -dl, 0, 'ftblr');
  E.box(f.C, m, mid - R - 0.8, mid + R + 0.8, H - 0.35, H, -dl, 0, 'ftblr');
  for (const s of [mid - R * 0.6, mid + R * 0.6]) E.box(f.B, m, s - 0.4, s + 0.4, y0, H - 0.35, -dl + 0.3, -dl + 1.1, 'flr');
  // rails along the landing edge
  E.box(f.B, 'metal', mid - R + 0.9, mid + R - 0.9, H + 0.95, H + 1.0, -dl, -dl + 0.05, 'ftb');
  const N = Math.ceil(H / 0.165);
  for (const side of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      // angle from the landing corner (0) to the front center (π/2)
      const a0 = ((i + 0) / N) * (Math.PI / 2) * 0.96, a1 = ((i + 1) / N) * (Math.PI / 2) * 0.96;
      const am = (a0 + a1) / 2;
      const s = mid + side * R * Math.cos(am), d = -dl - R * Math.sin(am);
      const h = H * (1 - (i + 0.5) / N);
      const cx = E.x(s, d), cz = E.z(s, d);
      // tangent direction of the arc (world)
      const ts = -side * R * Math.sin(am), td = -R * Math.cos(am);
      const tl = Math.hypot(ts, td) || 1;
      const ux = (E.tx * ts - E.nx * td) / tl, uz = (E.tz * ts - E.nz * td) / tl;
      const tread = (R * (a1 - a0)) + 0.05;
      f.B.box(m, cx, cz, ux, uz, tread, 2.0, y0, y0 + h);
      f.C.box(m, cx, cz, ux, uz, tread, 2.0, y0, y0 + h);
    }
  }
}

/** Hull-House: columned porch with a flat roof across the front (Halsted) side. */
function porch(f: FeatureInput): void {
  const E = edgeFacing(f, 1, 0, 6);
  if (!E) return;
  const y0 = f.v.minHeight, w = Math.min(E.L * 0.8, 14), s0 = (E.L - w) / 2, s1 = s0 + w;
  const white = mat('concretePrecast');
  E.box(f.B, white, s0, s1, y0, y0 + 0.75, -2.8, 0, 'ftlr');
  E.box(f.C, white, s0, s1, y0, y0 + 0.75, -2.8, 0, 'ftlr');
  const n = Math.max(3, Math.round(w / 2.2) + 1);
  for (let k = 0; k < n; k++) {
    const s = s0 + 0.3 + ((w - 0.6) * k) / (n - 1);
    E.box(f.B, white, s - 0.17, s + 0.17, y0 + 0.75, y0 + 4.3, -2.6, -2.26, 'flr');
    E.box(f.B, white, s - 0.24, s + 0.24, y0 + 4.05, y0 + 4.3, -2.68, -2.18, 'flrb'); // capital
  }
  E.box(f.B, white, s0 - 0.2, s1 + 0.2, y0 + 4.3, y0 + 4.75, -3.0, 0, 'ftblr');
  for (let i = 0; i < 4; i++) {
    const h = y0 + 0.75 * (1 - (i + 1) / 4);
    E.box(f.B, 'concrete', (E.L - 2.4) / 2, (E.L + 2.4) / 2, y0, h + 0.19, -2.8 - 0.3 * (i + 1), -2.8 - 0.3 * i, 'ftlr');
  }
}

/** ARC tower: folded aluminum fins at the window module, angled like Netsch's rotated geometry. */
function aluminumFins(f: FeatureInput): void {
  const m = mat('metalPanel');
  const y0 = f.v.minHeight + 4.5, y1 = f.res.roofY;
  if (y1 - y0 < 6) return;
  for (const E of exposedEdges(f, 3)) {
    const n = Math.max(1, Math.round(E.L / 1.8));
    for (let k = 1; k < n; k++) {
      const s = (k * E.L) / n;
      const fold = k % 2 === 0 ? 0.22 : -0.22;
      const ax = E.x(s, 0), az = E.z(s, 0), bx = E.x(s + fold, -0.45), bz = E.z(s + fold, -0.45);
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      f.B.quad(m, ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, nx, 0, nz);
      f.B.quad(m, ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, -nx, 0, -nz);
    }
  }
}

/** Rows of tilted solar panels on a flat roof (reclad Lincoln / Douglas / Grant Halls). */
function roofPV(f: FeatureInput): void {
  const ring: PlanPoint[] = f.res.outer;
  const o = orientedBox(ring);
  const y = f.res.roofY;
  const m = mat('solarPanel');
  const vx = -o.uy, vy = o.ux;
  for (let t = -o.wid / 2 + 2; t <= o.wid / 2 - 2; t += 2.6) {
    for (let s = -o.len / 2 + 2; s + 3 <= o.len / 2 - 2; s += 3.2) {
      const p = (ds: number, dt: number): PlanPoint => [o.cx + o.ux * (s + ds) + vx * (t + dt), o.cy + o.uy * (s + ds) + vy * (t + dt)];
      const corners = [p(0, 0), p(3, 0), p(3, 1.6), p(0, 1.6)];
      if (!corners.every(([x, yy]) => pointInPolygon(x, yy, ring) && distToRing(x, yy, ring) > 1.2)) continue;
      // tilted toward +v (low edge at t, high edge at t + 1.6)
      const [a, b, c, d] = corners as [PlanPoint, PlanPoint, PlanPoint, PlanPoint];
      const lo = y + 0.35, hi = y + 0.95;
      const nx = -vx * 0.35, nz = vy * 0.35, l = Math.hypot(nx, 1, nz);
      f.B.quad(m, a[0], lo, -a[1], b[0], lo, -b[1], c[0], hi, -c[1], d[0], hi, -d[1], nx / l, 1 / l, nz / l);
      f.B.quad('metal', a[0], lo, -a[1], b[0], lo, -b[1], c[0], hi, -c[1], d[0], hi, -d[1], -nx / l, -1 / l, -nz / l);
    }
  }
}

const FEATURES: Record<FeatureName, (f: FeatureInput) => void> = {
  butterflyColonnade, twistedPylons, scissorStairs, doubleStair, porch, aluminumFins, roofPV,
};

export function applyFeature(name: FeatureName, f: FeatureInput): void {
  FEATURES[name](f);
}
