import * as THREE from 'three';

/**
 * Turns registered collider meshes (world.colliders) into plain shape data for Rapier.
 * Pure three.js (no Rapier) so it can be unit-tested and timed separately.
 *
 * - Untouched BoxGeometry meshes / instances (walls, stair steps, slabs, curbs) become SOLID cuboids:
 *   cheapest and most robust (nothing can tunnel into a solid box, even a thin floor slab).
 * - Everything else becomes triangles, transformed to world space (world matrix x instance matrix),
 *   degenerate triangles dropped, and bucketed by XZ grid cell so each Rapier trimesh stays
 *   compact (good broad-phase culling even when a module merges the whole campus into one mesh).
 */

export interface CuboidShape {
  half: [number, number, number];
  pos: [number, number, number];
  rot: [number, number, number, number];
}

export interface TriCell {
  key: string;
  /** Flat xyz triangle soup (non-indexed; 9 floats per triangle). */
  verts: number[];
}

export interface CollectedShapes {
  cuboids: CuboidShape[];
  cells: Map<string, TriCell>;
  triangles: number;
  meshes: number;
  instances: number;
}

export function emptyShapes(): CollectedShapes {
  return { cuboids: [], cells: new Map(), triangles: 0, meshes: 0, instances: 0 };
}

const _m = new THREE.Matrix4();
const _inst = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Vector3();

/** Adds the collision shapes of `meshes` to `out` (created if omitted). */
export function collectShapes(meshes: readonly THREE.Mesh[], cellSize: number, out = emptyShapes()): CollectedShapes {
  for (const mesh of meshes) {
    const geom = mesh.geometry as THREE.BufferGeometry | undefined;
    if (!geom || !geom.getAttribute('position')) continue;
    mesh.updateWorldMatrix(true, false);
    out.meshes++;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const im = mesh as THREE.InstancedMesh;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, _inst);
        _m.multiplyMatrices(im.matrixWorld, _inst);
        addGeometry(geom, _m, cellSize, out);
        out.instances++;
      }
    } else {
      addGeometry(geom, mesh.matrixWorld, cellSize, out);
    }
  }
  return out;
}

/**
 * Rapier's shape casts lose precision against very large shapes (measured: a 2 km ground box lets the
 * capsule sink ~0.19 m; 400 m ~0.04 m; <= 64 m about 1 mm). So big boxes are tiled and big triangles
 * subdivided until no piece is longer than this (m).
 */
export const MAX_PIECE = 32;

function addGeometry(geom: THREE.BufferGeometry, m: THREE.Matrix4, cellSize: number, out: CollectedShapes): void {
  const box = boxFor(geom, m);
  if (box) {
    for (const c of tileCuboid(box, MAX_PIECE / 2)) out.cuboids.push(c);
    return;
  }
  addTriangles(geom, m, cellSize, out);
}

/** Splits a cuboid into a grid of smaller cuboids whose half-extents are all <= maxHalf. */
export function tileCuboid(c: CuboidShape, maxHalf: number): CuboidShape[] {
  const n = c.half.map((h) => Math.max(1, Math.ceil(h / maxHalf)));
  if (n[0] === 1 && n[1] === 1 && n[2] === 1) return [c];
  const q = new THREE.Quaternion(c.rot[0], c.rot[1], c.rot[2], c.rot[3]);
  const half: [number, number, number] = [c.half[0] / n[0], c.half[1] / n[1], c.half[2] / n[2]];
  const out: CuboidShape[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < n[0]; i++) {
    for (let j = 0; j < n[1]; j++) {
      for (let k = 0; k < n[2]; k++) {
        v.set(-c.half[0] + half[0] * (2 * i + 1), -c.half[1] + half[1] * (2 * j + 1), -c.half[2] + half[2] * (2 * k + 1));
        v.applyQuaternion(q);
        out.push({ half: [...half], pos: [c.pos[0] + v.x, c.pos[1] + v.y, c.pos[2] + v.z], rot: [...c.rot] });
      }
    }
  }
  return out;
}

/** A cuboid for an (unmodified or only translated) BoxGeometry under a shear-free transform, else null. */
export function boxFor(geom: THREE.BufferGeometry, m: THREE.Matrix4): CuboidShape | null {
  if (!(geom instanceof THREE.BoxGeometry)) return null;
  const { width, height, depth } = geom.parameters;
  if (!geom.boundingBox) geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  const eps = 1e-4 * Math.max(1, width, height, depth);
  bb.getSize(_c);
  if (Math.abs(_c.x - width) > eps || Math.abs(_c.y - height) > eps || Math.abs(_c.z - depth) > eps) return null;
  if (!isShearFree(m)) return null;
  m.decompose(_p, _q, _s);
  bb.getCenter(_c).applyMatrix4(m);
  const hx = Math.abs(_s.x) * width * 0.5;
  const hy = Math.abs(_s.y) * height * 0.5;
  const hz = Math.abs(_s.z) * depth * 0.5;
  if (!(hx > 0 && hy > 0 && hz > 0)) return null;
  return { half: [hx, hy, hz], pos: [_c.x, _c.y, _c.z], rot: [_q.x, _q.y, _q.z, _q.w] };
}

function isShearFree(m: THREE.Matrix4): boolean {
  const e = m.elements;
  const ax = [e[0], e[1], e[2]];
  const ay = [e[4], e[5], e[6]];
  const az = [e[8], e[9], e[10]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const lx = Math.sqrt(dot(ax, ax));
  const ly = Math.sqrt(dot(ay, ay));
  const lz = Math.sqrt(dot(az, az));
  if (lx < 1e-9 || ly < 1e-9 || lz < 1e-9) return false;
  const tol = 1e-4;
  return (
    Math.abs(dot(ax, ay)) / (lx * ly) < tol &&
    Math.abs(dot(ax, az)) / (lx * lz) < tol &&
    Math.abs(dot(ay, az)) / (ly * lz) < tol &&
    Math.abs(e[3]) < 1e-9 && Math.abs(e[7]) < 1e-9 && Math.abs(e[11]) < 1e-9
  );
}

let scratch = new Float32Array(0);

function addTriangles(geom: THREE.BufferGeometry, m: THREE.Matrix4, cellSize: number, out: CollectedShapes): void {
  const pos = geom.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  const n = pos.count;
  if (scratch.length < n * 3) scratch = new Float32Array(Math.max(n * 3, scratch.length * 2));
  const w = scratch;
  const e = m.elements;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const iw = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15] || 1);
    w[i * 3] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * iw;
    w[i * 3 + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * iw;
    w[i * 3 + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * iw;
  }
  const index = geom.getIndex();
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(n / 3);
  let lastKey = '';
  let lastCell: TriCell | undefined;
  for (let t = 0; t < triCount; t++) {
    const a = index ? index.getX(t * 3) : t * 3;
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const ax = w[a * 3], ay = w[a * 3 + 1], az = w[a * 3 + 2];
    const bx = w[b * 3], by = w[b * 3 + 1], bz = w[b * 3 + 2];
    const cx = w[c * 3], cy = w[c * 3 + 1], cz = w[c * 3 + 2];
    // Degenerate / non-finite triangles break BVH building and contact normals: drop them.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const area2 = nx * nx + ny * ny + nz * nz;
    if (!(area2 > 1e-12) || !Number.isFinite(area2)) continue;
    const longest = Math.max(ux * ux + uy * uy + uz * uz, vx * vx + vy * vy + vz * vz,
      (cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2);
    if (longest > MAX_PIECE * MAX_PIECE) {
      subdivide([ax, ay, az, bx, by, bz, cx, cy, cz], cellSize, out);
      lastKey = '';
      continue;
    }
    const key = `${Math.floor((ax + bx + cx) / (3 * cellSize))},${Math.floor((az + bz + cz) / (3 * cellSize))}`;
    let cell = key === lastKey ? lastCell : out.cells.get(key);
    if (!cell) out.cells.set(key, (cell = { key, verts: [] }));
    lastKey = key;
    lastCell = cell;
    cell.verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    out.triangles++;
  }
}

/** Splits a big triangle (9 floats) into 4 at its edge midpoints until every edge <= MAX_PIECE. */
function subdivide(tri: number[], cellSize: number, out: CollectedShapes): void {
  const stack: number[][] = [tri];
  while (stack.length) {
    const t = stack.pop()!;
    const d2 = (i: number, j: number) => (t[i] - t[j]) ** 2 + (t[i + 1] - t[j + 1]) ** 2 + (t[i + 2] - t[j + 2]) ** 2;
    if (Math.max(d2(0, 3), d2(3, 6), d2(0, 6)) > MAX_PIECE * MAX_PIECE) {
      const mid = (i: number, j: number) => [(t[i] + t[j]) / 2, (t[i + 1] + t[j + 1]) / 2, (t[i + 2] + t[j + 2]) / 2];
      const a = t.slice(0, 3), b = t.slice(3, 6), c = t.slice(6, 9);
      const ab = mid(0, 3), bc = mid(3, 6), ca = mid(6, 0);
      stack.push([...a, ...ab, ...ca], [...ab, ...b, ...bc], [...ca, ...bc, ...c], [...ab, ...bc, ...ca]);
      continue;
    }
    const key = `${Math.floor((t[0] + t[3] + t[6]) / (3 * cellSize))},${Math.floor((t[2] + t[5] + t[8]) / (3 * cellSize))}`;
    let cell = out.cells.get(key);
    if (!cell) out.cells.set(key, (cell = { key, verts: [] }));
    for (let i = 0; i < 9; i++) cell.verts.push(t[i]);
    out.triangles++;
  }
}
