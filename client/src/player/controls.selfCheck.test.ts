/**
 * Key / URL self-check for the documented Forge controls.
 * Missing query or ?squad=solo => solo; only ?squad=bots enables bots.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSquadOptions } from '../squad/adapter';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));

function src(rel: string): string {
  return readFileSync(`${srcRoot}/${rel}`, 'utf8');
}

describe('URL self-check', () => {
  it('defaults to solo; only ?squad=bots turns bots on', () => {
    expect(parseSquadOptions('')).toMatchObject({ mode: 'solo' });
    expect(parseSquadOptions('?squad=solo')).toMatchObject({ mode: 'solo' });
    expect(parseSquadOptions('?squad=bots')).toMatchObject({ mode: 'bots' });
    expect(parseSquadOptions('?squad=other')).toMatchObject({ mode: 'solo' });
  });

  it('clamps ?enemySquads and accepts bleedFast / zoneFast flags in source', () => {
    expect(parseSquadOptions('?enemySquads=2')).toMatchObject({ enemySquads: 2 });
    expect(parseSquadOptions('?enemySquads=99').enemySquads).toBeLessThanOrEqual(4);
    expect(src('zone/zoneLogic.ts')).toMatch(/zoneFast/);
    expect(src('squad/adapter.ts')).toMatch(/bleedFast/);
  });
});

describe('key self-check', () => {
  it('binds Q medkit, H practice hurt, P ping, K/J knock, F revive, L heal-all, O wipe, Z zone, arrows spectate', () => {
    const input = src('player/input.ts');
    expect(input).toMatch(/case 'KeyQ'/);
    expect(input).toMatch(/case 'KeyB'/);
    expect(input).toMatch(/case 'KeyH'/);
    expect(input).toMatch(/KeyF/);

    const adapter = src('squad/adapter.ts');
    for (const code of ["'KeyP'", "'KeyK'", "'KeyJ'", "'KeyF'", "'KeyL'", "'KeyO'", "'ArrowLeft'", "'ArrowRight'"]) {
      expect(adapter).toContain(code);
    }

    expect(src('zone/index.ts')).toMatch(/KeyZ/);
  });
});
