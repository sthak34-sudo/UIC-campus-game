/**
 * "Has the player started playing yet?" The match clock (QA-01) starts here rather than at
 * mount, because mounting happens during boot, before the loading screen and "Click to play".
 *
 * The first click, key or touch anywhere on the page counts. After that, later callers (Play
 * again remounts the match with the player already in) get their callback straight away.
 */
let started = false;
const waiting = new Set<() => void>();

const EVENTS = ['pointerdown', 'mousedown', 'keydown', 'touchstart'] as const;
let listening: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null = null;

function fire(): void {
  if (started) return;
  started = true;
  if (listening) for (const e of EVENTS) listening.removeEventListener(e, fire, true);
  listening = null;
  const list = [...waiting];
  waiting.clear();
  for (const cb of list) cb();
}

/**
 * Call `cb` once, on the first user input on `target` (or now, if the player already gave one).
 * Returns a cancel function.
 */
export function onFirstInput(
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  cb: () => void,
): () => void {
  if (started) {
    cb();
    return () => {};
  }
  waiting.add(cb);
  if (!listening) {
    listening = target;
    for (const e of EVENTS) target.addEventListener(e, fire, true);
  }
  return () => {
    waiting.delete(cb);
  };
}

/** Test hook. */
export function resetFirstInputForTests(): void {
  started = false;
  waiting.clear();
  listening = null;
}
