import * as THREE from 'three';
import type { PlanPoint } from '../../core/geo';
import { Batcher } from './batcher';
import { CURB_H, STREET_KINDS } from './ground';
import { makeRng } from './rng';
import type { SegmentIndex } from './spatial';
import type { CampusDataExt } from './types';

/**
 * Street furniture with real-world proportions, instanced (one InstancedMesh per prop type,
 * one draw call per material group). Props do not cast shadows (performance budget).
 * Every prototype is modeled with local +z = "front" (the side facing the street/path) and +x = along it.
 */

function proto(build: (B: Batcher) => void): THREE.Mesh {
  const B = new Batcher();
  build(B);
  return B.toMesh('proto')!;
}

/** Box in prototype space (center x/z, size, y range), axis aligned. */
function bx(B: Batcher, m: Parameters<Batcher['box']>[0], x: number, z: number, sx: number, sz: number, y0: number, y1: number, bottom = false): void {
  B.box(m, x, z, 1, 0, sx, sz, y0, y1, bottom);
}

/** Chicago park bench: wood slats on cast-metal frame. 1.8 m long, seat 0.45 m. */
const bench = () => proto((B) => {
  for (let i = 0; i < 4; i++) bx(B, 'wood', 0, -0.05 + i * 0.11 - 0.17 + 0.05, 1.8, 0.09, 0.42, 0.46, true);
  for (let i = 0; i < 3; i++) {
    const y = 0.55 + i * 0.12;
    bx(B, 'wood', 0, -0.25 - i * 0.03, 1.8, 0.035, y, y + 0.09, true);
  }
  for (const x of [-0.75, 0.75]) {
    bx(B, 'metal', x, 0.12, 0.06, 0.06, 0, 0.42);
    bx(B, 'metal', x, -0.2, 0.06, 0.06, 0, 0.42);
    bx(B, 'metal', x, -0.04, 0.06, 0.42, 0.36, 0.42, true);
    bx(B, 'metal', x, -0.29, 0.05, 0.05, 0.42, 0.9);
    bx(B, 'metal', x, -0.02, 0.05, 0.5, 0.6, 0.64, true); // armrest
  }
});

/** Chicago street light: ~9 m tapered pole, mast arm over the road, cobra-head luminaire. */
const streetLamp = () => proto((B) => {
  bx(B, 'metal', 0, 0, 0.42, 0.42, 0, 0.7);
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const r = 0.11 - (i / segs) * 0.05;
    bx(B, 'metal', 0, 0, r * 2, r * 2, 0.7 + i * 1.4, 0.7 + (i + 1) * 1.4);
  }
  // arm toward +z (street), rising slightly
  bx(B, 'metal', 0, 1.1, 0.07, 2.2, 8.8, 8.9, true);
  bx(B, 'metal', 0, 0.2, 0.07, 0.4, 8.6, 8.95, true);
  bx(B, 'metal', 0, 2.45, 0.34, 0.75, 8.62, 8.86, true);
  bx(B, 'glass', 0, 2.45, 0.28, 0.6, 8.58, 8.62, true);
});

/** Campus pedestrian light: 4.5 m pole with lantern. */
const pathLamp = () => proto((B) => {
  bx(B, 'metal', 0, 0, 0.3, 0.3, 0, 0.5);
  bx(B, 'metal', 0, 0, 0.12, 0.12, 0.5, 4.0);
  bx(B, 'metal', 0, 0, 0.42, 0.42, 4.0, 4.08, true);
  bx(B, 'glass', 0, 0, 0.34, 0.34, 4.08, 4.55);
  bx(B, 'metal', 0, 0, 0.46, 0.46, 4.55, 4.68, true);
});

/** Round litter bin, 0.6 m wide, 0.95 m tall. */
const trashCan = () => proto((B) => {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, x = Math.cos(a) * 0.27, z = Math.sin(a) * 0.27;
    B.box('metal', x, z, -Math.sin(a), Math.cos(a), 0.23, 0.04, 0.03, 0.92);
  }
  bx(B, 'metal', 0, 0, 0.64, 0.64, 0.92, 1.0, true);
  bx(B, 'concreteDark', 0, 0, 0.5, 0.5, 0, 0.03);
});

/** Row of 3 inverted-U "staple" bike racks, 0.9 m tall, 0.75 m wide, 0.9 m apart. */
const bikeRack = () => proto((B) => {
  for (const x of [-0.9, 0, 0.9]) {
    bx(B, 'metal', x - 0.34, 0, 0.05, 0.05, 0, 0.82);
    bx(B, 'metal', x + 0.34, 0, 0.05, 0.05, 0, 0.82);
    bx(B, 'metal', x, 0, 0.73, 0.05, 0.82, 0.88, true);
  }
});

/** CTA-style bus shelter (no logos): 3.6 x 1.5 m, glass back and end panels, flat roof. */
const busShelter = () => proto((B) => {
  for (const x of [-1.75, 1.75]) for (const z of [-0.65, 0.65]) bx(B, 'metal', x, z, 0.08, 0.08, 0, 2.45);
  bx(B, 'metal', 0, 0, 3.8, 1.7, 2.45, 2.6, true);
  bx(B, 'glass', 0, -0.68, 3.4, 0.03, 0.15, 2.3, true);
  bx(B, 'glass', -1.75, -0.05, 0.03, 1.1, 0.15, 2.3, true);
  bx(B, 'metal', 0, -0.4, 2.0, 0.35, 0.44, 0.48, true);
  bx(B, 'metal', 0, -0.4, 0.06, 0.06, 0, 0.44);
});

/** Bus stop sign pole. */
const busSign = () => proto((B) => {
  bx(B, 'metal', 0, 0, 0.06, 0.06, 0, 2.9);
  bx(B, 'metal', 0.25, 0, 0.45, 0.03, 2.3, 2.85, true);
});

export interface PropsResult {
  objects: THREE.Object3D[];
  /** Simple boxes for collisions (benches, poles, bins, shelters, tree trunks). */
  collider: THREE.Mesh | null;
}

interface Placement { x: number; y: number; angle: number }

/** Orientation: local +z faces the nearest street (or path) segment; long axis parallel to it. */
function orient(p: PlanPoint, segs: SegmentIndex, streetsOnly: boolean): Placement & { dist: number; street: boolean } {
  const near = segs.nearest(p[0], p[1], 40, streetsOnly ? (s) => STREET_KINDS.has(s.kind) : undefined) ?? segs.nearest(p[0], p[1], 120);
  if (!near) return { x: p[0], y: p[1], angle: 0, dist: Infinity, street: false };
  const s = near.seg;
  const dx = s.bx - s.ax, dy = s.by - s.ay, l = Math.hypot(dx, dy) || 1;
  // vector from point to the line
  const t = Math.max(0, Math.min(1, ((p[0] - s.ax) * dx + (p[1] - s.ay) * dy) / (l * l)));
  const fx = s.ax + dx * t - p[0], fy = s.ay + dy * t - p[1];
  // world: x = plan x, z = -plan y. Rotation about +y so that local +z points along (fx, -fy) in world
  const wx = fx, wz = -fy;
  const angle = Math.hypot(wx, wz) > 1e-3 ? Math.atan2(wx, wz) : Math.atan2(dx, -dy);
  return { x: p[0], y: p[1], angle, dist: near.dist, street: STREET_KINDS.has(s.kind) };
}

function instanced(protoMesh: THREE.Mesh, places: Placement[], name: string): THREE.InstancedMesh | null {
  if (!places.length) return null;
  const im = new THREE.InstancedMesh(protoMesh.geometry, protoMesh.material, places.length);
  im.name = name;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  places.forEach((p, i) => {
    q.setFromAxisAngle(up, p.angle);
    m.compose(new THREE.Vector3(p.x, CURB_H, -p.y), q, one);
    im.setMatrixAt(i, m);
  });
  im.castShadow = false;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  return im;
}

export function buildProps(data: CampusDataExt, segs: SegmentIndex, trees: { p: PlanPoint }[]): PropsResult {
  const objects: THREE.Object3D[] = [];
  const C = new Batcher(); // collider boxes
  const colBox = (p: Placement, lx: number, lz: number, sx: number, sz: number, h: number) => {
    const c = Math.cos(p.angle), s = Math.sin(p.angle);
    // local (lx, lz) -> world offset; local x axis in world = (cos, -sin), local z = (sin, cos)
    const wx = p.x + lx * c + lz * s, wz = -p.y - lx * s + lz * c;
    C.box('concrete', wx, wz, c, -s, sx, sz, CURB_H, CURB_H + h, true);
  };
  const add = (o: THREE.Object3D | null) => { if (o) objects.push(o); };

  // benches face the nearest path; streets lamps lean over the street
  const benches = data.props.bench.map((p) => orient(p, segs, false));
  // bench prototype: front = +z, so it faces the path
  add(instanced(bench(), benches, 'campus-benches'));
  benches.forEach((p) => colBox(p, 0, -0.1, 1.8, 0.6, 0.9));

  const lamps = data.props.streetLamp.map((p) => orient(p, segs, true));
  const street = lamps.filter((l) => l.street && l.dist < 14);
  const path = lamps.filter((l) => !(l.street && l.dist < 14));
  add(instanced(streetLamp(), street, 'campus-street-lamps'));
  add(instanced(pathLamp(), path, 'campus-path-lamps'));
  for (const l of lamps) colBox(l, 0, 0, 0.3, 0.3, 4);

  const bins = data.props.wasteBasket.map((p) => orient(p, segs, false));
  add(instanced(trashCan(), bins, 'campus-trash-cans'));
  bins.forEach((p) => colBox(p, 0, 0, 0.6, 0.6, 1));

  const racks = data.props.bicycleParking.map((p) => orient(p, segs, false));
  add(instanced(bikeRack(), racks, 'campus-bike-racks'));
  racks.forEach((p) => colBox(p, 0, 0, 2.6, 0.1, 0.9));

  // bus stops: shelters on major streets (deterministic half of them), sign poles everywhere
  const stops = data.props.busStop.map((p) => orient(p, segs, true));
  const shelters = stops.filter((s) => s.street && s.dist < 16 && makeRng(`bus:${s.x},${s.y}`).chance(0.55));
  add(instanced(busShelter(), shelters, 'campus-bus-shelters'));
  add(instanced(busSign(), stops, 'campus-bus-signs'));
  shelters.forEach((p) => { colBox(p, 0, -0.68, 3.6, 0.1, 2.5); colBox(p, -1.75, 0, 0.1, 1.4, 2.5); });

  for (const t of trees) colBox({ x: t.p[0], y: t.p[1], angle: 0 }, 0, 0, 0.45, 0.45, 3);

  const collider = C.toMesh('campus-prop-colliders');
  return { objects, collider };
}
