/**
 * Squad HUD (S4): team panel, world markers, downed indicator, kill feed, ping markers.
 * DOM overlay like combat/hud.ts. Map dots are fed to the zone minimap via setSquadMarks.
 */
import * as THREE from 'three';
import { DOWN } from './balance';
import { clampToScreenEdge } from './markerMath';
import type { Ping } from './pings';
import type { PlayerId, SquadEvent, SquadMember, SquadMatchState } from './types';

/** Slot colors: yellow, orange, blue, green (design §4). */
export const SLOT_COLORS = ['#e8c317', '#e88417', '#3b82f6', '#22c55e'] as const;

export interface SquadMapMark {
  x: number;
  z: number;
  color: string;
  /** Optional facing yaw (radians); drawn as a short tick. */
  yaw?: number;
  ping?: boolean;
}

export interface SquadHudOpts {
  parent: HTMLElement;
  camera: THREE.PerspectiveCamera;
  /** Local player id (hidden from world markers; still in the panel). */
  localId: PlayerId;
}

function slotColor(slot: number): string {
  return SLOT_COLORS[slot] ?? SLOT_COLORS[0]!;
}

function formatFeed(ev: SquadEvent, names: Record<PlayerId, string>): string | null {
  const n = (id: PlayerId | null | undefined) => (id ? names[id] ?? id : '?');
  switch (ev.type) {
    case 'downed':
      return `${n(ev.by)} knocked ${n(ev.id)}`;
    case 'killed':
      return `${n(ev.by)} finished ${n(ev.id)}`;
    case 'squadWiped':
      return `Squad ${ev.squad} eliminated (#${ev.placement})`;
    case 'revived':
      return `${n(ev.by)} revived ${n(ev.id)}`;
    case 'matchWon':
      return `Squad ${ev.squad} wins`;
    default:
      return null;
  }
}

interface MarkerEl {
  root: HTMLDivElement;
  label: HTMLDivElement;
}

interface FeedLine {
  el: HTMLDivElement;
  born: number;
}

export class SquadHud {
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly rows: HTMLDivElement[] = [];
  private readonly markersRoot: HTMLDivElement;
  private readonly markers = new Map<PlayerId, MarkerEl>();
  private readonly feedRoot: HTMLDivElement;
  private readonly feed: FeedLine[] = [];
  private readonly pingRoot: HTMLDivElement;
  private readonly pingEls = new Map<string, HTMLDivElement>();
  private readonly downedBanner: HTMLDivElement;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly localId: PlayerId;
  private readonly _v = new THREE.Vector3();
  private readonly _n = new THREE.Vector3();
  private markAcc = 0;
  private lastMarks: SquadMapMark[] = [];

  constructor(opts: SquadHudOpts) {
    this.camera = opts.camera;
    this.localId = opts.localId;

    this.root = document.createElement('div');
    this.root.id = 'squad-hud';
    Object.assign(this.root.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '18',
      fontFamily: 'system-ui, sans-serif',
      userSelect: 'none',
      color: '#f4f7f4',
    } satisfies Partial<CSSStyleDeclaration>);

    this.panel = document.createElement('div');
    this.panel.id = 'squad-team-panel';
    Object.assign(this.panel.style, {
      position: 'absolute',
      left: '12px',
      top: '48px',
      width: '220px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      textShadow: '0 1px 2px #000',
    } satisfies Partial<CSSStyleDeclaration>);
    for (let i = 0; i < 4; i++) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 8px',
        background: 'rgba(0,0,0,0.45)',
        borderRadius: '6px',
        borderLeft: `3px solid ${slotColor(i)}`,
        fontSize: '13px',
        minHeight: '28px',
      } satisfies Partial<CSSStyleDeclaration>);
      this.rows.push(row);
      this.panel.appendChild(row);
    }
    this.root.appendChild(this.panel);

    this.markersRoot = document.createElement('div');
    this.markersRoot.id = 'squad-markers';
    Object.assign(this.markersRoot.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.markersRoot);

    this.pingRoot = document.createElement('div');
    this.pingRoot.id = 'squad-pings';
    Object.assign(this.pingRoot.style, { position: 'absolute', inset: '0', overflow: 'hidden' } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.pingRoot);

    this.feedRoot = document.createElement('div');
    this.feedRoot.id = 'squad-kill-feed';
    Object.assign(this.feedRoot.style, {
      position: 'absolute',
      right: '12px',
      top: '200px',
      width: '280px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '4px',
      fontSize: '13px',
      fontWeight: '600',
      textShadow: '0 1px 2px #000',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.feedRoot);

    this.downedBanner = document.createElement('div');
    this.downedBanner.id = 'squad-downed';
    Object.assign(this.downedBanner.style, {
      position: 'absolute',
      left: '50%',
      top: '18%',
      transform: 'translateX(-50%)',
      padding: '8px 16px',
      background: 'rgba(120,16,24,0.72)',
      borderRadius: '8px',
      fontSize: '18px',
      fontWeight: '700',
      display: 'none',
      letterSpacing: '0.02em',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.downedBanner);

    opts.parent.appendChild(this.root);
  }

  /** Latest marks for the zone minimap (teammates + pings). */
  getMapMarks(): SquadMapMark[] {
    return this.lastMarks;
  }

  pushEvents(events: readonly SquadEvent[], names: Record<PlayerId, string>, nowMs: number): void {
    for (const ev of events) {
      const line = formatFeed(ev, names);
      if (!line) continue;
      const el = document.createElement('div');
      el.textContent = line;
      Object.assign(el.style, {
        padding: '3px 8px',
        background: 'rgba(0,0,0,0.5)',
        borderRadius: '4px',
        maxWidth: '280px',
      } satisfies Partial<CSSStyleDeclaration>);
      this.feedRoot.appendChild(el);
      this.feed.push({ el, born: nowMs });
      while (this.feed.length > 6) {
        const old = this.feed.shift();
        old?.el.remove();
      }
    }
  }

  update(opts: {
    state: SquadMatchState;
    pings: readonly Ping[];
    dt: number;
    nowMs: number;
    /** Force marker refresh (screenshots / first frame). */
    forceMarkers?: boolean;
  }): void {
    const { state, pings, dt, nowMs } = opts;
    const squadA = state.squads.A;
    const members = (squadA?.members ?? [])
      .map((id) => state.members[id])
      .filter((m): m is SquadMember => !!m)
      .sort((a, b) => a.slot - b.slot);

    for (let i = 0; i < 4; i++) {
      const row = this.rows[i]!;
      const m = members[i];
      if (!m) {
        row.style.opacity = '0.35';
        row.textContent = `—`;
        continue;
      }
      row.style.opacity = m.life === 'dead' ? '0.45' : '1';
      const col = slotColor(m.slot);
      row.style.borderLeftColor = col;
      const hp = m.life === 'alive' ? m.combatant.health : m.life === 'downed' ? m.downHp : 0;
      const maxHp = m.life === 'downed' ? DOWN.hp : 100;
      const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
      const armor = m.combatant.armor > 0 ? ' ◆' : '';
      const icon = m.life === 'dead' ? '☠' : m.life === 'downed' ? '✚' : '';
      const bleed =
        m.life === 'downed' && m.downedAt != null
          ? ` ${Math.max(0, m.downHp).toFixed(0)}`
          : '';
      row.innerHTML = '';
      const swatch = document.createElement('span');
      swatch.textContent = `${m.slot + 1}`;
      Object.assign(swatch.style, {
        width: '16px',
        height: '16px',
        borderRadius: '3px',
        background: col,
        color: '#111',
        fontSize: '11px',
        fontWeight: '700',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
      } satisfies Partial<CSSStyleDeclaration>);
      const body = document.createElement('div');
      body.style.flex = '1';
      body.style.minWidth = '0';
      const name = document.createElement('div');
      name.textContent = `${icon} ${m.name}${armor}${bleed}`;
      name.style.whiteSpace = 'nowrap';
      name.style.overflow = 'hidden';
      name.style.textOverflow = 'ellipsis';
      const bar = document.createElement('div');
      Object.assign(bar.style, {
        marginTop: '3px',
        height: '4px',
        background: 'rgba(255,255,255,0.15)',
        borderRadius: '2px',
        overflow: 'hidden',
      } satisfies Partial<CSSStyleDeclaration>);
      const fill = document.createElement('div');
      Object.assign(fill.style, {
        width: `${pct}%`,
        height: '100%',
        background: m.life === 'downed' ? '#ff5a5a' : col,
      } satisfies Partial<CSSStyleDeclaration>);
      bar.appendChild(fill);
      body.append(name, bar);
      row.append(swatch, body);
    }

    const local = state.members[this.localId];
    if (local?.life === 'downed') {
      this.downedBanner.style.display = 'block';
      const left = Math.max(0, local.downHp);
      this.downedBanner.textContent = `Downed · hold F for revive · ${left.toFixed(0)} knock hp`;
      const pulse = 0.65 + 0.35 * Math.sin(nowMs * 0.008);
      this.downedBanner.style.opacity = String(pulse);
    } else {
      this.downedBanner.style.display = 'none';
    }

    // Expire kill feed lines after ~6 s.
    while (this.feed.length && nowMs - this.feed[0]!.born > 6000) {
      this.feed.shift()!.el.remove();
    }

    this.markAcc += dt;
    if (opts.forceMarkers || this.markAcc >= 0.05) {
      this.markAcc = 0;
      this.updateMarkers(members, state.t);
      this.updatePings(pings, state.t);
      this.lastMarks = this.buildMapMarks(members, pings);
    }
  }

  private buildMapMarks(members: SquadMember[], pings: readonly Ping[]): SquadMapMark[] {
    const marks: SquadMapMark[] = members
      .filter((m) => m.life !== 'dead')
      .map((m) => ({
        x: m.pos.x,
        z: m.pos.z,
        color: m.life === 'downed' ? '#ff5a5a' : slotColor(m.slot),
      }));
    for (const p of pings) {
      marks.push({ x: p.x, z: p.z, color: '#ffe566', ping: true });
    }
    return marks;
  }

  private ensureMarker(id: PlayerId, color: string): MarkerEl {
    let m = this.markers.get(id);
    if (m) return m;
    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'absolute',
      transform: 'translate(-50%, -100%)',
      textAlign: 'center',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    const diamond = document.createElement('div');
    Object.assign(diamond.style, {
      width: '12px',
      height: '12px',
      margin: '0 auto 2px',
      background: color,
      transform: 'rotate(45deg)',
      boxShadow: '0 0 0 1px rgba(0,0,0,0.7)',
    } satisfies Partial<CSSStyleDeclaration>);
    diamond.dataset.role = 'diamond';
    const label = document.createElement('div');
    Object.assign(label.style, {
      fontSize: '12px',
      fontWeight: '650',
      textShadow: '0 1px 2px #000',
      whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    root.append(diamond, label);
    this.markersRoot.appendChild(root);
    m = { root, label };
    this.markers.set(id, m);
    return m;
  }

  private updateMarkers(members: SquadMember[], matchT: number): void {
    const w = this.root.clientWidth || 1280;
    const h = this.root.clientHeight || 720;
    const cam = this.camera;
    const seen = new Set<PlayerId>();
    for (const m of members) {
      if (m.id === this.localId) continue;
      if (m.life === 'dead') {
        const dead = this.markers.get(m.id);
        if (dead) dead.root.style.display = 'none';
        continue;
      }
      seen.add(m.id);
      const color = m.life === 'downed' ? '#ff5a5a' : slotColor(m.slot);
      const el = this.ensureMarker(m.id, color);
      const diamond = el.root.querySelector('[data-role="diamond"]') as HTMLDivElement;
      diamond.style.background = color;
      if (m.life === 'downed') {
        const pulse = 0.55 + 0.45 * Math.sin(matchT * 8);
        diamond.style.opacity = String(pulse);
        diamond.style.borderRadius = '50%';
        diamond.style.transform = 'none';
      } else {
        diamond.style.opacity = '1';
        diamond.style.borderRadius = '0';
        diamond.style.transform = 'rotate(45deg)';
      }
      this._v.set(m.pos.x, m.pos.y + (m.life === 'downed' ? 1.0 : 1.9), m.pos.z);
      this._v.project(cam);
      const scr = clampToScreenEdge(this._v.x, this._v.y, this._v.z, w, h, 28);
      el.root.style.display = 'block';
      el.root.style.left = `${scr.x}px`;
      el.root.style.top = `${scr.y}px`;
      this._n.set(m.pos.x, m.pos.y, m.pos.z);
      const dist = cam.position.distanceTo(this._n);
      const distLabel = dist > 50 ? ` ${Math.round(dist)}m` : '';
      const bleed =
        m.life === 'downed' ? ` · ${Math.max(0, m.downHp).toFixed(0)}` : '';
      el.label.textContent = `${m.name}${distLabel}${bleed}`;
      el.label.style.color = color;
      if (scr.clamped) el.root.style.opacity = '0.9';
      else el.root.style.opacity = '1';
    }
    for (const [id, el] of this.markers) {
      if (!seen.has(id)) el.root.style.display = 'none';
    }
  }

  private updatePings(pings: readonly Ping[], matchT: number): void {
    const w = this.root.clientWidth || 1280;
    const h = this.root.clientHeight || 720;
    const live = new Set<string>();
    for (const p of pings) {
      const key = `${p.by}:${p.placedAt}`;
      live.add(key);
      let el = this.pingEls.get(key);
      if (!el) {
        el = document.createElement('div');
        Object.assign(el.style, {
          position: 'absolute',
          transform: 'translate(-50%, -50%)',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          border: '2px solid #ffe566',
          background: 'rgba(255,229,102,0.35)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
        } satisfies Partial<CSSStyleDeclaration>);
        this.pingRoot.appendChild(el);
        this.pingEls.set(key, el);
      }
      this._v.set(p.x, p.y + 0.5, p.z);
      this._v.project(this.camera);
      const scr = clampToScreenEdge(this._v.x, this._v.y, this._v.z, w, h, 28);
      el.style.left = `${scr.x}px`;
      el.style.top = `${scr.y}px`;
      const pulse = 0.7 + 0.3 * Math.sin(matchT * 6);
      el.style.opacity = String(pulse);
    }
    for (const [key, el] of this.pingEls) {
      if (!live.has(key)) {
        el.remove();
        this.pingEls.delete(key);
      }
    }
  }

  dispose(): void {
    this.root.remove();
    this.markers.clear();
    this.pingEls.clear();
    this.feed.length = 0;
  }
}
