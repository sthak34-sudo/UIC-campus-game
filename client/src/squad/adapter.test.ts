import { describe, expect, it } from 'vitest';
import { parseSquadOptions } from './adapter';

describe('parseSquadOptions', () => {
  it('defaults to solo when squad param is missing', () => {
    expect(parseSquadOptions('')).toEqual({ mode: 'solo', bleedFast: false });
    expect(parseSquadOptions('?')).toEqual({ mode: 'solo', bleedFast: false });
    expect(parseSquadOptions('?bleedFast=1')).toEqual({ mode: 'solo', bleedFast: true });
  });

  it('only ?squad=bots turns bots on; anything else is solo', () => {
    expect(parseSquadOptions('?squad=bots')).toEqual({ mode: 'bots', bleedFast: false });
    expect(parseSquadOptions('?squad=bots&bleedFast=1')).toEqual({ mode: 'bots', bleedFast: true });
    expect(parseSquadOptions('?squad=solo')).toEqual({ mode: 'solo', bleedFast: false });
    expect(parseSquadOptions('bleedFast=true&squad=SOLO')).toEqual({ mode: 'solo', bleedFast: true });
    expect(parseSquadOptions('?squad=BOTS')).toEqual({ mode: 'bots', bleedFast: false });
    expect(parseSquadOptions('?squad=other')).toEqual({ mode: 'solo', bleedFast: false });
  });
});
