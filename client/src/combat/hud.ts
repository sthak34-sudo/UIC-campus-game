/**
 * Combat HUD: crosshair, health, armor, ammo, inventory, the "Press E" prompt, and the death screen.
 * Sits on the page's #hud layer (pointer-events pass through except the respawn button).
 */
import { COMBAT } from './balance';
import type { HitmarkerStyle } from './hitFeedback';

export interface HudState {
  health: number;
  maxHealth: number;
  armor: number;
  mag: number;
  reserve: number;
  medkits: number;
  bandages: number;
  hasGun: boolean;
  reloading: boolean;
  reloadLeft: number;
  prompt: string;
}

/** Crosshair arm size (px) and the gap limits. */
const ARM_LEN = 6;
const ARM_W = 2;
const MIN_GAP = 3;
const MAX_GAP = 160;
/** Seconds a zone edge pulse takes to fade. */
const EDGE_PULSE = 0.6;
/** Damage wedges sit on a ring this far from the screen centre (fraction of the short side). */
const WEDGE_RING = 0.22;
/** Hitmarker: each diagonal stroke's length and its gap from the centre (px). */
const HM_LEN = 9;
const HM_GAP = 5;

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
  private readonly arms: HTMLDivElement[];
  private gap = -1;
  private readonly edge: HTMLDivElement;
  private edgeLeft = 0;
  private readonly wedgeLayer: HTMLDivElement;
  private readonly wedges: HTMLDivElement[] = [];
  private readonly marker: HTMLDivElement;
  private readonly markerStrokes: HTMLDivElement[] = [];
  private markerLeft = 0;
  private markerLife = 0.2;

  constructor(parent: HTMLElement, onRespawn: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'combat-hud';
    Object.assign(this.root.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '15',
      fontFamily: 'system-ui, sans-serif', userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    // Crosshair: four arms whose inner ends sit on the edge of the real shot cone (setSpread),
    // so every bullet lands inside them (CMB-03).
    this.cross = document.createElement('div');
    this.cross.id = 'crosshair';
    this.cross.setAttribute('aria-hidden', 'true');
    Object.assign(this.cross.style, {
      position: 'absolute', left: '50%', top: '50%', width: '0', height: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    const arm = (w: number, h: number) => {
      const d = document.createElement('div');
      Object.assign(d.style, {
        position: 'absolute', left: '0', top: '0', width: `${w}px`, height: `${h}px`, background: '#f4f7f4',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.85)', willChange: 'transform',
      } satisfies Partial<CSSStyleDeclaration>);
      this.cross.appendChild(d);
      return d;
    };
    this.arms = [arm(ARM_LEN, ARM_W), arm(ARM_LEN, ARM_W), arm(ARM_W, ARM_LEN), arm(ARM_W, ARM_LEN)];
    this.setSpread(MIN_GAP);
    this.root.appendChild(this.cross);

    // Zone damage cue: a soft red glow at the screen edge, pulsed about once a second (CMB-01).
    this.edge = document.createElement('div');
    this.edge.id = 'zone-edge';
    this.edge.setAttribute('aria-hidden', 'true');
    Object.assign(this.edge.style, {
      position: 'absolute', inset: '0', opacity: '0',
      boxShadow: 'inset 0 0 90px 18px rgba(200,30,30,0.55)',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.edge);

    // Damage direction (CMB-04 / UI-04): red wedges on a ring around the centre, one per attacker.
    this.wedgeLayer = document.createElement('div');
    this.wedgeLayer.id = 'damage-indicators';
    this.wedgeLayer.setAttribute('aria-hidden', 'true');
    Object.assign(this.wedgeLayer.style, {
      position: 'absolute', left: '50%', top: '50%', width: '0', height: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.wedgeLayer);

    // Hitmarker (CMB-05 / UI-05): a diagonal X over the crosshair, red on a knock or kill.
    this.marker = document.createElement('div');
    this.marker.id = 'hitmarker';
    this.marker.setAttribute('aria-hidden', 'true');
    Object.assign(this.marker.style, {
      position: 'absolute', left: '50%', top: '50%', width: '0', height: '0', opacity: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    for (const deg of [45, 135, 225, 315]) {
      const d = document.createElement('div');
      Object.assign(d.style, {
        position: 'absolute', left: '0', top: '0', width: `${HM_LEN}px`, height: '2px', background: '#fff',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.8)', transformOrigin: '0 50%',
        transform: `rotate(${deg}deg) translate(${HM_GAP}px, -50%)`,
      } satisfies Partial<CSSStyleDeclaration>);
      this.marker.appendChild(d);
      this.markerStrokes.push(d);
    }
    this.root.appendChild(this.marker);

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
    this.invEl.textContent = `Med kits ${s.medkits} (Q)    Bandages ${s.bandages} (B)`;
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

  /**
   * Crosshair gap in pixels from the centre to the inner end of each arm: where a shot on the
   * edge of the current spread cone would land. Never drawn tighter than MIN_GAP.
   */
  setSpread(gapPx: number): void {
    const g = Math.round(Math.max(MIN_GAP, Math.min(MAX_GAP, gapPx)) * 2) / 2;
    if (g === this.gap) return;
    this.gap = g;
    const [l, r, t, b] = this.arms;
    const hw = ARM_W / 2;
    l!.style.transform = `translate(${-g - ARM_LEN}px, ${-hw}px)`;
    r!.style.transform = `translate(${g}px, ${-hw}px)`;
    t!.style.transform = `translate(${-hw}px, ${-g - ARM_LEN}px)`;
    b!.style.transform = `translate(${-hw}px, ${g}px)`;
    this.cross.dataset.gap = String(g);
  }

  /** One red edge pulse for zone damage. */
  pulseZoneEdge(): void {
    this.edgeLeft = EDGE_PULSE;
    this.edge.style.opacity = '1';
  }

  /**
   * Damage wedges: `angle` radians clockwise from straight up (0 = in front of you), `alpha` 0..1.
   * Called every frame with the live list (an empty list hides them all).
   */
  setDamageIndicators(list: { angle: number; alpha: number }[]): void {
    while (this.wedges.length < list.length) {
      const w = document.createElement('div');
      w.className = 'damage-wedge';
      Object.assign(w.style, {
        // Top-middle sits on the screen centre, which is also the rotation pivot.
        position: 'absolute', left: '-26px', top: '0', width: '0', height: '0',
        borderLeft: '26px solid transparent', borderRight: '26px solid transparent',
        borderBottom: '16px solid rgba(225,35,35,0.9)', filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.7))',
        transformOrigin: '50% 0', willChange: 'transform, opacity',
      } satisfies Partial<CSSStyleDeclaration>);
      this.wedgeLayer.appendChild(w);
      this.wedges.push(w);
    }
    const parent = this.root.parentElement;
    const short = Math.min(parent?.clientHeight || window.innerHeight, parent?.clientWidth || window.innerWidth);
    const r = Math.round(short * WEDGE_RING);
    this.wedges.forEach((w, i) => {
      const d = list[i];
      if (!d) {
        if (w.style.display !== 'none') w.style.display = 'none';
        return;
      }
      w.style.display = 'block';
      w.style.opacity = d.alpha.toFixed(2);
      // Push up to the ring, then rotate about the centre; the wedge points outward.
      w.style.transform = `rotate(${d.angle.toFixed(3)}rad) translateY(${-r - 16}px)`;
      w.dataset.angle = d.angle.toFixed(2);
    });
    this.wedgeLayer.dataset.count = String(list.length);
  }

  /** True while any damage wedge is still drawn. */
  get hasDamageIndicators(): boolean {
    return this.wedgeLayer.dataset.count !== undefined && this.wedgeLayer.dataset.count !== '0';
  }

  /** One hitmarker. A new hit restarts it (with a small pop). */
  showHitmarker(style: HitmarkerStyle): void {
    for (const st of this.markerStrokes) {
      st.style.background = style.color;
      st.style.height = `${style.thickness}px`;
    }
    this.markerLife = style.life;
    this.markerLeft = style.life;
    this.marker.dataset.kind = style.kind;
    this.marker.style.opacity = '1';
    this.marker.style.transform = 'scale(1.35)';
  }

  /** Crosshair fades a little while the muzzle is blocked short of the aim point. */
  setMuzzleBlocked(blocked: boolean): void {
    this.cross.style.opacity = blocked ? '0.35' : '';
    this.cross.dataset.blocked = blocked ? '1' : '0';
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
    if (this.edgeLeft > 0) {
      this.edgeLeft = Math.max(0, this.edgeLeft - dt);
      this.edge.style.opacity = (this.edgeLeft / EDGE_PULSE).toFixed(2);
    }
    if (this.markerLeft > 0) {
      this.markerLeft = Math.max(0, this.markerLeft - dt);
      const t = this.markerLeft / this.markerLife;
      this.marker.style.opacity = Math.min(1, t * 1.6).toFixed(2);
      // Pop: 1.35 -> 1 over the first 40% of its life.
      this.marker.style.transform = `scale(${(1 + 0.35 * Math.max(0, (t - 0.6) / 0.4)).toFixed(3)})`;
      if (this.markerLeft === 0) this.marker.dataset.kind = '';
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
    for (const child of this.arms) {
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
