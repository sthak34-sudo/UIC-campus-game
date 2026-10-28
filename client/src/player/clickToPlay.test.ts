import { describe, expect, it } from 'vitest';
import { clickToPlayText } from './clickToPlay';

describe('click to play prompt', () => {
  it('shows until the mouse is captured, then hides', () => {
    expect(clickToPlayText('idle')?.title).toBe('Click to play');
    expect(clickToPlayText('locked')).toBeNull();
  });
  it('explains drag-to-look when the browser refuses mouse capture', () => {
    expect(clickToPlayText('failed')?.sub).toMatch(/drag to look/);
  });
});
