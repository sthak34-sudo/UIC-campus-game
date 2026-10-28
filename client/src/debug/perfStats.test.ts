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

import { perfPanelPlacement } from './perfStats';
describe('perfPanelPlacement', () => {
  it('sits right-aligned under the anchor at full size on wide screens', () => {
    expect(perfPanelPlacement({ top: 10, right: 1268, bottom: 200, left: 1100 }, 1280, 220)).toEqual({ top: 208, right: 12, scale: 1 });
  });
  it('scales down on a 320px phone so it stays on the right half', () => {
    const p = perfPanelPlacement({ top: 8, right: 312, bottom: 150, left: 200 }, 320, 220);
    expect(p.right).toBe(8);
    expect(p.scale).toBeLessThan(1);
    expect(220 * p.scale).toBeLessThanOrEqual(144);
  });
  it('falls back to the top-right corner with no anchor', () => {
    expect(perfPanelPlacement(null, 900, 200)).toEqual({ top: 12, right: 12, scale: 1 });
  });
});
