import { describe, expect, it } from 'vitest';
import { allowKey, debugKeysEnabled, helpText } from './debugKeys';

describe('debug keys', () => {
  it('K (and the other cheat keys) do nothing without ?debug in a production build', () => {
    const on = debugKeysEnabled('?squad=bots', false);
    expect(on).toBe(false);
    for (const k of ['KeyK', 'KeyJ', 'KeyL', 'KeyO', 'KeyH', 'KeyZ']) expect(allowKey(k, on)).toBe(false);
  });
  it('normal keys still work', () => {
    for (const k of ['KeyP', 'KeyF', 'ArrowLeft', 'ArrowRight', 'KeyE']) expect(allowKey(k, false)).toBe(true);
  });
  it('?debug or a dev build turns them on', () => {
    expect(debugKeysEnabled('?debug', false)).toBe(true);
    expect(debugKeysEnabled('?squad=bots&debug=perf', false)).toBe(true);
    expect(debugKeysEnabled('', true)).toBe(true);
    expect(allowKey('KeyK', true)).toBe(true);
  });
  it('drops debug entries from the help bar when off', () => {
    const full = 'E pick up · V camera · H hurt (practice) · Z skip zone · F3 debug';
    expect(helpText(full, false)).toBe('E pick up · V camera · F3 debug');
    expect(helpText(full, true)).toBe(full);
  });
});
