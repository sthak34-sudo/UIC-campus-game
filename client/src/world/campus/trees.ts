import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial, type MaterialName } from '../../render/materials';
import { hashString, makeRng, type Rng } from './rng';
import { CURB_H } from './ground';

/**
 * Street / campus trees (common Chicago parkway species), instanced, with two levels of detail:
 *
 *  NEAR (within NEAR_RADIUS of the focus): the classic game-tree build —
 *    - a dark, solid inner canopy mass (so gaps between leaf clumps show shaded leaves, not sky),
 *    - ~100 irregular leaf cards (alpha-tested `foliage`) grouped in clumps at the ends of the
 *      main branches, facing outward,
 *    - trunk + main branches (`bark`).
 *  FAR: a lumpy crown shell (one mass + a few clump blobs) in `foliage`, over an opaque dark core
 *    so the cut-out leaves never show sky.
 *
 * Instances are re-assigned between NEAR and FAR from `world.focus` (camera or player) whenever it
 * moves more than a few meters. All prototypes are modeled at height 1 and scaled per instance to
 * the tree height from the data (LiDAR).
 */
interface Species {
  name: string;
  /** Where the clear trunk ends (fraction of height). */
  trunkTop: number;
  /** Trunk base radius (fraction of height). */
  trunkR: number;
  /** Crown envelope: center height, horizontal and vertical radii; taper narrows the top (linden). */
  env: { cy: number; rx: number; ry: number; taper: number };
  clumps: number;
  /** Leaf cards in the near model. */
  cards: number;
  cardSize: [number, number];
  /** Number of main branches (each ends in a clump). */
  branches: number;
}

const SPECIES: Species[] = [
  // honey locust: wide, flat-topped, open crown of fine leaflets
  { name: 'honeylocust', trunkTop: 0.42, trunkR: 0.014, env: { cy: 0.68, rx: 0.36, ry: 0.25, taper: 0 }, clumps: 26, cards: 380, cardSize: [0.04, 0.055], branches: 6 },
  // linden: dense, upright oval with a pointed top
  { name: 'linden', trunkTop: 0.22, trunkR: 0.016, env: { cy: 0.58, rx: 0.25, ry: 0.4, taper: 0.4 }, clumps: 24, cards: 440, cardSize: [0.045, 0.06], branches: 5 },
  // maple: dense round crown, low crown base
  { name: 'maple', trunkTop: 0.28, trunkR: 0.016, env: { cy: 0.6, rx: 0.33, ry: 0.34, taper: 0.1 }, clumps: 24, cards: 440, cardSize: [0.046, 0.062], branches: 5 },
  // oak: broad, spreading, irregular clumps
  { name: 'oak', trunkTop: 0.32, trunkR: 0.019, env: { cy: 0.62, rx: 0.4, ry: 0.3, taper: 0 }, clumps: 22, cards: 440, cardSize: [0.048, 0.065], branches: 6 },
];
const VARIANTS = 2;
/** Trees closer than this to the focus use the detailed leaf-card model (m). */
export const NEAR_RADIUS = 85;
/** Meters of foliage texture per normalized unit (prototypes are 1 unit tall; a typical tree is ~11 m). */
const UV_SCALE = 11;

/** Stand-ins until the Graphics Engineer provides a non-alpha foliage material (see README). */
const MAT_CARDS: MaterialName = 'foliage';
const MAT_SOLID: MaterialName = 'grass';
const MAT_BARK: MaterialName = 'bark';

function jitterNoise(x: number, y: number, z: number, seed: number): number {
  const h = hashString(`${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)},${seed}`);
  return (h / 4294967295) * 2 - 1;
}

interface Clump { c: THREE.Vector3; r: number }

/** Point on the crown envelope in direction d (unit), scaled by u (0 = center, 1 = surface). */
function envPoint(sp: Species, d: THREE.Vector3, u: number): THREE.Vector3 {
  const e = sp.env;
  const rx = e.rx * (1 - e.taper * Math.max(0, d.y));
  return new THREE.Vector3(d.x * rx * u, e.cy + d.y * e.ry * u, d.z * rx * u);
}

function makeClumps(sp: Species, rng: Rng): Clump[] {
  const out: Clump[] = [];
  for (let i = 0; i < sp.clumps; i++) {
    // golden-angle spiral for even coverage, jittered; slightly favor the upper half
    const t = (i + 0.5) / sp.clumps;
    const y = 1 - 1.75 * t + rng.range(-0.08, 0.08);
    const ring = Math.sqrt(Math.max(0, 1 - Math.min(1, y * y)));
    const a = i * 2.39996 + rng.range(-0.3, 0.3);
    const d = new THREE.Vector3(Math.cos(a) * ring, Math.max(-0.75, y), Math.sin(a) * ring).normalize();
    out.push({ c: envPoint(sp, d, rng.range(0.7, 0.88)), r: rng.range(0.07, 0.1) });
  }
  return out;
}

/** Smooth lumpy blob (icosahedron) with normals bent toward "away from the crown center". */
function blob(center: THREE.Vector3, rx: number, ry: number, detail: number, seed: number, crownC: THREE.Vector3): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + 0.16 * jitterNoise(pos.getX(i), pos.getY(i), pos.getZ(i), seed);
    pos.setXYZ(i, center.x + pos.getX(i) * rx * k, center.y + pos.getY(i) * ry * k, center.z + pos.getZ(i) * rx * k);
  }
  g.computeVertexNormals();
  bendNormals(g, crownC, 0.5);
  return g;
}

function bendNormals(g: THREE.BufferGeometry, c: THREE.Vector3, amount: number): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const n = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < nor.count; i++) {
    n.fromBufferAttribute(nor, i);
    d.fromBufferAttribute(pos, i).sub(c).normalize();
    n.lerp(d, amount).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
}

function withUv(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + pos.getZ(i)) * UV_SCALE;
    uv[i * 2 + 1] = pos.getY(i) * UV_SCALE;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Leaf cards: irregular hexagons (6 triangles) so the cut-out edges are ragged, not square.
 * UVs sample a random patch of the tiling foliage texture at real leaf scale.
 */
function leafCards(sp: Species, clumps: Clump[], rng: Rng): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const crownC = new THREE.Vector3(0, sp.env.cy, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3(), sn = new THREE.Vector3();
  const total = sp.cards;
  for (let k = 0; k < total; k++) {
    // 75 % of the leaves in clumps (branch ends), 25 % filling the crown between them
    let c: THREE.Vector3;
    if (k % 4 !== 3) {
      const cl = clumps[rng.int(0, clumps.length - 1)]!;
      const d = new THREE.Vector3(rng.range(-1, 1), rng.range(-0.8, 1), rng.range(-1, 1));
      if (d.lengthSq() > 1) d.normalize();
      c = cl.c.clone().addScaledVector(d, cl.r * 1.35);
    } else {
      const d = new THREE.Vector3(rng.range(-1, 1), rng.range(-0.6, 1), rng.range(-1, 1)).normalize();
      c = envPoint(sp, d, rng.range(0.55, 0.95));
    }
    const out = c.clone().sub(crownC).normalize();
    // facing: outward + up, strongly randomized (real leaves face every way)
    n.copy(out).multiplyScalar(0.6).add(new THREE.Vector3(rng.range(-0.8, 0.8), rng.range(-0.2, 1), rng.range(-0.8, 0.8))).normalize();
    t.crossVectors(n, Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    b.crossVectors(n, t);
    const rot = rng.range(0, Math.PI * 2);
    const size = rng.range(sp.cardSize[0], sp.cardSize[1]);
    const u0 = rng.range(0, 3), v0 = rng.range(0, 3);
    const base = pos.length / 3;
    // shading normal: mostly "away from crown center" so the canopy lights as one mass
    sn.copy(out).lerp(n, 0.3).normalize();
    // pentagon card: ragged cut-out silhouette for 5 triangles
    pos.push(c.x, c.y, c.z); nor.push(sn.x, sn.y, sn.z); uv.push(u0, v0);
    for (let s = 0; s < 5; s++) {
      const a = rot + (s / 5) * Math.PI * 2;
      const r = size * rng.range(0.75, 1.0);
      const lx = Math.cos(a) * r, ly = Math.sin(a) * r * 0.85;
      p.copy(c).addScaledVector(t, lx).addScaledVector(b, ly);
      pos.push(p.x, p.y, p.z); nor.push(sn.x, sn.y, sn.z);
      uv.push(u0 + lx * UV_SCALE, v0 + ly * UV_SCALE);
    }
    for (let s = 0; s < 5; s++) idx.push(base, base + 1 + s, base + 1 + ((s + 1) % 5));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Trunk + main branches reaching into the first clumps (bark). */
function trunkGeometry(sp: Species, clumps: Clump[], rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const top = sp.env.cy - sp.env.ry * 0.3;
  const trunk = new THREE.CylinderGeometry(sp.trunkR * 0.55, sp.trunkR, top, 6, 1, true);
  trunk.translate(0, top / 2, 0);
  parts.push(trunk);
  const from = new THREE.Vector3(0, sp.trunkTop, 0);
  const pick = [...clumps].sort((a, b) => a.c.y - b.c.y).filter((_, i) => i % 2 === 0).slice(0, sp.branches);
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (const cl of pick) {
    const start = from.clone().add(new THREE.Vector3(0, rng.range(0, top - sp.trunkTop), 0));
    const end = cl.c.clone().multiplyScalar(0.85).add(new THREE.Vector3(0, cl.c.y * 0.15, 0));
    const dir = end.clone().sub(start);
    const len = dir.length();
    if (len < 0.05) continue;
    const g = new THREE.CylinderGeometry(sp.trunkR * 0.18, sp.trunkR * 0.5, len, 4, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(yAxis, dir.normalize()));
    g.translate(start.x, start.y, start.z);
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

interface Proto {
  cards: THREE.BufferGeometry;
  core: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  farCore: THREE.BufferGeometry;
  trunk: THREE.BufferGeometry;
}

function buildProto(sp: Species, variant: number): Proto {
  const rng = makeRng(`species:${sp.name}:${variant}`);
  const clumps = makeClumps(sp, rng);
  const crownC = new THREE.Vector3(0, sp.env.cy, 0);
  const e = sp.env;
  // near: dark inner mass + clump blobs just inside the leaf cards
  const coreParts = [blob(crownC, e.rx * 0.55, e.ry * 0.55, 1, variant * 7 + 1, crownC)];
  const core = withUv(mergeGeometries(coreParts)!);
  // far: one silhouette-matching mass + the most outward clumps as blobs
  const farParts = [blob(crownC, e.rx * 0.8, e.ry * 0.82, 1, variant * 7 + 3, crownC)];
  const outward = [...clumps].sort((a, b) => b.c.distanceTo(crownC) - a.c.distanceTo(crownC)).slice(0, 4);
  for (const cl of outward) farParts.push(blob(cl.c, cl.r * 1.25, cl.r * 1.1, 0, variant * 17 + 4, crownC));
  const far = withUv(mergeGeometries(farParts)!);
  // far core: opaque dark mass just inside the far shell, so the alpha-cut leaves never show sky
  const farCore = withUv(blob(crownC, e.rx * 0.7, e.ry * 0.72, 0, variant * 7 + 5, crownC));
  return { cards: leafCards(sp, clumps, rng), core, far, farCore, trunk: trunkGeometry(sp, clumps, rng) };
}

export interface TreeInput { p: [number, number]; height: number }

export interface TreesResult {
  objects: THREE.Object3D[];
  /** Re-assign trees between the near (leaf cards) and far (solid) models. Cheap when the focus hasn't moved. */
  update(focus: THREE.Vector3): void;
  /** Number of trees currently drawn with the near model. */
  nearCount(): number;
}

interface Group {
  idx: number[];
  crown: THREE.Matrix4[];
  tint: THREE.Color[];
  cards: THREE.InstancedMesh;
  core: THREE.InstancedMesh;
  far: THREE.InstancedMesh;
  farCore: THREE.InstancedMesh;
}

export function buildTrees(trees: TreeInput[]): TreesResult {
  const objects: THREE.Object3D[] = [];
  const nProto = SPECIES.length * VARIANTS;
  const byProto: number[][] = Array.from({ length: nProto }, () => []);
  trees.forEach((t, i) => {
    const h = hashString(`tree:${t.p[0].toFixed(1)},${t.p[1].toFixed(1)}`);
    let s = h % SPECIES.length;
    if (t.height < 7 && s === 3) s = 1; // young "oaks" read better as lindens
    byProto[s * VARIANTS + ((h >>> 8) % VARIANTS)]!.push(i);
  });
  const up = new THREE.Vector3(0, 1, 0);
  const groups: Group[] = [];
  const setup = (im: THREE.InstancedMesh, name: string) => {
    im.name = name;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false; // instance sets change with the focus; the whole map is one set
    objects.push(im);
  };
  byProto.forEach((list, pi) => {
    if (!list.length) return;
    const sp = SPECIES[Math.floor(pi / VARIANTS)]!;
    const proto = buildProto(sp, pi % VARIANTS);
    const n = list.length;
    const cards = new THREE.InstancedMesh(proto.cards, getMaterial(MAT_CARDS), n);
    const core = new THREE.InstancedMesh(proto.core, getMaterial(MAT_SOLID), n);
    const far = new THREE.InstancedMesh(proto.far, getMaterial(MAT_CARDS), n);
    const farCore = new THREE.InstancedMesh(proto.farCore, getMaterial(MAT_SOLID), n);
    const trunk = new THREE.InstancedMesh(proto.trunk, getMaterial(MAT_BARK), n);
    const tag = `campus-trees-${sp.name}-${pi % VARIANTS}`;
    setup(cards, `${tag}-cards`); setup(core, `${tag}-core`); setup(far, `${tag}-far`); setup(farCore, `${tag}-far-core`); setup(trunk, `${tag}-trunks`);
    const g: Group = { idx: list, crown: [], tint: [], cards, core, far, farCore };
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) for (const im of [cards, core, far, farCore]) im.setColorAt(i, white);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
    list.forEach((ti, i) => {
      const t = trees[ti]!;
      const r = makeRng(`tree:${t.p[0]},${t.p[1]}`);
      const h = Math.max(4, t.height);
      const wide = r.range(0.85, 1.2) * (h < 8 ? 0.85 : 1);
      q.setFromAxisAngle(up, r.range(0, Math.PI * 2));
      pos.set(t.p[0], CURB_H, -t.p[1]);
      sc.set(h * wide * r.range(0.9, 1.1), h * r.range(0.95, 1.05), h * wide * r.range(0.9, 1.1));
      g.crown.push(new THREE.Matrix4().compose(pos, q, sc));
      // trunks: keep them from getting too fat on big trees
      const tk = h * Math.min(1, 10 / h + 0.25);
      m.compose(pos, q, sc.set(tk * wide, sc.y, tk * wide));
      trunk.setMatrixAt(i, m);
      const b = r.range(0.75, 1.0);
      trunk.setColorAt(i, col.setRGB(b, b * 0.97, b * 0.95));
      // per-tree foliage tint: greens with a few early-autumn trees (mid-October)
      const l = r.range(0.85, 1.12);
      const autumn = r.chance(0.12) ? r.range(0.1, 0.35) : 0;
      g.tint.push(new THREE.Color(l * (r.range(0.9, 1.05) + autumn), l * r.range(0.92, 1.05), l * r.range(0.8, 0.98) * (1 - autumn * 0.6)));
    });
    trunk.instanceMatrix.needsUpdate = true;
    groups.push(g);
  });

  // Solid stand-in material is lawn `grass`: pull it toward the darker, olive foliage color.
  const CORE_TINT = new THREE.Color(0.13, 0.15, 0.09);
  const last = new THREE.Vector3(Infinity, 0, 0);
  let near = 0;
  const tmp = new THREE.Color();
  const update = (focus: THREE.Vector3) => {
    if (last.distanceToSquared(focus) < 16) return;
    last.copy(focus);
    near = 0;
    const r2 = NEAR_RADIUS * NEAR_RADIUS;
    for (const g of groups) {
      let nn = 0, nf = 0;
      g.idx.forEach((ti, i) => {
        const t = trees[ti]!;
        const dx = t.p[0] - focus.x, dz = -t.p[1] - focus.z;
        const tint = g.tint[i]!;
        if (dx * dx + dz * dz < r2) {
          g.cards.setMatrixAt(nn, g.crown[i]!);
          g.cards.setColorAt(nn, tint);
          g.core.setMatrixAt(nn, g.crown[i]!);
          g.core.setColorAt(nn, tmp.copy(tint).multiply(CORE_TINT));
          nn++;
        } else {
          g.far.setMatrixAt(nf, g.crown[i]!);
          g.far.setColorAt(nf, tint);
          g.farCore.setMatrixAt(nf, g.crown[i]!);
          g.farCore.setColorAt(nf, tmp.copy(tint).multiply(CORE_TINT));
          nf++;
        }
      });
      g.cards.count = nn; g.core.count = nn; g.far.count = nf; g.farCore.count = nf;
      for (const im of [g.cards, g.core, g.far, g.farCore]) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
      near += nn;
    }
  };
  // start with everything far (valid before the first focus update)
  update(new THREE.Vector3(1e7, 0, 1e7));
  return { objects, update, nearCount: () => near };
}
