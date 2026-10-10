import * as THREE from 'three';
import type { CampusData } from '../../core/campusData';
import type { PlanPoint } from '../../core/geo';
import type { World } from '../../core/world';
import { Batcher, type BatchRange } from './batcher';
import { buildVolume, type DoorInfo } from './facade';
import { bbox, centroid, distToRing, orientedBox, pointInPolygon, signedArea, triangulate } from './geom';
import { buildContext, loadContext } from './context';
import { buildGround, STREET_KINDS } from './ground';
import { buildProps } from './props';
import { makeRng } from './rng';
import { GridIndex, SegmentIndex, VolumeIndex } from './spatial';
import { chooseStyle, makeStyle, type StyleName } from './styles';
import { buildTrees } from './trees';
import type { CampusBuildingExt, CampusDataExt } from './types';
import { addCampusViewpoints } from './viewpoints';

/**
 * Builds the whole campus from campus.json: generic buildings (with procedural facades),
 * ground surfaces, trees and street props. OWNER: Map Engineer.
 * Buildings whose `landmark` field is set are SKIPPED here — world/landmarks builds them.
 *
 * Performance: building geometry is merged per material inside ~350 m tiles (one draw call per
 * material per tile); trees and props are instanced. See README.md in this folder.
 */

export interface CampusVolumeEntry {
  data: CampusBuildingExt;
  /** Cleaned footprint actually built (plan coords; outer CCW, holes CW). */
  outer: PlanPoint[];
  holes: PlanPoint[][];
  /** Floor bottoms (m above ground) used for the facade rhythm — use them for interior slabs. */
  floors: number[];
  /** Top of the roof slab (flat roofs: below the parapet). */
  roofY: number;
  /** Invisible prism used for physics. */
  collider: THREE.Mesh;
}

export interface CampusBuildingEntry {
  /** Overture building id (all volumes/tiers of the building share it). */
  id: string;
  name: string | null;
  style: StyleName;
  volumes: CampusVolumeEntry[];
  /** Door openings cut into the facade (world coords) — where an interior will connect. */
  doors: DoorInfo[];
  /** Merged tile mesh holding this building's triangles, and where they are in its index buffer. */
  mesh: THREE.Mesh | null;
  ranges: BatchRange[];
}

/** Every generic building, by building id. Filled by buildCampus(). */
export const campusBuildings = new Map<string, CampusBuildingEntry>();

const TILE = 350;
const colliderMat = new THREE.MeshBasicMaterial({ visible: false });

/** Closed prism (walls + top, + bottom when floating) used as the physics shape of a volume. */
function prismCollider(outer: PlanPoint[], holes: PlanPoint[][], y0: number, y1: number, name: string): THREE.Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const ring of [outer, ...holes]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
      const v = pos.length / 3;
      pos.push(a[0], y0, -a[1], b[0], y0, -b[1], b[0], y1, -b[1], a[0], y1, -a[1]);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
  }
  const { pts, tris } = triangulate(outer, holes);
  for (const y of y0 > 0.5 ? [y0, y1] : [y1]) {
    const v = pos.length / 3;
    for (const [x, z] of pts) pos.push(x, y, -z);
    for (const t of tris) idx.push(v + t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingBox();
  const m = new THREE.Mesh(g, colliderMat);
  m.name = name;
  m.visible = false;
  return m;
}

/**
 * Collapse a building's triangles in its merged tile mesh (e.g. when a hand-made model or an
 * interior replaces it). Its collider is left to the caller (see campusBuildings).
 */
export function hideCampusBuilding(id: string): boolean {
  const e = campusBuildings.get(id);
  if (!e?.mesh) return false;
  const index = e.mesh.geometry.getIndex()!;
  const arr = index.array as Uint32Array | Uint16Array;
  for (const r of e.ranges) {
    const first = arr[r.start]!;
    arr.fill(first, r.start, r.start + r.count);
  }
  index.needsUpdate = true;
  return true;
}

/**
 * Returns a test "is this point clear of every building?". Generic footprints get a 1 m margin.
 * Landmarks are hand-built to their footprint's bounding rectangle (filling entrance notches) and
 * have interiors, so trees must also keep their crown out: margin max(1.5 m, 0.3 x tree height).
 */
export function makeFootprintFilter(buildings: CampusBuildingExt[]): (p: PlanPoint, treeHeight: number) => boolean {
  type Ref = { ring: PlanPoint[]; holes: PlanPoint[][]; landmark: boolean };
  const grid = new GridIndex<Ref>(40);
  for (const b of buildings) {
    if (b.minHeight > 0.5) continue;
    let ring = b.footprint.outer, holes = b.footprint.holes;
    if (b.landmark) {
      const o = orientedBox(ring);
      const vx = -o.uy, vy = o.ux;
      ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => [o.cx + o.ux * a! * o.len / 2 + vx * c! * o.wid / 2, o.cy + o.uy * a! * o.len / 2 + vy * c! * o.wid / 2] as PlanPoint);
      holes = [];
    }
    const [x0, y0, x1, y1] = bbox(ring);
    grid.insert({ ring, holes, landmark: !!b.landmark }, x0 - 10, y0 - 10, x1 + 10, y1 + 10);
  }
  return (p, h) => {
    for (const r of grid.at(p[0], p[1])) {
      const margin = r.landmark ? Math.max(1.5, 0.3 * h) : 1.0;
      if (pointInPolygon(p[0], p[1], r.ring, r.holes) || distToRing(p[0], p[1], r.ring) < margin) return false;
    }
    return true;
  };
}

export async function buildCampus(world: World, rawData: CampusData): Promise<void> {
  const data = rawData as unknown as CampusDataExt;
  const t0 = performance.now();
  campusBuildings.clear();
  const root = new THREE.Group();
  root.name = 'campus';
  world.scene.add(root);

  // --- spatial indexes ---------------------------------------------------------------------
  const vix = new VolumeIndex();
  for (const b of data.buildings) vix.add({ id: b.id, outer: b.footprint.outer, holes: b.footprint.holes, height: b.height, minHeight: b.minHeight });
  const segs = new SegmentIndex();
  for (const l of data.roadLines) {
    for (let i = 0; i + 1 < l.points.length; i++) {
      const a = l.points[i]!, b = l.points[i + 1]!;
      segs.add({ ax: a[0], ay: a[1], bx: b[0], by: b[1], kind: l.kind, width: l.width, ...(l.name ? { name: l.name } : {}) });
    }
  }
  const ctx = {
    coverAt: (x: number, y: number, self: string) => vix.coverAt(x, y, self),
    streetDist: (x: number, y: number) => segs.nearest(x, y, 60, (s) => STREET_KINDS.has(s.kind))?.dist ?? Infinity,
  };

  // --- buildings, grouped by building id and by tile ---------------------------------------
  const groups = new Map<string, CampusBuildingExt[]>();
  for (const b of data.buildings) {
    if (b.landmark) continue;
    const id = b.buildingId ?? b.id;
    let g = groups.get(id);
    if (!g) groups.set(id, (g = []));
    g.push(b);
  }
  const tiles = new Map<string, { B: Batcher; ids: string[] }>();
  let volumeCount = 0;
  for (const [id, vols] of groups) {
    const main = vols.reduce((a, b) => (Math.abs(signedArea(b.footprint.outer)) > Math.abs(signedArea(a.footprint.outer)) ? b : a));
    const c = centroid(main.footprint.outer);
    const tk = `${Math.floor(c[0] / TILE)},${Math.floor(c[1] / TILE)}`;
    let tile = tiles.get(tk);
    if (!tile) tiles.set(tk, (tile = { B: new Batcher(), ids: [] }));
    tile.ids.push(id);
    const totalArea = vols.reduce((s, v) => s + Math.abs(signedArea(v.footprint.outer)), 0);
    const tallest = vols.reduce((a, b) => (b.height > a.height ? b : a));
    const styleName = chooseStyle({ ...main, height: tallest.height }, totalArea, c[0], c[1]);
    const style = makeStyle(styleName, makeRng(`style:${id}`), main);
    // mixed-use: rowhouses / lofts / mid-rises right on a commercial street get shop fronts
    if ((styleName === 'rowhouse' || styleName === 'loft' || styleName === 'modern') && totalArea < 2500) {
      const onMain = main.footprint.outer.some(([x, y]) => {
        const n = segs.nearest(x, y, 30, (s) => s.kind === 'primary' || s.kind === 'secondary');
        return !!n && n.dist <= n.seg.width / 2 + 7;
      });
      if (onMain && main.kind !== 'house') style.shopFront = true;
    }
    const mark = tile.B.mark();
    const entry: CampusBuildingEntry = { id, name: main.name, style: styleName, volumes: [], doors: [], mesh: null, ranges: [] };
    for (const v of vols) {
      const res = buildVolume(tile.B, v, style, makeRng(`vol:${v.id}`), ctx, { door: v === main, rooftop: true });
      entry.doors.push(...res.doors);
      const collider = prismCollider(res.outer, res.holes, v.minHeight, v.height, `collider:${v.id}`);
      world.addCollider(collider);
      entry.volumes.push({ data: v, outer: res.outer, holes: res.holes, floors: res.floors, roofY: res.roofY, collider });
      volumeCount++;
    }
    entry.ranges = tile.B.rangesSince(mark);
    campusBuildings.set(id, entry);
  }
  const bgroup = new THREE.Group();
  bgroup.name = 'campus-buildings';
  root.add(bgroup);
  let vertices = 0, drawGroups = 0;
  for (const [tk, tile] of tiles) {
    vertices += tile.B.vertexCount;
    const mesh = tile.B.toMesh(`campus-buildings-${tk}`);
    if (!mesh) continue;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    drawGroups += mesh.geometry.groups.length;
    bgroup.add(mesh);
    for (const id of tile.ids) {
      const e = campusBuildings.get(id)!;
      e.mesh = mesh;
      e.ranges = e.ranges.map((r) => ({ ...r, start: r.start + (tile.B.groupStart.get(r.mat) ?? 0) }));
    }
  }

  // --- ground ----------------------------------------------------------------------------------
  const context = await loadContext();
  const ground = buildGround(data, context?.bounds ?? data.bounds);
  if (context) {
    for (const o of buildContext(context)) {
      root.add(o);
      drawGroups += (o as THREE.Mesh).geometry.groups.length || 1;
    }
  }
  for (const m of [ground.mesh, ground.markings]) if (m) { root.add(m); drawGroups += m.geometry.groups.length; vertices += m.geometry.getAttribute('position').count; }
  if (ground.collider) world.addCollider(ground.collider);

  // --- trees & props (never inside a building: 1 m margin, landmarks by their full rectangle) ----
  const clearOf = makeFootprintFilter(data.buildings);
  const treeData = data.trees.filter((t) => clearOf(t.p, t.height));
  const propData = { ...data, props: Object.fromEntries(Object.entries(data.props).map(([k, v]) => [k, v.filter((p) => clearOf(p, 0))])) as CampusDataExt['props'] };
  const trees = buildTrees(treeData);
  for (const t of trees.objects) root.add(t);
  drawGroups += trees.objects.length;
  world.onUpdate(() => trees.update(world.focus));
  const props = buildProps(propData, segs, treeData);
  for (const o of props.objects) {
    root.add(o);
    drawGroups += (o as THREE.Mesh).geometry.groups.length || 1;
  }
  if (props.collider) world.addCollider(props.collider);

  addCampusViewpoints(world, data);
  console.info(
    `campus: ${campusBuildings.size} buildings / ${volumeCount} volumes in ${tiles.size} tiles, ${data.trees.length} trees, ` +
      `${(vertices / 1e6).toFixed(2)}M static vertices, ~${drawGroups} draw calls (before culling/shadows), ${(performance.now() - t0).toFixed(0)} ms`,
  );
}
