import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial } from '../../render/materials';
import { hashString, makeRng, type Rng } from './rng';
import { CURB_H } from './ground';

/**
 * Street / campus trees: instanced, a few species shapes, per-instance size + color variation.
 * All prototypes are modeled at height 1 and scaled to the tree height from the data (LiDAR).
 *
 * Species (common Chicago parkway trees):
 *  - honeylocust: open, wide, airy crown of many small lobes
 *  - maple: dense round crown
 *  - linden: oval / upright crown
 *  - elm: vase shape (branches spread high)
 */
interface Species {
  name: string;
  trunkTop: number; // fraction of height where the trunk disappears into the crown
  trunkR: number; // base radius as fraction of height
  lobes: { n: number; spreadXZ: number; y0: number; y1: number; r0: number; r1: number };
  branches: number;
}

const SPECIES: Species[] = [
  { name: 'honeylocust', trunkTop: 0.55, trunkR: 0.014, lobes: { n: 14, spreadXZ: 0.3, y0: 0.5, y1: 0.9, r0: 0.08, r1: 0.13 }, branches: 5 },
  { name: 'maple', trunkTop: 0.4, trunkR: 0.016, lobes: { n: 12, spreadXZ: 0.22, y0: 0.38, y1: 0.86, r0: 0.12, r1: 0.17 }, branches: 4 },
  { name: 'linden', trunkTop: 0.36, trunkR: 0.015, lobes: { n: 11, spreadXZ: 0.15, y0: 0.32, y1: 0.92, r0: 0.11, r1: 0.15 }, branches: 3 },
  { name: 'elm', trunkTop: 0.52, trunkR: 0.016, lobes: { n: 13, spreadXZ: 0.32, y0: 0.55, y1: 0.9, r0: 0.1, r1: 0.15 }, branches: 5 },
];
const VARIANTS = 2;

function jitterNoise(x: number, y: number, z: number, seed: number): number {
  const h = hashString(`${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)},${seed}`);
  return (h / 4294967295) * 2 - 1;
}

function crownGeometry(sp: Species, rng: Rng, seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const L = sp.lobes;
  const center = new THREE.Vector3(0, (L.y0 + L.y1) / 2, 0);
  // one smooth core mass + low-poly lobes around it (keeps ~260 triangles per tree)
  const core = new THREE.IcosahedronGeometry(Math.max(L.spreadXZ * 0.8, L.r1), 1);
  core.scale(1, ((L.y1 - L.y0) / 2) / Math.max(L.spreadXZ * 0.8, L.r1), 1);
  core.translate(center.x, center.y, center.z);
  parts.push(core);
  const nLobes = Math.round(L.n * 0.7);
  for (let i = 0; i < nLobes; i++) {
    const r = rng.range(L.r0, L.r1) * 1.15;
    const g = new THREE.IcosahedronGeometry(r, 0);
    const a = (i / nLobes) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const rad = L.spreadXZ * rng.range(0.6, 1.0);
    const y = rng.range(L.y0 + r * 0.5, L.y1 - r * 0.4);
    g.translate(Math.cos(a) * rad, y, Math.sin(a) * rad);
    parts.push(g);
  }
  let geo = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); p.deleteAttribute('normal'); return p; }))!;
  geo = mergeVertices(geo, 1e-4);
  // lumpy, irregular outline
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + 0.24 * jitterNoise(v.x, v.y, v.z, seed);
    const dx = v.x - center.x, dy = v.y - center.y, dz = v.z - center.z;
    pos.setXYZ(i, center.x + dx * k, center.y + dy * k * 0.95, center.z + dz * k);
  }
  geo.computeVertexNormals();
  // soften: blend normals toward "away from crown center" so the crown shades like one mass
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const n = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < nor.count; i++) {
    n.fromBufferAttribute(nor, i);
    c.fromBufferAttribute(pos, i).sub(center).normalize();
    n.lerp(c, 0.55).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  // UVs in meters-ish (scaled later with the instance; fine for foliage noise)
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) * 8 + pos.getZ(i) * 8; uv[i * 2 + 1] = pos.getY(i) * 8; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function trunkGeometry(sp: Species, rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const t = new THREE.CylinderGeometry(sp.trunkR * 0.6, sp.trunkR, sp.trunkTop, 6, 1, true);
  t.translate(0, sp.trunkTop / 2, 0);
  parts.push(t);
  for (let i = 0; i < Math.min(3, sp.branches); i++) {
    const len = rng.range(0.16, 0.26);
    const b = new THREE.CylinderGeometry(sp.trunkR * 0.25, sp.trunkR * 0.45, len, 4, 1, true);
    b.translate(0, len / 2, 0);
    b.rotateZ(rng.range(0.5, 0.9));
    b.rotateY((i / sp.branches) * Math.PI * 2 + rng.range(-0.3, 0.3));
    b.translate(0, sp.trunkTop * rng.range(0.7, 0.95), 0);
    parts.push(b);
  }
  const g = mergeGeometries(parts)!;
  return g;
}

export interface TreeInput { p: [number, number]; height: number }

export function buildTrees(trees: TreeInput[]): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const nProto = SPECIES.length * VARIANTS;
  const byProto: TreeInput[][] = Array.from({ length: nProto }, () => []);
  for (const t of trees) {
    const h = hashString(`tree:${t.p[0].toFixed(1)},${t.p[1].toFixed(1)}`);
    let s = h % SPECIES.length;
    if (t.height < 7 && s === 3) s = 2; // young elms look like lindens
    byProto[s * VARIANTS + ((h >>> 8) % VARIANTS)]!.push(t);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  byProto.forEach((list, pi) => {
    if (!list.length) return;
    const sp = SPECIES[Math.floor(pi / VARIANTS)]!;
    const rng = makeRng(`species:${sp.name}:${pi % VARIANTS}`);
    const crown = crownGeometry(sp, rng, pi);
    const trunk = trunkGeometry(sp, rng);
    const crownMesh = new THREE.InstancedMesh(crown, getMaterial('foliage'), list.length);
    const trunkMesh = new THREE.InstancedMesh(trunk, getMaterial('bark'), list.length);
    crownMesh.name = `campus-trees-${sp.name}-${pi % VARIANTS}-crowns`;
    trunkMesh.name = `campus-trees-${sp.name}-${pi % VARIANTS}-trunks`;
    list.forEach((t, i) => {
      const r = makeRng(`tree:${t.p[0]},${t.p[1]}`);
      const h = Math.max(4, t.height);
      const wide = r.range(0.85, 1.25) * (h < 8 ? 0.85 : 1);
      sc.set(h * wide * r.range(0.88, 1.12), h * r.range(0.95, 1.05), h * wide * r.range(0.88, 1.12));
      q.setFromAxisAngle(up, r.range(0, Math.PI * 2));
      pos.set(t.p[0], CURB_H, -t.p[1]);
      m.compose(pos, q, sc);
      crownMesh.setMatrixAt(i, m);
      // trunks: keep them from getting too fat on big trees
      const tk = h * Math.min(1, 10 / h + 0.2);
      sc.set(tk, sc.y, tk);
      m.compose(pos, q, sc);
      trunkMesh.setMatrixAt(i, m);
      // color variation (multiplies the foliage material color)
      const l = r.range(0.75, 1.15);
      col.setRGB(l * r.range(0.84, 1.1), l * r.range(0.9, 1.06), l * r.range(0.72, 0.98));
      crownMesh.setColorAt(i, col);
      // bark: darker and greyer than the generic wood material
      const b = r.range(0.42, 0.58);
      col.setRGB(b, b * 0.95, b * 0.92);
      trunkMesh.setColorAt(i, col);
    });
    for (const im of [crownMesh, trunkMesh]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      out.push(im);
    }
  });
  return out;
}
