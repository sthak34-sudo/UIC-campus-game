import * as THREE from 'three';
import type { CampusBuilding } from '../../core/campusData';
import type { World } from '../../core/world';
import { FACE, MeshBatch, type MatKey } from './kit/batch';
import { ColliderSet } from './kit/colliders';
import { slidingDoors } from './kit/doors';
import { fitFootprint, localToWorld, type LocalFrame } from './kit/frame';
import { railing } from './kit/railings';
import { rect, rectMinusHoles, type Rect } from './kit/rects';
import { switchbackStair, type SwitchbackResult } from './kit/stairs';
import { buildWall, evenOpenings, type Opening } from './kit/walls';
import { addInteriorVolume } from './kit/zones';
import { Furnisher } from './kit/furniture';
import { lightPanelMaterial, lm } from './kit/materials';
import { furnishLibrary } from './daleyInterior';

/**
 * Richard J. Daley Library (801 S Morgan; Walter Netsch / SOM, 1963–65, end additions ~1967–68).
 *
 * Research (see README "Assumptions"): 4 storeys, LiDAR roof 18.0 m (h50) / 19.5 m (h98). Brutalist
 * exposed-aggregate concrete columns and floor beams expressed on the facade with precast panel infill;
 * the end bays added in phase 2 are brick-faced. Faces Morgan St to the west and the Quad to the east.
 * Three step-free entrances: Main Doors (east, facing the Quad), IDEA Commons doors (east, south of the
 * main doors) and West Doors (Morgan St). IDEA Commons (2011 renovation) fills half of the 1st floor
 * behind a 16-ft glass curtain wall: café, 100+ computers, help desk. Circle Reading Room (fireplace) in
 * the NE quadrant of the 1st floor behind the reserve desk. Group study on 1–2, quiet study on 1, 3, 4,
 * Special Collections on 3, the 4th floor is an open "talking" floor.
 */
export const LIB = {
  /** Structural bays along the long (north–south) axis. 15 bays put the main doors mid-bay. */
  bays: 15,
  /** Bays across (east–west). */
  acrossBays: 4,
  /** Brick-faced phase-2 bays at each end. */
  brickEndBays: 2,
  /** Finished floor levels L1..L4 (local y). L1 = 16 ft curtain wall storey. */
  floorY: [0.05, 4.95, 9.15, 13.35],
  roofY: 17.55,
  parapetY: 18.05,
  slab: 0.35,
  /** Exterior columns: width along the facade and total depth (projection + wall). */
  colW: 0.8,
  colDepth: 0.75,
  /** Infill wall plane: inner face at (half - colDepth), thickness. */
  wallT: 0.35,
  /** Exposed floor beam band: below / above floor level. */
  beamBelow: 0.55,
  beamAbove: 0.35,
  beamProj: 0.6,
  /** Upper-floor windows per bay (narrow, deep-set "Netsch" slots). */
  windowsPerBay: 3,
  windowW: 0.8,
  windowSill: 0.8,
  windowHead: 3.25,
  brickWindowsPerBay: 1,
  /** West (Morgan St) face: plain stucco panels with a single slot per bay on the upper floors. */
  westWindowsPerBay: 1,
  /** East curtain wall (L1) inset from the outer column face. */
  curtainInset: 0.6,
  mullion: 1.47,
  innerCol: 0.6,
  doorW: 2.0,
  doorH: 2.6,
  /** Main switchback stair (L1 -> L4): west edge x, start z, flight width, gap, common far end. */
  stair: { x0: -7.15, z0: 5.0, flightWidth: 2.0, gap: 0.3, zEnd: 10.7 },
  /** Bay index (0 = north) of each entrance. */
  mainDoorBay: 7,
  ideaDoorBay: 10,
  /** North edge (local z) of the hard-floored lobby band on L1. */
  lobbyZ0: -17.6,
  westDoorBay: 7,
  apronEast: 9,
  apronWest: 3,
  apronEnds: 3,
};

export interface LibraryCtx {
  world: World;
  frame: LocalFrame;
  group: THREE.Group;
  /** Half extents of the main block (outer column faces). */
  hx: number;
  hz: number;
  /** Inner faces of the exterior walls. */
  ix: number;
  iz: number;
  bayLen: number;
  /** z of column line k (0..bays). */
  zk: (k: number) => number;
  /** x of interior column lines. */
  colX: number[];
  floorY: number[];
  /** Ceiling (slab underside) above floor i. */
  ceilY: (i: number) => number;
  stairs: SwitchbackResult[];
  /** Areas furniture must avoid on each floor (stair wells, cores). */
  keepOut: Rect[][];
  core: Rect;
  struct: MeshBatch;
  col: ColliderSet;
}

export interface LibraryInfo {
  frame: LocalFrame;
  ctx: LibraryCtx;
  /** World points for viewpoints/spawn. */
  mainDoor: THREE.Vector3;
  toWorld: (x: number, y: number, z: number) => THREE.Vector3;
}

/** Split the footprint into the main block and the small annexes beyond its ends. */
function analyseFootprint(b: CampusBuilding) {
  const fit = fitFootprint(b.footprint.outer);
  const pts = fit.local;
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  // the west facade is unbroken: its vertices give the main block's length
  const west = pts.filter((p) => p[0] < minX + 2);
  const z0 = Math.min(...west.map((p) => p[1]));
  const z1 = Math.max(...west.map((p) => p[1]));
  const annexes: Rect[] = [];
  const north = pts.filter((p) => p[1] < z0 - 1);
  const south = pts.filter((p) => p[1] > z1 + 1);
  for (const [grp, edge] of [[north, z0], [south, z1]] as const) {
    if (grp.length < 2) continue;
    const xs = grp.map((p) => p[0]);
    const zs = grp.map((p) => p[1]);
    annexes.push(rect(Math.min(...xs), Math.max(...xs), edge, edge < 0 ? Math.min(...zs) : Math.max(...zs)));
  }
  const cx = (minX + maxX) / 2;
  const cz = (z0 + z1) / 2;
  const origin = localToWorld(fit, cx, 0, cz);
  const frame: LocalFrame = { origin, rotY: fit.rotY, halfX: (maxX - minX) / 2, halfZ: (z1 - z0) / 2 };
  return { frame, annexes: annexes.map((r) => rect(r.x0 - cx, r.x1 - cx, r.z0 - cz, r.z1 - cz)) };
}

export function buildDaleyLibrary(world: World, b: CampusBuilding): LibraryInfo {
  const { frame, annexes } = analyseFootprint(b);
  const hx = frame.halfX;
  const hz = frame.halfZ;
  const bayLen = (2 * hz) / LIB.bays;
  const zk = (k: number) => -hz + k * bayLen;
  const wx = hx - LIB.colDepth + LIB.wallT / 2; // infill wall centerline
  const ix = hx - LIB.colDepth; // inner wall face
  const iz = hz - LIB.colDepth;
  const F = LIB.floorY;
  const nextY = (i: number) => (i + 1 < F.length ? F[i + 1] : LIB.roofY);
  const ceilY = (i: number) => nextY(i) - LIB.slab;

  const group = new THREE.Group();
  group.name = 'landmark:daley-library';
  group.position.copy(frame.origin);
  group.rotation.y = frame.rotY;
  world.scene.add(group);

  const AGG = lm('concreteExposedAggregate'); // Netsch exposed-aggregate frame
  const ext = new MeshBatch(); // facade + roof (casts shadows)
  const struct = new MeshBatch(); // slabs, interior walls, stairs (no shadows needed)
  const col = new ColliderSet();

  const isBrick = (k: number) => k < LIB.brickEndBays || k >= LIB.bays - LIB.brickEndBays;

  // ------------------------------------------------------------------ exterior columns & beams
  const colX = [1, 2, 3].map((j) => -hx + (j * 2 * hx) / LIB.acrossBays);
  for (let k = 0; k <= LIB.bays; k++) {
    const z = THREE.MathUtils.clamp(zk(k), -hz + LIB.colW / 2, hz - LIB.colW / 2);
    for (const s of [1, -1]) {
      ext.box(AGG, s * (hx - LIB.colDepth / 2), LIB.parapetY / 2, z, LIB.colDepth, LIB.parapetY, LIB.colW);
      // exposed-aggregate face: a slightly proud centre strip gives the column two vertical shadow lines
      ext.box(AGG, s * (hx + 0.03), LIB.parapetY / 2, z, 0.06, LIB.parapetY - 0.4, LIB.colW - 0.22, { faces: (s > 0 ? FACE.PX : FACE.NX) | FACE.PZ | FACE.NZ });
      // darker, splash-stained base
      ext.box('concreteDark', s * (hx - LIB.colDepth / 2 + 0.02), 0.35, z, LIB.colDepth + 0.1, 0.7, LIB.colW + 0.06);
      col.box(s * (hx - LIB.colDepth / 2), LIB.parapetY / 2, z, LIB.colDepth, LIB.parapetY, LIB.colW, 'column');
    }
  }
  for (const x of colX) {
    for (const s of [1, -1]) {
      ext.box(AGG, x, LIB.parapetY / 2, s * (hz - LIB.colDepth / 2), LIB.colW, LIB.parapetY, LIB.colDepth);
      ext.box(AGG, x, LIB.parapetY / 2, s * (hz + 0.03), LIB.colW - 0.22, LIB.parapetY - 0.4, 0.06, { faces: (s > 0 ? FACE.PZ : FACE.NZ) | FACE.PX | FACE.NX });
      ext.box('concreteDark', x, 0.35, s * (hz - LIB.colDepth / 2 + 0.02), LIB.colW + 0.06, 0.7, LIB.colDepth + 0.1);
      col.box(x, LIB.parapetY / 2, s * (hz - LIB.colDepth / 2), LIB.colW, LIB.parapetY, LIB.colDepth, 'column');
    }
  }
  // floor beams at L2..L4 and the roof fascia, wrapping all four faces
  const band = (y0: number, y1: number) => {
    const ox = hx - 0.1; // beam face sits just behind the column faces
    const oz = hz - 0.1;
    const drip = 0.16; // recessed shadow line along the underside of each beam
    const ya = y0 + drip;
    for (const s of [1, -1]) {
      ext.box(AGG, s * (ix + ox) / 2, (ya + y1) / 2, 0, ox - ix, y1 - ya, 2 * oz);
      ext.box(AGG, 0, (ya + y1) / 2, s * (iz + oz) / 2, 2 * ox, y1 - ya, oz - iz);
      ext.box('concreteDark', s * (ix + ox - 0.12) / 2, (y0 + ya) / 2, 0, ox - 0.12 - ix, drip, 2 * (oz - 0.12));
      ext.box('concreteDark', 0, (y0 + ya) / 2, s * (iz + oz - 0.12) / 2, 2 * (ox - 0.12), drip, oz - 0.12 - iz);
    }
  };
  for (let i = 1; i < F.length; i++) band(F[i] - LIB.beamBelow, F[i] + LIB.beamAbove);
  band(LIB.roofY - 0.6, LIB.parapetY);

  // ------------------------------------------------------------------ infill walls per bay & floor
  // Concrete frame + infill: dark UIC brick in the phase-2 end bays (and the north/south ends),
  // smooth precast panels in the original central bays, plain stucco-like panels on the west face
  // where the never-built west wings were planned. Windows are deep-set Block-I slots (bronze centre,
  // clear top/bottom bands, dark bronze frames) pushed to the inner face of the wall.
  const BRICK = lm('brickUIC');
  const PRECAST = lm('concreteSmooth');
  const STUCCO = lm('concreteSmooth');
  const blockI = { clear: lm('glassClear'), bronze: lm('glassBronzeClear'), frame: lm('metalBronze'), inset: LIB.wallT / 2 - 0.05 };
  const slots = (len: number, n: number, bottom: number, top: number, w = LIB.windowW): Opening[] =>
    n <= 0 ? [] : evenOpenings(0.25, len - 0.25, n, w, bottom, top, { blockI });
  const winOps = (len: number, n: number, y: number): Opening[] => slots(len, n, y + LIB.windowSill, y + LIB.windowHead);
  const infill = (a: [number, number], b2: [number, number], y0: number, y1: number, mat: MatKey, ops: Opening[], joints = false) => {
    buildWall(ext, col, { a, b: b2, y0, y1, thickness: LIB.wallT, mat, skin: { mat: 'interiorWall', side: 1 }, openings: ops });
    // outward normal = right of a->b (the skin is on the left/inside)
    const len = Math.hypot(b2[0] - a[0], b2[1] - a[1]);
    const dx = (b2[0] - a[0]) / len;
    const dz = (b2[1] - a[1]) / len;
    const nx = dz;
    const nz = -dx;
    const rotY = Math.atan2(-dz, dx);
    const face = LIB.wallT / 2;
    const at = (u: number, off: number): [number, number] => [a[0] + dx * u + nx * off, a[1] + dz * u + nz * off];
    // projecting precast sills under the windows
    for (const o of ops) {
      if (o.door || o.bottom <= y0 + 0.05) continue;
      const [x, z] = at(o.at, face + 0.05);
      ext.box(PRECAST, x, o.bottom - 0.04, z, o.width + 0.16, 0.08, 0.14, { rotY });
    }
    // vertical panel joints half-way between windows (precast panels only)
    if (joints) {
      const sorted = [...ops].sort((p, q) => p.at - q.at);
      const us = sorted.length > 1 ? sorted.slice(1).map((o, i) => (o.at + sorted[i].at) / 2) : [len / 3, (2 * len) / 3];
      for (const u of us) {
        const [x, z] = at(u, face + 0.004);
        ext.box('concreteDark', x, (y0 + y1) / 2, z, 0.03, y1 - y0, 0.01, { rotY });
      }
    }
  };

  for (let fi = 0; fi < F.length; fi++) {
    const yb = fi === 0 ? 0 : F[fi] + LIB.beamAbove;
    const yt = (fi + 1 < F.length ? F[fi + 1] : LIB.roofY - 0.6) - (fi + 1 < F.length ? LIB.beamBelow : 0);
    const fy = F[fi];
    for (let k = 0; k < LIB.bays; k++) {
      const za = zk(k) + LIB.colW / 2;
      const zb = zk(k + 1) - LIB.colW / 2;
      const len = zb - za;
      const brick = isBrick(k);
      const nWin = brick ? LIB.brickWindowsPerBay : LIB.windowsPerBay;
      const l1 = (n: number) => slots(len, n, fy + 0.9, fy + 3.3);
      // EAST (Quad side): L1 is the 2011 glass curtain wall except the brick end bays
      if (fi === 0 && !brick) {
        curtainBay(ext, col, hx - LIB.curtainInset, za, zb, fy, yt, k === LIB.mainDoorBay || k === LIB.ideaDoorBay);
      } else {
        infill([wx, za], [wx, zb], yb, yt, brick ? BRICK : PRECAST, fi === 0 ? l1(nWin) : winOps(len, nWin, fy), !brick);
      }
      // WEST (Morgan St): plainer - stucco panels in the central bays with a single slot per bay
      let opsW = fi === 0 ? l1(brick ? nWin : 1) : winOps(len, brick ? nWin : LIB.westWindowsPerBay, fy);
      if (fi === 0 && k === LIB.westDoorBay) {
        opsW = [
          { at: len / 2, width: LIB.doorW + 0.2, bottom: fy, top: fy + LIB.doorH, door: true },
          { at: len / 2 - 2.4, width: 1.6, bottom: fy, top: fy + LIB.doorH, glass: 'glassClear', frame: lm('metalBronze') },
          { at: len / 2 + 2.4, width: 1.6, bottom: fy, top: fy + LIB.doorH, glass: 'glassClear', frame: lm('metalBronze') },
        ];
      }
      infill([-wx, zb], [-wx, za], yb, yt, brick ? BRICK : STUCCO, opsW);
    }
    // NORTH and SOUTH ends (brick, two slots per bay)
    for (let j = 0; j < LIB.acrossBays; j++) {
      const xa = -hx + (j * 2 * hx) / LIB.acrossBays + LIB.colW / 2;
      const xb = -hx + ((j + 1) * 2 * hx) / LIB.acrossBays - LIB.colW / 2;
      const len = xb - xa;
      const ops = evenOpenings(0.5, len - 0.5, 2, LIB.windowW, fy + (fi === 0 ? 0.9 : LIB.windowSill), fy + (fi === 0 ? 3.3 : LIB.windowHead), { blockI });
      const wz = hz - LIB.colDepth + LIB.wallT / 2;
      infill([xa, -wz], [xb, -wz], yb, yt, BRICK, ops);
      infill([xb, wz], [xa, wz], yb, yt, BRICK, ops);
    }
  }

  // ------------------------------------------------------------------ entrances (east main + IDEA, west)
  const doorSets: [number, number][] = [
    [hx - LIB.curtainInset, (zk(LIB.mainDoorBay) + zk(LIB.mainDoorBay + 1)) / 2],
    [hx - LIB.curtainInset, (zk(LIB.ideaDoorBay) + zk(LIB.ideaDoorBay + 1)) / 2],
    [-wx, (zk(LIB.westDoorBay) + zk(LIB.westDoorBay + 1)) / 2],
  ];
  for (const [x, z] of doorSets) {
    slidingDoors(world, group, { center: [x, z], y: F[0], rotY: Math.PI / 2, clearWidth: LIB.doorW, holeWidth: LIB.doorW + 0.2, height: LIB.doorH });
    // door mats (inside and outside)
    for (const s of [1, -1]) ext.boxMinMax('windowFrame', x + s * 0.2, F[0], z - 1.2, x + s * 2.0, F[0] + 0.012, z + 1.2, FACE.PY);
  }
  // IDEA Commons entry: two lit prisms of steel grating flanking the doors (Woodhouse Tinucci, 2011)
  {
    const z = doorSets[1][1];
    for (const s of [1, -1]) {
      ext.box(lm('metalPanel'), hx + 1.2, 1.9, z + s * 2.7, 1.3, 3.8, 1.3, { rotY: Math.PI / 4 });
      col.box(hx + 1.2, 1.9, z + s * 2.7, 1.3, 3.8, 1.3, 'solid', { rotY: Math.PI / 4 });
    }
  }
  // stub of the old 2nd-floor walkway over the main doors (now a canopy) - see README assumptions
  {
    const z = doorSets[0][1];
    const y = F[1];
    ext.boxMinMax(AGG, hx, y - 0.75, z - 3.2, hx + 6.5, y + 0.05, z + 3.2);
    for (const s of [1, -1]) ext.boxMinMax(AGG, hx, y + 0.05, z + s * 3.2 - (s > 0 ? 0.25 : -0.25), hx + 6.5, y + 1.1, z + s * 3.2);
    ext.boxMinMax(AGG, hx + 6.25, y + 0.05, z - 3.2, hx + 6.5, y + 1.1, z + 3.2);
    // butterfly-ish support columns
    for (const s of [1, -1]) {
      ext.box(AGG, hx + 5.6, (y - 0.75) / 2, z + s * 2.6, 0.6, y - 0.75, 0.6);
      ext.box('concreteDark', hx + 5.6, 0.3, z + s * 2.6, 0.68, 0.6, 0.68);
      col.box(hx + 5.6, (y - 0.75) / 2, z + s * 2.6, 0.6, y - 0.75, 0.6, 'column');
    }
    // smooth soffit with recessed downlights, and a drip groove along the deck edge
    ext.boxMinMax('concreteSmooth', hx, y - 0.78, z - 3.15, hx + 6.45, y - 0.75, z + 3.15, FACE.NY);
    for (const dx of [1.6, 3.6]) for (const dz of [-1.6, 0, 1.6]) ext.box(lightPanelMaterial(), hx + dx, y - 0.785, z + dz, 0.35, 0.01, 0.35, { faces: FACE.NY });
    ext.boxMinMax('concreteDark', hx + 6.5, y - 0.75, z - 3.2, hx + 6.53, y - 0.6, z + 3.2);
  }

  entranceProps(ext, col, hx, doorSets[0][1], doorSets[1][1], bayLen);

  // ------------------------------------------------------------------ annexes (2-storey brick blocks)
  for (const a of annexes) {
    const h = 8.9;
    ext.boxMinMax(lm('brickUIC'), a.x0, 0, a.z0, a.x1, h, a.z1, FACE.PX | FACE.NX | FACE.PZ | FACE.NZ);
    ext.boxMinMax(AGG, a.x0 - 0.1, h, a.z0 - 0.1, a.x1 + 0.1, h + 0.5, a.z1 + 0.1);
    ext.boxMinMax(AGG, a.x0 - 0.1, F[1] - 0.5, a.z0 - 0.1, a.x1 + 0.1, F[1] + 0.3, a.z1 + 0.1);
    col.boxMinMax(a.x0, 0, a.z0, a.x1, h + 0.5, a.z1, 'solid');
  }

  // ------------------------------------------------------------------ roof
  ext.boxMinMax('roof', -ix, LIB.roofY - 0.3, -iz, ix, LIB.roofY, iz, FACE.PY);
  for (const [x0, z0, x1, z1] of [
    [-12, -30, -2, -18],
    [2, 18, 12, 32],
  ])
    ext.boxMinMax('concreteDark', x0, LIB.roofY, z0, x1, LIB.roofY + 1.9, z1);
  ext.boxMinMax('metal', -4, LIB.roofY, 40, 4, LIB.roofY + 1.2, 46);

  // ------------------------------------------------------------------ aprons (paving outside doors)
  const yF = F[0];
  ext.boxMinMax('plaza', hx, 0, -hz - LIB.apronEnds, hx + LIB.apronEast, yF, hz + LIB.apronEnds, FACE.PY | FACE.PX | FACE.PZ | FACE.NZ);
  ext.boxMinMax('plaza', -hx - LIB.apronWest, 0, -hz - LIB.apronEnds, -hx, yF, hz + LIB.apronEnds, FACE.PY | FACE.NX | FACE.PZ | FACE.NZ);
  col.boxMinMax(hx - 0.05, -0.3, -hz - LIB.apronEnds, hx + LIB.apronEast, yF, hz + LIB.apronEnds, 'floor');
  col.boxMinMax(-hx - LIB.apronWest, -0.3, -hz - LIB.apronEnds, -hx + 0.05, yF, hz + LIB.apronEnds, 'floor');
  // floor strip between the curtain wall and the outer column face (under the colonnade)
  for (const s of [1, -1]) {
    col.boxMinMax(s * ix, -0.3, -hz, s * hx, yF, hz, 'floor');
    ext.boxMinMax('plaza', s * ix, 0, -hz, s * hx, yF, hz, FACE.PY);
  }

  // ------------------------------------------------------------------ stairs and floor slabs
  const S = LIB.stair;
  const stairs: SwitchbackResult[] = [];
  for (let i = 0; i < F.length - 1; i++) {
    const nRise = Math.ceil((F[i + 1] - F[i]) / 0.18 - 1e-9);
    const nA = Math.ceil(nRise / 2);
    const zL = S.z0 + (nA - 1) * 0.28;
    stairs.push(
      switchbackStair(struct, col, {
        x0: S.x0, z0: S.z0, dir: 1, y0: F[i], y1: F[i + 1], flightWidth: S.flightWidth, gap: S.gap,
        landingDepth: S.zEnd - zL, stepMat: 'concrete', structureMat: 'concrete', railMat: 'metal', endWall: 'interiorWall',
      }),
    );
  }
  const inner = rect(-ix, ix, -iz, iz);
  for (let i = 0; i < F.length; i++) {
    const holes = i > 0 ? [stairs[i - 1].hole] : [];
    const y = F[i];
    // finish: hard terrazzo-like floor in the ground-floor lobby band (doors -> desk -> stair), carpet elsewhere
    const lobby = rect(-ix, ix, LIB.lobbyZ0, zk(LIB.mainDoorBay + 1));
    for (const r of rectMinusHoles(inner, i === 0 ? [lobby] : holes)) struct.boxMinMax('interiorFloor', r.x0, y - 0.05, r.z0, r.x1, y, r.z1, FACE.PY);
    if (i === 0) struct.boxMinMax('interiorFloorHard', lobby.x0, y - 0.05, lobby.z0, lobby.x1, y, lobby.z1, FACE.PY);
    for (const r of rectMinusHoles(inner, holes)) {
      struct.boxMinMax('concrete', r.x0, y - LIB.slab, r.z0, r.x1, y - 0.05, r.z1, i > 0 ? FACE.PX | FACE.NX | FACE.PZ | FACE.NZ : 0);
      if (i > 0) struct.boxMinMax('interiorCeiling', r.x0, y - LIB.slab, r.z0, r.x1, y - LIB.slab + 0.01, r.z1, FACE.NY);
      col.boxMinMax(r.x0, y - (i === 0 ? 0.4 : LIB.slab), r.z0, r.x1, y, r.z1, 'floor');
    }
    // guard rails around the stair opening in this floor
    if (i > 0) {
      const h = stairs[i - 1].hole;
      railing(struct, col, { a: [h.x0 - 0.05, h.z0], b: [h.x0 - 0.05, h.z1], yA: y, yB: y, mat: 'metal', panel: 'glassClear' });
      railing(struct, col, { a: [h.x1 + 0.05, h.z0], b: [h.x1 + 0.05, h.z1], yA: y, yB: y, mat: 'metal', panel: 'glassClear' });
      if (i === F.length - 1) {
        // top floor: no flight continues upward, close the start edge over flight A
        const fa = stairs[i - 1].flightA;
        railing(struct, col, { a: [fa[0], h.z0 + 0.05], b: [fa[1] + S.gap, h.z0 + 0.05], yA: y, yB: y, mat: 'metal', panel: 'glassClear' });
      }
    }
  }
  // roof slab underside = L4 ceiling
  struct.boxMinMax('interiorCeiling', -ix, LIB.roofY - LIB.slab, -iz, ix, LIB.roofY - LIB.slab + 0.01, iz, FACE.NY);

  // interior columns
  for (let i = 0; i < F.length; i++) {
    for (let k = 1; k < LIB.bays; k++) {
      for (const x of colX) {
        const z = zk(k);
        const c = LIB.innerCol;
        struct.box('concrete', x, (F[i] + ceilY(i)) / 2, z, c, ceilY(i) - F[i], c, { faces: FACE.PX | FACE.NX | FACE.PZ | FACE.NZ });
        col.box(x, (F[i] + ceilY(i)) / 2, z, c, ceilY(i) - F[i], c, 'column');
      }
    }
  }

  // service core (elevators, restrooms) on every floor, same place
  const core = rect(-ix, -11.2, -14.2, -5.6);
  for (let i = 0; i < F.length; i++) {
    const y0 = F[i];
    const y1 = ceilY(i);
    struct.boxMinMax('interiorWall', core.x0, y0, core.z0, core.x1, y1, core.z1, FACE.PX | FACE.PZ | FACE.NZ);
    col.boxMinMax(core.x0, y0, core.z0, core.x1, y1, core.z1, 'wall');
    for (const z of [-12.3, -10.1]) {
      struct.box('metal', core.x1 + 0.02, y0 + 1.1, z, 0.04, 2.2, 1.15);
      struct.box('windowFrame', core.x1 + 0.012, y0 + 1.15, z, 0.03, 2.32, 1.35);
    }
    // restroom doors (closed, decorative) on the south face of the core
    for (const x of [-17.5, -14.0]) struct.box('wood', x, y0 + 1.05, core.z1 + 0.02, 0.95, 2.1, 0.04);
    struct.box('metal', core.x1 + 0.03, y0 + 1.4, -8.0, 0.02, 0.6, 0.4); // signage plate
  }

  const keepOut: Rect[][] = F.map((_, i) => {
    const ko = [core];
    if (i < stairs.length) ko.push(stairs[i].footprint);
    if (i > 0) ko.push(rect(stairs[i - 1].hole.x0 - 0.6, stairs[i - 1].hole.x1 + 0.6, stairs[i - 1].hole.z0 - 1.6, stairs[i - 1].hole.z1 + 0.3));
    return ko;
  });

  const ctx: LibraryCtx = { world, frame, group, hx, hz, ix, iz, bayLen, zk, colX, floorY: F, ceilY, stairs, keepOut, core, struct, col };

  // ------------------------------------------------------------------ furnishing (per-floor groups)
  furnishLibrary(ctx);

  group.add(ext.build('library-exterior', { castShadow: true, receiveShadow: true }));
  group.add(struct.build('library-structure', { castShadow: false, receiveShadow: true }));
  col.register(world, group);

  // interior zones, one volume per floor
  for (let i = 0; i < F.length; i++) {
    addInteriorVolume(world, frame, 'daley-library', 'Richard J. Daley Library', rect(-ix + 0.3, ix - 0.3, -iz + 0.3, iz - 0.3), F[i] - 0.05, i + 1 < F.length ? F[i + 1] - 0.05 : LIB.roofY);
  }

  const toWorld = (x: number, y: number, z: number) => localToWorld(frame, x, y, z);
  return { frame, ctx, mainDoor: toWorld(hx - LIB.curtainInset, F[0], doorSets[0][1]), toWorld };
}

/** One bay of the 16-ft east curtain wall (mullions + transom + glass), optionally with a doorway. */
function curtainBay(b: MeshBatch, col: ColliderSet, x: number, za: number, zb: number, y0: number, y1: number, door: boolean): void {
  const len = zb - za;
  const panes = (s0: number, s1: number) => {
    const n = Math.max(1, Math.round((s1 - s0) / LIB.mullion));
    return evenOpenings(s0, s1, n, (s1 - s0) / n - 0.07, y0 + 0.12, y1 - 0.1, { glass: 'glassClear' });
  };
  const dw = LIB.doorW + 0.2;
  const ops: Opening[] = door ? [...panes(0, len / 2 - dw / 2 - 0.035), ...panes(len / 2 + dw / 2 + 0.035, len)] : panes(0, len);
  // door opening runs full height: transom bar + transom glass above the sliding leaves
  if (door) ops.push({ at: len / 2, width: dw, bottom: y0, top: y1 - 0.1, door: true });
  buildWall(b, col, { a: [x, za], b: [x, zb], y0, y1, thickness: 0.12, mat: 'windowFrame', openings: ops });
  // transom bar at 3.0 m and glass above the doors
  b.box('windowFrame', x, y0 + 3.0, (za + zb) / 2, 0.1, 0.08, len);
  if (door) {
    b.box('windowFrame', x, y0 + LIB.doorH + 0.07, (za + zb) / 2, 0.14, 0.14, dw + 0.02);
    b.box('glassClear', x, (y0 + LIB.doorH + 0.14 + y1 - 0.1) / 2, (za + zb) / 2, 0.024, y1 - 0.1 - (y0 + LIB.doorH + 0.14), dw);
  }
}

/**
 * Street furniture on the east apron (signage-free): benches, bike racks, planters with shrubs,
 * litter bins and plain fabric banners on the columns either side of the main doors.
 * The straight path from the spawn point to the main doors (|z - doorZ| < 2.6) is kept clear.
 */
function entranceProps(b: MeshBatch, col: ColliderSet, hx: number, doorZ: number, ideaZ: number, bayLen: number): void {
  const f = new Furnisher(b, col);
  const y = LIB.floorY[0];
  // benches facing the Quad, backs to the library
  for (const dz of [-7.5, 7.5, -16]) {
    const p = { x: hx + 3.4, y, z: doorZ + dz, rotY: Math.PI / 2 };
    f.part(p, 'wood', 0, 0.44, 0, 1.9, 0.05, 0.45);
    f.part(p, 'wood', 0, 0.68, 0.2, 1.9, 0.3, 0.04);
    for (const lx of [-0.75, 0.75]) f.part(p, 'concreteSmooth', lx, 0.21, 0, 0.12, 0.42, 0.45);
    f.solid(p, 0, 0.35, 0, 1.9, 0.7, 0.5);
  }
  // planters with shrubs flanking the door approach
  for (const dz of [-4.6, 4.6]) {
    const p = { x: hx + 7.6, y, z: doorZ + dz, rotY: 0 };
    f.part(p, 'concreteSmooth', 0, 0.3, 0, 1.6, 0.6, 1.6);
    f.part(p, 'soil', 0, 0.58, 0, 1.44, 0.04, 1.44);
    f.part(p, 'foliage', 0, 0.95, 0, 1.2, 0.7, 1.2);
    f.solid(p, 0, 0.3, 0, 1.6, 0.6, 1.6);
  }
  // bike racks (inverted-U hoops) between the main and IDEA doors
  for (let i = 0; i < 6; i++) {
    const p = { x: hx + 4.2, y, z: doorZ + 10.5 + i * 0.9, rotY: 0 };
    f.part(p, 'metal', -0.3, 0.42, 0, 0.05, 0.84, 0.05);
    f.part(p, 'metal', 0.3, 0.42, 0, 0.05, 0.84, 0.05);
    f.part(p, 'metal', 0, 0.84, 0, 0.65, 0.05, 0.05);
  }
  col.boxMinMax(hx + 3.8, y, doorZ + 10.2, hx + 4.6, y + 0.9, doorZ + 15.3, 'furniture');
  // litter bins
  for (const z of [doorZ - 9.6, ideaZ - 5]) {
    const p = { x: hx + 3.4, y, z, rotY: 0 };
    f.part(p, 'metal', 0, 0.45, 0, 0.5, 0.9, 0.5);
    f.part(p, 'windowFrame', 0, 0.92, 0, 0.56, 0.05, 0.56);
    f.solid(p, 0, 0.45, 0, 0.5, 0.9, 0.5);
  }
  // plain banners hung from brackets on the columns either side of the main doors
  for (const s of [-1, 1]) {
    const z = doorZ + (s * bayLen) / 2;
    const y0 = LIB.floorY[1] + 0.7;
    const y1 = LIB.floorY[2] - 0.2;
    for (const yy of [y0, y1]) b.box('metal', hx + 0.35, yy, z, 0.7, 0.05, 0.05);
    b.box('fabric', hx + 0.64, (y0 + y1) / 2, z, 0.02, y1 - y0 - 0.1, 0.6);
  }
}
