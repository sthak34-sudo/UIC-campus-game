import type { MatKey, MeshBatch } from './batch';
import type { ColliderSet } from './colliders';

/** An opening in a wall. Positions are along the wall, measured from point `a`. */
export interface Opening {
  /** Distance from `a` to the opening's center (m). */
  at: number;
  width: number;
  /** Absolute y of the opening's bottom (sill or floor) and top (head). */
  bottom: number;
  top: number;
  /** Glass pane material, or omit for an open hole (doorways). */
  glass?: MatKey;
  /** Frame material for a thin frame around the glass. */
  frame?: MatKey;
  /** Doorway: no collider in the opening. Non-door openings are blocked by an invisible collider. */
  door?: boolean;
}

export interface WallOpts {
  a: [number, number];
  b: [number, number];
  y0: number;
  y1: number;
  thickness: number;
  mat: MatKey;
  /** Optional thin finish layer on one side (+1 = left of a->b, -1 = right). */
  skin?: { mat: MatKey; side: 1 | -1; thickness?: number };
  openings?: Opening[];
  /** 'pieces' (default): colliders follow the wall minus doorways. 'none': no colliders. */
  collide?: 'pieces' | 'none';
  /** Faces to emit on the main wall boxes (default all). */
  faces?: number;
}

export interface WallFrame {
  len: number;
  rotY: number;
  /** Along-wall unit vector (x, z). */
  dx: number;
  dz: number;
  /** Left normal (x, z). */
  nx: number;
  nz: number;
}

export function wallFrame(a: [number, number], b: [number, number]): WallFrame {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dx = (b[0] - a[0]) / len;
  const dz = (b[1] - a[1]) / len;
  return { len, rotY: Math.atan2(-dz, dx), dx, dz, nx: -dz, nz: dx };
}

/** 1D: split [0, len] into solid intervals and opening intervals. */
export function wallPieces(len: number, openings: Opening[]): { solid: [number, number][]; holes: Opening[] } {
  const holes = [...openings].sort((p, q) => p.at - q.at);
  const solid: [number, number][] = [];
  let s = 0;
  for (const o of holes) {
    const a = Math.max(0, o.at - o.width / 2);
    if (a > s + 1e-4) solid.push([s, a]);
    s = Math.min(len, o.at + o.width / 2);
  }
  if (len > s + 1e-4) solid.push([s, len]);
  return { solid, holes };
}

/**
 * Build a straight wall with openings (doors, windows) as merged boxes + collider boxes.
 * The wall's centerline runs from a to b; thickness is split evenly on both sides.
 */
export function buildWall(batch: MeshBatch, col: ColliderSet | null, o: WallOpts): void {
  const f = wallFrame(o.a, o.b);
  const t = o.thickness;
  const { solid, holes } = wallPieces(f.len, o.openings ?? []);
  const place = (u0: number, u1: number, y0: number, y1: number, off: number, thick: number, mat: MatKey, faces?: number) => {
    const uc = (u0 + u1) / 2;
    const cx = o.a[0] + f.dx * uc + f.nx * off;
    const cz = o.a[1] + f.dz * uc + f.nz * off;
    batch.box(mat, cx, (y0 + y1) / 2, cz, u1 - u0, y1 - y0, thick, { rotY: f.rotY, faces });
  };
  const layers: { off: number; thick: number; mat: MatKey; faces?: number }[] = [{ off: 0, thick: t, mat: o.mat, faces: o.faces }];
  if (o.skin) {
    const st = o.skin.thickness ?? 0.02;
    layers.push({ off: o.skin.side * (t / 2 + st / 2), thick: st, mat: o.skin.mat });
  }
  for (const L of layers) {
    for (const [u0, u1] of solid) place(u0, u1, o.y0, o.y1, L.off, L.thick, L.mat, L.faces);
    for (const h of holes) {
      const u0 = h.at - h.width / 2;
      const u1 = h.at + h.width / 2;
      if (h.bottom > o.y0 + 1e-4) place(u0, u1, o.y0, h.bottom, L.off, L.thick, L.mat, L.faces);
      if (h.top < o.y1 - 1e-4) place(u0, u1, h.top, o.y1, L.off, L.thick, L.mat, L.faces);
    }
  }
  for (const h of holes) {
    const u0 = h.at - h.width / 2;
    const u1 = h.at + h.width / 2;
    if (h.glass) place(u0, u1, h.bottom, h.top, 0, 0.024, h.glass);
    if (h.frame) {
      const fw = 0.06;
      const ft = Math.min(t, 0.12);
      place(u0, u0 + fw, h.bottom, h.top, 0, ft, h.frame);
      place(u1 - fw, u1, h.bottom, h.top, 0, ft, h.frame);
      place(u0, u1, h.bottom, h.bottom + fw, 0, ft, h.frame);
      place(u0, u1, h.top - fw, h.top, 0, ft, h.frame);
    }
  }
  if (col && o.collide !== 'none') {
    const doors = holes.filter((h) => h.door);
    const segs = wallPieces(f.len, doors);
    const total = t + (o.skin ? (o.skin.thickness ?? 0.02) : 0);
    const off = o.skin ? (o.skin.side * (o.skin.thickness ?? 0.02)) / 2 : 0;
    const addCol = (u0: number, u1: number, y0: number, y1: number) => {
      const uc = (u0 + u1) / 2;
      const m = col.box(o.a[0] + f.dx * uc + f.nx * off, (y0 + y1) / 2, o.a[1] + f.dz * uc + f.nz * off, u1 - u0, y1 - y0, total, 'wall', { rotY: f.rotY });
      return m;
    };
    for (const [u0, u1] of segs.solid) addCol(u0, u1, o.y0, o.y1);
    for (const d of doors) if (d.top < o.y1) addCol(d.at - d.width / 2, d.at + d.width / 2, d.top, o.y1);
  }
}

/** Evenly spaced openings helper: n openings of `width` centered in segments of [start, end]. */
export function evenOpenings(start: number, end: number, n: number, width: number, bottom: number, top: number, extra: Partial<Opening> = {}): Opening[] {
  const step = (end - start) / n;
  return Array.from({ length: n }, (_, i) => ({ at: start + step * (i + 0.5), width, bottom, top, ...extra }));
}
