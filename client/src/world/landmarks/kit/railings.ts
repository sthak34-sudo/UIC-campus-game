import type { MatKey, MeshBatch } from './batch';
import type { ColliderSet } from './colliders';

export interface RailingOpts {
  a: [number, number];
  b: [number, number];
  /** Walking-surface height at a and b (rail follows the slope). */
  yA: number;
  yB: number;
  height?: number;
  mat: MatKey;
  postSpacing?: number;
  /** Solid panel infill (e.g. glass) instead of a mid rail. */
  panel?: MatKey;
  collide?: boolean;
}

/** Metal guard rail: top rail + mid rail + posts; one thin collider box ~1.2 m tall. */
export function railing(batch: MeshBatch, col: ColliderSet | null, o: RailingOpts): void {
  const h = o.height ?? 1.0;
  const dx = o.b[0] - o.a[0];
  const dz = o.b[1] - o.a[1];
  const dy = o.yB - o.yA;
  const lh = Math.hypot(dx, dz);
  if (lh < 0.05) return;
  const l3 = Math.hypot(lh, dy);
  const rotY = Math.atan2(dx, dz);
  const rotX = -Math.atan2(dy, lh);
  const mx = (o.a[0] + o.b[0]) / 2;
  const mz = (o.a[1] + o.b[1]) / 2;
  const my = (o.yA + o.yB) / 2;
  batch.box(o.mat, mx, my + h, mz, 0.05, 0.05, l3, { rotY, rotX });
  if (o.panel) batch.box(o.panel, mx, my + h * 0.5, mz, 0.02, h * 0.85, l3, { rotY, rotX });
  else batch.box(o.mat, mx, my + h * 0.5, mz, 0.03, 0.03, l3, { rotY, rotX });
  const n = Math.max(1, Math.ceil(lh / (o.postSpacing ?? 1.2)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = o.a[0] + dx * t;
    const z = o.a[1] + dz * t;
    const y = o.yA + dy * t;
    batch.box(o.mat, x, y + h / 2, z, 0.045, h, 0.045, {});
  }
  if (col && o.collide !== false) {
    col.box(mx, my + 0.6, mz, 0.1, 1.2, l3, 'rail', { rotY, rotX });
  }
}
