import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MaterialName } from '../../render/materials';
import { getMaterial } from '../../render/materials';
import type { Polygon2D } from '../../core/campusData';
import { Batcher } from './batcher';
import { CURB_H } from './ground';
import { makeRng } from './rng';

/**
 * Low-detail surroundings beyond the play area (client/public/data/context.json, made by
 * tools/map-pipeline/context.py): the Near West Side, West Loop and the Loop skyline as simple
 * blocks, streets and parkway trees, so aerial views read as a continuing city fading into haze.
 * Cheap on purpose: ~9 draw calls, no shadow casting, no colliders (out of reach for the player).
 */
export interface ContextData {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** [cx, cy, ux, uy, len, wid, height, style] — style 0 brick, 1 concrete, 2 glass high-rise */
  buildings: number[][];
  ground: { road: Polygon2D[]; block: Polygon2D[] };
  /** [x, y, height] */
  trees: number[][];
}

const WALL: MaterialName[] = ['brick', 'concrete', 'glass'];

export async function loadContext(): Promise<ContextData | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/context.json`);
    return r.ok ? ((await r.json()) as ContextData) : null;
  } catch {
    return null; // e.g. unit tests without a server: the campus still builds
  }
}

export function buildContext(ctx: ContextData): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  // ground: streets at road level, blocks at curb level (same as the campus), never overlapping
  const G = new Batcher();
  for (const p of ctx.ground.road) G.polygon('asphalt', p.outer, p.holes, 0, true);
  // blocks: dull grey-brown urban ground (gravel), so distant haze doesn't read lawn-green
  for (const p of ctx.ground.block) G.polygon('roof', p.outer, p.holes, CURB_H, true);
  const g = G.toMesh('campus-context-ground');
  if (g) { g.receiveShadow = true; out.push(g); }

  // buildings: one box each (walls + gravel roof)
  const B = new Batcher();
  for (const [cx, cy, ux, uy, len, wid, h, style] of ctx.buildings) {
    const wx = cx!, wz = -cy!, tx = ux!, tz = -uy!;
    const nx = tz, nz = -tx;
    const ox = wx - tx * len! / 2 + nx * wid! / 2, oz = wz - tz * len! / 2 + nz * wid! / 2;
    B.boxLocal(WALL[style!] ?? 'concrete', ox, oz, tx, tz, nx, nz, 0, len!, 0, h!, 0, wid!, 'flrk');
    B.boxLocal('roof', ox, oz, tx, tz, nx, nz, 0, len!, 0, h!, 0, wid!, 't');
  }
  const b = B.toMesh('campus-context-buildings');
  if (b) { b.receiveShadow = true; out.push(b); }

  // trees: one lumpy blob each, darker than lawn (foliage stand-in, see trees.ts)
  if (ctx.trees.length) {
    let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 0);
    geo.deleteAttribute('normal');
    geo = mergeVertices(geo);
    geo.scale(0.36, 0.3, 0.36);
    geo.translate(0, 0.62, 0);
    geo.computeVertexNormals();
    const im = new THREE.InstancedMesh(geo, getMaterial('grass'), ctx.trees.length);
    im.name = 'campus-context-trees';
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    ctx.trees.forEach(([x, y, h], i) => {
      const r = makeRng(`ctx-tree:${x},${y}`);
      q.setFromAxisAngle(up, r.range(0, Math.PI * 2));
      m.compose(p.set(x!, CURB_H, -y!), q, s.set(h! * r.range(0.9, 1.2), h!, h! * r.range(0.9, 1.2)));
      im.setMatrixAt(i, m);
      const l = r.range(0.85, 1.1);
      im.setColorAt(i, c.setRGB(0.34 * l, 0.37 * l, 0.25 * l));
    });
    im.receiveShadow = true;
    im.computeBoundingSphere();
    out.push(im);
  }
  for (const o of out) o.castShadow = false;
  return out;
}
