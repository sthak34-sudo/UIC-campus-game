import { describe, expect, it, vi } from 'vitest';
import { SHADER_WARM_CAP_MS, withTimeout } from './warm';

describe('withTimeout', () => {
  it('reports done when the promise settles first', async () => {
    expect(await withTimeout(Promise.resolve(1), 50)).toBe('done');
    expect(await withTimeout(Promise.reject(new Error('x')), 50)).toBe('done');
  });
  it('reports timeout when the promise hangs', async () => {
    vi.useFakeTimers();
    const r = withTimeout(new Promise(() => {}), 100);
    vi.advanceTimersByTime(100);
    expect(await r).toBe('timeout');
    vi.useRealTimers();
  });
  it('caps shader warm-up at a few seconds', () => {
    expect(SHADER_WARM_CAP_MS).toBeGreaterThan(0);
    expect(SHADER_WARM_CAP_MS).toBeLessThanOrEqual(10_000);
  });
});
