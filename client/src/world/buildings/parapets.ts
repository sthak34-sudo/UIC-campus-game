import * as THREE from 'three';

/**
 * Invisible parapet lips around walkable roofs (Atlas `_roofNN_col` meshes).
 *
 * Roof colliders are arbitrary meshes (L-shapes, rotated slabs, node-scaled unit cubes), so the
 * lip follows the real outline: take the upward-facing triangles in world space, find the
 * outline edges (edges used by only one top triangle), cut each into ~1 m segments and put a
 * 1.1 m high, 0.2 m thick invisible wall on every segment, except where the ground just past the
 * edge is still walkable at about the same height (another roof, a stair or a floor collider).
 * Those are the only gaps.
 */
export const PARAPET_HEIGHT = 1.1;
export const PARAPET_THICKNESS = 0.2;
const SEGMENT = 1.0;
/** How far past the edge to look for more walkable surface. */
const PROBE_OUT = 0.45;
/** A walkable neighbour within this height of the roof edge opens a gap. */
const STEP_TOL = 1.2;
const UP_DOT = 0.7;

const INVISIBLE = new THREE.MeshBasicMaterial({ visible: false });

interface Tri { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3 }

/** Upward-facing triangles of a mesh in world space. */
export function topTriangles(mesh: THREE.Mesh): Tri[] {
  mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  const out: Tri[] = [];
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld);
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i + 2 < n; i += 3) {
    const a = v(i), b = v(i + 1), c = v(i + 2);
    nn.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    const len = nn.length();
    if (len < 1e-8) continue;
    if (nn.y / len >= UP_DOT) out.push({ a, b, c });
  }
  return out;
}

/** Height of the walkable surface at (x, z) closest to `y`, or null if none. */
function surfaceY(tris: Tri[], x: number, z: number, y: number): number | null {
  let best: number | null = null;
  for (const t of tris) {
    const { a, b, c } = t;
    const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (Math.abs(d) < 1e-9) continue;
    const l1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
    const l2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
    const ty = l1 * a.y + l2 * b.y + l3 * c.y;
    if (best === null || Math.abs(ty - y) < Math.abs(best - y)) best = ty;
  }
  return best;
}

const key = (p: THREE.Vector3) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)},${Math.round(p.z * 100)}`;

/**
 * Build parapet meshes (not yet registered) around `roofs`. `others` (stairs, floors) and all
 * roofs count as walkable neighbours that open a gap.
 */
export function buildParapets(roofs: THREE.Mesh[], others: THREE.Mesh[] = []): THREE.Mesh[] {
  const roofTris = roofs.map(topTriangles);
  const walk = [...roofTris.flat(), ...others.flatMap(topTriangles)];
  const out: THREE.Mesh[] = [];
  const t = PARAPET_THICKNESS;
  roofs.forEach((roof, ri) => {
    const tris = roofTris[ri]!;
    // outline edges: used by exactly one top triangle
    const edges = new Map<string, { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; n: number }>();
    for (const tr of tris) {
      for (const [a, b, c] of [[tr.a, tr.b, tr.c], [tr.b, tr.c, tr.a], [tr.c, tr.a, tr.b]] as const) {
        const ka = key(a), kb = key(b);
        const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const e = edges.get(k);
        if (e) e.n++;
        else edges.set(k, { a, b, c, n: 1 });
      }
    }
    for (const e of edges.values()) {
      if (e.n !== 1) continue;
      const dir = new THREE.Vector3(e.b.x - e.a.x, 0, e.b.z - e.a.z);
      const len = dir.length();
      if (len < 0.3) continue;
      dir.divideScalar(len);
      // outward normal in XZ: away from the triangle's third vertex
      const outN = new THREE.Vector3(dir.z, 0, -dir.x);
      const mid = e.a.clone().lerp(e.b, 0.5);
      if (outN.dot(new THREE.Vector3(e.c.x - mid.x, 0, e.c.z - mid.z)) > 0) outN.negate();
      const n = Math.max(1, Math.round(len / SEGMENT));
      const seg = len / n;
      const closed: boolean[] = [];
      for (let i = 0; i < n; i++) {
        const p = e.a.clone().lerp(e.b, (i + 0.5) / n);
        const y = surfaceY(walk, p.x + outN.x * PROBE_OUT, p.z + outN.z * PROBE_OUT, p.y);
        closed.push(!(y !== null && Math.abs(y - p.y) <= STEP_TOL));
      }
      const yaw = Math.atan2(-dir.z, dir.x);
      for (let i = 0; i < n; ) {
        if (!closed[i]) { i++; continue; }
        let j = i;
        while (j < n && closed[j]) j++;
        // run [i, j): extend by t/2 at both ends so lips meet at corners
        const s0 = i * seg - t / 2, s1 = j * seg + t / 2;
        const L = s1 - s0;
        const c = e.a.clone().addScaledVector(new THREE.Vector3(e.b.x - e.a.x, e.b.y - e.a.y, e.b.z - e.a.z).divideScalar(len), (s0 + s1) / 2);
        const m = new THREE.Mesh(new THREE.BoxGeometry(L, PARAPET_HEIGHT, t), INVISIBLE);
        m.position.set(c.x - outN.x * t / 2, c.y + PARAPET_HEIGHT / 2, c.z - outN.z * t / 2);
        m.rotation.set(0, yaw, 0);
        m.visible = false;
        m.name = `${roof.name}:parapet`;
        m.userData.collider = { kind: 'box', size: [L, PARAPET_HEIGHT, t], tag: 'rail' };
        m.userData.colliderTag = 'parapet';
        m.updateMatrixWorld(true);
        out.push(m);
        i = j;
      }
    }
  });
  return out;
}
