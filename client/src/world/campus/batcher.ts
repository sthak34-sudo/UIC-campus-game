import * as THREE from 'three';
import { getMaterial, type MaterialName } from '../../render/materials';
import type { PlanPoint } from '../../core/geo';
import { triangulate } from './geom';

/** Growable vertex/index buffer for one material. UVs are in meters (1 UV unit = 1 m). */
export class GeoBuffer {
  pos = new Float32Array(3 * 4096);
  nor = new Float32Array(3 * 4096);
  uv = new Float32Array(2 * 4096);
  idx = new Uint32Array(6 * 4096);
  nv = 0;
  ni = 0;

  private ensure(addV: number, addI: number): void {
    if ((this.nv + addV) * 3 > this.pos.length) {
      const cap = Math.max((this.nv + addV) * 2, 4096);
      const grow = <T extends Float32Array>(a: T, k: number): T => {
        const b = new Float32Array(cap * k);
        b.set(a);
        return b as T;
      };
      this.pos = grow(this.pos, 3);
      this.nor = grow(this.nor, 3);
      this.uv = grow(this.uv, 2);
    }
    if (this.ni + addI > this.idx.length) {
      const b = new Uint32Array(Math.max((this.ni + addI) * 2, 8192));
      b.set(this.idx);
      this.idx = b;
    }
  }

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    this.ensure(1, 0);
    const i = this.nv++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.nor[i * 3] = nx; this.nor[i * 3 + 1] = ny; this.nor[i * 3 + 2] = nz;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v;
    return i;
  }

  tri(a: number, b: number, c: number): void {
    this.ensure(0, 3);
    this.idx[this.ni++] = a; this.idx[this.ni++] = b; this.idx[this.ni++] = c;
  }
}

/** Index range of one building (or other addressable thing) inside a material buffer. */
export interface BatchRange {
  mat: MaterialName;
  start: number;
  count: number;
}

/**
 * Collects geometry for many objects, merged per material. `toMesh()` returns ONE mesh whose
 * geometry has one group per material (one draw call per material).
 */
export class Batcher {
  readonly bufs = new Map<MaterialName, GeoBuffer>();

  buf(m: MaterialName): GeoBuffer {
    let b = this.bufs.get(m);
    if (!b) this.bufs.set(m, (b = new GeoBuffer()));
    return b;
  }

  get vertexCount(): number {
    let n = 0;
    for (const b of this.bufs.values()) n += b.nv;
    return n;
  }

  /** Snapshot of index counters, to later compute the ranges an object occupies. */
  mark(): Map<MaterialName, number> {
    const m = new Map<MaterialName, number>();
    for (const [k, b] of this.bufs) m.set(k, b.ni);
    return m;
  }

  rangesSince(mark: Map<MaterialName, number>): BatchRange[] {
    const out: BatchRange[] = [];
    for (const [k, b] of this.bufs) {
      const s = mark.get(k) ?? 0;
      if (b.ni > s) out.push({ mat: k, start: s, count: b.ni - s });
    }
    return out;
  }

  /**
   * Planar quad a-b-c-d (any winding; fixed so the front faces along n).
   * UVs: horizontal faces use world x/z, others use (distance along the horizontal tangent, y).
   */
  quad(
    m: MaterialName,
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number, dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
  ): void {
    const g = this.buf(m);
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    const flip = fx * nx + fy * ny + fz * nz < 0;
    let i0: number, i1: number, i2: number, i3: number;
    if (Math.abs(ny) > 0.7) {
      i0 = g.vert(ax, ay, az, nx, ny, nz, ax, az); i1 = g.vert(bx, by, bz, nx, ny, nz, bx, bz);
      i2 = g.vert(cx, cy, cz, nx, ny, nz, cx, cz); i3 = g.vert(dx, dy, dz, nx, ny, nz, dx, dz);
    } else {
      // tangent: horizontal, perpendicular to n
      let tx = -nz, tz = nx;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      i0 = g.vert(ax, ay, az, nx, ny, nz, ax * tx + az * tz, ay); i1 = g.vert(bx, by, bz, nx, ny, nz, bx * tx + bz * tz, by);
      i2 = g.vert(cx, cy, cz, nx, ny, nz, cx * tx + cz * tz, cy); i3 = g.vert(dx, dy, dz, nx, ny, nz, dx * tx + dz * tz, dy);
    }
    if (flip) { g.tri(i0, i2, i1); g.tri(i0, i3, i2); } else { g.tri(i0, i1, i2); g.tri(i0, i2, i3); }
  }

  /** Triangle with explicit normal and UV mode like quad(). */
  triangle(m: MaterialName, ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, nx: number, ny: number, nz: number): void {
    const g = this.buf(m);
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    const flip = fx * nx + fy * ny + fz * nz < 0;
    let tx = -nz, tz = nx;
    const tl = Math.hypot(tx, tz);
    const horiz = Math.abs(ny) > 0.7 || tl < 1e-6;
    if (!horiz) { tx /= tl; tz /= tl; }
    const uv = (x: number, y: number, z: number): [number, number] => (horiz ? [x, z] : [x * tx + z * tz, y]);
    const [ua, va] = uv(ax, ay, az), [ub, vb] = uv(bx, by, bz), [uc, vc] = uv(cx, cy, cz);
    const i0 = g.vert(ax, ay, az, nx, ny, nz, ua, va), i1 = g.vert(bx, by, bz, nx, ny, nz, ub, vb), i2 = g.vert(cx, cy, cz, nx, ny, nz, uc, vc);
    if (flip) g.tri(i0, i2, i1); else g.tri(i0, i1, i2);
  }

  /** Horizontal polygon (PLAN coordinates) at height y, facing up (or down). */
  polygon(m: MaterialName, outer: readonly PlanPoint[], holes: readonly PlanPoint[][], y: number, up = true): void {
    const { pts, tris } = triangulate(outer, holes);
    if (tris.length === 0) return;
    const g = this.buf(m);
    const ny = up ? 1 : -1;
    const base = g.nv;
    for (const [px, py] of pts) g.vert(px, y, -py, 0, ny, 0, px, -py);
    for (let i = 0; i < tris.length; i += 3) {
      const a = base + tris[i]!, b = base + tris[i + 1]!, c = base + tris[i + 2]!;
      // plan CCW -> seen from above in world (z = -y) the order flips; check with the first vertex positions
      const ax = g.pos[a * 3]!, az = g.pos[a * 3 + 2]!, bx = g.pos[b * 3]!, bz = g.pos[b * 3 + 2]!, cx = g.pos[c * 3]!, cz = g.pos[c * 3 + 2]!;
      const fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (fy * ny >= 0) g.tri(a, b, c); else g.tri(a, c, b);
    }
  }

  /**
   * Axis-free box given by a local frame: origin o (world x,z), unit tangent t (world x,z),
   * outward normal n (world x,z). Spans s∈[s0,s1] along t, y∈[y0,y1], depth d∈[d0,d1] where
   * positive depth goes INTO the building (against n). Faces listed in `faces` are emitted
   * (default: front, top, bottom, left, right — the back face is assumed hidden in the wall).
   */
  boxLocal(
    m: MaterialName, ox: number, oz: number, tx: number, tz: number, nx: number, nz: number,
    s0: number, s1: number, y0: number, y1: number, d0: number, d1: number, faces = 'ftblr',
  ): void {
    const P = (s: number, d: number): [number, number] => [ox + tx * s - nx * d, oz + tz * s - nz * d];
    const [a0x, a0z] = P(s0, d0), [b0x, b0z] = P(s1, d0), [a1x, a1z] = P(s0, d1), [b1x, b1z] = P(s1, d1);
    if (faces.includes('f')) this.quad(m, a0x, y0, a0z, b0x, y0, b0z, b0x, y1, b0z, a0x, y1, a0z, nx, 0, nz);
    if (faces.includes('k')) this.quad(m, a1x, y0, a1z, b1x, y0, b1z, b1x, y1, b1z, a1x, y1, a1z, -nx, 0, -nz);
    if (faces.includes('t')) this.quad(m, a0x, y1, a0z, b0x, y1, b0z, b1x, y1, b1z, a1x, y1, a1z, 0, 1, 0);
    if (faces.includes('b')) this.quad(m, a0x, y0, a0z, b0x, y0, b0z, b1x, y0, b1z, a1x, y0, a1z, 0, -1, 0);
    if (faces.includes('l')) this.quad(m, a0x, y0, a0z, a1x, y0, a1z, a1x, y1, a1z, a0x, y1, a0z, -tx, 0, -tz);
    if (faces.includes('r')) this.quad(m, b0x, y0, b0z, b1x, y0, b1z, b1x, y1, b1z, b0x, y1, b0z, tx, 0, tz);
  }

  /** Free-standing oriented box in world space (center x,z; size along u=(ux,uz) and its normal). */
  box(m: MaterialName, cx: number, cz: number, ux: number, uz: number, len: number, wid: number, y0: number, y1: number, bottom = false): void {
    const nx = uz, nz = -ux; // perpendicular
    const ox = cx - ux * len / 2 + nx * wid / 2, oz = cz - uz * len / 2 + nz * wid / 2;
    this.boxLocal(m, ox, oz, ux, uz, nx, nz, 0, len, y0, y1, 0, wid, bottom ? 'ftblrk' : 'ftlrk');
  }

  toMesh(name: string): THREE.Mesh | null {
    let nv = 0, ni = 0;
    for (const b of this.bufs.values()) { nv += b.nv; ni += b.ni; }
    if (ni === 0) return null;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const geo = new THREE.BufferGeometry();
    const mats: THREE.Material[] = [];
    let vo = 0, io = 0;
    for (const [m, b] of this.bufs) {
      if (b.ni === 0) continue;
      pos.set(b.pos.subarray(0, b.nv * 3), vo * 3);
      nor.set(b.nor.subarray(0, b.nv * 3), vo * 3);
      uv.set(b.uv.subarray(0, b.nv * 2), vo * 2);
      for (let i = 0; i < b.ni; i++) idx[io + i] = b.idx[i]! + vo;
      geo.addGroup(io, b.ni, mats.length);
      mats.push(getMaterial(m));
      this.groupStart.set(m, io);
      vo += b.nv; io += b.ni;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, mats);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  /** After toMesh(): start of each material's group in the merged index buffer. */
  readonly groupStart = new Map<MaterialName, number>();
}
