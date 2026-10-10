/** Axis-aligned rectangle in a building's local x/z plane. */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export const rect = (x0: number, x1: number, z0: number, z1: number): Rect => ({
  x0: Math.min(x0, x1),
  x1: Math.max(x0, x1),
  z0: Math.min(z0, z1),
  z1: Math.max(z0, z1),
});

export const rectArea = (r: Rect): number => (r.x1 - r.x0) * (r.z1 - r.z0);

export const rectContains = (r: Rect, x: number, z: number): boolean => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

export const rectsOverlap = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

export const inflate = (r: Rect, d: number): Rect => ({ x0: r.x0 - d, x1: r.x1 + d, z0: r.z0 - d, z1: r.z1 + d });

/**
 * Split `outer` minus `holes` into a small set of non-overlapping rectangles
 * (grid decomposition, then greedy merging). Used for floor slabs and ceilings with
 * stair openings, atria, shafts...
 */
export function rectMinusHoles(outer: Rect, holes: Rect[]): Rect[] {
  const hs = holes
    .map((h) => rect(Math.max(h.x0, outer.x0), Math.min(h.x1, outer.x1), Math.max(h.z0, outer.z0), Math.min(h.z1, outer.z1)))
    .filter((h) => h.x1 > h.x0 && h.z1 > h.z0);
  if (hs.length === 0) return [outer];
  const uniq = (a: number[]) => [...new Set(a.map((v) => Math.round(v * 1e4) / 1e4))].sort((p, q) => p - q);
  const xs = uniq([outer.x0, outer.x1, ...hs.flatMap((h) => [h.x0, h.x1])]);
  const zs = uniq([outer.z0, outer.z1, ...hs.flatMap((h) => [h.z0, h.z1])]);
  // rows of merged x-runs
  const rows: Rect[][] = [];
  for (let j = 0; j < zs.length - 1; j++) {
    const row: Rect[] = [];
    let run: Rect | null = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cz = (zs[j] + zs[j + 1]) / 2;
      const solid = !hs.some((h) => rectContains(h, cx, cz));
      if (solid) {
        if (run) run.x1 = xs[i + 1];
        else run = { x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1] };
      } else if (run) {
        row.push(run);
        run = null;
      }
    }
    if (run) row.push(run);
    rows.push(row);
  }
  // merge identical runs vertically
  const out: Rect[] = [];
  let open: Rect[] = [];
  for (const row of rows) {
    const next: Rect[] = [];
    for (const r of row) {
      const m = open.find((o) => Math.abs(o.x0 - r.x0) < 1e-6 && Math.abs(o.x1 - r.x1) < 1e-6 && Math.abs(o.z1 - r.z0) < 1e-6);
      if (m) {
        m.z1 = r.z1;
        next.push(m);
        open = open.filter((o) => o !== m);
      } else next.push({ ...r });
    }
    out.push(...open);
    open = next;
  }
  out.push(...open);
  return out;
}
