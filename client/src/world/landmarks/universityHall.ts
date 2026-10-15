import * as THREE from 'three';
import type { CampusBuilding } from '../../core/campusData';
import type { World } from '../../core/world';
import { FACE, MeshBatch, type MatKey } from './kit/batch';
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
  pierW: 0.55,
  /** Depth of the exterior piers and of the floor-edge upstand (m). */
  pierDepth: 0.55,
  upstandDepth: 0.3,
  upstandH: 0.85,
  /** Window wall set back behind the pier face: open gallery ledge on floors 3-28. */
  galleryDepth: 1.3,
  /** Block-I window: clear glass band at top and bottom, bronze centre; window width in a module. */
  blockIClear: 0.35,
  windowW: 0.95,
  /** Solid corner = one full module on each face (assumption, see README). */
  cornerW: 1.524,
  crownH: 1.1,
  /** Ground floor: glass line set back behind the column line. */
  lobbySetback: 2.8,
  /** Giant ground-floor columns. */
  columnSize: 1.6,
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

  // ------------------------------------------------------------------ tower floors 2..28
  // Each face is built in "face coordinates": u runs along the face, depth runs inward from the
  // outer face of the concrete piers. Outer layer: exposed-aggregate piers (continuous per tier) and
  // a low floor-edge upstand. Behind it, floors 3-28 have an open GALLERY LEDGE; the window wall
  // (narrow Block-I windows: clear top/bottom, bronze centre, dark bronze frames, smooth precast
  // panels between) sits UH.galleryDepth behind the pier face. Floor 28 is the 2017-18 curtain wall.
  const C = 'concrete'; // cast-in-place, board-formed skeleton
  const P = 'concreteSmooth';
  const GB = 'glassBronze';
  const GC = 'glass';
  const FR = 'metalBronze';
  const cw = UH.cornerW;
  interface Face { axis: 'x' | 'z'; s: number; h: number; a: number; n: number }
  const faces = (t: number): Face[] => {
    const hz = tierHalfZ[t];
    return [1, -1].flatMap((s) => [
      { axis: 'x' as const, s, h: hx, a: hz, n: UH.tierBays[t] },
      { axis: 'z' as const, s, h: hz, a: hx, n: UH.shortBays },
    ]);
  };
  const out = (F: Face) => (F.axis === 'x' ? (F.s > 0 ? FACE.PX : FACE.NX) : F.s > 0 ? FACE.PZ : FACE.NZ);
  const sides = (F: Face) => (F.axis === 'x' ? FACE.PZ | FACE.NZ : FACE.PX | FACE.NX);
  /** Box in face coordinates: u0..u1 along the face, d0..d1 depth behind the pier face, y0..y1. */
  const fbox = (F: Face, mat: MatKey, u0: number, u1: number, d0: number, d1: number, y0: number, y1: number, faceMask: number) => {
    const n0 = F.s * (F.h - d0);
    const n1 = F.s * (F.h - d1);
    if (F.axis === 'x') ext.boxMinMax(mat, Math.min(n0, n1), y0, u0, Math.max(n0, n1), y1, u1, faceMask);
    else ext.boxMinMax(mat, u0, y0, Math.min(n0, n1), u1, y1, Math.max(n0, n1), faceMask);
  };
  const GD = UH.galleryDepth;
  for (let t = 0; t < 3; t++) {
    const ty0 = t === 0 ? uhFloorY(2) : uhFloorY(UH.tierTopFloor[t - 1] + 1);
    const ty1 = uhFloorY(UH.tierTopFloor[t] + 1);
    const f0 = t === 0 ? 2 : UH.tierTopFloor[t - 1] + 1;
    for (const F of faces(t)) {
      const m = (2 * F.a) / F.n;
      const ua = -F.a + cw;
      const ub = F.a - cw;
      // continuous exterior piers for the whole tier
      for (let i = 1; i < F.n; i++) {
        const u = -F.a + i * m;
        if (u - UH.pierW / 2 < ua - 0.01 || u + UH.pierW / 2 > ub + 0.01) continue;
        fbox(F, C, u - UH.pierW / 2, u + UH.pierW / 2, 0, UH.pierDepth, ty0, ty1, out(F) | sides(F));
      }
      for (let f = f0; f <= UH.tierTopFloor[t]; f++) {
        const y0 = uhFloorY(f);
        const y1 = uhFloorY(f + 1);
        const ledge = f >= 3;
        const gd = ledge ? GD : UH.pierDepth + 0.15; // floor 2 has no gallery
        // floor-edge upstand (the horizontal line of the grid)
        fbox(F, C, ua, ub, 0, UH.upstandDepth, y0 - 0.35, y0 + UH.upstandH, out(F) | FACE.PY | FACE.NY);
        // gallery ledge floor; its underside is the ceiling of the gallery below
        if (ledge) fbox(F, P, ua, ub, UH.upstandDepth, gd, y0 - 0.3, y0, FACE.PY | FACE.NY);
        const sill = y0 + 0.15;
        const head = y1 - 0.35;
        // curb under the windows and lintel above them
        fbox(F, P, ua, ub, gd - 0.02, gd + 0.2, y0, sill, out(F) | FACE.PY);
        fbox(F, P, ua, ub, gd - 0.02, gd + 0.2, head, y1 - (f < UH.floors ? 0.3 : 0), out(F) | FACE.NY);
        if (f === UH.floors) {
          // 2017-18 curtain wall: continuous bronze glass with slim mullions at every module
          fbox(F, GB, ua, ub, gd + 0.05, gd + 0.07, sill, head, out(F));
          for (let i = 0; i <= F.n; i++) {
            const u = -F.a + i * m;
            if (u < ua - 0.01 || u > ub + 0.01) continue;
            fbox(F, FR, u - 0.04, u + 0.04, gd - 0.02, gd + 0.06, sill, head, out(F) | sides(F));
          }
          fbox(F, FR, ua, ub, gd - 0.02, gd + 0.06, sill + 1.0, sill + 1.06, out(F) | FACE.PY | FACE.NY);
        } else {
          // Block-I window bands: clear bottom, bronze centre, clear top (one quad each per face)
          const b0 = sill + UH.blockIClear;
          const b1 = head - UH.blockIClear;
          fbox(F, GC, ua, ub, gd + 0.1, gd + 0.12, sill, b0, out(F));
          fbox(F, GB, ua, ub, gd + 0.1, gd + 0.12, b0, b1, out(F));
          fbox(F, GC, ua, ub, gd + 0.1, gd + 0.12, b1, head, out(F));
          for (const yb of [b0, b1]) fbox(F, FR, ua, ub, gd + 0.04, gd + 0.1, yb - 0.025, yb + 0.025, out(F) | FACE.PY | FACE.NY);
          // smooth precast panels between the windows (windows centred in each module)
          const pw = m - UH.windowW;
          for (let i = 0; i <= F.n; i++) {
            const u = -F.a + i * m;
            const u0 = Math.max(ua, u - pw / 2);
            const u1 = Math.min(ub, u + pw / 2);
            if (u1 - u0 < 0.02) continue;
            fbox(F, P, u0, u1, gd - 0.02, gd + 0.2, sill, head, out(F) | sides(F));
            // dark bronze jamb frames
            fbox(F, FR, u0 - 0.04, u0, gd + 0.02, gd + 0.1, sill, head, out(F));
            fbox(F, FR, u1, u1 + 0.04, gd + 0.02, gd + 0.1, sill, head, out(F));
          }
        }
      }
      // gallery ceiling above the top floor of the building
      if (t === 2) fbox(F, P, ua, ub, UH.upstandDepth, GD, ty1 - 0.3, ty1, FACE.NY);
    }
    // solid corner columns per tier (full tier height)
    const hz = tierHalfZ[t];
    for (const sx of [1, -1])
      for (const sz of [1, -1])
        ext.box(C, sx * (hx - cw / 2), (ty0 + ty1) / 2, sz * (hz - cw / 2), cw, ty1 - ty0, cw, {
          faces: (sx > 0 ? FACE.PX : FACE.NX) | (sz > 0 ? FACE.PZ : FACE.NZ),
        });
    // dark opaque interior behind the window wall
    ext.box('concreteDark', 0, (ty0 + ty1) / 2, 0, 2 * (hx - GD - 0.6), ty1 - ty0, 2 * (hz - GD - 0.6), { faces: FACE.PX | FACE.NX | FACE.PZ | FACE.NZ });
    if (t > 0) {
      // cantilever soffit where the north/south faces step out (also roofs the gallery below)
      const prev = tierHalfZ[t - 1];
      for (const s of [1, -1]) {
        const za = s * (prev - GD - 0.1);
        const zb = s * hz;
        ext.boxMinMax(C, -hx, ty0 - 0.45, Math.min(za, zb), hx, ty0, Math.max(za, zb), FACE.NY | FACE.PX | FACE.NX | (s > 0 ? FACE.PZ : FACE.NZ));
      }
    }
  }
  // crown / parapet and roof
  const hzTop = tierHalfZ[2];
  ext.boxMinMax(C, -hx, roofY, -hzTop, hx, topY, hzTop, FACE.PX | FACE.NX | FACE.PZ | FACE.NZ);
  ext.boxMinMax('roof', -hx + 0.4, roofY, -hzTop + 0.4, hx - 0.4, topY - 0.7, hzTop - 0.4, FACE.PY);
  ext.boxMinMax(C, -hx, topY - 0.05, -hzTop, hx, topY, hzTop, FACE.PY);
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
  ext.boxMinMax(C, -hx, y2 - 0.6, -hz0, hx, y2, hz0, FACE.NY | FACE.PX | FACE.NX | FACE.PZ | FACE.NZ);
  // massive ground-floor columns on the facade line
  const cs = UH.columnSize;
  const nCols = UH.tierBays[0] / UH.columnEvery;
  for (let i = 0; i <= nCols; i++) {
    const z = THREE.MathUtils.clamp(-hz0 + (i * 2 * hz0) / nCols, -hz0 + cs / 2, hz0 - cs / 2);
    for (const s of [1, -1]) {
      ext.box(C, s * (hx - cs / 2), (UH.floorY + y2) / 2, z, cs, y2 - UH.floorY, cs);
      col.box(s * (hx - cs / 2), (UH.floorY + y2) / 2, z, cs, y2 - UH.floorY, cs, 'column');
    }
  }
  for (const s of [1, -1]) {
    ext.box(C, 0, (UH.floorY + y2) / 2, s * (hz0 - cs / 2), cs, y2 - UH.floorY, cs);
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
      return evenOpenings(s0, s1, n, (s1 - s0) / n - 0.08, yF + 0.1, lobbyTop - 0.1, { glass: 'glassClear' });
    };
    const dw = UH.doorWidth + 0.2;
    const ops = doorAt !== null ? [...panes(0, doorAt - dw / 2 - 0.04), ...panes(doorAt + dw / 2 + 0.04, len)] : panes(0, len);
    if (doorAt !== null) ops.push({ at: doorAt, width: dw, bottom: yF, top: lobbyTop - 0.1, door: true });
    buildWall(ext, col, { a, b, y0: yF, y1: lobbyTop, thickness: 0.1, mat: 'windowFrame', openings: ops });
    if (doorAt !== null) {
      // transom glass + header above the doors
      const t = doorAt / len;
      const mx = a[0] + (b[0] - a[0]) * t;
      const mz = a[1] + (b[1] - a[1]) * t;
      ext.box('glassClear', mx, (yF + UH.doorHeight + lobbyTop) / 2, mz, 0.03, lobbyTop - yF - UH.doorHeight - 0.15, UH.doorWidth + 0.2);
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
  inner.boxMinMax('interiorFloorHard', -gx, 0, -gz, gx, yF, gz, FACE.PY);
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
