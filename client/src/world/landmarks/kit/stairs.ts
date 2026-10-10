import type { MatKey, MeshBatch } from './batch';
import { slopedBox, type ColliderSet } from './colliders';
import { rect, type Rect } from './rects';
import { railing } from './railings';

/** Comfortable public-building stair: rise <= 0.18 m, run 0.28 m (riser ~0.17 m). */
export const STAIR_RUN = 0.28;
export const STAIR_MAX_RISE = 0.18;

export interface SwitchbackOpts {
  /** West (min-x) edge of the stair well, local frame. */
  x0: number;
  /** z of the start line: flight A starts here, flight B arrives here. */
  z0: number;
  /** +1: flight A climbs toward +z; -1: toward -z. */
  dir: 1 | -1;
  /** Lower and upper floor levels (top of finished floor). */
  y0: number;
  y1: number;
  /** Width of each flight (team rule >= 1.5 m). */
  flightWidth: number;
  /** Gap between the two flights (m). */
  gap?: number;
  landingDepth?: number;
  run?: number;
  maxRise?: number;
  /** Which side flight A is on: 'west' (x0 side, default) or 'east'. */
  flightASide?: 'west' | 'east';
  stepMat: MatKey;
  structureMat: MatKey;
  railMat: MatKey;
  /** Add a solid wall under the far end of the well from y0 to y1 (closes the void behind the landing). */
  endWall?: MatKey;
}

export interface SwitchbackResult {
  /** Opening that must be cut out of the UPPER floor slab (local x/z). */
  hole: Rect;
  /** Whole footprint of the stair on the lower floor (keep furniture out). */
  footprint: Rect;
  risers: number;
  rise: number;
  run: number;
  /** Mid landing height. */
  landingY: number;
  /** x ranges of flight A (up from y0) and flight B (arriving at y1). */
  flightA: [number, number];
  flightB: [number, number];
  /** Where flight B arrives on the upper floor (z of the top riser). */
  arrivalZ: number;
}

/**
 * U-shaped ("switchback") stair between two floors: flight A climbs from z0 in `dir` to a full-width
 * mid landing, flight B returns and arrives back at z0 on the upper floor.
 *
 * Visual: solid step blocks + a sloped soffit + metal railings.
 * Physics: one hidden smooth RAMP collider per flight (tag 'stair-ramp') whose top surface passes
 * through the step nosings (slope = rise/run, ~31 deg), a box for the landing, and rail colliders
 * (1.1 m) on all open edges. The individual steps are NOT colliders, so a capsule glides smoothly.
 */
export function switchbackStair(batch: MeshBatch, col: ColliderSet, o: SwitchbackOpts): SwitchbackResult {
  const run = o.run ?? STAIR_RUN;
  const maxRise = o.maxRise ?? STAIR_MAX_RISE;
  const gap = o.gap ?? 0.2;
  const ld = o.landingDepth ?? Math.max(1.8, o.flightWidth);
  const s = o.dir;
  const H = o.y1 - o.y0;
  const n = Math.ceil(H / maxRise - 1e-9);
  const rise = H / n;
  const nA = Math.ceil(n / 2);
  const nB = n - nA;
  const yL = o.y0 + nA * rise;
  const zL = o.z0 + s * (nA - 1) * run; // top riser of flight A = landing edge
  const zEnd = zL + s * ld; // far edge of landing
  const zArr = zL - s * (nB - 1) * run; // flight B top riser = arrival edge
  const wA = o.flightASide === 'east' ? [o.x0 + o.flightWidth + gap, o.x0 + 2 * o.flightWidth + gap] : [o.x0, o.x0 + o.flightWidth];
  const wB = o.flightASide === 'east' ? [o.x0, o.x0 + o.flightWidth] : [o.x0 + o.flightWidth + gap, o.x0 + 2 * o.flightWidth + gap];
  const x1 = o.x0 + 2 * o.flightWidth + gap;
  const fA: [number, number] = [wA[0], wA[1]];
  const fB: [number, number] = [wB[0], wB[1]];
  const zmin = (a: number, b: number) => Math.min(a, b);
  const zmax = (a: number, b: number) => Math.max(a, b);

  // --- visual steps (solid blocks ~0.3 m deep under each tread, so they read as concrete steps)
  const stepBlock = (x: [number, number], zf: number, zb: number, top: number) => {
    batch.boxMinMax(o.stepMat, x[0], top - rise - 0.12, zmin(zf, zb), x[1], top, zmax(zf, zb));
  };
  for (let i = 0; i < nA - 1; i++) stepBlock(fA, o.z0 + s * i * run, o.z0 + s * (i + 1) * run, o.y0 + (i + 1) * rise);
  for (let j = 0; j < nB - 1; j++) stepBlock(fB, zL - s * j * run, zL - s * (j + 1) * run, yL + (j + 1) * rise);
  // soffits under the flights
  const soffit = (x: [number, number], zA: number, yA: number, zB: number, yB: number) => {
    const b = slopedBox(x[0], x[1], zA, yA, zB, yB, 0.18);
    batch.box(o.structureMat, b.cx, b.cy, b.cz, b.sx, b.sy, b.sz, { rotY: b.rotY, rotX: b.rotX });
  };
  soffit(fA, o.z0, o.y0 - 0.1, zL, yL - rise - 0.1);
  soffit(fB, zL, yL - 0.1, zArr, o.y1 - rise - 0.1);
  // landing slab (full well width)
  batch.boxMinMax(o.stepMat, o.x0, yL - 0.3, zmin(zL, zEnd), x1, yL, zmax(zL, zEnd));
  col.boxMinMax(o.x0, yL - 0.3, zmin(zL, zEnd), x1, yL, zmax(zL, zEnd), 'landing');
  // small filler where flight B arrives short of z0 (odd riser counts)
  if (Math.abs(zArr - o.z0) > 1e-3) {
    batch.boxMinMax(o.stepMat, fB[0], o.y1 - 0.3, zmin(zArr, o.z0), fB[1], o.y1, zmax(zArr, o.z0));
    col.boxMinMax(fB[0], o.y1 - 0.3, zmin(zArr, o.z0), fB[1], o.y1, zmax(zArr, o.z0), 'floor');
  }
  // gap filler between flights under the landing is open; close the gap at the bottom/top with nothing.

  // --- ramp colliders through the nosings (extend one run onto the floor/landing at each end)
  const ramp = (x: [number, number], zA: number, yA: number, zB: number, yB: number) => {
    const b = slopedBox(x[0], x[1], zA, yA, zB, yB, 0.25);
    col.box(b.cx, b.cy, b.cz, b.sx, b.sy, b.sz, 'stair-ramp', { rotY: b.rotY, rotX: b.rotX });
  };
  ramp(fA, o.z0 - s * run, o.y0, zL, yL);
  ramp(fB, zL + s * run, yL, zArr, o.y1);

  // --- railings
  const railH = 1.0;
  // flight A outer edge and inner (gap) edge, flight B outer and inner edge
  const outerA = o.flightASide === 'east' ? fA[1] : fA[0];
  const innerA = o.flightASide === 'east' ? fA[0] : fA[1];
  const outerB = o.flightASide === 'east' ? fB[0] : fB[1];
  const innerB = o.flightASide === 'east' ? fB[1] : fB[0];
  const inset = (x: number, toward: number) => x + Math.sign(toward - x) * 0.05;
  const midA = (fA[0] + fA[1]) / 2;
  const midB = (fB[0] + fB[1]) / 2;
  // sloped rails follow the nosing line
  const slopedRail = (x: number, zA: number, yA: number, zB: number, yB: number) =>
    railing(batch, col, { a: [x, zA], b: [x, zB], yA, yB, height: railH, mat: o.railMat });
  slopedRail(inset(outerA, midA), o.z0, o.y0 + rise, zL, yL);
  slopedRail(inset(innerA, midA), o.z0, o.y0 + rise, zL, yL);
  slopedRail(inset(outerB, midB), zL, yL + rise, zArr, o.y1);
  slopedRail(inset(innerB, midB), zL, yL + rise, zArr, o.y1);
  // landing: outer sides + far end
  railing(batch, col, { a: [inset(outerA, midA), zL], b: [inset(outerA, midA), zEnd], yA: yL, yB: yL, height: railH, mat: o.railMat });
  railing(batch, col, { a: [inset(outerB, midB), zL], b: [inset(outerB, midB), zEnd], yA: yL, yB: yL, height: railH, mat: o.railMat });
  if (o.endWall) {
    // full-height wall closing the well behind the landing
    const zw = zEnd + s * 0.1;
    batch.boxMinMax(o.endWall, o.x0, o.y0, zmin(zEnd, zw), x1, o.y1, zmax(zEnd, zw));
    col.boxMinMax(o.x0, o.y0, zmin(zEnd, zw), x1, o.y1, zmax(zEnd, zw), 'wall');
  } else {
    railing(batch, col, { a: [o.x0, zEnd - s * 0.05], b: [x1, zEnd - s * 0.05], yA: yL, yB: yL, height: railH, mat: o.railMat });
  }

  const hole = rect(o.x0, x1, o.z0, zEnd);
  return {
    hole,
    footprint: rect(o.x0 - 0.3, x1 + 0.3, o.z0 - s * 1.2, zEnd),
    risers: n,
    rise,
    run,
    landingY: yL,
    flightA: fA,
    flightB: fB,
    arrivalZ: zArr,
  };
}
