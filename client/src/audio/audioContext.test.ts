import { afterEach, describe, expect, it, vi } from 'vitest';
import { UNLOCK_EVENTS, installAudioUnlock, resetSharedAudioForTests, sharedAudioContext } from './audioContext';
import { createFeedbackSound } from './feedbackSound';

class FakeNode {
  connect(n: unknown) { return n; }
  start() {}
  stop() {}
  frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  pan = { value: 0 };
  type = 'sine';
}
class FakeCtx {
  static made = 0;
  state: 'suspended' | 'running' = 'suspended';
  currentTime = 0;
  destination = {};
  oscillators = 0;
  constructor() { FakeCtx.made++; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createStereoPanner() { return new FakeNode(); }
  createGain() { return new FakeNode(); }
  createOscillator() { this.oscillators++; return new FakeNode(); }
}

class Target {
  listeners = new Map<string, () => void>();
  addEventListener(e: string, f: () => void) { this.listeners.set(e, f); }
  removeEventListener(e: string) { this.listeners.delete(e); }
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetSharedAudioForTests();
  FakeCtx.made = 0;
});

describe('shared audio context', () => {
  it('is one context for every sound', () => {
    vi.stubGlobal('AudioContext', FakeCtx);
    expect(sharedAudioContext()).toBe(sharedAudioContext());
    expect(FakeCtx.made).toBe(1);
  });

  it('the first gesture resumes it, then the listeners go away', async () => {
    vi.stubGlobal('AudioContext', FakeCtx);
    const t = new Target();
    installAudioUnlock(t);
    expect([...t.listeners.keys()].sort()).toEqual([...UNLOCK_EVENTS].sort());
    t.listeners.get('mousedown')!();
    await Promise.resolve();
    await Promise.resolve();
    expect(sharedAudioContext()!.state).toBe('running');
    expect(t.listeners.size).toBe(0);
  });

  it('a hit cue asked for while still suspended plays once audio resumes (not dropped)', async () => {
    vi.stubGlobal('AudioContext', FakeCtx);
    const ctx = sharedAudioContext() as unknown as FakeCtx;
    createFeedbackSound().play('hit');
    expect(ctx.oscillators).toBe(0);
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(ctx.oscillators).toBe(1);
  });
});
