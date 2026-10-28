import { describe, expect, it } from 'vitest';
import { spectateLabel } from './spectate';

describe('spectateLabel', () => {
  it('shows position and the cycle hint only with several mates', () => {
    expect(spectateLabel('Bot1', 0, 2)).toBe('Spectating Bot1 (1/2) · ← / → switch');
    expect(spectateLabel('Bot2', 0, 1)).toBe('Spectating Bot2 (1/1)');
  });
});
