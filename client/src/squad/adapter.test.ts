import { describe, expect, it } from 'vitest';
import { parseSquadOptions } from './adapter';

describe('parseSquadOptions', () => {
  it('defaults to solo when squad param is missing', () => {
    expect(parseSquadOptions('')).toEqual({ mode: 'solo', bleedFast: false, enemySquads: 0 });
    expect(parseSquadOptions('?')).toEqual({ mode: 'solo', bleedFast: false, enemySquads: 0 });
    expect(parseSquadOptions('?bleedFast=1')).toEqual({ mode: 'solo', bleedFast: true, enemySquads: 0 });
  });

  it('only ?squad=bots turns bots on; anything else is solo', () => {
    expect(parseSquadOptions('?squad=bots')).toEqual({ mode: 'bots', bleedFast: false, enemySquads: 3 });
    expect(parseSquadOptions('?squad=bots&bleedFast=1')).toEqual({ mode: 'bots', bleedFast: true, enemySquads: 3 });
    expect(parseSquadOptions('?squad=solo')).toEqual({ mode: 'solo', bleedFast: false, enemySquads: 0 });
    expect(parseSquadOptions('bleedFast=true&squad=SOLO')).toEqual({ mode: 'solo', bleedFast: true, enemySquads: 0 });
    expect(parseSquadOptions('?squad=BOTS')).toEqual({ mode: 'bots', bleedFast: false, enemySquads: 3 });
    expect(parseSquadOptions('?squad=other')).toEqual({ mode: 'solo', bleedFast: false, enemySquads: 0 });
    expect(parseSquadOptions('?squad=bots&enemySquads=2')).toEqual({ mode: 'bots', bleedFast: false, enemySquads: 2 });
    expect(parseSquadOptions('?enemySquads=9')).toEqual({ mode: 'solo', bleedFast: false, enemySquads: 4 });
    expect(parseSquadOptions('?enemySquads=-3')).toEqual({ mode: 'solo', bleedFast: false, enemySquads: 0 });
  });
});
