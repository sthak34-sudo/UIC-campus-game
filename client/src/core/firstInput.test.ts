import { afterEach, describe, expect, it } from 'vitest';
import { onFirstInput, resetFirstInputForTests } from './firstInput';

class Target {
  listeners = new Map<string, () => void>();
  addEventListener(e: string, f: () => void) { this.listeners.set(e, f); }
  removeEventListener(e: string) { this.listeners.delete(e); }
}

afterEach(() => resetFirstInputForTests());

describe('onFirstInput (QA-01 match clock)', () => {
  it('waits for the first input, then fires once and stops listening', () => {
    const t = new Target();
    let n = 0;
    onFirstInput(t, () => n++);
    expect(n).toBe(0);
    t.listeners.get('keydown')!();
    expect(n).toBe(1);
    expect(t.listeners.size).toBe(0);
  });
  it('after the player is in (Play again), a new match starts its clock at once', () => {
    const t = new Target();
    onFirstInput(t, () => {});
    t.listeners.get('mousedown')!();
    let n = 0;
    onFirstInput(t, () => n++);
    expect(n).toBe(1);
  });
  it('a cancelled wait never fires', () => {
    const t = new Target();
    let n = 0;
    const off = onFirstInput(t, () => n++);
    off();
    t.listeners.get('pointerdown')!();
    expect(n).toBe(0);
  });
});
