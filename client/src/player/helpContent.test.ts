import { describe, expect, it } from 'vitest';
import { controlsList, SHORT_HELP, START_CARD } from './helpContent';

describe('new-player help (UI-07, UI-22)', () => {
  it('start card is three short lines with the goal', () => {
    expect(START_CARD).toHaveLength(3);
    expect(START_CARD.join(' ')).toMatch(/circle/);
    expect(START_CARD.join(' ')).toMatch(/[Ll]ast squad/);
  });
  it('top line is short and has no debug keys', () => {
    expect(SHORT_HELP.length).toBeLessThan(80);
    expect(SHORT_HELP).not.toMatch(/F3|debug|hurt|skip zone/i);
  });
  it('public controls list hides F3 / H / Z, debug list shows them', () => {
    const pub = controlsList(false).map((c) => c[0]);
    expect(pub).not.toContain('F3');
    expect(pub).not.toContain('H');
    expect(pub).not.toContain('Z');
    expect(pub).toContain('Hold F');
    const dbg = controlsList(true).map((c) => c[0]);
    expect(dbg).toEqual(expect.arrayContaining(['F3', 'H', 'Z']));
  });
});
