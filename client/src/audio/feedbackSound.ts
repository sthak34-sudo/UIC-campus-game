/**
 * Hit feedback sounds, synthesized with Web Audio (no files, nothing to credit):
 * - `hit`: short bright tick when your shot lands, `head`: sharper and higher,
 * - `kill`: two-note "ding" on a knock or kill,
 * - `hurt`: low thump when a bot hits you, panned toward the shooter.
 * Uses the shared context (`audioContext.ts`). If it is still suspended, the cue is held and
 * played as soon as it resumes (within `FEEDBACK_LATE_LIMIT`), so the first hit is not silent.
 */
import { resumeAudio, sharedAudioContext } from './audioContext';

export type FeedbackKind = 'hit' | 'head' | 'kill' | 'hurt';

export interface Tone {
  /** Start and end frequency (Hz). */
  f0: number;
  f1: number;
  /** Seconds. */
  dur: number;
  /** Peak gain 0..1. */
  gain: number;
  type: OscillatorType;
  /** Delay from the trigger (s). */
  at: number;
}

/** The notes for each cue. Kept here so tests can check the cues stay short and distinct. */
export const FEEDBACK_TONES: Record<FeedbackKind, Tone[]> = {
  hit: [{ f0: 2100, f1: 1700, dur: 0.045, gain: 0.22, type: 'square', at: 0 }],
  head: [
    { f0: 3100, f1: 2600, dur: 0.05, gain: 0.24, type: 'square', at: 0 },
    { f0: 4200, f1: 3800, dur: 0.035, gain: 0.12, type: 'triangle', at: 0.012 },
  ],
  kill: [
    { f0: 1320, f1: 1320, dur: 0.16, gain: 0.26, type: 'sine', at: 0 },
    { f0: 1760, f1: 1760, dur: 0.28, gain: 0.26, type: 'sine', at: 0.09 },
  ],
  hurt: [
    { f0: 180, f1: 60, dur: 0.16, gain: 0.5, type: 'sine', at: 0 },
    { f0: 420, f1: 140, dur: 0.07, gain: 0.18, type: 'triangle', at: 0 },
  ],
};

/** At most this many cues per kind start per second (full auto at 11 shots/s stays readable). */
export const FEEDBACK_MAX_PER_SECOND = 12;

/** A cue that waited this long (s) for audio to unlock is dropped instead of played late. */
export const FEEDBACK_LATE_LIMIT = 0.3;

export interface FeedbackSound {
  /** `pan` -1 (left) .. 1 (right). */
  play(kind: FeedbackKind, pan?: number): void;
}

export function createFeedbackSound(): FeedbackSound {
  const windowStart: Partial<Record<FeedbackKind, number>> = {};
  const count: Partial<Record<FeedbackKind, number>> = {};
  const sound: FeedbackSound = {
    play(kind, pan = 0) {
      const ctx = sharedAudioContext();
      if (!ctx) return;
      if (ctx.state !== 'running') {
        // Hold the cue until audio unlocks instead of dropping it; drop it if that takes too long.
        const asked = performance.now();
        void resumeAudio().then((ok) => {
          if (ok && ctx.state === 'running' && (performance.now() - asked) / 1000 <= FEEDBACK_LATE_LIMIT) sound.play(kind, pan);
        });
        return;
      }
      const now = ctx.currentTime;
      if (now - (windowStart[kind] ?? -10) > 1) {
        windowStart[kind] = now;
        count[kind] = 0;
      }
      count[kind] = (count[kind] ?? 0) + 1;
      if (count[kind]! > FEEDBACK_MAX_PER_SECOND) return;
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      panner.connect(ctx.destination);
      for (const t of FEEDBACK_TONES[kind]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const t0 = now + t.at;
        osc.type = t.type;
        osc.frequency.setValueAtTime(t.f0, t0);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, t.f1), t0 + t.dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(t.gain, t0 + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + t.dur);
        osc.connect(g).connect(panner);
        osc.start(t0);
        osc.stop(t0 + t.dur + 0.02);
      }
    },
  };
  return sound;
}
