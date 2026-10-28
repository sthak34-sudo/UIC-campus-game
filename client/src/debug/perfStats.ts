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
