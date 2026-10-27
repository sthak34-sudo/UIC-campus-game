import { describe, expect, it } from 'vitest';
import { clampToScreenEdge, ndcToScreen } from './markerMath';

describe('markerMath', () => {
  it('maps NDC center to screen center', () => {
    expect(ndcToScreen(0, 0, 1280, 720)).toEqual({ x: 640, y: 360 });
  });

  it('clamps off-screen points to the edge at 1280x720', () => {
    const edge = clampToScreenEdge(2, 0, 0.5, 1280, 720, 24);
    expect(edge.clamped).toBe(true);
    expect(edge.x).toBeCloseTo(1280 - 24, 5);
    expect(edge.y).toBeGreaterThan(24);
    expect(edge.y).toBeLessThan(720 - 24);

    const up = clampToScreenEdge(0, 3, 0.5, 1280, 720, 24);
    expect(up.clamped).toBe(true);
    expect(up.y).toBeCloseTo(24, 5);
  });

  it('flips behind-camera points to the opposite edge', () => {
    const p = clampToScreenEdge(0.5, 0, 1.5, 1280, 720, 24);
    expect(p.behind).toBe(true);
    expect(p.clamped).toBe(true);
    expect(p.x).toBeLessThan(640);
  });
});
