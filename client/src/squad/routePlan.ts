/**
 * Simple route planning for bots: an A* search over a coarse grid around the bot, using a
 * "can a bot stand here?" check that is passed in. Used only when a bot is stuck (for example
 * in a dead end), so the cost stays small. Pure math: no physics or rendering here.
 */
type P = { x: number; z: number };

export const ROUTE = {
  /** Grid cell size (m). */
  cell: 0.75,
  /** Search no further than this from the bot (m). */
  radius: 24,
  /** Give up after expanding this many cells. */
  maxNodes: 5000,
  /** Seconds of little progress before a bot plans a route. */
  stuckAfter: 0.7,
  /** A planned route is dropped after this long (the goal has probably moved). */
  maxAge: 6,
  /** Waypoint counts as reached inside this range (m). */
  reach: 0.45,
};

/**
 * Waypoints from `from` to `to` (excluding `from`), or null if there is no way within range.
 * If the goal itself is blocked, heads for the reachable cell closest to it.
 */
export function planRoute(from: P, to: P, isFree: (x: number, z: number) => boolean, opts = ROUTE): P[] | null {
  const { cell, radius, maxNodes } = opts;
  const n = Math.ceil(radius / cell);
  const size = n * 2 + 1;
  const key = (i: number, j: number) => (i + n) * size + (j + n);
  const toW = (i: number, j: number): P => ({ x: from.x + i * cell, z: from.z + j * cell });
  const gi = Math.max(-n, Math.min(n, Math.round((to.x - from.x) / cell)));
  const gj = Math.max(-n, Math.min(n, Math.round((to.z - from.z) / cell)));
  const freeCache = new Map<number, boolean>();
  const free = (i: number, j: number) => {
    const k = key(i, j);
    let f = freeCache.get(k);
    if (f === undefined) { const w = toW(i, j); f = isFree(w.x, w.z); freeCache.set(k, f); }
    return f;
  };
  const h = (i: number, j: number) => Math.hypot(i - gi, j - gj);
  const g = new Map<number, number>([[key(0, 0), 0]]);
  const parent = new Map<number, number>();
  const open: { i: number; j: number; f: number }[] = [{ i: 0, j: 0, f: h(0, 0) }];
  const closed = new Set<number>();
  let best = { i: 0, j: 0, h: h(0, 0) };
  let expanded = 0;
  while (open.length && expanded < maxNodes) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k]!.f < open[bi]!.f) bi = k;
    const cur = open.splice(bi, 1)[0]!;
    const ck = key(cur.i, cur.j);
    if (closed.has(ck)) continue;
    closed.add(ck);
    expanded++;
    const ch = h(cur.i, cur.j);
    if (ch < best.h) best = { i: cur.i, j: cur.j, h: ch };
    if (cur.i === gi && cur.j === gj) break;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ni = cur.i + di, nj = cur.j + dj;
      if (Math.abs(ni) > n || Math.abs(nj) > n) continue;
      if (!free(ni, nj)) continue;
      // No cutting corners past a wall.
      if (di && dj && (!free(cur.i + di, cur.j) || !free(cur.i, cur.j + dj))) continue;
      const nk = key(ni, nj);
      const ng = g.get(ck)! + (di && dj ? Math.SQRT2 : 1);
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        parent.set(nk, ck);
        open.push({ i: ni, j: nj, f: ng + h(ni, nj) });
      }
    }
  }
  if (best.i === 0 && best.j === 0) return null;
  const cells: P[] = [];
  let k = key(best.i, best.j);
  while (k !== key(0, 0)) {
    const i = Math.floor(k / size) - n, j = (k % size) - n;
    cells.push(toW(i, j));
    k = parent.get(k)!;
  }
  cells.reverse();
  return smoothPath(from, cells, isFree, cell / 3);
}

/** Drops waypoints that can be skipped with a straight, wall-free walk. */
export function smoothPath(from: P, pts: P[], isFree: (x: number, z: number) => boolean, stepLen = 0.25): P[] {
  const out: P[] = [];
  let at = from;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !straightClear(at, pts[j]!, isFree, stepLen)) j--;
    out.push(pts[j]!);
    at = pts[j]!;
    i = j + 1;
  }
  return out;
}

export function straightClear(a: P, b: P, isFree: (x: number, z: number) => boolean, stepLen = 0.25): boolean {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(d / stepLen));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    if (!isFree(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

export interface RouteState {
  path: P[] | null;
  age: number;
  stuck: number;
  /** Closest the bot has got to its goal since it last made progress. */
  bestD: number;
}

export const newRouteState = (): RouteState => ({ path: null, age: 0, stuck: 0, bestD: Infinity });

/**
 * One frame of route following. `want` is where the bot was about to step (straight at its goal);
 * returns where it should step instead, plus the updated route memory. Plans a route only after
 * the bot has got no closer to its goal for `ROUTE.stuckAfter` seconds (sliding back and forth
 * against a wall does not count as progress).
 */
export function followRoute(
  rs: RouteState,
  from: P,
  want: P,
  goal: P,
  dt: number,
  plan: (from: P, goal: P) => P[] | null,
): { to: P; rs: RouteState; planned: boolean } {
  const step = Math.hypot(want.x - from.x, want.z - from.z);
  const next: RouteState = { ...rs };
  let planned = false;
  const dGoal = Math.hypot(goal.x - from.x, goal.z - from.z);
  if (step < 1e-4) return { to: want, rs: { ...next, stuck: 0, bestD: dGoal }, planned };
  if (dGoal < rs.bestD - 0.1) { next.bestD = dGoal; next.stuck = 0; } else next.stuck = rs.stuck + dt;
  if (next.path) {
    next.age += dt;
    if (next.age > ROUTE.maxAge) next.path = null;
  }
  if (!next.path && next.stuck > ROUTE.stuckAfter && Math.hypot(goal.x - from.x, goal.z - from.z) > 1.5) {
    next.path = plan(from, goal);
    next.age = 0;
    next.stuck = 0;
    next.bestD = dGoal;
    planned = next.path != null;
  }
  if (!next.path) return { to: want, rs: next, planned };
  let path = next.path;
  while (path.length && Math.hypot(path[0]!.x - from.x, path[0]!.z - from.z) < ROUTE.reach) path = path.slice(1);
  next.path = path.length ? path : null;
  if (!next.path) return { to: want, rs: next, planned };
  const wp = next.path[0]!;
  const d = Math.hypot(wp.x - from.x, wp.z - from.z);
  const s = Math.min(step, d);
  return { to: { x: from.x + ((wp.x - from.x) / d) * s, z: from.z + ((wp.z - from.z) / d) * s }, rs: next, planned };
}
