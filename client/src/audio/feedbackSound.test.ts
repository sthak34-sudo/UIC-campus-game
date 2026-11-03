import { describe, expect, it } from 'vitest';
import { FEEDBACK_TONES, createFeedbackSound } from './feedbackSound';

describe('feedback sounds', () => {
  it('every cue is short, audible and not too loud', () => {
    for (const [kind, tones] of Object.entries(FEEDBACK_TONES)) {
      expect(tones.length, kind).toBeGreaterThan(0);
      const end = Math.max(...tones.map((t) => t.at + t.dur));
      expect(end, kind).toBeLessThanOrEqual(0.4);
      for (const t of tones) {
        expect(t.gain).toBeGreaterThan(0);
        expect(t.gain).toBeLessThanOrEqual(0.5);
        expect(t.f1).toBeGreaterThanOrEqual(20);
      }
    }
  });
  it('the head tick is higher than the body tick; the kill ding is longer; hurt is low', () => {
    expect(FEEDBACK_TONES.head[0]!.f0).toBeGreaterThan(FEEDBACK_TONES.hit[0]!.f0);
    const len = (k: keyof typeof FEEDBACK_TONES) => Math.max(...FEEDBACK_TONES[k].map((t) => t.at + t.dur));
    expect(len('kill')).toBeGreaterThan(len('hit'));
    expect(FEEDBACK_TONES.hurt[0]!.f0).toBeLessThan(500);
  });
  it('is silent (no throw) where Web Audio does not exist', () => {
    expect(() => createFeedbackSound().play('kill')).not.toThrow();
  });
});
