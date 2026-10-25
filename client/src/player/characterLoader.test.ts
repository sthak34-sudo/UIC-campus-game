import { describe, expect, it } from 'vitest';
import { CLIP_NAMES, selectClipName } from './characterLoader';

describe('character clip selection', () => {
  it('uses the milestone 3 clip names', () => {
    expect([...CLIP_NAMES]).toEqual([
      'idle', 'walk', 'run', 'crouch_idle', 'crouch_walk', 'aim_idle', 'fire', 'hit', 'death',
    ]);
  });

  it('picks idle, walk, and run from speed', () => {
    expect(selectClipName(0)).toBe('idle');
    expect(selectClipName(1.2)).toBe('walk');
    expect(selectClipName(4.5)).toBe('run');
  });

  it('prefers crouch, aim, fire, hit, and death when those flags are set', () => {
    expect(selectClipName(0, { crouch: true })).toBe('crouch_idle');
    expect(selectClipName(1, { crouch: true })).toBe('crouch_walk');
    expect(selectClipName(0, { aiming: true })).toBe('aim_idle');
    expect(selectClipName(1.4, { aiming: true })).toBe('walk');
    expect(selectClipName(1, { crouch: true, firing: true })).toBe('fire');
    expect(selectClipName(4, { hit: true })).toBe('hit');
    expect(selectClipName(4, { dead: true, firing: true })).toBe('death');
  });
});
