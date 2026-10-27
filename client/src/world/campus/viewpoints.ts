import * as THREE from 'three';
import type { PlanPoint } from '../../core/geo';
import type { World } from '../../core/world';
import { centroid, distToRing, pointInPolygon } from './geom';
import { CURB_H } from './ground';
import type { CampusDataExt } from './types';

const EYE = 1.7;

function buildingCenter(data: CampusDataExt, name: string): PlanPoint | null {
  const vols = data.buildings.filter((b) => b.name === name);
  if (!vols.length) return null;
  let ax = 0, ay = 0, aw = 0;
  for (const v of vols) {
    const c = centroid(v.footprint.outer);
    const w = Math.abs(v.footprint.outer.length) + v.height; // rough weight
    ax += c[0] * w; ay += c[1] * w; aw += w;
  }
  return [ax / aw, ay / aw];
}

/**
 * Point on a named street where the street crosses x = value (axis 'x') or y = value (axis 'y').
 * Returns the street center point and the street's local direction.
 */
export function streetPoint(data: CampusDataExt, name: string, axis: 'x' | 'y', value: number): { p: PlanPoint; dir: PlanPoint; width: number } | null {
  const k = axis === 'x' ? 0 : 1;
  for (const l of data.roadLines) {
    if (l.name !== name) continue;
    for (let i = 0; i + 1 < l.points.length; i++) {
      const a = l.points[i]!, b = l.points[i + 1]!;
      if ((a[k] - value) * (b[k] - value) > 0 || a[k] === b[k]) continue;
      const t = (value - a[k]) / (b[k] - a[k]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], width: l.width };
    }
  }
  return null;
}

const W = (p: PlanPoint, h: number) => new THREE.Vector3(p[0], h, -p[1]);

/**
 * Walk from a street center line outward (direction `side`, plan unit vector) and return the
 * middle of the first sidewalk strip found (divided roads have two carriageways, so a fixed
 * offset is not enough).
 */
function sidewalkFrom(data: CampusDataExt, p: PlanPoint, side: PlanPoint): PlanPoint {
  const inKind = (q: PlanPoint, k: 'sidewalk' | 'road') => data.surfaces[k].some((s) => pointInPolygon(q[0], q[1], s.outer, s.holes));
  let start = -1;
  for (let d = 2; d <= 40; d += 0.25) {
    const q: PlanPoint = [p[0] + side[0] * d, p[1] + side[1] * d];
    const sw = inKind(q, 'sidewalk');
    if (sw && start < 0) start = d;
    if (!sw && start >= 0) { const m = (start + d) / 2; return [p[0] + side[0] * m, p[1] + side[1] * m]; }
  }
  // no mapped sidewalk: first point off the road + 2 m
  for (let d = 2; d <= 40; d += 0.5) {
    const q: PlanPoint = [p[0] + side[0] * d, p[1] + side[1] * d];
    if (!inKind(q, 'road')) return [q[0] + side[0] * 2, q[1] + side[1] * 2];
  }
  return [p[0] + side[0] * 8, p[1] + side[1] * 8];
}

/**
 * Slide a street-level camera along the street (±dir) until no tree trunk stands in the first
 * 25 m of its view corridor, so screenshots are not blocked by a trunk right in front of the lens.
 */
function clearOfTrees(data: CampusDataExt, p: PlanPoint, look: PlanPoint, along: PlanPoint): PlanPoint {
  const l = Math.hypot(look[0], look[1]) || 1;
  const fx = look[0] / l, fy = look[1] / l;
  const blocked = (q: PlanPoint) => data.trees.some((t) => {
    const dx = t.p[0] - q[0], dy = t.p[1] - q[1];
    const f = dx * fx + dy * fy;
    return f > -0.5 && f < 7 && Math.abs(dx * -fy + dy * fx) < Math.min(2.4, 1.0 + 0.45 * Math.max(0, f));
  });
  for (const k of [0, 3, -3, 6, -6, 9, -9, 12, -12, 15, -15]) {
    const q: PlanPoint = [p[0] + along[0] * k, p[1] + along[1] * k];
    if (!blocked(q)) return q;
  }
  return p;
}

export function addCampusViewpoints(world: World, data: CampusDataExt): void {
  // The Quad: the lawn ringed by Stevenson, Grant, Douglass, Jefferson and Henry Halls.
  const ring = ['Stevenson Hall', 'Grant Hall', 'Douglass Hall', 'Jefferson Hall', 'Henry Hall'].map((n) => buildingCenter(data, n)).filter((p): p is PlanPoint => !!p);
  const quad: PlanPoint = ring.length ? [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length] : [48, 125];
  const uh = buildingCenter(data, 'University Hall') ?? [-42, 174];

  // Aerial from the south-east, ~350 m up, looking north-west over the Quad toward University Hall.
  world.addViewpoint('map-aerial', {
    position: W([quad[0] + 330, quad[1] - 330], 350),
    target: W([(quad[0] + uh[0]) / 2 - 30, (quad[1] + uh[1]) / 2 + 30], 0),
    fov: 55,
  });

  // Standing on the Quad, looking at University Hall.
  world.addViewpoint('map-quad-ground', {
    position: W([quad[0] + 25, quad[1] - 20], CURB_H + EYE),
    target: W(uh, 30),
    fov: 65,
  });

  // Halsted St, west sidewalk south of Student Center East, looking north toward SCE / SRF.
  const sce = buildingCenter(data, 'Student Center East') ?? [212, -31];
  const hal = streetPoint(data, 'South Halsted Street', 'y', sce[1] - 170);
  if (hal) {
    const p = clearOfTrees(data, sidewalkFrom(data, hal.p, [-1, 0]), [0.03, 1], [0, 1]);
    world.addViewpoint('map-halsted', { position: W(p, CURB_H + EYE), target: W([p[0] + 6, p[1] + 200], 12), fov: 65 });
  }

  // Harrison St at eye level: south sidewalk west of Morgan, looking east (ARC left, University Hall right).
  const har = streetPoint(data, 'West Harrison Street', 'x', uh[0] - 140);
  if (har) {
    const p = clearOfTrees(data, sidewalkFrom(data, har.p, [0, -1]), [1, 0.015], [1, 0]);
    world.addViewpoint('map-harrison', { position: W(p, CURB_H + EYE), target: W([p[0] + 200, p[1] + 3], 10), fov: 65 });
  }

  // Lecture Center plaza (Brutalist close-up): between Lecture Centers A–F, looking at Lecture Center C.
  const lcs = ['A', 'B', 'C', 'D', 'E', 'F'].map((k) => buildingCenter(data, `Lecture Center ${k}`)).filter((p): p is PlanPoint => !!p);
  if (lcs.length >= 4) {
    const c: PlanPoint = [lcs.reduce((s, p) => s + p[0], 0) / lcs.length, lcs.reduce((s, p) => s + p[1], 0) / lcs.length];
    const lcC = buildingCenter(data, 'Lecture Center C') ?? [c[0] + 45, c[1] + 25];
    world.addViewpoint('map-lecture-centers', { position: W([c[0] - 22, c[1] - 12], CURB_H + EYE), target: W(lcC, 5), fov: 70 });
  }

  // Low aerial over Little Italy rowhouses (roofs, cornices, alleys), looking north-west across Taylor St.
  const tay0 = streetPoint(data, 'West Taylor Street', 'x', -230);
  if (tay0) {
    world.addViewpoint('map-little-italy-low', { position: W([tay0.p[0] + 60, tay0.p[1] - 90], 55), target: W([tay0.p[0] - 60, tay0.p[1] + 40], 0), fov: 60 });
  }

  // Building portraits (facade checks against docs/research/facades.md)
  const portrait = (vp: string, name: string, bearingDeg: number, dist: number, eye: number, lookH: number, fov = 60) => {
    const vols = data.buildings.filter((b) => b.name === name);
    if (!vols.length) return;
    const all = vols.flatMap((b) => b.footprint.outer);
    const c = buildingCenter(data, name)!;
    const a = (bearingDeg * Math.PI) / 180; // 0 = north, 90 = east
    const dx = Math.sin(a), dy = Math.cos(a);
    // distance from the center to the footprint edge along the bearing
    let r = 0;
    for (const p of all) r = Math.max(r, (p[0] - c[0]) * dx + (p[1] - c[1]) * dy);
    // step outward until the camera is clear of every building (incl. stair towers / colonnades)
    const blocked = (q: PlanPoint) => data.buildings.some((b) => b.minHeight < 0.5 && (pointInPolygon(q[0], q[1], b.footprint.outer, b.footprint.holes) || distToRing(q[0], q[1], b.footprint.outer) < 6));
    let d = dist;
    let pos: PlanPoint = [c[0] + dx * (r + d), c[1] + dy * (r + d)];
    while (blocked(pos) && d < dist + 60) { d += 2; pos = [c[0] + dx * (r + d), c[1] + dy * (r + d)]; }
    world.addViewpoint(vp, { position: W(pos, CURB_H + eye), target: W(c, lookH), fov });
  };
  portrait('map-sce', 'Student Center East', 205, 16, EYE, 9);
  portrait('map-seo', 'Science & Engineering Offices', 60, 22, EYE, 22, 65);
  portrait('map-bsb', 'Behavioral Sciences Building', 150, 30, EYE, 8);
  portrait('map-arc', 'Academic and Residential Complex', 190, 28, EYE, 16, 65);
  portrait('map-sel', 'Science and Engineering Laboratories', 0, 30, EYE, 10);
  // B3 close-up: SEL East/West + bridge from the south plaza, and SEO tower from the NE.
  portrait('b3-sel-close', 'Science and Engineering Laboratories', 180, 18, EYE, 8, 65);
  portrait('b3-seo-close', 'Science & Engineering Offices', 45, 16, EYE, 18, 60);
  // B4: SEL bridge close-up (part_c between East/West), and UH/Daley far shells.
  // SEL bridge close-up: same framing as b3-sel-close (shows elevated span with clear air under it).
  portrait('b4-sel-bridge', 'Science and Engineering Laboratories', 180, 18, EYE, 8, 65);
  // South of the elevated span looking north-up at the soffit and pier grid.
  world.addViewpoint('b4-sel-bridge-under', {
    position: new THREE.Vector3(152.3, 1.8, 210),
    target: new THREE.Vector3(152.3, 11, 194),
    fov: 70,
  });
  portrait('b4-uh-far', 'University Hall', 90, 160, 25, 40, 50);
  portrait('b4-daley-far', 'Richard J. Daley Library', 45, 150, 20, 12, 55);
  portrait('map-henry-hall', 'Henry Hall', 160, 22, EYE, 6);
  portrait('map-burnham-hall', 'Burnham Hall', 200, 22, EYE, 6);
  portrait('map-grant-hall', 'Grant Hall', 0, 24, EYE, 6);
  portrait('map-hull-house', 'Jane Addams Hull-House Museum', 90, 16, EYE, 6);
  portrait('map-cdrlc', 'Computer Design Research and Learning Center', 190, 22, EYE, 12);
  portrait('map-srf', 'Student Recreation Facility', 270, 30, EYE, 10);

  // Taylor St in Little Italy: south sidewalk, looking west along the rowhouses.
  const tay = streetPoint(data, 'West Taylor Street', 'x', -200);
  if (tay) {
    const p = clearOfTrees(data, sidewalkFrom(data, tay.p, [0, -1]), [-1, 0.02], [1, 0]);
    world.addViewpoint('map-taylor-street', { position: W(p, CURB_H + EYE), target: W([p[0] - 200, p[1] + 4], 8), fov: 65 });
  }
}
