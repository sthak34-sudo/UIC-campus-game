import type { PlanPoint } from '../../core/geo';
import { bbox, distToSegment, pointInPolygon } from './geom';

/** Uniform grid bucket index over plan-space items with bounding boxes. */
export class GridIndex<T> {
  private cells = new Map<number, T[]>();
  constructor(private readonly size = 25) {}

  private key(i: number, j: number): number {
    return (i + 32768) * 65536 + (j + 32768);
  }

  insert(item: T, x0: number, y0: number, x1: number, y1: number): void {
    const s = this.size;
    for (let i = Math.floor(x0 / s); i <= Math.floor(x1 / s); i++)
      for (let j = Math.floor(y0 / s); j <= Math.floor(y1 / s); j++) {
        const k = this.key(i, j);
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, (c = []));
        c.push(item);
      }
  }

  at(x: number, y: number): readonly T[] {
    return this.cells.get(this.key(Math.floor(x / this.size), Math.floor(y / this.size))) ?? [];
  }

  /** Items in all cells overlapping the square of radius r around (x, y) (may contain duplicates). */
  near(x: number, y: number, r: number): T[] {
    const s = this.size, out: T[] = [];
    for (let i = Math.floor((x - r) / s); i <= Math.floor((x + r) / s); i++)
      for (let j = Math.floor((y - r) / s); j <= Math.floor((y + r) / s); j++) {
        const c = this.cells.get(this.key(i, j));
        if (c) for (const it of c) out.push(it);
      }
    return out;
  }
}

export interface VolumeRef {
  id: string;
  outer: PlanPoint[];
  holes: PlanPoint[][];
  height: number;
  minHeight: number;
}

/** Answers "what is built right next to this wall?" for party walls between attached buildings. */
export class VolumeIndex {
  private grid = new GridIndex<VolumeRef>(20);
  add(v: VolumeRef): void {
    const [x0, y0, x1, y1] = bbox(v.outer);
    this.grid.insert(v, x0, y0, x1, y1);
  }
  coverAt(x: number, y: number, selfId: string): number {
    let h = 0;
    for (const v of this.grid.at(x, y)) {
      if (v.id === selfId || v.minHeight > 1 || v.height <= h) continue;
      if (pointInPolygon(x, y, v.outer, v.holes)) h = v.height;
    }
    return h;
  }
}

export interface Segment {
  ax: number; ay: number; bx: number; by: number;
  kind: string; width: number; name?: string;
}

/** Nearest road/path segment queries. */
export class SegmentIndex {
  private grid = new GridIndex<Segment>(30);
  readonly segments: Segment[] = [];
  add(s: Segment): void {
    this.segments.push(s);
    this.grid.insert(s, Math.min(s.ax, s.bx), Math.min(s.ay, s.by), Math.max(s.ax, s.bx), Math.max(s.ay, s.by));
  }
  nearest(x: number, y: number, maxR = 60, filter?: (s: Segment) => boolean): { seg: Segment; dist: number } | null {
    let best: Segment | null = null, bd = Infinity;
    for (const s of this.grid.near(x, y, maxR)) {
      if (filter && !filter(s)) continue;
      const d = distToSegment(x, y, s.ax, s.ay, s.bx, s.by);
      if (d < bd) { bd = d; best = s; }
    }
    return best ? { seg: best, dist: bd } : null;
  }
}
