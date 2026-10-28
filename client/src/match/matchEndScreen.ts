/**
 * Match-end screen: title, placement, kills, damage dealt, survival time, Play again.
 * Thin DOM layer; the numbers come from matchStats.ts.
 */
import type { MatchSummary } from './matchStats';
import { requestRestart } from './restart';

export class MatchEndScreen {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly placement: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private shown = false;

  constructor(parent: HTMLElement, onPlayAgain: () => void = () => void requestRestart()) {
    this.root = document.createElement('div');
    this.root.id = 'match-end';
    Object.assign(this.root.style, {
      position: 'absolute', inset: '0', display: 'none', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(4,8,14,0.78)', zIndex: '60', pointerEvents: 'auto',
      fontFamily: 'system-ui, sans-serif', color: '#f4f7fb', textAlign: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    const card = document.createElement('div');
    Object.assign(card.style, {
      background: '#0d141d', border: '1px solid #2c3a4a', borderRadius: '10px', padding: '28px 40px',
      minWidth: '320px', boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
    } satisfies Partial<CSSStyleDeclaration>);
    this.title = document.createElement('div');
    this.title.style.cssText = 'font-size:40px;font-weight:800;letter-spacing:0.02em';
    this.placement = document.createElement('div');
    this.placement.id = 'match-end-placement';
    this.placement.style.cssText = 'margin-top:6px;font-size:22px;font-weight:700;color:#ffd38a';
    this.stats = document.createElement('div');
    this.stats.style.cssText = 'margin:20px 0 22px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px';
    const btn = document.createElement('button');
    btn.id = 'match-end-play-again';
    btn.type = 'button';
    btn.textContent = 'Play again';
    btn.style.cssText = 'font:inherit;font-size:18px;font-weight:700;padding:10px 28px;cursor:pointer;background:#49c2f5;color:#05121c;border:0;border-radius:6px';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPlayAgain();
    });
    card.append(this.title, this.placement, this.stats, btn);
    this.root.appendChild(card);
    parent.appendChild(this.root);
  }

  show(s: MatchSummary): void {
    this.title.textContent = s.title;
    this.title.style.color = s.title === 'Victory!' ? '#ffe27a' : '#f4f7fb';
    this.placement.textContent = s.placement;
    this.stats.replaceChildren(
      ...[
        ['Kills', String(s.kills)],
        ['Damage dealt', String(s.damage)],
        ['Survived', s.survival],
      ].map(([label, value]) => {
        const cell = document.createElement('div');
        cell.innerHTML = `<div style="font-size:28px;font-weight:800"></div><div style="font-size:12px;opacity:.7;text-transform:uppercase;letter-spacing:.08em"></div>`;
        (cell.children[0] as HTMLElement).textContent = value!;
        (cell.children[1] as HTMLElement).textContent = label!;
        return cell;
      }),
    );
    this.root.style.display = 'flex';
    this.shown = true;
    document.exitPointerLock?.();
  }

  isShown(): boolean {
    return this.shown;
  }

  dispose(): void {
    this.root.remove();
  }
}
