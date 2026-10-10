import type { MaterialName } from '../../render/materials';
import type { PlanPoint } from '../../core/geo';
import type { Batcher } from './batcher';
import type { CampusBuildingExt } from './types';
import type { FacadeStyle } from './styles';
import type { Rng } from './rng';
import { cleanRing, distToRing, edgeNormal, offsetRing, orientedBox, pointInPolygon, signedArea } from './geom';

/** What the facade generator needs to know about the surroundings. */
export interface FacadeContext {
  /** Height of the tallest OTHER ground-based volume containing plan point (x, y), 0 if none. */
  coverAt(x: number, y: number, selfId: string): number;
  /** Distance (m) from plan point to the nearest street center line. */
  streetDist(x: number, y: number): number;
}

/** A door opening cut into a facade (world coordinates) — where a future interior connects. */
export interface DoorInfo {
  /** Center of the door at the facade plane, ground level (world x, y, z). */
  position: [number, number, number];
  /** Outward normal (world x, z). */
  normal: [number, number];
  width: number;
  height: number;
}

export interface VolumeResult {
  /** Ring(s) actually used (cleaned, CCW outer / CW holes), plan coords. */
  outer: PlanPoint[];
  holes: PlanPoint[][];
  /** Floor bottoms (m above ground) — where future interior floor slabs go. */
  floors: number[];
  roofY: number;
  doors: DoorInfo[];
}

const PITCHED = new Set(['gabled', 'hipped', 'pyramidal', 'skillion', 'gambrel', 'mansard', 'half-hipped', 'saltbox']);

/** Local frame of one wall edge: s = along the edge, y = up, d = depth INTO the building. */
class Edge {
  readonly tx: number; readonly tz: number; readonly nx: number; readonly nz: number; readonly L: number;
  constructor(readonly ax: number, readonly az: number, bx: number, bz: number, nPlan: PlanPoint) {
    this.L = Math.hypot(bx - ax, bz - az);
    this.tx = (bx - ax) / (this.L || 1); this.tz = (bz - az) / (this.L || 1);
    this.nx = nPlan[0]; this.nz = -nPlan[1];
  }
  x(s: number, d: number): number { return this.ax + this.tx * s - this.nx * d; }
  z(s: number, d: number): number { return this.az + this.tz * s - this.nz * d; }
  /** Wall rectangle facing outward at depth d. */
  rect(B: Batcher, m: MaterialName, s0: number, s1: number, y0: number, y1: number, d = 0): void {
    if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
    B.quad(m, this.x(s0, d), y0, this.z(s0, d), this.x(s1, d), y0, this.z(s1, d), this.x(s1, d), y1, this.z(s1, d), this.x(s0, d), y1, this.z(s0, d), this.nx, 0, this.nz);
  }
  box(B: Batcher, m: MaterialName, s0: number, s1: number, y0: number, y1: number, d0: number, d1: number, faces = 'ftblr'): void {
    B.boxLocal(m, this.ax, this.az, this.tx, this.tz, this.nx, this.nz, s0, s1, y0, y1, d0, d1, faces);
  }
}

function ensureOrientation(ring: PlanPoint[], ccw: boolean): PlanPoint[] {
  const a = signedArea(ring);
  return (a > 0) === ccw ? ring : ring.slice().reverse();
}

/** Floor bottoms between y0 and roofY (ground floor taller). */
export function floorLevels(y0: number, roofY: number, style: FacadeStyle, floorsHint: number | null, groundBased: boolean): number[] {
  const usable = roofY - y0;
  if (usable < 2.4) return [y0];
  const gh = groundBased ? Math.min(style.groundH, usable * 0.5) : style.floorH;
  let n: number;
  if (floorsHint && usable / floorsHint >= 2.6 && usable / floorsHint <= 6.5) n = floorsHint;
  else n = Math.max(1, Math.round((usable - gh) / style.floorH) + 1);
  while (n > 1 && (usable - gh) / (n - 1) < 2.6) n--;
  if (n === 1) return [y0];
  const up = (usable - gh) / (n - 1);
  const out = [y0];
  for (let i = 1; i < n; i++) out.push(y0 + gh + (i - 1) * up);
  return out;
}

/**
 * Builds one building volume (walls with real recessed windows, bands, cornice, parapet, roof,
 * rooftop equipment) into the batcher. Deterministic for a given rng.
 */
export function buildVolume(
  B: Batcher, v: CampusBuildingExt, style: FacadeStyle, rng: Rng, ctx: FacadeContext,
  opts: { door: boolean; rooftop: boolean },
): VolumeResult {
  const outer = ensureOrientation(cleanRing(v.footprint.outer), true);
  const holes = v.footprint.holes.map((h) => ensureOrientation(cleanRing(h), false)).filter((h) => h.length >= 3);
  const y0 = v.minHeight;
  const top = v.height;
  const groundBased = y0 < 0.5;
  const area = Math.abs(signedArea(outer)) - holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);

  // --- roof form -------------------------------------------------------------------------
  const shape = v.roofShape && PITCHED.has(v.roofShape) && holes.length === 0 ? v.roofShape : 'flat';
  const obb = orientedBox(outer);
  let pitched = shape !== 'flat';
  let roofH = 0;
  if (pitched) {
    roofH = v.roofHeight ?? Math.min(obb.wid * 0.35, 6);
    roofH = Math.min(roofH, (top - y0) * 0.6);
    if (roofH < 0.8 || top - roofH - y0 < 2.2) pitched = false;
  }
  const smallOrLow = top - y0 < 4.5;
  const parapet = pitched ? 0 : Math.min(style.parapet, smallOrLow ? 0.35 : style.parapet);
  const wallTop = pitched ? top - roofH : top;
  const roofY = pitched ? wallTop : top - parapet;
  const floors = floorLevels(y0, roofY, style, v.floors, groundBased);
  const plinthTop = groundBased ? y0 + style.plinth : -1;

  const rings: { ring: PlanPoint[]; hole: boolean }[] = [{ ring: outer, hole: false }, ...holes.map((ring) => ({ ring, hole: true }))];
  const doors: DoorInfo[] = [];

  // choose the door edge: longest uncovered outer edge facing a street
  let doorEdge = -1;
  if (opts.door && groundBased && style.name !== 'garage') {
    let best = 0;
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i]!, b = outer[(i + 1) % outer.length]!;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = edgeNormal(a, b);
      const mx = (a[0] + b[0]) / 2 + n[0] * 1.0, my = (a[1] + b[1]) / 2 + n[1] * 1.0;
      if (ctx.coverAt(mx, my, v.id) > 0) continue;
      const sd = ctx.streetDist(mx, my);
      const score = L * (sd < 25 ? 3 : sd < 60 ? 1.5 : 1);
      if (L >= 2.5 && score > best) { best = score; doorEdge = i; }
    }
  }

  // --- walls -------------------------------------------------------------------------------
  const edgeCover: number[][] = [];
  for (const { ring, hole } of rings) {
    const covers: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
      const n = edgeNormal(a, b);
      const E = new Edge(a[0], -a[1], b[0], -b[1], n);
      let cover = Infinity;
      for (const f of [0.15, 0.5, 0.85]) {
        const px = a[0] + (b[0] - a[0]) * f + n[0] * 0.6, py = a[1] + (b[1] - a[1]) * f + n[1] * 0.6;
        cover = Math.min(cover, ctx.coverAt(px, py, v.id));
      }
      covers.push(cover);
      if (E.L < 0.05) continue;
      const yStart = Math.max(y0, cover);
      if (yStart >= top - 0.05) continue;
      const isFront = !hole && i === doorEdge;
      facadeEdge(B, E, style, rng, floors, yStart, wallTop, roofY, plinthTop, isFront, doors);
    }
    edgeCover.push(covers);
  }

  // --- horizontal bands, cornice, parapet --------------------------------------------------
  rings.forEach(({ ring }, ri) => {
    const covers = edgeCover[ri]!;
    if (style.bandD > 0 && style.bandH > 0) {
      for (let f = 1; f < floors.length; f++) {
        const yb = floors[f]! - style.bandH * 0.6, yt = floors[f]! + style.bandH * 0.4;
        if (yt < wallTop - 0.3) ringBand(B, style.bandMat, ring, yb, yt, style.bandD, covers);
      }
    }
    if (!pitched && style.corniceD > 0 && top - y0 > 5) {
      ringBand(B, style.corniceMat, ring, top - style.corniceH, top, style.corniceD, covers, true);
    }
    if (!pitched && parapet > 0.05) parapetRing(B, ring, roofY, top, 0.3, covers, top);
  });

  // --- roof ----------------------------------------------------------------------------------
  if (pitched) {
    if (!pitchedRoof(B, outer, obb, shape, wallTop, top, style.wall)) {
      B.polygon('roof', outer, [], wallTop, true);
    }
  } else {
    B.polygon('roof', outer, holes, roofY, true);
    if (opts.rooftop && area > 450 && top - y0 > 7) rooftopUnits(B, outer, holes, obb, roofY, area, rng);
  }
  if (!groundBased) B.polygon('concreteDark', outer, holes, y0, false); // soffit of bridges / overhangs

  return { outer, holes, floors, roofY, doors };
}

/** One wall edge: piers, spandrels, recessed windows, door. */
function facadeEdge(
  B: Batcher, E: Edge, st: FacadeStyle, rng: Rng, floors: number[], yStart: number, wallTop: number, roofY: number,
  plinthTop: number, isFront: boolean, doors: DoorInfo[],
): void {
  const L = E.L;
  // wall rect that switches to the base material below the plinth line
  const wall = (s0: number, s1: number, ya: number, yb: number): void => {
    if (yb <= ya || s1 <= s0) return;
    if (ya < plinthTop) {
      E.rect(B, st.base, s0, s1, ya, Math.min(yb, plinthTop));
      if (yb > plinthTop) E.rect(B, st.wall, s0, s1, plinthTop, yb);
    } else E.rect(B, st.wall, s0, s1, ya, yb);
  };

  const curtain = st.name === 'curtain';
  const garage = st.name === 'garage';
  const fill = st.winW <= 0; // openings fill the bay (curtain wall / garage)
  const pier = garage ? 0.6 : curtain ? 0.08 : 0.35;
  const corner = Math.min(st.corner, L * 0.2);
  const usable = L - 2 * corner;
  const minOpen = curtain || garage ? 1.0 : Math.min(st.winW, 0.8);
  let nb = usable >= minOpen + pier ? Math.max(1, Math.floor(usable / st.bay)) : 0;
  if (st.name === 'shed') nb = 0;
  const bw = nb > 0 ? usable / nb : 0;
  const winW = fill ? bw - pier : Math.min(st.winW, bw - pier);
  if (nb > 0 && winW < 0.5) nb = 0;

  // which bays are blank (decided once per edge so the rhythm is vertical)
  const blank: boolean[] = [];
  for (let k = 0; k < nb; k++) blank.push(rng.chance(st.blankBays));
  const doorBay = isFront && nb > 0 ? Math.floor(nb / 2) : -1;

  if (nb === 0) {
    const y0 = floors[0]!;
    const dh = Math.min(2.3, wallTop - y0 - 0.3);
    if (isFront && L >= 2.2 && y0 >= yStart - 0.01 && dh > 1.8) {
      const w = st.name === 'shed' ? Math.min(2.7, L - 0.6) : 1.0;
      const s0 = (L - w) / 2, s1 = s0 + w;
      wall(0, s0, yStart, wallTop); wall(s1, L, yStart, wallTop); wall(s0, s1, y0 + dh, wallTop);
      cutOpening(B, E, st, s0, s1, y0, y0 + dh, 'door', true);
      recordDoor(E, (s0 + s1) / 2, y0, w, dh, doors);
    } else wall(0, L, yStart, wallTop);
    return;
  }

  // mixed-use: a shop-front ground floor with its own wide bays; the upper rhythm starts above it
  const shopGround = st.shopFront && isFront && floors.length > 1 && plinthTop > 0 && floors[0]! >= yStart - 0.01 && L >= 4;
  let pierBottom = yStart;
  if (shopGround) {
    const yb = floors[0]!, yt = floors[1]!;
    pierBottom = yt;
    const nS = Math.max(1, Math.floor((L - 1.0) / 3.2)), sw = (L - 1.0) / nS, p2 = 0.25;
    const dk = Math.floor(nS / 2);
    const o1 = Math.min(yb + 3.1, yt - 0.45);
    E.rect(B, st.wall, 0, 0.5 + p2, yb, yt);
    E.rect(B, st.wall, L - 0.5 - p2, L, yb, yt);
    for (let k = 0; k < nS; k++) {
      const s0 = 0.5 + sw * k + p2, s1 = 0.5 + sw * (k + 1) - p2;
      if (k > 0) E.rect(B, st.wall, s0 - 2 * p2, s0, yb, yt);
      const o0 = k === dk ? yb : yb + 0.45;
      if (o0 > yb) E.rect(B, 'concreteDark', s0, s1, yb, o0);
      E.rect(B, st.wall, s0, s1, o1, yt);
      cutOpening(B, E, st, s0, s1, o0, o1, k === dk ? 'door' : 'shop', true);
      if (k === dk) recordDoor(E, (s0 + s1) / 2, yb, s1 - s0, o1 - o0, doors);
    }
    // sign band / storefront cornice
    E.box(B, st.corniceMat === 'concreteDark' ? 'metal' : st.corniceMat, 0, L, o1 + 0.05, o1 + 0.35, -0.12, 0, 'ftb');
  }

  // full-height piers (corners + between bays)
  const pierCols: [number, number][] = [[0, corner + (bw - winW) / 2]];
  for (let k = 0; k < nb - 1; k++) {
    const c = corner + bw * (k + 1);
    pierCols.push([c - (bw - winW) / 2, c + (bw - winW) / 2]);
  }
  pierCols.push([L - corner - (bw - winW) / 2, L]);
  for (const [s0, s1] of pierCols) wall(s0, s1, pierBottom, wallTop);
  if (st.fins) {
    for (let k = 0; k <= nb; k++) {
      const c = k === 0 ? corner * 0.5 : k === nb ? L - corner * 0.5 : corner + bw * k;
      E.box(B, st.wall, c - 0.17, c + 0.17, pierBottom, wallTop, -0.42, 0, 'ftlr');
    }
  }

  // bays, floor by floor
  for (let f = 0; f < floors.length; f++) {
    const yb = floors[f]!, yt = f + 1 < floors.length ? floors[f + 1]! : wallTop;
    if (yt <= yStart + 0.01) continue;
    if (shopGround && f === 0) continue;
    const ground = f === 0 && plinthTop > 0;
    let sill: number, head: number;
    if (curtain) {
      sill = yb + (ground ? st.groundSill : 0.85); head = f + 1 < floors.length ? yt - 0.12 : Math.min(yt - 0.12, roofY - 0.2);
    } else if (garage) {
      sill = yb + (ground ? 0.2 : st.sill); head = yt - 0.4;
    } else {
      sill = yb + (ground ? st.groundSill : st.sill);
      head = Math.min(ground ? yb + st.groundWinH : sill + st.winH, yt - Math.max(0.35, st.bandH * 0.6 + 0.08));
      if (f === floors.length - 1) head = Math.min(head, roofY - 0.45);
    }
    const partial = yb < yStart;
    for (let k = 0; k < nb; k++) {
      const s0 = corner + bw * (k + 0.5) - winW / 2, s1 = s0 + winW;
      const isDoor = ground && k === doorBay;
      let o0 = sill, o1 = head;
      if (isDoor) { o0 = yb; o1 = Math.min(yb + (st.name === 'rowhouse' ? 2.4 : 2.7), yt - 0.3); }
      if (partial || blank[k] || o1 - o0 < 0.6 || o0 < yStart) { wall(s0, s1, Math.max(yb, yStart), yt); continue; }
      wall(s0, s1, yb, o0);
      wall(s0, s1, o1, yt);
      if (isDoor) {
        const dw = Math.min(winW, st.name === 'rowhouse' ? 1.1 : 2.2);
        const d0 = (s0 + s1) / 2 - dw / 2, d1 = d0 + dw;
        if (d0 > s0 + 0.01) { wall(s0, d0, o0, o1); wall(d1, s1, o0, o1); }
        cutOpening(B, E, st, d0, d1, o0, o1, 'door', true);
        recordDoor(E, (d0 + d1) / 2, yb, dw, o1 - o0, doors);
      } else {
        const shopKind = ground && (st.name === 'storefront' || st.name === 'modern' || st.name === 'loft');
        const detail = st.lintels || st.name === 'rowhouse' ? isFront || (f < 2 && st.name !== 'rowhouse') : f < 3;
        cutOpening(B, E, st, s0, s1, o0, o1, shopKind ? 'shop' : 'window', detail);
      }
    }
  }
}

function recordDoor(E: Edge, s: number, y: number, w: number, h: number, doors: DoorInfo[]): void {
  doors.push({ position: [E.x(s, 0), y, E.z(s, 0)], normal: [E.nx, E.nz], width: w, height: h });
}

/** Recessed opening: 4 reveals + pane (glass / door / dark interior) + optional frame details. */
function cutOpening(B: Batcher, E: Edge, st: FacadeStyle, s0: number, s1: number, y0: number, y1: number, kind: 'window' | 'shop' | 'door', detail: boolean): void {
  const r = kind === 'door' ? Math.max(0.25, Math.min(st.recess, 0.5)) : st.recess;
  const rev = st.reveal;
  // reveals (jambs face along the edge, sill faces up, head faces down)
  B.quad(rev, E.x(s0, 0), y0, E.z(s0, 0), E.x(s0, r), y0, E.z(s0, r), E.x(s0, r), y1, E.z(s0, r), E.x(s0, 0), y1, E.z(s0, 0), E.tx, 0, E.tz);
  B.quad(rev, E.x(s1, 0), y0, E.z(s1, 0), E.x(s1, r), y0, E.z(s1, r), E.x(s1, r), y1, E.z(s1, r), E.x(s1, 0), y1, E.z(s1, 0), -E.tx, 0, -E.tz);
  B.quad(kind === 'door' ? 'concreteDark' : rev, E.x(s0, 0), y0, E.z(s0, 0), E.x(s1, 0), y0, E.z(s1, 0), E.x(s1, r), y0, E.z(s1, r), E.x(s0, r), y0, E.z(s0, r), 0, 1, 0);
  B.quad(rev, E.x(s0, 0), y1, E.z(s0, 0), E.x(s1, 0), y1, E.z(s1, 0), E.x(s1, r), y1, E.z(s1, r), E.x(s0, r), y1, E.z(s0, r), 0, -1, 0);
  // pane
  const doorMat: MaterialName = st.name === 'rowhouse' ? 'wood' : 'glass';
  E.rect(B, kind === 'door' ? doorMat : st.glass, s0, s1, y0, y1, r);
  if (!detail || st.name === 'garage') return;
  // frame strips just in front of the pane
  const fd = r - 0.025, fw = kind === 'shop' || kind === 'door' ? 0.09 : 0.06;
  const fm = st.frame;
  E.rect(B, fm, s0, s0 + fw, y0, y1, fd);
  E.rect(B, fm, s1 - fw, s1, y0, y1, fd);
  E.rect(B, fm, s0 + fw, s1 - fw, y1 - fw, y1, fd);
  E.rect(B, fm, s0 + fw, s1 - fw, y0, y0 + fw, fd);
  const w = s1 - s0;
  const mull = kind === 'door' ? (w > 1.5 ? 1 : 0) : kind === 'shop' ? Math.max(1, Math.round(w / 1.6) - 1) : st.mullions;
  for (let k = 1; k <= mull; k++) {
    const c = s0 + (w * k) / (mull + 1);
    E.rect(B, fm, c - 0.035, c + 0.035, y0 + fw, y1 - fw, fd);
  }
  if ((st.transom && kind === 'window') || kind === 'shop') {
    const ty = kind === 'shop' ? y1 - 0.55 : y0 + (y1 - y0) * 0.52;
    E.rect(B, fm, s0 + fw, s1 - fw, ty - 0.035, ty + 0.035, fd);
  }
  if (st.lintels && kind !== 'shop') {
    E.box(B, 'concrete', s0 - 0.1, s1 + 0.1, y1, y1 + 0.24, -0.05, 0, 'ftb');
    if (kind === 'window') E.box(B, 'concrete', s0 - 0.07, s1 + 0.07, y0 - 0.09, y0, -0.07, 0, 'ft');
  }
}

/** Protruding band around a ring (mitered corners). Edges covered above yb are skipped. */
function ringBand(B: Batcher, m: MaterialName, ring: PlanPoint[], yb: number, yt: number, depth: number, covers: number[], topFace = true): void {
  const off = offsetRing(ring, depth);
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    if (covers[i]! >= yb) continue;
    const a = ring[i]!, b = ring[(i + 1) % n]!, oa = off[i]!, ob = off[(i + 1) % n]!;
    const nn = edgeNormal(a, b);
    const nx = nn[0], nz = -nn[1];
    B.quad(m, oa[0], yb, -oa[1], ob[0], yb, -ob[1], ob[0], yt, -ob[1], oa[0], yt, -oa[1], nx, 0, nz);
    B.quad(m, a[0], yb, -a[1], b[0], yb, -b[1], ob[0], yb, -ob[1], oa[0], yb, -oa[1], 0, -1, 0);
    if (topFace) B.quad(m, a[0], yt, -a[1], b[0], yt, -b[1], ob[0], yt, -ob[1], oa[0], yt, -oa[1], 0, 1, 0);
  }
}

/** Parapet inner faces + coping (top) around a flat roof. */
function parapetRing(B: Batcher, ring: PlanPoint[], roofY: number, top: number, thick: number, covers: number[], selfTop: number): void {
  const inn = offsetRing(ring, -thick);
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    if (covers[i]! >= selfTop - 0.05) continue;
    const a = ring[i]!, b = ring[(i + 1) % n]!, ia = inn[i]!, ib = inn[(i + 1) % n]!;
    const nn = edgeNormal(a, b);
    B.quad('concrete', ia[0], roofY, -ia[1], ib[0], roofY, -ib[1], ib[0], top, -ib[1], ia[0], top, -ia[1], -nn[0], 0, nn[1]);
    B.quad('concrete', a[0], top, -a[1], b[0], top, -b[1], ib[0], top, -ib[1], ia[0], top, -ia[1], 0, 1, 0);
  }
}

/** Gabled / hipped / pyramidal / skillion roof over the oriented bounding box. */
function pitchedRoof(B: Batcher, outer: PlanPoint[], obb: ReturnType<typeof orientedBox>, shape: string, eave: number, ridge: number, gableMat: MaterialName): boolean {
  const area = Math.abs(signedArea(outer));
  if (area / obb.area < 0.8) return false;
  const ov = 0.3;
  const hl = obb.len / 2 + ov, hw = obb.wid / 2 + ov;
  const { cx, cy, ux, uy } = obb;
  const vx = -uy, vy = ux;
  const W = (s: number, t: number): [number, number] => [cx + ux * s + vx * t, -(cy + uy * s + vy * t)];
  const c00 = W(-hl, -hw), c10 = W(hl, -hw), c11 = W(hl, hw), c01 = W(-hl, hw);
  const slope = (ridge - eave) / hw;
  const nUp = (tx: number, ty: number): [number, number, number] => {
    // normal of a plane rising toward the ridge, horizontal outward direction (tx,ty) plan
    const l = Math.hypot(1, slope);
    return [tx / l * slope, 1 / l, -ty / l * slope];
  };
  if (shape === 'pyramidal' || (shape === 'hipped' && obb.len - obb.wid < 0.5)) {
    const ap = W(0, 0);
    const corners = [c00, c10, c11, c01];
    const dirs: [number, number][] = [[-vx, -vy], [ux, uy], [vx, vy], [-ux, -uy]];
    for (let i = 0; i < 4; i++) {
      const p = corners[i]!, q = corners[(i + 1) % 4]!, d = dirs[i]!;
      const nn = nUp(d[0], d[1]);
      B.triangle('roof', p[0], eave, p[1], q[0], eave, q[1], ap[0], ridge, ap[1], nn[0], nn[1], nn[2]);
    }
    return true;
  }
  const inset = shape === 'hipped' ? hw : 0;
  const r0 = W(-hl + inset, 0), r1 = W(hl - inset, 0);
  if (shape === 'skillion') {
    const sk = (ridge - eave) / (2 * hw), lk = Math.hypot(1, sk);
    const lo0 = c00, lo1 = c10;
    const hi0 = W(-hl, hw), hi1 = W(hl, hw);
    B.quad('roof', lo0[0], eave, lo0[1], lo1[0], eave, lo1[1], hi1[0], ridge, hi1[1], hi0[0], ridge, hi0[1], (-vx / lk) * sk, 1 / lk, (vy / lk) * sk);
    const fx = vx, fz = -vy;
    B.quad(gableMat, c01[0], eave, c01[1], c11[0], eave, c11[1], hi1[0], ridge, hi1[1], hi0[0], ridge, hi0[1], fx, 0, fz);
    B.triangle(gableMat, c00[0], eave, c00[1], c01[0], eave, c01[1], hi0[0], ridge, hi0[1], -ux, 0, uy);
    B.triangle(gableMat, c10[0], eave, c10[1], c11[0], eave, c11[1], hi1[0], ridge, hi1[1], ux, 0, -uy);
    return true;
  }
  // gabled / hipped: two long slopes
  const nA = nUp(-vx, -vy), nB = nUp(vx, vy);
  B.quad('roof', c00[0], eave, c00[1], c10[0], eave, c10[1], r1[0], ridge, r1[1], r0[0], ridge, r0[1], nA[0], nA[1], nA[2]);
  B.quad('roof', c01[0], eave, c01[1], c11[0], eave, c11[1], r1[0], ridge, r1[1], r0[0], ridge, r0[1], nB[0], nB[1], nB[2]);
  if (shape === 'hipped') {
    const sl = (ridge - eave) / hw;
    const l = Math.hypot(1, sl);
    B.triangle('roof', c00[0], eave, c00[1], c01[0], eave, c01[1], r0[0], ridge, r0[1], -ux / l * sl, 1 / l, uy / l * sl);
    B.triangle('roof', c10[0], eave, c10[1], c11[0], eave, c11[1], r1[0], ridge, r1[1], ux / l * sl, 1 / l, -uy / l * sl);
  } else {
    // gable end walls (slightly inside the overhang)
    const g = (s: number): void => {
      const a = W(s, -hw + ov), b = W(s, hw - ov), r = W(s, 0);
      const sgn = Math.sign(s);
      B.triangle(gableMat, a[0], eave, a[1], b[0], eave, b[1], r[0], ridge, r[1], ux * sgn, 0, -uy * sgn);
    };
    g(-hl + ov); g(hl - ov);
  }
  return true;
}

/** HVAC units / penthouses on big flat roofs. */
function rooftopUnits(B: Batcher, outer: PlanPoint[], holes: PlanPoint[][], obb: ReturnType<typeof orientedBox>, roofY: number, area: number, rng: Rng): void {
  const count = Math.max(1, Math.min(6, Math.round(area / 1100)));
  const [x0, y0, x1, y1] = [obb.cx - obb.len, obb.cy - obb.len, obb.cx + obb.len, obb.cy + obb.len];
  let placed = 0;
  for (let tries = 0; tries < 40 && placed < count; tries++) {
    const big = placed === 0 && area > 1500;
    const len = big ? rng.range(6, 12) : rng.range(2.2, 6), wid = big ? rng.range(4, 8) : rng.range(1.6, 3.6);
    const h = big ? rng.range(2.6, 4.2) : rng.range(1.2, 2.6);
    const cx = rng.range(x0, x1), cy = rng.range(y0, y1);
    const ok = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].every(([a, b]) => {
      const px = cx + obb.ux * (a! * len / 2) - obb.uy * (b! * wid / 2), py = cy + obb.uy * (a! * len / 2) + obb.ux * (b! * wid / 2);
      return pointInPolygon(px, py, outer, holes) && distToRing(px, py, outer) > 1.5;
    });
    if (!ok) continue;
    B.box(big ? 'concreteDark' : 'metal', cx, -cy, obb.ux, -obb.uy, len, wid, roofY, roofY + h);
    placed++;
  }
}
