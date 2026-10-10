import * as THREE from 'three';
import { FACE, MeshBatch } from './kit/batch';
import { fireMaterial } from './kit/materials';
import { BookFiller, Furnisher, lightPanelGrid, type Pose } from './kit/furniture';
import { interiorLod } from './kit/lod';
import { rng } from './kit/random';
import { inflate, rect, rectsOverlap, type Rect } from './kit/rects';
import { buildWall, evenOpenings } from './kit/walls';
import type { LibraryCtx } from './daleyLibrary';

/**
 * Daley Library furnishing, floor by floor. Layout is data-driven by the bay grid (ctx.zk(k)
 * = column line k, 15 bays north→south; interior column lines at ctx.colX). Everything here is an
 * educated reconstruction – see README "Assumptions" for what to verify against the owner's photos.
 *
 * Floor 1  IDEA Commons (south half): help desk, printers, 144 computers, group tables, café;
 *          lobby + circulation/reserve desk; Circle Reading Room (NE, fireplace); quiet study (NW).
 * Floor 2  group-study rooms (west), stacks, window tables.
 * Floor 3  Special Collections & University Archives (north end), stacks, quiet carrels at windows.
 * Floor 4  open "talking" floor: tables and lounges; a few stacks at the south end.
 */

const PI = Math.PI;
/** Footprints of the 3 spans between the exterior wall and the interior column lines (local x). */
function spans(ctx: LibraryCtx): { x0: number; x1: number; c: number }[] {
  const xs = [-ctx.ix, ...ctx.colX, ctx.ix];
  return xs.slice(0, -1).map((x, i) => {
    const x0 = x + (i === 0 ? 0 : 0.3);
    const x1 = xs[i + 1] - (i + 1 === xs.length - 1 ? 0 : 0.3);
    return { x0, x1, c: (x0 + x1) / 2 };
  });
}

class FloorPlan {
  readonly batch = new MeshBatch();
  readonly books: BookFiller;
  readonly f: Furnisher;
  readonly y: number;
  readonly ceil: number;
  private obstacles: Rect[];
  placed = 0;
  skipped = 0;

  constructor(
    readonly ctx: LibraryCtx,
    readonly i: number,
  ) {
    this.y = ctx.floorY[i];
    this.ceil = ctx.ceilY(i);
    this.books = new BookFiller(rng(1000 + i * 77));
    this.f = new Furnisher(this.batch, ctx.col, this.books);
    this.obstacles = [...ctx.keepOut[i]];
    for (let k = 1; k < 15; k++) for (const x of ctx.colX) this.obstacles.push(inflate(rect(x, x, ctx.zk(k), ctx.zk(k)), 0.3 + 0.12));
  }

  free(r: Rect): boolean {
    const t = 0.01;
    return r.x0 > -this.ctx.ix - t && r.x1 < this.ctx.ix + t && r.z0 > -this.ctx.iz - t && r.z1 < this.ctx.iz + t && !this.obstacles.some((o) => rectsOverlap(o, r));
  }

  /** Reserve an area (walls, rooms) so later furniture avoids it. */
  claim(r: Rect): void {
    this.obstacles.push(r);
  }

  /** Place a piece if its footprint is free. */
  put(r: Rect, fn: () => void): boolean {
    if (!this.free(r)) {
      this.skipped++;
      return false;
    }
    fn();
    this.claim(r);
    this.placed++;
    return true;
  }

  pose(x: number, z: number, rotY = 0): Pose {
    return { x, y: this.y, z, rotY };
  }

  // ---- placement helpers with footprints (rotY multiples of 90°)
  tableGroup(x: number, z: number, w: number, d: number, perSide: number, alongZ = false, ends = false): boolean {
    const ex = (alongZ ? d : w) / 2 + (alongZ ? 0.75 : ends ? 0.75 : 0.1);
    const ez = (alongZ ? w : d) / 2 + (alongZ ? (ends ? 0.75 : 0.1) : 0.75);
    return this.put(rect(x - ex, x + ex, z - ez, z + ez), () => this.f.tableWithChairs(this.pose(x, z, alongZ ? PI / 2 : 0), w, d, perSide, ends));
  }

  stack(x: number, z: number, units: number, fill = 0.88): boolean {
    const L = units * 0.91;
    return this.put(rect(x - L / 2 - 0.05, x + L / 2 + 0.05, z - 0.32, z + 0.32), () => this.f.stackRange(this.pose(x, z), units, fill));
  }

  bench(x: number, z: number, seats: number): boolean {
    const L = seats * 1.35;
    return this.put(rect(x - L / 2, x + L / 2, z - 1.4, z + 1.4), () => this.f.computerBench(this.pose(x, z), seats));
  }

  /** Carrel whose user faces toward `face` ('east' | 'west' | 'north' | 'south'). */
  carrel(x: number, z: number, face: 'east' | 'west' | 'north' | 'south'): boolean {
    const rot = { north: 0, south: PI, east: -PI / 2, west: PI / 2 }[face];
    const alongX = face === 'north' || face === 'south';
    const r = alongX ? rect(x - 0.5, x + 0.5, z - 0.35, z + 0.35) : rect(x - 0.35, x + 0.35, z - 0.5, z + 0.5);
    return this.put(r, () => this.f.carrel(this.pose(x, z, rot)));
  }

  lounge(x: number, z: number): boolean {
    return this.put(rect(x - 1.6, x + 1.6, z - 1.5, z + 1.5), () => {
      this.f.sofa(this.pose(x, z + 1.0, 0), 2.0);
      this.f.armchair(this.pose(x - 1.2, z - 0.4, -PI / 2 + 0.3));
      this.f.armchair(this.pose(x + 1.2, z - 0.4, PI / 2 - 0.3));
      this.f.table(this.pose(x, z - 0.1), 1.0, 0.6, 0.42);
    });
  }

  build(): THREE.Group {
    const g = this.batch.build(`library-floor-${this.i + 1}`, { receiveShadow: true });
    if (this.books.count > 0) g.add(this.books.build(`library-books-${this.i + 1}`));
    return g;
  }
}

export function furnishLibrary(ctx: LibraryCtx): void {
  const floors = ctx.floorY.map((_, i) => new FloorPlan(ctx, i));
  floor1(ctx, floors[0]);
  floor2(ctx, floors[1]);
  floor3(ctx, floors[2]);
  floor4(ctx, floors[3]);

  // ceiling light panels on every floor (part of the structure batch: always drawn with the shell)
  for (let i = 0; i < ctx.floorY.length; i++) {
    const holes = i + 1 < ctx.floorY.length ? [ctx.stairs[i].hole] : [];
    lightPanelGrid(ctx.struct, rect(-ctx.ix + 0.6, ctx.ix - 0.6, -ctx.iz + 0.6, ctx.iz - 0.6), ctx.ceilY(i), [3.6, 3.0], [0.6, 1.2], (x, z) =>
      holes.some((h) => x > h.x0 - 0.8 && x < h.x1 + 0.8 && z > h.z0 - 0.8 && z < h.z1 + 0.8) ||
      (x > ctx.core.x0 && x < ctx.core.x1 + 0.4 && z > ctx.core.z0 - 0.4 && z < ctx.core.z1 + 0.4),
    );
  }

  // per-floor groups with interior LOD (hidden when you are far away / on another floor)
  const groups = floors.map((fp) => fp.build());
  for (const g of groups) ctx.group.add(g);
  interiorLod(
    ctx.world,
    ctx.frame,
    rect(-ctx.hx, ctx.hx, -ctx.hz, ctx.hz),
    groups.map((g, i) => ({ group: g, y0: ctx.floorY[i], y1: i + 1 < ctx.floorY.length ? ctx.floorY[i + 1] : ctx.ceilY(i) + 0.35, outsideDistance: i === 0 ? 70 : 25 })),
  );

  // a few real lights (no shadows). Emissive panels do the visual work; these give local falloff.
  const lights: [number, number, number, number][] = [
    [6, 0, -4, 1], // lobby / circulation desk
    [-4, 0, 34, 1], // IDEA Commons computers
    [12, 0, -28, 0.8], // Circle Reading Room
    [0, 1, 25, 0.8],
    [0, 2, -20, 0.8],
    [0, 3, 0, 0.8],
  ];
  for (const [x, fi, z, k] of lights) {
    const L = new THREE.PointLight(0xfff1dc, 12 * k, 24, 2);
    L.position.set(x, ctx.ceilY(fi) - 1.3, z);
    L.castShadow = false;
    L.name = `library-light-${fi + 1}`;
    ctx.group.add(L);
  }
}

// =====================================================================================================
// FLOOR 1
// =====================================================================================================
function floor1(ctx: LibraryCtx, fp: FloorPlan): void {
  const { zk, ix, iz } = ctx;
  const y = fp.y;
  const top = fp.ceil;
  const f = fp.f;
  const b = fp.batch;
  const col = ctx.col;
  const [W, M, E] = spans(ctx);

  // --- staff offices: north end two bays behind a wall with (closed) office doors
  const zStaff = zk(2);
  buildWall(ctx.struct, col, { a: [-ix, zStaff], b: [ix, zStaff], y0: y, y1: top, thickness: 0.15, mat: 'interiorWall' });
  for (const x of [-12, -2, 8]) {
    b.box('wood', x, y + 1.05, zStaff + 0.09, 1.0, 2.1, 0.04);
    b.box('metal', x + 0.38, y + 1.0, zStaff + 0.12, 0.12, 0.03, 0.04);
  }
  fp.claim(rect(-ix, ix, -iz, zStaff + 0.4));

  // --- Circle Reading Room (NE quadrant, behind the reserve desk): fireplace, armchairs, tables
  const rr = rect(4.6, ix, zk(3), -17.6);
  buildWall(ctx.struct, col, { a: [rr.x0, rr.z0], b: [rr.x1, rr.z0], y0: y, y1: top, thickness: 0.15, mat: 'interiorWall' });
  buildWall(ctx.struct, col, {
    a: [rr.x0, rr.z1], b: [rr.x0, rr.z0], y0: y, y1: top, thickness: 0.15, mat: 'interiorWall',
    openings: evenOpenings(1.0, rr.z1 - rr.z0 - 1.0, 4, 2.6, y + 0.9, y + 2.6, { glass: 'glassClear', frame: 'windowFrame' }).filter((o) => Math.abs(o.at - (rr.z1 - rr.z0) / 2) > 3),
  });
  buildWall(ctx.struct, col, {
    a: [rr.x1, rr.z1], b: [rr.x0, rr.z1], y0: y, y1: top, thickness: 0.15, mat: 'interiorWall',
    openings: [
      { at: ix - 8.6, width: 1.8, bottom: y, top: y + 2.4, door: true },
      { at: 3.6, width: 4.5, bottom: y + 0.9, top: y + 2.6, glass: 'glassClear', frame: 'windowFrame' },
    ],
  });
  fp.claim(inflate(rect(rr.x0, rr.x1, rr.z0, rr.z0), 0.2));
  fp.claim(inflate(rect(rr.x0, rr.x0, rr.z0, rr.z1), 0.2));
  fp.claim(rect(rr.x0, rr.x1 - 9.5, rr.z1 - 0.2, rr.z1 + 0.2));
  fp.claim(rect(rr.x1 - 7.7, rr.x1, rr.z1 - 0.2, rr.z1 + 0.2));
  // fireplace on the west wall of the room, centred
  const fz = (rr.z0 + rr.z1) / 2;
  b.boxMinMax('brick', rr.x0 + 0.07, y, fz - 1.4, rr.x0 + 0.75, y + 2.4, fz + 1.4);
  b.boxMinMax('concreteDark', rr.x0 + 0.75, y, fz - 1.6, rr.x0 + 1.25, y + 0.25, fz + 1.6);
  b.boxMinMax(fireMaterial(), rr.x0 + 0.74, y + 0.3, fz - 0.6, rr.x0 + 0.76, y + 0.95, fz + 0.6, FACE.PX);
  b.boxMinMax('brick', rr.x0 + 0.07, y + 2.4, fz - 0.8, rr.x0 + 0.6, top, fz + 0.8);
  col.boxMinMax(rr.x0, y, fz - 1.6, rr.x0 + 1.25, y + 2.4, fz + 1.6, 'furniture');
  fp.claim(rect(rr.x0, rr.x0 + 1.3, fz - 1.6, fz + 1.6));
  // armchairs in a semicircle facing the fire
  for (let a = -2; a <= 2; a++) {
    const ang = (a / 2) * 0.9;
    const x = rr.x0 + 4.0 - Math.cos(ang) * 0.6;
    const z = fz + Math.sin(ang) * 2.6;
    fp.put(rect(x - 0.45, x + 0.45, z - 0.45, z + 0.45), () => f.armchair(fp.pose(x, z, PI / 2 - ang)));
  }
  fp.put(rect(rr.x0 + 2.2, rr.x0 + 3.0, fz - 0.6, fz + 0.6), () => f.table(fp.pose(rr.x0 + 2.6, fz), 0.7, 1.1, 0.42));
  // long reading tables
  for (const z of [rr.z0 + 3.5, rr.z0 + 8.0, rr.z1 - 3.6]) fp.tableGroup(14.6, z, 3.6, 1.1, 3, false);
  for (const z of [rr.z0 + 1.0]) fp.put(rect(rr.x0 + 1, rr.x1 - 0.2, z - 0.4, z + 0.3), () => f.bookcase(fp.pose((rr.x0 + 1 + rr.x1) / 2, z, 0), 15, 2.0));

  // --- circulation / reserve desk facing the lobby
  const dz = -15.2;
  fp.put(rect(4.8, 12.6, dz - 1.6, dz + 0.5), () => {
    f.counter(fp.pose(8.7, dz, 0), 7.6, 0.75);
    for (const x of [6.2, 8.7, 11.2]) {
      f.chair(fp.pose(x, dz - 1.0, PI));
      f.part(fp.pose(x, dz - 0.15, 0), 'screen', 0, 1.27, 0, 0.5, 0.3, 0.02, FACE.PZ);
      f.part(fp.pose(x, dz - 0.17, 0), 'windowFrame', 0, 1.27, 0, 0.52, 0.32, 0.03);
    }
  });
  // self-checkout kiosks + new books display
  for (const x of [1.6, 3.0]) fp.put(rect(x - 0.4, x + 0.4, -13.8, -13.0), () => {
    f.part(fp.pose(x, -13.4), 'metal', 0, 0.55, 0, 0.5, 1.1, 0.4);
    f.part(fp.pose(x, -13.4), 'screen', 0, 1.25, 0.12, 0.42, 0.32, 0.03, FACE.PZ);
  });
  fp.put(rect(-9.2, -2.8, -16.8, -15.8), () => f.bookcase(fp.pose(-6, -16.3, 0), 6, 1.4));
  // benches in the lobby
  for (const x of [-8.5, -2.5]) fp.put(rect(x - 1.1, x + 1.1, -2.3, -1.4), () => f.sofa(fp.pose(x, -1.9, 0), 2.0));
  fp.put(rect(13.5, 14.5, 3.0, 4.0), () => f.plant(fp.pose(14, 3.5)));
  fp.put(rect(13.5, 14.5, -4.0, -3.0), () => f.plant(fp.pose(14, -3.5)));

  // --- NW quiet study (between the staff wall and the core)
  for (const sp of [W, M])
    for (let k = 2; k < 6; k++)
      for (const dzz of [2.4, 6.4]) fp.tableGroup(sp.c, zk(k) + dzz, 3.2, 1.1, 3);
  // NW: a run of bookcases (new books / browsing collection) against the west wall below the windows
  // (low cases, windows have a 0.9 m sill)
  for (let k = 2; k < 6; k++) fp.put(rect(-ix, -ix + 0.4, zk(k) + 0.6, zk(k + 1) - 0.6), () => f.bookcase(fp.pose(-ix + 0.18, (zk(k) + zk(k + 1)) / 2, PI / 2), 8, 0.85));

  // --- IDEA Commons ---------------------------------------------------------------------------
  // help / support desk + printing
  fp.put(rect(0.6, 7.2, 14.4, 16.6), () => {
    f.counter(fp.pose(3.9, 15.0, 0), 6.0, 0.8);
    for (const x of [2.2, 5.6]) {
      f.chair(fp.pose(x, 15.9, 0));
      f.part(fp.pose(x, 15.15), 'screen', 0, 1.27, 0, 0.5, 0.3, 0.02, FACE.PZ);
      f.part(fp.pose(x, 15.13), 'windowFrame', 0, 1.27, 0, 0.52, 0.32, 0.03);
    }
  });
  b.box('metal', 3.9, top - 0.6, 15.0, 3.0, 0.5, 0.06); // "Help" sign blade
  for (const x of [-8.3, -7.1, -5.9, -4.7]) fp.put(rect(x - 0.4, x + 0.4, 17.4, 18.2), () => f.printer(fp.pose(x, 17.8)));
  // 144 computers: two double-sided benches per bay in the west and middle spans, bays 10-12
  for (const sp of [W, M]) for (let k = 10; k <= 12; k++) for (const dzz of [2.25, 6.55]) fp.bench(sp.c, zk(k) + dzz, 6);
  // group tables in the east span (bays 9-13)
  for (let k = 9; k <= 13; k++) for (const dzz of [2.3, 6.5]) fp.tableGroup(E.c - 1.3, zk(k) + dzz, 2.4, 1.0, 3);
  // café (bay 11, against the east glass, near the IDEA Commons doors)
  const cz = zk(11);
  fp.put(rect(11.0, ix - 0.2, cz + 0.6, cz + 7.6), () => {
    f.counter(fp.pose(13.2, cz + 4.0, PI / 2), 6.0, 0.8, 1.05, 'wood', 'concreteDark');
    f.counter(fp.pose(ix - 0.45, cz + 4.0, PI / 2), 6.0, 0.6, 0.92, 'interiorWall', 'concreteDark');
    // espresso machines, grinders, fridge, menu boards
    for (const dz2 of [-1.8, -0.6, 0.6]) f.part(fp.pose(ix - 0.45, cz + 4.0 + dz2), 'metal', 0, 1.15, 0, 0.45, 0.45, 0.6);
    f.part(fp.pose(ix - 0.45, cz + 6.5), 'metal', 0, 1.0, 0, 0.6, 2.0, 0.9);
    f.part(fp.pose(ix - 0.1, cz + 4.0), 'screen', 0, 2.8, 0, 0.04, 0.8, 4.0, FACE.NX);
    f.displayCase(fp.pose(13.2, cz + 1.2, PI / 2), 1.4, 0.7);
    f.part(fp.pose(13.2, cz + 5.6), 'metal', 0, 1.2, 0, 0.35, 0.3, 0.4); // register
  });
  // café seating: high bar along the glass and small round tables
  for (const z0 of [zk(9) + 1.0, zk(12) + 1.0]) {
    fp.put(rect(ix - 1.4, ix - 0.05, z0, z0 + 6.8), () => {
      f.counter(fp.pose(ix - 0.35, z0 + 3.4, PI / 2), 6.8, 0.45, 1.05, 'wood', 'wood');
      for (let i = 0; i < 6; i++) f.stool(fp.pose(ix - 0.95, z0 + 0.6 + i * 1.12));
    });
  }
  for (const [x, z] of [[11.5, zk(12) + 2.0], [11.5, zk(12) + 5.5], [15.0, zk(10) + 7.6], [11.8, zk(10) + 7.6]] as const)
    fp.put(rect(x - 1.0, x + 1.0, z - 1.0, z + 1.0), () => f.roundTable(fp.pose(x, z), 0.45, 3));
  // lounge (bay 13, west/middle) and media lab (bay 14) behind a glass partition
  for (const sp of [W, M]) for (const dzz of [2.4, 6.2]) fp.lounge(sp.c, zk(13) + dzz);
  const ml = zk(14) + 0.8;
  buildWall(ctx.struct, col, {
    a: [-ix, ml], b: [5.0, ml], y0: y, y1: top, thickness: 0.12, mat: 'windowFrame',
    openings: [
      ...evenOpenings(0.2, 14.0, 7, 1.85, y + 0.1, y + 2.9, { glass: 'glassClear' }),
      { at: 15.5, width: 1.6, bottom: y, top: y + 2.4, door: true },
      ...evenOpenings(16.5, 24.1, 4, 1.75, y + 0.1, y + 2.9, { glass: 'glassClear' }),
    ],
  });
  buildWall(ctx.struct, col, { a: [5.0, ml], b: [5.0, iz], y0: y, y1: top, thickness: 0.12, mat: 'interiorWall' });
  fp.claim(rect(-ix, 5.2, ml - 0.3, ml + 0.3));
  fp.claim(rect(4.8, 5.2, ml, iz));
  for (const z of [ml + 1.6, ml + 4.4]) for (const sp of [W, M]) fp.bench(sp.c, z, 5);
  // east of the media lab: comfy seating by the windows
  for (const z of [zk(14) + 3, zk(14) + 6.5]) fp.lounge(E.c + 2, z);
}

// =====================================================================================================
// FLOOR 2: group study rooms, stacks, window tables
// =====================================================================================================
function floor2(ctx: LibraryCtx, fp: FloorPlan): void {
  const { zk, ix, iz } = ctx;
  const y = fp.y;
  const top = fp.ceil;
  const f = fp.f;
  const [W, M, E] = spans(ctx);

  // group-study rooms along the west wall, bays 2-5 (8 rooms), glass fronts with open doorways
  const rx = -12.4;
  const rz0 = zk(2);
  const rz1 = ctx.core.z0 - 0.2;
  const n = 7;
  const rw = (rz1 - rz0) / n;
  buildWall(ctx.struct, ctx.col, {
    a: [rx, rz0], b: [rx, rz1], y0: y, y1: top, thickness: 0.12, mat: 'windowFrame',
    openings: Array.from({ length: n }, (_, i) => [
      { at: rw * i + 0.9, width: 1.2, bottom: y, top: y + 2.4, door: true },
      { at: rw * i + rw / 2 + 0.9, width: rw - 2.4, bottom: y + 0.1, top: y + 2.9, glass: 'glassClear' as const },
    ]).flat(),
  });
  for (let i = 0; i <= n; i++) {
    const z = rz0 + i * rw;
    buildWall(ctx.struct, ctx.col, { a: [-ix, z], b: [rx, z], y0: y, y1: top, thickness: 0.12, mat: 'interiorWall' });
  }
  fp.claim(rect(-ix, rx + 0.3, rz0 - 0.2, rz1 + 0.2));
  for (let i = 0; i < n; i++) {
    const z = rz0 + rw * (i + 0.5);
    f.tableWithChairs(fp.pose(-15.6, z, PI / 2), 2.2, 1.0, 3);
  }

  // stacks: west + middle spans, bays 9-12, four 6-unit ranges per bay
  for (const sp of [W, M]) for (let k = 9; k <= 12; k++) for (let r = 0; r < 4; r++) fp.stack(sp.c, zk(k) + 1.25 + r * 2.1, 6);
  // reference shelving along the north side of the stacks
  for (const sp of [W, M]) fp.put(rect(sp.c - 3.5, sp.c + 3.5, zk(13) + 0.5, zk(13) + 0.9), () => f.bookcase(fp.pose(sp.c, zk(13) + 0.7, PI), 7, 1.6));

  // window tables in the east span (all bays), quiet armchairs between
  for (let k = 1; k < 14; k++) for (const dzz of [2.3, 6.5]) fp.tableGroup(E.c + 2.6, zk(k) + dzz, 1.6, 1.0, 2, false);
  for (let k = 1; k < 14; k++) for (const dzz of [2.3, 6.5]) fp.tableGroup(E.c - 2.4, zk(k) + dzz, 1.6, 1.0, 2, false);
  // north end: open group tables + periodicals
  for (const sp of [W, M]) for (const k of [0, 1]) for (const dzz of [2.4, 6.4]) fp.tableGroup(sp.c, zk(k) + dzz, 3.2, 1.1, 3);
  fp.put(rect(-ix + 0.5, ix - 0.5, -iz, -iz + 0.45), () => f.bookcase(fp.pose(0, -iz + 0.2, 0), 40, 1.8));
  // middle span near the stairs: tables; south end lounges
  for (let k = 2; k <= 7; k++) for (const dzz of [2.4, 6.4]) fp.tableGroup(M.c, zk(k) + dzz, 3.2, 1.1, 3);
  for (const sp of [W, M]) for (const k of [13, 14]) for (const dzz of [2.6, 6.2]) fp.lounge(sp.c, zk(k) + dzz);
}

// =====================================================================================================
// FLOOR 3: Special Collections (north), stacks, carrels
// =====================================================================================================
function floor3(ctx: LibraryCtx, fp: FloorPlan): void {
  const { zk, ix, iz } = ctx;
  const y = fp.y;
  const top = fp.ceil;
  const f = fp.f;
  const b = fp.batch;
  const [W, M, E] = spans(ctx);

  // Special Collections & University Archives: north end (bays 0-2), glass wall with an entrance
  const sz = zk(3) - 0.5;
  buildWall(ctx.struct, ctx.col, {
    a: [-ix, sz], b: [ix, sz], y0: y, y1: top, thickness: 0.12, mat: 'windowFrame',
    openings: [
      ...evenOpenings(0.3, ix + 1.3, 9, 1.9, y + 0.1, y + 2.9, { glass: 'glassClear' }),
      { at: ix + 2.5, width: 1.8, bottom: y, top: y + 2.4, door: true },
      ...evenOpenings(ix + 3.7, 2 * ix - 0.3, 7, 1.9, y + 0.1, y + 2.9, { glass: 'glassClear' }),
    ],
  });
  fp.claim(rect(-ix, ix, sz - 0.3, sz + 0.3));
  b.box('metal', 2.5, y + 2.75, sz + 0.08, 2.4, 0.3, 0.02); // name plate above the door
  // closed stacks (single-faced cases) along the north wall and archive ranges
  fp.put(rect(-ix + 0.3, ix - 0.3, -iz, -iz + 0.45), () => f.bookcase(fp.pose(0, -iz + 0.2, 0), 40, 2.2));
  for (const sp of [W, M]) for (let r = 0; r < 3; r++) fp.stack(sp.c, zk(0) + 2.4 + r * 2.2, 7, 0.95);
  // reading room tables (staff-mediated) and display cases
  for (const k of [1, 2]) for (const dzz of [2.6, 6.2]) fp.tableGroup(M.c, zk(k) + dzz, 3.2, 1.2, 3);
  for (const k of [1, 2]) for (const dzz of [2.6, 6.2]) fp.tableGroup(E.c, zk(k) + dzz, 3.2, 1.2, 3);
  for (let i = 0; i < 5; i++) fp.put(rect(-17.4 + i * 3.0 - 0.9, -17.4 + i * 3.0 + 0.9, zk(2) + 5.6, zk(2) + 6.6), () => f.displayCase(fp.pose(-17.4 + i * 3.0, zk(2) + 6.1)));
  fp.put(rect(11, 16, zk(2) + 1.0, zk(2) + 2.2), () => f.counter(fp.pose(13.5, zk(2) + 1.6, PI), 4.6, 0.75));

  // general stacks: bays 9-10 in west + middle spans
  for (const sp of [W, M]) for (let k = 9; k <= 10; k++) for (let r = 0; r < 4; r++) fp.stack(sp.c, zk(k) + 1.25 + r * 2.1, 6);
  // quiet carrels along the east and west windows (users face the windows)
  for (let k = 3; k < 15; k++)
    for (let j = 0; j < 7; j++) {
      const z = zk(k) + 0.8 + j * 1.15;
      fp.carrel(ix - 0.4, z, 'east');
      if (k >= 12) fp.carrel(-ix + 0.4, z, 'west');
    }
  // quiet tables in the remaining middle bays
  for (const sp of [W, M, E]) for (let k = 3; k <= 13; k++) for (const dzz of [2.4, 6.4]) fp.tableGroup(sp.c - (sp === E ? 1.0 : 0), zk(k) + dzz, 2.4, 1.0, 2);
}

// =====================================================================================================
// FLOOR 4: open "talking" floor
// =====================================================================================================
function floor4(ctx: LibraryCtx, fp: FloorPlan): void {
  const { zk } = ctx;
  const [W, M, E] = spans(ctx);
  // stacks at the south end (bay 13)
  for (const sp of [W, M]) for (let k = 13; k <= 13; k++) for (let r = 0; r < 4; r++) fp.stack(sp.c, zk(k) + 1.25 + r * 2.1, 6, 0.8);
  // big shared tables everywhere else, lounges by the east windows
  for (const sp of [W, M]) for (let k = 0; k <= 11; k++) for (const dzz of [2.4, 6.4]) fp.tableGroup(sp.c, zk(k) + dzz, 3.2, 1.1, 3, false, true);
  for (let k = 0; k < 15; k++) {
    fp.lounge(E.c + 1.8, zk(k) + 2.4);
    fp.tableGroup(E.c - 1.6, zk(k) + 6.4, 2.4, 1.0, 2);
  }
  for (const k of [14]) for (const sp of [W, M]) for (const dzz of [2.6, 6.2]) fp.lounge(sp.c, zk(k) + dzz);
}
