import { describe, expect, it } from 'vitest';
import { parseSquadOptions } from './adapter';

describe('parseSquadOptions', () => {
  it('defaults to bots', () => {
    expect(parseSquadOptions('')).toEqual({ mode: 'bots', bleedFast: false });
    expect(parseSquadOptions('?')).toEqual({ mode: 'bots', bleedFast: false });
  });

  it('reads solo and bleedFast', () => {
    expect(parseSquadOptions('?squad=solo')).toEqual({ mode: 'solo', bleedFast: false });
    expect(parseSquadOptions('?squad=bots&bleedFast=1')).toEqual({ mode: 'bots', bleedFast: true });
    expect(parseSquadOptions('bleedFast=true&squad=SOLO')).toEqual({ mode: 'solo', bleedFast: true });
  });
});
