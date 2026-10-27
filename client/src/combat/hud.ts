/**
 * Combat HUD: crosshair, health, armor, ammo, inventory, the "Press E" prompt, and the death screen.
 * Sits on the page's #hud layer (pointer-events pass through except the respawn button).
 */
import { COMBAT } from './balance';

export interface HudState {
  health: number;
  maxHealth: number;
  armor: number;
  mag: number;
  reserve: number;
  medkits: number;
  hasGun: boolean;
  reloading: boolean;
  reloadLeft: number;
  prompt: string;
}

export class CombatHud {
  private readonly root: HTMLDivElement;
  private readonly healthFill: HTMLDivElement;
  private readonly healthText: HTMLDivElement;
  private readonly armorFill: HTMLDivElement;
  private readonly ammoEl: HTMLDivElement;
  private readonly invEl: HTMLDivElement;
  private readonly promptEl: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;
  private readonly cross: HTMLDivElement;
  private readonly death: HTMLDivElement;
  private hint = '';
  private hintLeft = 0;
  private crossLeft = 0;
  private crossColor = '#f4f7f4';

  constructor(parent: HTMLElement, onRespawn: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'combat-hud';
    Object.assign(this.root.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '15',
      fontFamily: 'system-ui, sans-serif', userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    this.cross = document.createElement('div');
    this.cross.setAttribute('aria-hidden', 'true');
    Object.assign(this.cross.style, {
      position: 'absolute', left: '50%', top: '50%', width: '18px', height: '18px',
      transform: 'translate(-50%, -50%)',
    } satisfies Partial<CSSStyleDeclaration>);
    const arm = (x: string, y: string, w: string, h: string) => {
      const d = document.createElement('div');
      Object.assign(d.style, {
        position: 'absolute', left: x, top: y, width: w, height: h, background: '#f4f7f4',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.85)',
      } satisfies Partial<CSSStyleDeclaration>);
      this.cross.appendChild(d);
      return d;
    };
    arm('0', '8px', '5px', '2px');
    arm('13px', '8px', '5px', '2px');
    arm('8px', '0', '2px', '5px');
    arm('8px', '13px', '2px', '5px');
    this.root.appendChild(this.cross);

    const stack = document.createElement('div');
    Object.assign(stack.style, {
      position: 'absolute', left: '16px', bottom: '28px', width: '240px',
      textShadow: '0 1px 2px #000', color: '#f4f7f4',
    } satisfies Partial<CSSStyleDeclaration>);

    this.armorFill = barRow(stack, '#7eb0d8');
    this.healthFill = barRow(stack, '#d24b4b');
    this.healthText = document.createElement('div');
    this.healthText.style.fontSize = '13px';
    this.healthText.style.marginTop = '4px';
    stack.appendChild(this.healthText);
    this.ammoEl = document.createElement('div');
    Object.assign(this.ammoEl.style, { fontSize: '22px', fontWeight: '700', letterSpacing: '0.04em', marginTop: '2px' } satisfies Partial<CSSStyleDeclaration>);
    stack.appendChild(this.ammoEl);
    this.invEl = document.createElement('div');
    this.invEl.style.fontSize = '14px';
    this.invEl.style.opacity = '0.95';
    stack.appendChild(this.invEl);
    this.root.appendChild(stack);

    this.promptEl = document.createElement('div');
    Object.assign(this.promptEl.style, {
      position: 'absolute', left: '50%', bottom: '18%', transform: 'translateX(-50%)',
      padding: '6px 12px', background: 'rgba(0,0,0,0.55)', borderRadius: '6px',
      fontSize: '16px', color: '#fff', display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.promptEl);

    this.hintEl = document.createElement('div');
    Object.assign(this.hintEl.style, {
      position: 'absolute', left: '50%', bottom: '24%', transform: 'translateX(-50%)',
      fontSize: '15px', color: '#ffe7a3', display: 'none', textShadow: '0 1px 2px #000',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.hintEl);

    this.death = document.createElement('div');
    Object.assign(this.death.style, {
      position: 'absolute', inset: '0', display: 'none', pointerEvents: 'auto',
      background: 'rgba(20,8,10,0.72)', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', color: '#fff', textAlign: 'center', gap: '12px',
    } satisfies Partial<CSSStyleDeclaration>);
    const title = document.createElement('div');
    title.textContent = 'You are down';
    title.style.fontSize = '40px';
    title.style.fontWeight = '700';
    const sub = document.createElement('div');
    sub.textContent = 'This is a practice round. You can get back up at the library entrance.';
    sub.style.fontSize = '16px';
    sub.style.maxWidth = '420px';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Respawn';
    Object.assign(btn.style, {
      marginTop: '8px', font: 'inherit', fontSize: '18px', padding: '10px 22px', cursor: 'pointer',
      background: '#f4f7f4', color: '#1a1a1a', border: '0', borderRadius: '6px',
    } satisfies Partial<CSSStyleDeclaration>);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onRespawn();
    });
    this.death.append(title, sub, btn);
    this.root.appendChild(this.death);
    parent.appendChild(this.root);
  }

  setState(s: HudState): void {
    const h = s.maxHealth <= 0 ? 0 : Math.max(0, Math.min(1, s.health / s.maxHealth));
    this.healthFill.style.transform = `scaleX(${h})`;
    this.armorFill.style.transform = `scaleX(${Math.max(0, Math.min(1, s.armor / COMBAT.armorCap))})`;
    this.healthText.textContent = `Health ${Math.ceil(s.health)}    Armor ${Math.ceil(s.armor)}`;
    if (!s.hasGun) this.ammoEl.textContent = 'No rifle';
    else if (s.reloading) this.ammoEl.textContent = `Reloading ${s.reloadLeft.toFixed(1)}s`;
    else this.ammoEl.textContent = `${s.mag} / ${COMBAT.magSize}    ${s.reserve} reserve`;
    this.invEl.textContent = `Med kits ${s.medkits}    (Q to use)`;
    if (s.prompt) {
      this.promptEl.style.display = 'block';
      this.promptEl.textContent = s.prompt;
    } else {
      this.promptEl.style.display = 'none';
    }
    this.hintEl.style.display = this.hintLeft > 0 ? 'block' : 'none';
    this.hintEl.textContent = this.hint;
  }

  flashHint(text: string): void {
    this.hint = text;
    this.hintLeft = 1.4;
    this.hintEl.style.display = 'block';
    this.hintEl.textContent = text;
  }

  flashCrosshair(kind: 'hit' | 'head'): void {
    this.crossColor = kind === 'head' ? '#ffd15a' : '#ff8d8d';
    this.crossLeft = 0.12;
    this.paintCross();
  }

  showDeath(on: boolean): void {
    this.death.style.display = on ? 'flex' : 'none';
    this.cross.style.display = on ? 'none' : 'block';
  }

  tick(dt: number): void {
    if (this.hintLeft > 0) {
      this.hintLeft -= dt;
      if (this.hintLeft <= 0) this.hintEl.style.display = 'none';
    }
    if (this.crossLeft > 0) {
      this.crossLeft -= dt;
      if (this.crossLeft <= 0) {
        this.crossColor = '#f4f7f4';
        this.paintCross();
      }
    }
  }

  private paintCross(): void {
    for (const child of this.cross.children) {
      (child as HTMLElement).style.background = this.crossColor;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}

function barRow(parent: HTMLElement, color: string): HTMLDivElement {
  const track = document.createElement('div');
  Object.assign(track.style, {
    marginTop: '4px', height: '12px', background: 'rgba(0,0,0,0.55)', borderRadius: '2px', overflow: 'hidden',
    boxShadow: '0 0 0 1px rgba(255,255,255,0.25)',
  } satisfies Partial<CSSStyleDeclaration>);
  const fill = document.createElement('div');
  Object.assign(fill.style, {
    height: '100%', width: '100%', background: color, transformOrigin: 'left center', transform: 'scaleX(1)',
  } satisfies Partial<CSSStyleDeclaration>);
  track.appendChild(fill);
  parent.appendChild(track);
  return fill;
}
