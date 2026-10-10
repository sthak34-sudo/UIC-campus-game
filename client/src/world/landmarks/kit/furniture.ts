import * as THREE from 'three';
import { FACE, MeshBatch, type MatKey } from './batch';
import type { ColliderSet } from './colliders';
import { booksMaterial, lightPanelMaterial } from './materials';
import { pick } from './random';
import type { Rect } from './rects';

/**
 * Furniture kit. Every piece is a handful of boxes merged into the building's MeshBatch (so the whole
 * interior costs ~1 draw call per material) plus at most ONE simple collider box. Books are the only
 * thing drawn with instancing (InstancedMesh + per-instance colors) because there are tens of thousands.
 *
 * Convention: a Pose is the piece's floor-center; rotY = 0 means the user of the piece faces -z
 * (a chair's back is at +z, a desk's user sits at +z).
 */
export interface Pose {
  x: number;
  y: number;
  z: number;
  rotY?: number;
}

/** Dimensions (m) shared by the kit; tweak here, not in the pieces. */
export const FURN = {
  deskH: 0.74,
  seatH: 0.46,
  stationW: 1.35,
  stationD: 0.75,
  shelfUnit: 0.91, // 36" library shelving section
  shelfDepth: 0.6, // double-faced range
  shelfH: 2.1,
  shelves: 6,
};

/** Library binding colors (sRGB). */
const BOOK_COLORS = [
  0x7a1f1f, 0x8e2b23, 0x5c1a2a, 0x1f2f5a, 0x24406e, 0x2d4a3a, 0x355e3b, 0x1d1d1d, 0x3b3330, 0x6b4a2b, 0x8a6a3c,
  0xb59a6a, 0xd8cfb8, 0xe6e0d0, 0x4a4f56, 0x6f7a80, 0x9c3d1b, 0x6d6a2a, 0x2a5a66, 0x553366, 0xa38b5a, 0x203030,
] as const;

export class BookFiller {
  private mats: THREE.Matrix4[] = [];
  private colors: THREE.Color[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  constructor(private rand: () => number) {}

  get count(): number {
    return this.mats.length;
  }

  add(x: number, y: number, z: number, rotY: number, w: number, h: number, d: number, tilt = 0): void {
    this.e.set(0, rotY, tilt, 'YXZ');
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.set(w, h, d);
    this.mats.push(this.m.clone().compose(this.p, this.q, this.s));
    const c = new THREE.Color(pick(this.rand, BOOK_COLORS));
    c.offsetHSL(0, (this.rand() - 0.5) * 0.1, (this.rand() - 0.5) * 0.08);
    this.colors.push(c);
  }

  /** Fill a shelf run with upright books whose spines face rotY's local +z. */
  fillRun(f: Furnisher, pose: Pose, x0: number, x1: number, y: number, zFront: number, maxH: number, fill = 0.92): void {
    let x = x0 + 0.01;
    const r = pose.rotY ?? 0;
    while (x < x1 - 0.02) {
      const w = 0.022 + this.rand() * 0.038;
      if (x + w > x1 - 0.01) break;
      if (this.rand() > fill) {
        x += 0.04 + this.rand() * 0.12; // a gap on the shelf
        continue;
      }
      const h = Math.min(maxH, 0.17 + this.rand() * 0.14);
      const d = 0.15 + this.rand() * 0.09;
      const lx = x + w / 2;
      const lz = zFront - d / 2;
      const [wx, wz] = f.toWorld(pose, lx, lz);
      this.add(wx, pose.y + y + h / 2, wz, r, w, h, d);
      x += w + 0.002;
    }
  }

  build(name = 'books'): THREE.InstancedMesh {
    const b = new MeshBatch();
    b.box('bookshelf', 0, 0, 0, 1, 1, 1, { faces: FACE.PZ | FACE.PY });
    const geo = (b.build('book').children[0] as THREE.Mesh).geometry;
    const mesh = new THREE.InstancedMesh(geo, booksMaterial(), Math.max(1, this.mats.length));
    mesh.name = name;
    this.mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    this.colors.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.count = this.mats.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    return mesh;
  }
}

export class Furnisher {
  constructor(
    readonly batch: MeshBatch,
    readonly col: ColliderSet | null,
    readonly books: BookFiller | null = null,
  ) {}

  toWorld(p: Pose, lx: number, lz: number): [number, number] {
    const r = p.rotY ?? 0;
    const c = Math.cos(r);
    const s = Math.sin(r);
    return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
  }

  /** Child pose at local offset (lx, lz) with extra yaw. */
  at(p: Pose, lx: number, lz: number, rot = 0, ly = 0): Pose {
    const [x, z] = this.toWorld(p, lx, lz);
    return { x, y: p.y + ly, z, rotY: (p.rotY ?? 0) + rot };
  }

  part(p: Pose, mat: MatKey, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, faces?: number): void {
    const [x, z] = this.toWorld(p, lx, lz);
    this.batch.box(mat, x, p.y + ly, z, sx, sy, sz, { rotY: p.rotY ?? 0, faces });
  }

  solid(p: Pose, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number): void {
    if (!this.col) return;
    const [x, z] = this.toWorld(p, lx, lz);
    this.col.box(x, p.y + ly, z, sx, sy, sz, 'furniture', { rotY: p.rotY ?? 0 });
  }

  // ---------------------------------------------------------------- seating
  /** Task chair (user faces -z). No collider: chairs are pushed around in real life. */
  chair(p: Pose, fabric: MatKey = 'fabric'): void {
    const sh = FURN.seatH;
    this.part(p, fabric, 0, sh, 0, 0.46, 0.07, 0.44);
    this.part(p, fabric, 0, sh + 0.3, 0.2, 0.44, 0.42, 0.06);
    this.part(p, 'metal', 0, sh / 2, 0, 0.05, sh - 0.04, 0.05);
    this.part(p, 'metal', 0, 0.03, 0, 0.52, 0.04, 0.08);
    this.part(p, 'metal', 0, 0.03, 0, 0.08, 0.04, 0.52);
  }

  /** Lounge armchair (user faces -z). */
  armchair(p: Pose, fabric: MatKey = 'fabric'): void {
    this.part(p, fabric, 0, 0.22, 0, 0.8, 0.44, 0.8);
    this.part(p, fabric, 0, 0.62, 0.32, 0.8, 0.4, 0.16);
    this.part(p, fabric, -0.34, 0.52, 0, 0.12, 0.2, 0.8);
    this.part(p, fabric, 0.34, 0.52, 0, 0.12, 0.2, 0.8);
    this.solid(p, 0, 0.4, 0, 0.8, 0.8, 0.8);
  }

  sofa(p: Pose, w: number, fabric: MatKey = 'fabric'): void {
    this.part(p, fabric, 0, 0.22, 0, w, 0.44, 0.85);
    this.part(p, fabric, 0, 0.62, 0.34, w, 0.42, 0.17);
    this.part(p, fabric, -w / 2 + 0.07, 0.52, 0, 0.14, 0.2, 0.85);
    this.part(p, fabric, w / 2 - 0.07, 0.52, 0, 0.14, 0.2, 0.85);
    this.solid(p, 0, 0.4, 0, w, 0.8, 0.85);
  }

  stool(p: Pose): void {
    this.part(p, 'fabric', 0, 0.76, 0, 0.36, 0.06, 0.36);
    this.part(p, 'metal', 0, 0.38, 0, 0.05, 0.74, 0.05);
    this.part(p, 'metal', 0, 0.02, 0, 0.4, 0.03, 0.4);
  }

  // ---------------------------------------------------------------- tables & desks
  table(p: Pose, w: number, d: number, h = FURN.deskH, top: MatKey = 'wood'): void {
    this.part(p, top, 0, h - 0.02, 0, w, 0.04, d);
    const lx = w / 2 - 0.06;
    const lz = d / 2 - 0.06;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.part(p, 'metal', sx * lx, (h - 0.04) / 2, sz * lz, 0.05, h - 0.04, 0.05);
    this.solid(p, 0, h / 2, 0, w, h, d);
  }

  /** Rectangular table with chairs on the long sides (and optionally the ends). */
  tableWithChairs(p: Pose, w: number, d: number, perSide: number, ends = false): void {
    this.table(p, w, d);
    const step = w / perSide;
    for (let i = 0; i < perSide; i++) {
      const lx = -w / 2 + step * (i + 0.5);
      this.chair(this.at(p, lx, d / 2 + 0.3, 0));
      this.chair(this.at(p, lx, -d / 2 - 0.3, Math.PI));
    }
    if (ends) {
      this.chair(this.at(p, w / 2 + 0.3, 0, Math.PI / 2));
      this.chair(this.at(p, -w / 2 - 0.3, 0, -Math.PI / 2));
    }
  }

  roundTable(p: Pose, r: number, chairs: number, h = FURN.deskH): void {
    const geo = new THREE.CylinderGeometry(r, r, 0.04, 20);
    const m = new THREE.Matrix4().makeTranslation(p.x, p.y + h - 0.02, p.z);
    this.batch.geometry('wood', geo, m);
    this.part(p, 'metal', 0, (h - 0.04) / 2, 0, 0.08, h - 0.04, 0.08);
    this.part(p, 'metal', 0, 0.02, 0, 0.6, 0.03, 0.6);
    for (let i = 0; i < chairs; i++) {
      const a = (i / chairs) * Math.PI * 2;
      const lx = Math.sin(a) * (r + 0.32);
      const lz = Math.cos(a) * (r + 0.32);
      this.chair(this.at(p, lx, lz, a));
    }
    this.solid(p, 0, h / 2, 0, r * 1.6, h, r * 1.6);
  }

  /** One computer workstation: user sits at +z facing the monitor at -z. */
  computerStation(p: Pose, w = FURN.stationW): void {
    const d = FURN.stationD;
    const h = FURN.deskH;
    this.part(p, 'wood', 0, h - 0.015, 0, w, 0.03, d);
    // monitor: thin 'screen' panel with a dark shell behind it
    const sy = h + 0.12 + 0.17;
    this.part(p, 'screen', 0, sy, -0.12, 0.56, 0.33, 0.012, FACE.PZ);
    this.part(p, 'windowFrame', 0, sy, -0.14, 0.58, 0.35, 0.03);
    this.part(p, 'windowFrame', 0, h + 0.07, -0.16, 0.05, 0.14, 0.04);
    this.part(p, 'windowFrame', 0, h + 0.01, -0.15, 0.22, 0.015, 0.16);
    // keyboard + PC tower under the desk
    this.part(p, 'windowFrame', 0, h + 0.012, 0.12, 0.44, 0.015, 0.14);
    this.part(p, 'windowFrame', w / 2 - 0.2, 0.22, -0.1, 0.18, 0.42, 0.42);
    this.chair(this.at(p, 0, d / 2 + 0.28, 0));
  }

  /** Double-sided computer bench with `seats` stations per side along local x. */
  computerBench(p: Pose, seats: number, sides: 1 | 2 = 2): void {
    const w = FURN.stationW;
    const L = seats * w;
    const d = FURN.stationD;
    for (const side of sides === 2 ? [1, -1] : [1]) {
      const sp = this.at(p, 0, (side * d) / 2, side === 1 ? 0 : Math.PI);
      for (let i = 0; i < seats; i++) this.computerStation(this.at(sp, -L / 2 + w * (i + 0.5), 0));
    }
    // legs / end panels and a low fabric privacy divider down the middle
    for (const ex of [-L / 2 + 0.02, L / 2 - 0.02]) this.part(p, 'metal', ex, FURN.deskH / 2, sides === 2 ? 0 : d / 2, 0.04, FURN.deskH, sides * d - 0.05);
    if (sides === 2) this.part(p, 'fabric', 0, FURN.deskH + 0.22, 0, L, 0.44, 0.04);
    this.solid(p, 0, FURN.deskH / 2, sides === 2 ? 0 : d / 2, L, FURN.deskH, sides * d);
  }

  /** Study carrel (user faces -z): desk with tall side and front panels + chair. */
  carrel(p: Pose, w = 0.95): void {
    const d = 0.6;
    const h = FURN.deskH;
    this.part(p, 'wood', 0, h - 0.015, 0, w, 0.03, d);
    this.part(p, 'wood', -w / 2 + 0.015, 0.65, 0, 0.03, 1.3, d);
    this.part(p, 'wood', w / 2 - 0.015, 0.65, 0, 0.03, 1.3, d);
    this.part(p, 'wood', 0, h + 0.28, -d / 2 + 0.015, w, 0.56, 0.03);
    this.part(p, 'wood', 0, h + 0.4, -d / 2 + 0.12, w - 0.06, 0.02, 0.2); // small shelf
    this.chair(this.at(p, 0, d / 2 + 0.25, 0));
    this.solid(p, 0, 0.65, 0, w, 1.3, d);
  }

  // ---------------------------------------------------------------- service
  counter(p: Pose, w: number, d: number, h = 1.05, front: MatKey = 'wood', top: MatKey = 'concreteDark'): void {
    this.part(p, front, 0, (h - 0.04) / 2, 0, w, h - 0.04, d);
    this.part(p, top, 0, h - 0.02, 0, w + 0.06, 0.04, d + 0.06);
    this.solid(p, 0, h / 2, 0, w, h, d);
  }

  /** Display case (Special Collections): wooden base with a glass vitrine. */
  displayCase(p: Pose, w = 1.6, d = 0.8): void {
    this.part(p, 'wood', 0, 0.45, 0, w, 0.9, d);
    this.part(p, 'glass', 0, 1.1, 0, w - 0.04, 0.4, d - 0.04);
    this.part(p, 'metal', 0, 1.31, 0, w, 0.02, d);
    this.solid(p, 0, 0.66, 0, w, 1.32, d);
  }

  /** Wall-mounted or free-standing single-faced bookcase against a wall (books face -z... local +z). */
  bookcase(p: Pose, units: number, h = 2.0): void {
    const L = units * FURN.shelfUnit;
    const d = 0.32;
    const levels = Math.max(3, Math.round((h - 0.15) / 0.33));
    const sp = (h - 0.12) / levels;
    this.part(p, 'bookshelf', 0, h / 2, -d / 2 + 0.01, L, h, 0.02);
    for (const ex of [-L / 2, L / 2]) this.part(p, 'bookshelf', ex, h / 2, 0, 0.03, h, d);
    for (let k = 0; k <= levels; k++) this.part(p, 'bookshelf', 0, 0.1 + k * sp, 0, L, 0.02, d);
    this.part(p, 'bookshelf', 0, 0.05, 0, L, 0.1, d);
    if (this.books) for (let k = 0; k < levels; k++) this.books.fillRun(this, p, -L / 2 + 0.02, L / 2 - 0.02, 0.11 + k * sp, d / 2 - 0.01, sp - 0.04);
    this.solid(p, 0, h / 2, 0, L, h, d);
  }

  /**
   * Double-faced library stack range along local x: `units` sections of 0.91 m, 6 shelves per face,
   * filled with instanced books on both faces.
   */
  stackRange(p: Pose, units: number, fill = 0.9): void {
    const L = units * FURN.shelfUnit;
    const D = FURN.shelfDepth;
    const H = FURN.shelfH;
    const n = FURN.shelves;
    const sp = (H - 0.14) / n;
    this.part(p, 'bookshelf', 0, H / 2, 0, L, H, 0.02); // center back panel
    this.part(p, 'bookshelf', 0, 0.05, 0, L, 0.1, D - 0.02); // kick plinth
    this.part(p, 'bookshelf', 0, H - 0.01, 0, L + 0.02, 0.02, D); // top cap
    for (let u = 0; u <= units; u++) {
      const x = -L / 2 + u * FURN.shelfUnit;
      const endPanel = u === 0 || u === units;
      this.part(p, endPanel ? 'wood' : 'bookshelf', x, H / 2, 0, endPanel ? 0.04 : 0.025, H, D);
    }
    for (let k = 1; k < n; k++) this.part(p, 'bookshelf', 0, 0.1 + k * sp, 0, L, 0.02, D);
    if (this.books) {
      for (const side of [1, -1]) {
        const sideP = this.at(p, 0, 0, side === 1 ? 0 : Math.PI);
        for (let u = 0; u < units; u++) {
          const x0 = -L / 2 + u * FURN.shelfUnit + 0.02;
          const x1 = x0 + FURN.shelfUnit - 0.04;
          for (let k = 0; k < n; k++) this.books.fillRun(this, sideP, x0, x1, 0.11 + k * sp, D / 2 - 0.01, sp - 0.05, fill);
        }
      }
    }
    this.solid(p, 0, H / 2, 0, L + 0.04, H, D);
  }

  // ---------------------------------------------------------------- misc
  plant(p: Pose, r = 0.3, h = 1.2): void {
    this.part(p, 'concreteDark', 0, 0.22, 0, r * 1.4, 0.44, r * 1.4);
    this.part(p, 'grass', 0, 0.44 + h / 2, 0, r * 2, h, r * 2);
    this.solid(p, 0, 0.5, 0, r * 1.4, 1.0, r * 1.4);
  }

  /** Printer / copier. */
  printer(p: Pose): void {
    this.part(p, 'interiorCeiling', 0, 0.5, 0, 0.7, 1.0, 0.6);
    this.part(p, 'windowFrame', 0, 1.02, 0.05, 0.6, 0.04, 0.4);
    this.solid(p, 0, 0.5, 0, 0.7, 1.0, 0.6);
  }
}

/**
 * Emissive ceiling light panels on a grid inside `area` (bottom face only: 2 triangles each).
 * `skip` lets callers leave out panels over stair openings etc.
 */
export function lightPanelGrid(batch: MeshBatch, area: Rect, y: number, spacing: [number, number], size: [number, number] = [0.6, 1.2], skip?: (x: number, z: number) => boolean): number {
  let n = 0;
  const mat = lightPanelMaterial();
  for (let x = area.x0 + spacing[0] / 2; x < area.x1; x += spacing[0]) {
    for (let z = area.z0 + spacing[1] / 2; z < area.z1; z += spacing[1]) {
      if (skip?.(x, z)) continue;
      batch.box(mat, x, y - 0.015, z, size[0], 0.03, size[1], { faces: FACE.NY });
      batch.box('metal', x, y - 0.012, z, size[0] + 0.04, 0.024, size[1] + 0.04, { faces: FACE.PX | FACE.NX | FACE.PZ | FACE.NZ });
      n++;
    }
  }
  return n;
}
