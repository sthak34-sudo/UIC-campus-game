/**
 * "Click to play" prompt: a clear card in the middle of the screen while the mouse is not captured.
 * Clicks pass straight through it to the game canvas, which requests pointer lock (see input.ts).
 * If the browser refuses pointer lock, the card says so and explains drag-to-look.
 */
export type LockState = 'idle' | 'locked' | 'failed';

/** Prompt text for a pointer-lock state, or null when the prompt should be hidden. */
export function clickToPlayText(state: LockState): { title: string; sub: string } | null {
  if (state === 'locked') return null;
  if (state === 'failed') {
    return { title: 'Click to play', sub: 'The browser blocked mouse capture. Click again, or hold the left button and drag to look.' };
  }
  return { title: 'Click to play', sub: 'Captures the mouse for aiming · Esc releases it' };
}

export function mountClickToPlay(dom: HTMLElement, parent: HTMLElement = document.getElementById('hud') ?? document.body): { dispose(): void } {
  const card = document.createElement('div');
  card.id = 'click-to-play';
  Object.assign(card.style, {
    position: 'absolute', left: '50%', top: '68%', transform: 'translate(-50%, -50%)',
    padding: '12px 22px', borderRadius: '10px', background: 'rgba(0,0,0,0.55)',
    border: '1px solid rgba(255,255,255,0.25)', textAlign: 'center', pointerEvents: 'none', zIndex: '30',
    maxWidth: '360px',
  } satisfies Partial<CSSStyleDeclaration>);
  const title = document.createElement('div');
  Object.assign(title.style, { fontSize: '20px', fontWeight: '700', letterSpacing: '0.03em' });
  const sub = document.createElement('div');
  Object.assign(sub.style, { fontSize: '12px', opacity: '0.8', marginTop: '4px' });
  card.append(title, sub);
  parent.appendChild(card);
  dom.style.cursor = 'pointer';

  let state: LockState = 'idle';
  let waitTimer: ReturnType<typeof setTimeout> | null = null;
  const render = () => {
    // Stay hidden behind the loading screen; check again shortly.
    if (document.getElementById('loading')) {
      card.style.display = 'none';
      waitTimer ??= setTimeout(() => { waitTimer = null; render(); }, 300);
      return;
    }
    const t = clickToPlayText(state);
    card.style.display = t ? 'block' : 'none';
    dom.style.cursor = t ? 'pointer' : 'none';
    if (t) { title.textContent = t.title; sub.textContent = t.sub; }
  };
  const onChange = () => {
    state = document.pointerLockElement === dom ? 'locked' : state === 'failed' ? 'failed' : 'idle';
    render();
  };
  const onError = () => { state = 'failed'; render(); };
  document.addEventListener('pointerlockchange', onChange);
  document.addEventListener('pointerlockerror', onError);
  render();
  return {
    dispose() {
      document.removeEventListener('pointerlockchange', onChange);
      document.removeEventListener('pointerlockerror', onError);
      if (waitTimer) clearTimeout(waitTimer);
      card.remove();
    },
  };
}
