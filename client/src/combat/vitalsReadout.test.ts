import { describe, expect, it } from 'vitest';
import { HEALTH_COLOR, KNOCK_COLOR, vitalsReadout } from './vitalsReadout';

describe('vitalsReadout (QA-07)', () => {
  it('normal: health and armor', () => {
    const r = vitalsReadout({ health: 74.2, maxHealth: 100, armor: 20 });
    expect(r.text).toBe('Health 75    Armor 20');
    expect(r.fill).toBeCloseTo(0.742);
    expect(r.color).toBe(HEALTH_COLOR);
  });
  it('knocked: never "Health 0", shows the bleed-out bar instead', () => {
    const r = vitalsReadout({ health: 0, maxHealth: 100, armor: 0, knock: { hp: 87, max: 100 } });
    expect(r.text).not.toMatch(/Health 0/);
    expect(r.text).toMatch(/Knocked down/);
    expect(r.fill).toBeCloseTo(0.87);
    expect(r.color).toBe(KNOCK_COLOR);
  });
});
