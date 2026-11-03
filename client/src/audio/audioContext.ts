/**
 * One Web Audio context for every game sound (gunshots, impacts, hit feedback).
 *
 * Browsers start an AudioContext "suspended" until a user gesture. Before this module each sound
 * made its own context on first use, mid-fight, so the first hit tick or gunshot was dropped while
 * the context resumed. `installAudioUnlock` creates and resumes the shared context on the very
 * first click, key or touch, so it is already running when the first shot lands.
 */
type Ctor = new () => AudioContext;

let shared: AudioContext | null = null;

function ctor(): Ctor | null {
  const g = globalThis as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** The shared context, created on first call; null where Web Audio does not exist. */
export function sharedAudioContext(): AudioContext | null {
  if (shared) return shared;
  const C = ctor();
  if (!C) return null;
  shared = new C();
  return shared;
}

/** Ask the context to run; resolves true when it is running. Never throws. */
export async function resumeAudio(): Promise<boolean> {
  const ctx = sharedAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'running') return true;
  try {
    await ctx.resume();
  } catch {
    return false;
  }
  return (ctx.state as AudioContextState) === 'running';
}

/** Gestures that browsers accept for starting audio. */
export const UNLOCK_EVENTS = ['pointerdown', 'mousedown', 'keydown', 'touchstart'] as const;

/**
 * Resume the shared context on the first user gesture on `target` (normally `window`).
 * Listeners stay until the context is running, then remove themselves. Returns an unsubscribe.
 */
export function installAudioUnlock(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>): () => void {
  let done = false;
  const off = () => {
    if (done) return;
    done = true;
    for (const e of UNLOCK_EVENTS) target.removeEventListener(e, onGesture, true);
  };
  const onGesture = () => {
    void resumeAudio().then((ok) => {
      if (ok) off();
    });
  };
  for (const e of UNLOCK_EVENTS) target.addEventListener(e, onGesture, true);
  return off;
}

/** Test hook: forget the shared context. */
export function resetSharedAudioForTests(): void {
  shared = null;
}
