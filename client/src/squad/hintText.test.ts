import { describe, expect, it } from 'vitest';
import { feedTopPx, squadHintText } from './hintText';

describe('squad hint (UI-09)', () => {
  it('public build shows only the key hint, no counters', () => {
    const t = squadHintText({ debug: false, bleedFast: true, enemySquads: 3, pings: 2, spectating: 'Bot1' });
    expect(t).toBe('P ping · hold F revive');
  });
  it('debug shows counters', () => {
    const t = squadHintText({ debug: true, enemySquads: 3, pings: 2 });
    expect(t).toMatch(/enemy×3/);
    expect(t).toMatch(/ping×2/);
  });
});

describe('kill feed placement (UI-17)', () => {
  it('sits under the measured zone HUD', () => {
    expect(feedTopPx(310, 0)).toBe(318);
    expect(feedTopPx(310.2, 10)).toBe(309);
  });
  it('never higher than the old spot, and falls back when no zone HUD', () => {
    expect(feedTopPx(90, 0)).toBe(200);
    expect(feedTopPx(null, 0)).toBe(200);
  });
});
