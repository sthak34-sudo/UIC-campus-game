import { describe, expect, it } from 'vitest';
import { canSeeFoe, FOE_MEMORY, headY, stepFoeMemory } from './foeMemory';

const chest = (d: boolean) => (d ? 0.55 : 1.25);
const eye = { x: 0, y: 1.55, z: 0 };
const foe = { x: 10, y: 0, z: 0 };

describe('seeing a foe', () => {
  it('counts the chest or the head', () => {
    expect(canSeeFoe(eye, foe, false, chest, () => true)).toBe(true);
    // Low wall: only rays aimed above 1.5 m get over it.
    const overWall = (_a: { y: number }, b: { y: number }) => b.y > 1.5;
    expect(canSeeFoe(eye, foe, false, chest, overWall)).toBe(true);
    expect(canSeeFoe(eye, foe, false, chest, () => false)).toBe(false);
    // A downed foe's head is low too, so the same wall hides it.
    expect(headY(true)).toBeLessThan(1.5);
    expect(canSeeFoe(eye, foe, true, chest, overWall)).toBe(false);
  });
});

describe('remembering a foe', () => {
  const self = { x: 0, y: 0, z: 0 };
  const never = () => false;
  it('keeps the last-seen spot for a while, then forgets', () => {
    let m = stepFoeMemory(null, { id: 'b1', pos: foe }, self, 0.1, never);
    expect(m).toMatchObject({ foe: 'b1', x: 10, age: 0 });
    m = stepFoeMemory(m, null, self, 1, never);
    expect(m).toMatchObject({ x: 10, age: 1 });
    m = stepFoeMemory(m, null, self, FOE_MEMORY.keep, never);
    expect(m).toBeNull();
  });
  it('forgets once the spot is reached or the foe is gone', () => {
    const m = stepFoeMemory(null, { id: 'b1', pos: foe }, self, 0.1, never);
    expect(stepFoeMemory(m, null, { x: 9.5, y: 0, z: 0 }, 0.1, never)).toBeNull();
    expect(stepFoeMemory(m, null, self, 0.1, () => true)).toBeNull();
  });
});
