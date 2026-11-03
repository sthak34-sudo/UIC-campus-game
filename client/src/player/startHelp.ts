/**
 * Start card + short help bar + full controls overlay (UI-07, UI-22).
 * Mounted once at boot; survives Play again.
 */
import { onFirstInput } from '../core/firstInput';
import {
  controlsList, HELP_FADE_AFTER_S, HELP_FADED_OPACITY, SHORT_HELP, START_CARD, START_CARD_SECONDS,
} from './helpContent';

export function mountStartHelp(hud: HTMLElement, debug: boolean): () => void {
  const help = document.getElementById('help');
  if (help) {
    help.textContent = SHORT_HELP;
    help.style.transition = 'opacity 1.2s ease';
  }

  const card = document.createElement('div');
  card.id = 'start-card';
  Object.assign(card.style, {
    position: 'absolute', top: '64px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.55)', color: '#fff', padding: '10px 18px', borderRadius: '8px',
    font: '600 15px/1.5 system-ui, sans-serif', textAlign: 'center', pointerEvents: 'none',
    textShadow: '0 1px 2px #000', transition: 'opacity 1s ease', zIndex: '15',
  } satisfies Partial<CSSStyleDeclaration>);
  for (const line of START_CARD) {
    const d = document.createElement('div');
    d.textContent = line;
    card.appendChild(d);
  }
  hud.appendChild(card);

  const overlay = document.createElement('div');
  overlay.id = 'controls-overlay';
  Object.assign(overlay.style, {
    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
    background: 'rgba(8,12,18,0.88)', color: '#eee', padding: '14px 20px', borderRadius: '10px',
    font: '13px/1.6 system-ui, sans-serif', display: 'none', pointerEvents: 'none', zIndex: '40',
    whiteSpace: 'pre',
  } satisfies Partial<CSSStyleDeclaration>);
  overlay.textContent = 'Controls\n' + controlsList(debug).map(([k, v]) => `${k.padEnd(12)} ${v}`).join('\n');
  overlay.style.fontFamily = 'ui-monospace, monospace';
  hud.appendChild(overlay);

  const timers: ReturnType<typeof setTimeout>[] = [];
  const hideCard = () => {
    card.style.opacity = '0';
    timers.push(setTimeout(() => card.remove(), 1100));
  };
  timers.push(setTimeout(hideCard, START_CARD_SECONDS * 1000));
  const offFirst = onFirstInput(window, () => {
    hideCard();
    timers.push(setTimeout(() => {
      if (help) help.style.opacity = String(HELP_FADED_OPACITY);
    }, HELP_FADE_AFTER_S * 1000));
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Slash' || e.repeat) return;
    overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
    if (help) help.style.opacity = '';
  };
  window.addEventListener('keydown', onKey);

  return () => {
    offFirst();
    for (const t of timers) clearTimeout(t);
    window.removeEventListener('keydown', onKey);
    card.remove();
    overlay.remove();
  };
}
