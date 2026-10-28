/** Pure frame-time statistics for the ?debug=perf overlay. No DOM, no three. */
export interface PerfWindow {
  frames: number;
  sumMs: number;
  worstMs: number;
  elapsedMs: number;
}
export interface PerfReport {
  fps: number;
  avgMs: number;
  worstMs: number;
}

export const PERF_WINDOW_MS = 1000;

export function emptyWindow(): PerfWindow {
  return { frames: 0, sumMs: 0, worstMs: 0, elapsedMs: 0 };
}

/** Add one frame. Returns a report when the window (about 1 s) is full, then starts a new window. */
export function addFrame(w: PerfWindow, frameMs: number): { w: PerfWindow; report: PerfReport | null } {
  const next: PerfWindow = {
    frames: w.frames + 1,
    sumMs: w.sumMs + frameMs,
    worstMs: Math.max(w.worstMs, frameMs),
    elapsedMs: w.elapsedMs + frameMs,
  };
  if (next.elapsedMs < PERF_WINDOW_MS) return { w: next, report: null };
  return {
    w: emptyWindow(),
    report: {
      fps: (next.frames * 1000) / next.elapsedMs,
      avgMs: next.sumMs / next.frames,
      worstMs: next.worstMs,
    },
  };
}

export function perfEnabled(search: string): boolean {
  return new URLSearchParams(search).getAll('debug').some((v) => v.split(',').includes('perf'));
}

export function formatPerf(r: PerfReport, calls: number, triangles: number): string {
  const tris = triangles >= 1e6 ? `${(triangles / 1e6).toFixed(2)}M` : triangles >= 1e3 ? `${(triangles / 1e3).toFixed(1)}k` : `${triangles}`;
  return `${r.fps.toFixed(r.fps < 10 ? 1 : 0)} FPS\n${r.avgMs.toFixed(1)} ms avg\n${r.worstMs.toFixed(1)} ms worst\n${calls} draws\n${tris} tris`;
}

export interface Rect { top: number; right: number; bottom: number; left: number }

/**
 * Where the perf panel goes: right-aligned under the minimap/zone HUD (or 12px from the
 * top-right corner without one), scaled down so it never takes more than ~45% of a narrow
 * viewport's width. `top`/`right` are px from the viewport's top and right edges.
 */
export function perfPanelPlacement(anchor: Rect | null, viewportW: number, panelW: number): { top: number; right: number; scale: number } {
  const right = anchor ? Math.max(4, viewportW - anchor.right) : 12;
  const top = anchor ? anchor.bottom + 8 : 12;
  const maxW = Math.max(120, viewportW * 0.45);
  const scale = panelW > maxW ? Math.max(0.5, maxW / panelW) : 1;
  return { top: Math.round(top), right: Math.round(right), scale: Math.round(scale * 100) / 100 };
}
