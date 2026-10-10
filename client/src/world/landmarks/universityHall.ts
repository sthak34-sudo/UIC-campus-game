import * as THREE from 'three';
import type { CampusBuilding } from '../../core/campusData';
import type { World } from '../../core/world';
import { FACE, MeshBatch } from './kit/batch';
import { ColliderSet } from './kit/colliders';
import { slidingDoors } from './kit/doors';
import { fitFootprint, localToWorld, type LocalFrame } from './kit/frame';
import { Furnisher, lightPanelGrid } from './kit/furniture';
import { rect } from './kit/rects';
import { buildWall, evenOpenings } from './kit/walls';
import { addInteriorVolume } from './kit/zones';

/**
 * University Hall (601 S Morgan; Walter Netsch / SOM, 1965). 28 floors, LiDAR roof 103.3 m (h50),
 * 104.3 m (h98). Seen from the east/west it gets WIDER as it rises: 150 ft (floors 1–8), 160 ft
 * (9–16), 170 ft (17–28); seen from the north/south its width is constant (cantilevered tiers).
 * Exposed reinforced-concrete skeleton with a dense grid of narrow, deep-set windows.
 *
 * Model: the facade grid is REAL geometry on every floor (piers, spandrels, recessed glass) merged into
 * one mesh per material (≈3 draw calls for the whole tower). Ground floor: tall glazed lobby set back
 * behind massive columns, automatic doors on the east and west, an enterable lobby with the elevator
 * core. Upper floors are sealed for now (an opaque dark core sits behind the glass).
 */
export const UH = {
  /** Facade module = 5 ft. 30/32/34 modules = 150/160/170 ft. */
  module: 1.524,
  tierBays: [30, 32, 34],
  /** Last floor (1-based) of each tier. */
  tierTopFloor: [8, 16, 28],
  floors: 28,
  /** Window bays across the narrow (north/south) faces. */
  shortBays: 14,
  /** Finished floor level of floor 1 (sits on the plaza). */
  floorY: 0.05,
  groundH: 6.1,
  typicalH: 3.58,
  /** Facade layering (m). */
  pierW: 0.6,
  /** Solid corner = one full module on each face (assumption, see README). */
  cornerW: 1.524,
  recess: 0.38,
  frameDepth: 0.55,
  spandrelH: 1.1,
  crownH: 1.1,
  /** Ground floor: glass line set back behind the column line. */
  lobbySetback: 2.8,
  columnSize: 1.1,
  /** Columns every N modules on the long faces. */
  columnEvery: 5,
  plazaMargin: 7,
  doorWidth: 2.0,
  doorHeight: 2.6,
} as const;

export function uhFloorY(f: number): number {
  return UH.floorY + (f <= 1 ? 0 : UH.groundH + (f - 2) * UH.typicalH);
}

export function uhTier(f: number): number {
  return f <= UH.tierTopFloor[0] ? 0 : f <= UH.tierTopFloor[1] ? 1 : 2;
}

export interface UniversityHallInfo {
  frame: LocalFrame;
  group: THREE.Group;
  halfX: number;
  /** Half length per tier (local z). */
  tierHalfZ: number[];
  roofY: number;
  topY: number;
  /** World-space points for viewpoints. */
  eastEntrance: THREE.Vector3;
  /** Local z of the east/west lobby doors. */
  eastEntranceZ: number;
  lobbyCenter: THREE.Vector3;
}

export function buildUniversityHall(world: World, b: CampusBuilding): UniversityHallInfo {
  const fit = fitFootprint(b.footprint.outer);
  const frame: LocalFrame = { origin: fit.origin, rotY: fit.rotY, halfX: fit.halfX, halfZ: fit.halfZ };
  const hx = fit.halfX; // ≈ 11 m (74 ft deep), from the real footprint
  const tierHalfZ = UH.tierBays.map((n) => (n * UH.module) / 2);
  const roofY = uhFloorY(UH.floors + 1);
  const topY = roofY + UH.crownH;

  const group = new THREE.Group();
  group.name = 'landmark:university-hall';
  group.position.copy(frame.origin);
  group.rotation.y = frame.rotY;

  const ext = new MeshBatch(); // casts shadows
  const inner = new MeshBatch(); // lobby interior
  const col = new ColliderSet();
  const D = UH.frameDepth;

  // ------------------------------------------------------------------ tower floors 2..28
  for (let f = 2; f <= UH.floors; f++) {
    const t = uhTier(f);
    const hz = tierHalfZ[t];
    const y0 = uhFloorY(f);
    const y1 = uhFloorY(f + 1);
    const ws = y0 + UH.spandrelH; // window sill
    const wh = y1 - ws; // window strip height
    // spandrel band (wraps all four faces) - outward, top (sill) and bottom (head) faces only
    for (const s of [1, -1]) {
      ext.box('concrete', s * (hx - D / 2), y0 + UH.spandrelH / 2, 0, D, UH.spandrelH, 2 * hz, { faces: (s > 0 ? FACE.PX : FACE.NX) | FACE.PY | FACE.NY });
      ext.box('concrete', 0, y0 + UH.spandrelH / 2, s * (hz - D / 2), 2 * hx - 2 * D, UH.spandrelH, D, { faces: (s > 0 ? FACE.PZ : FACE.NZ) | FACE.PY | FACE.NY });
    }
    // piers on the long faces (x = ±hx)
    const nL = UH.tierBays[t];
    const mL = (2 * hz) / nL;
    for (let i = 1; i < nL; i++) {
      const z = -hz + i * mL;
      for (const s of [1, -1]) ext.box('concrete', s * (hx - D / 2), ws + wh / 2, z, D, wh, UH.pierW, { faces: (s > 0 ? FACE.PX : FACE.NX) | FACE.PZ | FACE.NZ });
    }
    // piers on the short faces (z = ±hz)
    const mS = (2 * hx) / UH.shortBays;
    for (let i = 1; i < UH.shortBays; i++) {
      const x = -hx + i * mS;
      for (const s of [1, -1]) ext.box('concrete', x, ws + wh / 2, s * (hz - D / 2), UH.pierW, wh, D, { faces: (s > 0 ? FACE.PZ : FACE.NZ) | FACE.PX | FACE.NX });
    }
    // recessed glass strips (one quad per face per floor)
    const gIn = UH.recess;
    for (const s of [1, -1]) {
      ext.box('glass', s * (hx - gIn), ws + wh / 2, 0, 0.02, wh, 2 * hz, { faces: s > 0 ? FACE.PX : FACE.NX });
      ext.box('glass', 0, ws + wh / 2, s * (hz - gIn), 2 * hx, wh, 0.02, { faces: s > 0 ? FACE.PZ : FACE.NZ });
    }
    // window head/jamb backing: the recess "floor/ceiling" between glass and frame face are the
    // spandrel top/bottom faces; the recess back wall is the glass itself.
  }
  // solid corner columns per tier (full tier height) and the cantilever soffits
  for (let t = 0; t < 3; t++) {
    const hz = tierHalfZ[t];
    const fy0 = t === 0 ? uhFloorY(2) : uhFloorY(UH.tierTopFloor[t - 1] + 1);
    const fy1 = uhFloorY(UH.tierTopFloor[t] + 1);
    for (const sx of [1, -1])
      for (const sz of [1, -1])
        ext.box('concrete', sx * (hx - UH.cornerW / 2), (fy0 + fy1) / 2, sz * (hz - UH.cornerW / 2), UH.cornerW, fy1 - fy0, UH.cornerW, {
          faces: (sx > 0 ? FACE.PX : FACE.NX) | (sz > 0 ? FACE.PZ : FACE.NZ),
        });
    // dark opaque interior behind the glass (so future transparent glass does not reveal a hollow tower)
    ext.box('concreteDark', 0, (fy0 + fy1) / 2, 0, 2 * (hx - 1.0), fy1 - fy0, 2 * (hz - 1.0), { faces: FACE.PX | FACE.NX | FACE.PZ | FACE.NZ });
    if (t > 0) {
      const prev = tierHalfZ[t - 1];
      for (const s of [1, -1]) {
        const za = s * prev;
        const zb = s * hz;
        ext.boxMinMax('concrete', -hx, fy0 - 0.45, Math.min(za, zb), hx, fy0, Math.max(za, zb), FACE.NY | FACE.PX | FACE.NX | (s > 0 ? FACE.PZ : FACE.NZ));
      }
    }
  }
  // crown / parapet and roof
  const hzTop = tierHalfZ[2];
  ext.boxMinMax('concrete', -hx, roofY, -hzTop, hx, topY, hzTop, FACE.PX | FACE.NX | FACE.PZ | FACE.NZ);
  ext.boxMinMax('roof', -hx + 0.4, roofY, -hzTop + 0.4, hx - 0.4, topY - 0.7, hzTop - 0.4, FACE.PY);
  ext.boxMinMax('concrete', -hx, topY - 0.05, -hzTop, hx, topY, hzTop, FACE.PY);
  // rooftop: elevator machine room + mechanical units (small: LiDAR h98 is only ~1 m above h50)
  ext.boxMinMax('concreteDark', -2.2, topY - 0.7, -3.6, 2.2, topY + 1.6, 3.6);
  ext.boxMinMax('metal', -6.5, topY - 0.7, 6, -3, topY + 0.7, 11);
  ext.boxMinMax('metal', 3, topY - 0.7, -11, 6.5, topY + 0.7, -6);
  col.boxMinMax(-hx, uhFloorY(2), -hzTop, hx, topY, hzTop, 'solid');

  // ------------------------------------------------------------------ ground floor (lobby)
  const hz0 = tierHalfZ[0];
  const y2 = uhFloorY(2);
  const sb = UH.lobbySetback;
  const gx = hx - sb;
  const gz = hz0 - sb;
  // soffit/podium slab under floor 2 (covers the colonnade)
  ext.boxMinMax('concrete', -hx, y2 - 0.6, -hz0, hx, y2, hz0, FACE.NY | FACE.PX | FACE.NX | FACE.PZ | FACE.NZ);
  // massive ground-floor columns on the facade line
  const cs = UH.columnSize;
  const nCols = UH.tierBays[0] / UH.columnEvery;
  for (let i = 0; i <= nCols; i++) {
    const z = THREE.MathUtils.clamp(-hz0 + (i * 2 * hz0) / nCols, -hz0 + cs / 2, hz0 - cs / 2);
    for (const s of [1, -1]) {
      ext.box('concrete', s * (hx - cs / 2), (UH.floorY + y2) / 2, z, cs, y2 - UH.floorY, cs);
      col.box(s * (hx - cs / 2), (UH.floorY + y2) / 2, z, cs, y2 - UH.floorY, cs, 'column');
    }
  }
  for (const s of [1, -1]) {
    ext.box('concrete', 0, (UH.floorY + y2) / 2, s * (hz0 - cs / 2), cs, y2 - UH.floorY, cs);
    col.box(0, (UH.floorY + y2) / 2, s * (hz0 - cs / 2), cs, y2 - UH.floorY, cs, 'column');
  }
  // glass lobby enclosure with doors in the middle of the east and west sides
  const lobbyTop = y2 - 0.6;
  const yF = UH.floorY;
  // doors sit mid-way between two ground-floor columns (columns every 5 modules, one at z = 0)
  const doorZ = (hz0 / (UH.tierBays[0] / UH.columnEvery));
  const glassSide = (a: [number, number], b: [number, number], doorAt: number | null) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const panes = (s0: number, s1: number) => {
      const n = Math.max(1, Math.round((s1 - s0) / 1.6));
      return evenOpenings(s0, s1, n, (s1 - s0) / n - 0.08, yF + 0.1, lobbyTop - 0.1, { glass: 'glass' });
    };
    const dw = UH.doorWidth + 0.2;
    const ops = doorAt !== null ? [...panes(0, doorAt - dw / 2 - 0.04), ...panes(doorAt + dw / 2 + 0.04, len)] : panes(0, len);
    if (doorAt !== null) ops.push({ at: doorAt, width: dw, bottom: yF, top: yF + UH.doorHeight, door: true });
    buildWall(ext, col, { a, b, y0: yF, y1: lobbyTop, thickness: 0.1, mat: 'windowFrame', openings: ops });
    if (doorAt !== null) {
      // transom glass + header above the doors
      const t = doorAt / len;
      const mx = a[0] + (b[0] - a[0]) * t;
      const mz = a[1] + (b[1] - a[1]) * t;
      ext.box('glass', mx, (yF + UH.doorHeight + lobbyTop) / 2, mz, 0.03, lobbyTop - yF - UH.doorHeight - 0.15, UH.doorWidth + 0.2);
      ext.box('windowFrame', mx, yF + UH.doorHeight + 0.08, mz, 0.12, 0.16, UH.doorWidth + 0.4);
    }
  };
  glassSide([gx, -gz], [gx, gz], gz + doorZ);
  glassSide([-gx, gz], [-gx, -gz], gz - doorZ);
  glassSide([-gx, -gz], [gx, -gz], null);
  glassSide([gx, gz], [-gx, gz], null);
  for (const s of [1, -1])
    slidingDoors(world, group, { center: [s * gx, doorZ], y: yF, rotY: Math.PI / 2, clearWidth: UH.doorWidth, holeWidth: UH.doorWidth + 0.2, height: UH.doorHeight });

  // lobby floor, ceiling, elevator core, desk
  inner.boxMinMax('interiorFloor', -gx, 0, -gz, gx, yF, gz, FACE.PY);
  inner.boxMinMax('interiorCeiling', -gx, lobbyTop - 0.02, -gz, gx, lobbyTop, gz, FACE.NY);
  const core = rect(-4.2, 4.2, -8.5, 8.5);
  inner.boxMinMax('interiorWall', core.x0, yF, core.z0, core.x1, lobbyTop, core.z1, FACE.PX | FACE.NX | FACE.PZ | FACE.NZ);
  col.boxMinMax(core.x0, yF, core.z0, core.x1, lobbyTop, core.z1, 'wall');
  for (const s of [1, -1]) {
    for (const z of [-5.2, -1.7, 1.7, 5.2]) {
      inner.box('metal', s * (core.x1 + 0.02), yF + 1.1, z, 0.04, 2.2, 1.1);
      inner.box('windowFrame', s * (core.x1 + 0.015), yF + 1.15, z, 0.04, 2.3, 1.3);
      inner.box('metal', s * (core.x1 + 0.03), yF + 2.6, z, 0.03, 0.12, 0.3); // floor indicator
    }
  }
  const furn = new Furnisher(inner, col);
  furn.counter({ x: 6.5, y: yF, z: -11, rotY: -Math.PI / 2 }, 3.2, 0.8);
  furn.chair({ x: 5.6, y: yF, z: -11, rotY: -Math.PI / 2 });
  for (const z of [10, 14]) furn.sofa({ x: -6.5, y: yF, z, rotY: Math.PI / 2 }, 2.2);
  furn.plant({ x: 7.5, y: yF, z: 15 });
  furn.plant({ x: 7.5, y: yF, z: -15 });
  // directory board by the core
  inner.box('screen', core.x1 + 0.05, yF + 1.6, 7.6, 0.03, 1.0, 1.4);
  lightPanelGrid(inner, rect(-gx + 0.6, gx - 0.6, -gz + 0.6, gz - 0.6), lobbyTop - 0.02, [3.0, 3.0], [0.6, 0.6], (x, z) => x > core.x0 - 0.5 && x < core.x1 + 0.5 && z > core.z0 - 0.5 && z < core.z1 + 0.5);
  // walkable floor of the lobby
  col.boxMinMax(-gx, -0.3, -gz, gx, yF, gz, 'floor');

  // ------------------------------------------------------------------ plaza around the base
  const pm = UH.plazaMargin;
  ext.boxMinMax('plaza', -hx - pm, 0, -hz0 - pm, hx + pm, yF, hz0 + pm, FACE.PY | FACE.PX | FACE.NX | FACE.PZ | FACE.NZ);
  for (const [x0, z0, x1, z1] of [
    [-hx - pm, -hz0 - pm, hx + pm, -gz],
    [-hx - pm, gz, hx + pm, hz0 + pm],
    [-hx - pm, -gz, -gx, gz],
    [gx, -gz, hx + pm, gz],
  ])
    col.boxMinMax(x0, -0.3, z0, x1, yF, z1, 'floor');

  const exterior = ext.build('uh-exterior', { castShadow: true, receiveShadow: true });
  const interior = inner.build('uh-lobby', { castShadow: false, receiveShadow: true });
  group.add(exterior, interior);
  world.scene.add(group);
  col.register(world, group);

  addInteriorVolume(world, frame, 'university-hall', 'University Hall (lobby)', rect(-gx + 0.2, gx - 0.2, -gz + 0.2, gz - 0.2), 0, lobbyTop);

  return {
    frame,
    group,
    halfX: hx,
    tierHalfZ,
    roofY,
    topY,
    eastEntrance: localToWorld(frame, hx + 0.5, 0, doorZ),
    eastEntranceZ: doorZ,
    lobbyCenter: localToWorld(frame, 0, 0, 0),
  };
}
