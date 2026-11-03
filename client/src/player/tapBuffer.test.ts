import { describe, expect, it } from 'vitest';
import { PLAYER_CONFIG } from './config';
import { TAP_BUFFER, fireReady, stepTapBuffer, type TapBuffer } from './movement';

const idle: TapBuffer = { pending: false, age: 0 };

describe('fire tap buffer', () => {
  it('a tap with the rifle up fires at once', () => {
    expect(stepTapBuffer(idle, true, true, 1 / 60).fire).toBe(true);
  });
  it('a tap mid-sprint is kept, then fires once the 0.15 s delay has passed', () => {
    const dt = 1 / 60;
    let b = stepTapBuffer(idle, true, false, dt);
    expect(b).toMatchObject({ pending: true, fire: false });
    // The tap ends the sprint this frame; replay the sprint-to-fire delay.
    let since = 0;
    let fired = 0;
    let firedAt = -1;
    for (let i = 0; i < 30; i++) {
      since += dt;
      b = stepTapBuffer(b, false, fireReady(false, since, PLAYER_CONFIG), dt);
      if (b.fire) {
        fired++;
        if (firedAt < 0) firedAt = since;
      }
    }
    expect(fired).toBe(1);
    expect(firedAt).toBeGreaterThanOrEqual(PLAYER_CONFIG.sprintToFire - 1e-9);
    expect(firedAt).toBeLessThan(PLAYER_CONFIG.sprintToFire + 2 * dt);
  });
  it('a stale tap is dropped after TAP_BUFFER seconds (no surprise shot much later)', () => {
    let b = stepTapBuffer(idle, true, false, 0.1);
    for (let t = 0; t < TAP_BUFFER + 0.2; t += 0.1) b = stepTapBuffer(b, false, false, 0.1);
    expect(b.pending).toBe(false);
    expect(stepTapBuffer(b, false, true, 0.1).fire).toBe(false);
  });
  it('the buffer outlasts the sprint-to-fire delay', () => {
    expect(TAP_BUFFER).toBeGreaterThan(PLAYER_CONFIG.sprintToFire * 2);
  });
  it('two taps while lowered still give one shot', () => {
    let b = stepTapBuffer(idle, true, false, 0.05);
    b = stepTapBuffer(b, true, false, 0.05);
    const r = stepTapBuffer(b, false, true, 0.05);
    expect(r.fire).toBe(true);
    expect(stepTapBuffer(r, false, true, 0.05).fire).toBe(false);
  });
});
