import * as THREE from 'three';
import { getMaterial, type MaterialName } from '../../../render/materials';

/**
 * MeshBatch: collects boxes (and other simple shapes) and merges them into ONE mesh per material.
 * This keeps draw calls low: a whole building facade with thousands of piers is a single draw call
 * per material.
 *
 * Coordinates are in the batch's local frame (usually the building frame, see LocalFrame).
 * UVs are in meters and continuous across neighbouring boxes (box-projected from local position),
 * as required by the team's texture convention (1 UV unit = 1 m).
 */
export type MatKey = MaterialName | THREE.Material;

/** Face bit flags for `box({ faces })`. Skip faces nobody can see to save triangles. */
export const FACE = { PX: 1, NX: 2, PY: 4, NY: 8, PZ: 16, NZ: 32, ALL: 63 } as const;

export interface BoxOpts {
  /** Yaw around +Y (radians), applied last. */
  rotY?: number;
  /** Pitch around +X (radians), applied before yaw. */
  rotX?: number;
  /** Bit mask of FACE flags. Default: all faces. */
  faces?: number;
}

interface Buf {
  pos: number[];
  nor: number[];
  uv: number[];
  idx: number[];
}

// Face table: normal, u axis, v axis (u x v = n).
const FACES: { bit: number; n: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3 }[] = [
  { bit: FACE.PX, n: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 0, -1), v: new THREE.Vector3(0, 1, 0) },
  { bit: FACE.NX, n: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0) },
  { bit: FACE.PY, n: new THREE.Vector3(0, 1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1) },
  { bit: FACE.NY, n: new THREE.Vector3(0, -1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) },
  { bit: FACE.PZ, n: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
  { bit: FACE.NZ, n: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(-1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
];

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _n = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Vector3();

function halfAlong(axis: THREE.Vector3, hx: number, hy: number, hz: number): number {
  return Math.abs(axis.x) * hx + Math.abs(axis.y) * hy + Math.abs(axis.z) * hz;
}

export class MeshBatch {
  private bufs = new Map<MatKey, Buf>();
  /** Number of boxes added (for stats/tests). */
  boxCount = 0;

  private buf(mat: MatKey): Buf {
    let b = this.bufs.get(mat);
    if (!b) {
      b = { pos: [], nor: [], uv: [], idx: [] };
      this.bufs.set(mat, b);
    }
    return b;
  }

  /** Axis-aligned (or yawed/pitched) box centered at (cx, cy, cz) with full sizes (sx, sy, sz). */
  box(mat: MatKey, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, o: BoxOpts = {}): void {
    if (sx <= 1e-4 || sy <= 1e-4 || sz <= 1e-4) return;
    const faces = o.faces ?? FACE.ALL;
    const b = this.buf(mat);
    _e.set(o.rotX ?? 0, o.rotY ?? 0, 0, 'YXZ');
    _q.setFromEuler(_e);
    _c.set(cx, cy, cz);
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    for (const f of FACES) {
      if (!(faces & f.bit)) continue;
      const hn = halfAlong(f.n, hx, hy, hz);
      const hu = halfAlong(f.u, hx, hy, hz);
      const hv = halfAlong(f.v, hx, hy, hz);
      _n.copy(f.n).applyQuaternion(_q);
      _u.copy(f.u).applyQuaternion(_q);
      _v.copy(f.v).applyQuaternion(_q);
      // UV offset so neighbouring boxes line up: project the center onto the rotated axes.
      const ou = _c.dot(_u);
      const ov = _c.dot(_v);
      const base = b.pos.length / 3;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        _p.copy(_c).addScaledVector(_n, hn).addScaledVector(_u, su * hu).addScaledVector(_v, sv * hv);
        b.pos.push(_p.x, _p.y, _p.z);
        b.nor.push(_n.x, _n.y, _n.z);
        b.uv.push(ou + su * hu, ov + sv * hv);
      }
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    this.boxCount++;
  }

  /** Box given by min/max corners (axis-aligned in the batch frame). */
  boxMinMax(mat: MatKey, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, faces?: number): void {
    this.box(mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), { faces });
  }

  /** Add an arbitrary BufferGeometry (e.g. a cylinder) transformed by `matrix`. UVs are kept as-is. */
  geometry(mat: MatKey, geo: THREE.BufferGeometry, matrix: THREE.Matrix4): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    const b = this.buf(mat);
    const base = b.pos.length / 3;
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      b.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      b.nor.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      b.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      b.idx.push(base + i);
    }
  }

  /** Total triangle count so far. */
  get triangles(): number {
    let n = 0;
    for (const b of this.bufs.values()) n += b.idx.length / 3;
    return n;
  }

  /** Merge everything into one Mesh per material and return them in a Group. */
  build(name: string, opts: { castShadow?: boolean; receiveShadow?: boolean } = {}): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, b] of this.bufs) {
      if (b.idx.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setIndex(b.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const material = typeof mat === 'string' ? getMaterial(mat) : mat;
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `${name}:${typeof mat === 'string' ? mat : mat.name || 'custom'}`;
      mesh.castShadow = opts.castShadow ?? false;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    this.bufs.clear();
    return group;
  }
}
