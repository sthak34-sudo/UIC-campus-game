import { describe, expect, it } from 'vitest';
import { snapBotY, BOT_SNAP_LIFT_M } from './botBody';

const stairs = { sample: (x: number, yFrom: number, _z: number, d: number) => {
  const g = Math.max(0, Math.min(5, Math.floor(x / 0.3))) * 0.17;
  return g <= yFrom && g >= yFrom - d ? g : null;
} };

describe('squad bots stand on the ground', () => {
  it('walks up and down stairs one step at a time', () => {
    let y = 0;
    for (let x = 0; x <= 1.65; x += 0.1) y = snapBotY(stairs, x, y, 0);
    expect(y).toBeCloseTo(0.85);
    for (let x = 1.65; x >= 0; x -= 0.1) y = snapBotY(stairs, x, y, 0);
    expect(y).toBeCloseTo(0);
  });

  it('ignores floors far above (no teleporting onto roofs) and keeps height with no floor', () => {
    const roof = { sample: (_x: number, yFrom: number) => (yFrom >= 10 ? 10 : null) };
    expect(snapBotY(roof, 0, 2, 0)).toBe(2);
    expect(BOT_SNAP_LIFT_M).toBeLessThan(1);
    expect(snapBotY(null, 0, 3, 0)).toBe(3);
  });
});
