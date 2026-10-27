import { describe, expect, it } from 'vitest';
import { bootStages, mark, publishReady, type UicStatus } from './bootTimings';

describe('boot timings + ready flag', () => {
  it('records stages in order', () => {
    mark('a'); mark('b');
    const names = bootStages().map((s) => s.name);
    expect(names.slice(-2)).toEqual(['a', 'b']);
    expect(bootStages().every((s) => s.ms >= 0)).toBe(true);
  });

  it('publishes a read-only, frozen status exactly once', () => {
    const w: Record<string, unknown> = {};
    expect(publishReady(w, { bootMs: 12, quality: 'low', reason: 'frames' }, 345.6)).toBe(true);
    const st = w.__uicStatus as UicStatus;
    expect(w.__uicReady).toBe(true);
    expect(st).toMatchObject({ ready: true, bootMs: 12, readyMs: 346, quality: 'low', reason: 'frames' });
    expect(Object.isFrozen(st)).toBe(true);
    expect(Object.isFrozen(st.stages)).toBe(true);
    expect(() => { 'use strict'; (w as { __uicReady: boolean }).__uicReady = false; }).toThrow();
    expect(() => Object.defineProperty(w, '__uicStatus', { value: null })).toThrow();
    expect(publishReady(w, { bootMs: 0, quality: 'high', reason: 'fallback' })).toBe(false);
    expect((w.__uicStatus as UicStatus).quality).toBe('low');
  });

  it('exposes no setters or functions', () => {
    const w: Record<string, unknown> = {};
    publishReady(w, { bootMs: 1, quality: 'medium', reason: 'fallback' });
    const vals = Object.values(w.__uicStatus as object);
    expect(vals.some((v) => typeof v === 'function')).toBe(false);
  });
});
