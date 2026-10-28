import { describe, expect, it } from 'vitest';
import { addFrame, emptyWindow, formatPerf, perfEnabled } from './perfStats';

describe('perf overlay stats', () => {
  it('only turns on with ?debug=perf', () => {
    expect(perfEnabled('')).toBe(false);
    expect(perfEnabled('?debug=other')).toBe(false);
    expect(perfEnabled('?debug=perf')).toBe(true);
    expect(perfEnabled('?squad=bots&debug=x,perf')).toBe(true);
  });
  it('reports fps, average and worst once a second', () => {
    let w = emptyWindow();
    let report = null;
    for (let i = 0; i < 59 && !report; i++) ({ w, report } = addFrame(w, 16));
    expect(report).toBeNull();
    ({ w, report } = addFrame(w, 100)); // one hitch
    ({ w, report } = report ? { w, report } : addFrame(w, 16));
    expect(report).not.toBeNull();
    expect(report!.worstMs).toBe(100);
    expect(report!.fps).toBeGreaterThan(40);
    expect(report!.fps).toBeLessThan(60);
    expect(w.frames).toBe(0);
  });
  it('formats a readable panel', () => {
    expect(formatPerf({ fps: 59.6, avgMs: 16.78, worstMs: 33.3 }, 1630, 2_450_000)).toBe('60 FPS\n16.8 ms avg\n33.3 ms worst\n1630 draws\n2.45M tris');
  });
});
