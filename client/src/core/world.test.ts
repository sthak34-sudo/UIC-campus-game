import { describe, expect, it } from 'vitest';
import { World } from './world';

describe('World.onUpdate', () => {
  it('returns an unsubscribe so a restarted match does not leave old callbacks running', () => {
    const w = new World();
    let a = 0;
    let b = 0;
    const offA = w.onUpdate(() => a++);
    w.onUpdate(() => b++);
    w.update(0.016, 0);
    offA();
    offA(); // idempotent
    w.update(0.016, 0);
    expect([a, b]).toEqual([1, 2]);
    expect(w.updateCount).toBe(1);
  });
  it('tolerates a callback unsubscribing during the frame', () => {
    const w = new World();
    let n = 0;
    const off = w.onUpdate(() => off());
    w.onUpdate(() => n++);
    w.update(0.016, 0);
    expect(n).toBe(1);
  });
});
