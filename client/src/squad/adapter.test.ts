import { describe, expect, it } from 'vitest';
import { parseSquadOptions } from './adapter';

describe('parseSquadOptions', () => {
  it('defaults to solo when squad param is missing', () => {
    expect(parseSquadOptions('')).toEqual({ mode: 'solo', bleedFast: false, enemySquads: 0 });
    expect(parseSquadOptions('?')).toEqual({ mode: 'solo', bleedFast: false, enemySquads: 0 });
    expect(parseSquadOptions('?bleedFast=1')).toEqual({ mode: 'solo', bleedFast: true, enemySquads: 0 });
  });

  it('only ?squad=bots turns bots on; anything else is solo', () => {
    expect(parseSquadOptions('?squad=bots')).toEqual({ mode: 'bots', bleedFast: false, enemySquads: 0 });
    expect(parseSquadOptions('?squad=bots&bleedFast=1')).toEqual({ mode: 'bots', bleedFast: true, enemySquads: 0 });
    expect(parseSquadOptions('?squad=solo')).toEqual({ mode: 'solo', bleedFast: false, enemySquads: 0 });
    expect(parseSquadOptions('bleedFast=true&squad=SOLO')).toEqual({ mode: 'solo', bleedFast: true, enemySquads: 0 });
    expect(parseSquadOptions('?squad=BOTS')).toEqual({ mode: 'bots', bleedFast: false, enemySquads: 0 });
    expect(parseSquadOptions('?squad=other')).toEqual({ mode: 'solo', bleedFast: false, enemySquads: 0 });
    expect(parseSquadOptions('?squad=bots&enemySquads=2')).toEqual({ mode: 'bots', bleedFast: false, enemySquads: 2 });
    expect(parseSquadOptions('?enemySquads=9')).toEqual({ mode: 'solo', bleedFast: false, enemySquads: 4 });
    expect(parseSquadOptions('?enemySquads=-3')).toEqual({ mode: 'solo', bleedFast: false, enemySquads: 0 });
  });
});

describe('squad key hint placement', () => {
  it('sits above the bottom-left health / ammo stack instead of over it', async () => {
    const { SQUAD_HINT_BOTTOM_PX } = await import('./adapter');
    // Combat HUD stack: bottom 28 px, two bars + health line + 22 px ammo line + inventory line.
    expect(SQUAD_HINT_BOTTOM_PX).toBeGreaterThanOrEqual(28 + 100);
  });
});
