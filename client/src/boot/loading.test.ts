import { describe, expect, it } from 'vitest';
import { yieldToBrowser } from './loading';

describe('loading helpers', () => {
  it('yields to the event loop', async () => {
    let ran = false;
    const p = yieldToBrowser().then(() => {
      ran = true;
    });
    expect(ran).toBe(false);
    await p;
    expect(ran).toBe(true);
  });
});
