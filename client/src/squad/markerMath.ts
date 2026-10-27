/**
 * Pure screen projection helpers for squad world markers (S4).
 * NDC in [-1,1]; output CSS pixels with top-left origin.
 */

export interface ScreenPoint {
  x: number;
  y: number;
  /** True when the point was pulled onto the screen edge (off-screen / behind). */
  clamped: boolean;
  /** True when the world point is behind the camera. */
  behind: boolean;
}

/** Map NDC to CSS pixels. */
export function ndcToScreen(ndcX: number, ndcY: number, width: number, height: number): { x: number; y: number } {
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (-ndcY * 0.5 + 0.5) * height,
  };
}

/**
 * Clamp a screen point to the rectangle inset by `margin`.
 * If behind the camera, push to the opposite edge in the direction of (ndcX, ndcY).
 */
export function clampToScreenEdge(
  ndcX: number,
  ndcY: number,
  ndcZ: number,
  width: number,
  height: number,
  margin = 24,
): ScreenPoint {
  const behind = ndcZ > 1;
  let x = ndcX;
  let y = ndcY;
  if (behind) {
    x = -x;
    y = -y;
  }
  const raw = ndcToScreen(x, y, width, height);
  const minX = margin;
  const maxX = width - margin;
  const minY = margin;
  const maxY = height - margin;
  let sx = raw.x;
  let sy = raw.y;
  let clamped = behind || sx < minX || sx > maxX || sy < minY || sy > maxY;
  if (sx < minX || sx > maxX || sy < minY || sy > maxY) {
    // Pull onto the edge along the ray from screen center.
    const cx = width / 2;
    const cy = height / 2;
    const dx = raw.x - cx;
    const dy = raw.y - cy;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
      sx = cx;
      sy = minY;
    } else {
      const scaleX = dx > 0 ? (maxX - cx) / dx : dx < 0 ? (minX - cx) / dx : Infinity;
      const scaleY = dy > 0 ? (maxY - cy) / dy : dy < 0 ? (minY - cy) / dy : Infinity;
      const scale = Math.min(scaleX, scaleY);
      sx = cx + dx * scale;
      sy = cy + dy * scale;
    }
    clamped = true;
  }
  sx = Math.min(maxX, Math.max(minX, sx));
  sy = Math.min(maxY, Math.max(minY, sy));
  return { x: sx, y: sy, clamped, behind };
}
