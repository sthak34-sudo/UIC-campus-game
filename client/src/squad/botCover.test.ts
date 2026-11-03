import { describe, expect, it } from 'vitest';
import { BOT_COVER, coverCandidates, pickCover, shouldCrouch, wantsCover } from './botCover';

describe('bot cover (AI-04 first pass)', () => {
  it('goes for cover while reloading or when hurt', () => {
    expect(wantsCover(true, 100, 100)).toBe(true);
    expect(wantsCover(false, 40, 100)).toBe(true);
    expect(wantsCover(false, 80, 100)).toBe(false);
  });
  it('picks the nearest free spot the foe cannot see, never toward the foe', () => {
    const pos = { x: 0, z: 0 };
    const foe = { x: 20, z: 0 };
    // A wall along x = -3 hides everything behind it (x < -3) from the foe; a spot at +z is open.
    const hidden = (p: { x: number; z: number }) => p.x < -3;
    const c = pickCover(pos, foe, coverCandidates(pos), () => true, hidden)!;
    expect(c.x).toBeLessThan(-3);
    expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(BOT_COVER.radii[1] + 1e-6);
    // Cover only toward the foe (behind a crate on its side): refused.
    expect(pickCover(pos, foe, coverCandidates(pos), () => true, (p) => p.x > 3)).toBeNull();
    // Blocked spots are skipped.
    expect(pickCover(pos, foe, coverCandidates(pos), () => false, hidden)).toBeNull();
  });
  it('crouches to shoot when holding still at range, not up close or on the move', () => {
    expect(shouldCrouch(false, 15)).toBe(true);
    expect(shouldCrouch(true, 15)).toBe(false);
    expect(shouldCrouch(false, 5)).toBe(false);
  });
});
