import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestRestart, setRestartHandler } from './restart';

afterEach(() => setRestartHandler(null));

describe('requestRestart', () => {
  it('reloads when no handler is registered', async () => {
    const reload = vi.fn();
    expect(await requestRestart(reload)).toBe('reloaded');
    expect(reload).toHaveBeenCalledOnce();
  });
  it('restarts in place when a handler is registered', async () => {
    const reload = vi.fn();
    const run = vi.fn();
    setRestartHandler(run);
    expect(await requestRestart(reload)).toBe('restarted');
    expect(run).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });
  it('falls back to reload if the restart throws', async () => {
    const reload = vi.fn();
    setRestartHandler(() => { throw new Error('boom'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await requestRestart(reload)).toBe('reloaded');
    expect(reload).toHaveBeenCalledOnce();
  });
});
