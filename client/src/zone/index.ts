/**
 * Safe-zone wall, the white next-circle line, and the zone HUD.
 * The numbers live in zoneLogic.ts. This file only draws them and asks combat
 * to apply damage.
 */
import * as THREE from 'three';
import type { World } from '../core/world';
import type { Player } from '../player';
import {
  buildZone,
  distanceToSafe,
  distanceLabel,
  parseZoneOptions,
  skipStage,
  stateAt,
  zoneDamage,
  zoneTimerLabel,
  type Circle,
  type PlanBounds,
  type ZoneSnapshot,
  type ZonePhase,
  phaseLabel,
} from './zoneLogic';

const WALL_HEIGHT = 180;
/** Chicago Blue. Unlit and without fog so the wall stays blue at the far side of campus. */
const WALL_COLOR = 0x49c2f5;

export interface SquadMapDot {
  x: number;
  z: number;
  color: string;
  /** Optional facing yaw (radians). */
  yaw?: number;
  /** Yellow ping marker. */
  ping?: boolean;
}

export interface ZoneMount {
  dispose(): void;
  /** Teammate / ping dots drawn on the minimap (S4). */
  setSquadMarks(marks: readonly SquadMapDot[]): void;
  /** Current safe circle (used to keep spawns inside the zone). */
  safeCircle?(): Circle;
  /** Latest zone state (circle now, next circle, damage). Bots use it to rotate and take damage. */
  snapshot?(): ZoneSnapshot;
}

export interface ZoneDebugState {
  mode: ZoneSnapshot['mode'];
  phase: number;
  remaining: number;
  damagePerSecond: number;
  timer: string;
  distance: string;
  inside: boolean;
  current: Circle;
  next: Circle | null;
}

declare global {
  interface Window {
    __zone?: {
      getState(): ZoneDebugState;
      skip(): void;
    };
  }
}

export function mountZone(opts: {
  world: World;
  player: Player | null;
  bounds: PlanBounds;
  search: string;
  applyDamage(amount: number): void;
  /** The match's phases. Pass the same ones used to place loot; built from the URL otherwise. */
  phases?: ZonePhase[];
}): ZoneMount {
  const { fast, seed } = parseZoneOptions(opts.search);
  const phases = opts.phases ?? buildZone(opts.bounds, seed, fast);
  const first = phases[0]!;

  const wallGeo = new THREE.CylinderGeometry(1, 1, 1, 128, 1, true);
  const wallMat = new THREE.MeshBasicMaterial({
    color: WALL_COLOR,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.name = 'zone-wall';
  // The cylinder's origin is the campus center, so distance sorting would draw it
  // behind closer glass. Keep it in the transparent pass, after ordinary props.
  wall.renderOrder = 2;
  wall.frustumCulled = false;
  wall.castShadow = false;
  wall.receiveShadow = false;
  opts.world.scene.add(wall);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.2, 8), ringMat);
  ring.name = 'zone-next';
  ring.renderOrder = 2;
  ring.rotation.x = -Math.PI / 2;
  ring.frustumCulled = false;
  ring.castShadow = false;
  ring.receiveShadow = false;
  opts.world.scene.add(ring);

  let ringKey = '';
  const syncRing = (next: Circle | null) => {
    if (!next) {
      ring.visible = false;
      return;
    }
    ring.visible = true;
    const key = `${next.x.toFixed(2)}:${next.z.toFixed(2)}:${next.radius.toFixed(2)}`;
    if (key !== ringKey) {
      ringKey = key;
      const stroke = 3.2;
      const inner = Math.max(0.25, next.radius - stroke / 2);
      const geo = new THREE.RingGeometry(inner, next.radius + stroke / 2, 160);
      ring.geometry.dispose();
      ring.geometry = geo;
    }
    ring.position.set(next.x, 0.8, next.z);
  };

  const syncWall = (circle: Circle) => {
    wall.position.set(circle.x, WALL_HEIGHT / 2, circle.z);
    wall.scale.set(circle.radius, WALL_HEIGHT, circle.radius);
  };

  addViewpoints(opts.world, first.start, first.end);

  const parent = document.getElementById('hud') ?? document.body;
  const hud = new ZoneHud(parent);
  hud.phaseCount = phases.length;
  let squadMarks: SquadMapDot[] = [];

  let elapsed = 0;
  let skipQueued = false;
  let latest: ZoneSnapshot = stateAt(phases, 0);

  const point = () => {
    const p = opts.player?.position;
    return p ? { x: p.x, z: p.z } : null;
  };

  const publish = (snap: ZoneSnapshot) => {
    latest = snap;
    syncWall(snap.current);
    syncRing(snap.next);
    const feet = point();
    const meters = feet ? distanceToSafe(snap.current, feet) : 0;
    hud.set(snap, feet, meters, squadMarks);
  };

  publish(latest);

  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'KeyZ' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    skipQueued = true;
  };
  window.addEventListener('keydown', onKey);

  const onUpdate = (dt: number) => {
    if (skipQueued) {
      elapsed = skipStage(phases, elapsed);
      skipQueued = false;
    } else {
      elapsed += dt;
    }
    const snap = stateAt(phases, elapsed);
    publish(snap);
    const feet = point();
    if (!feet) return;
    const amount = zoneDamage(snap.damagePerSecond, dt, feet, snap.current);
    if (amount > 0) opts.applyDamage(amount);
  };
  const offUpdate = opts.world.onUpdate(onUpdate);

  const api = {
    getState(): ZoneDebugState {
      const feet = point();
      const meters = feet ? distanceToSafe(latest.current, feet) : 0;
      return {
        mode: latest.mode,
        phase: latest.phase,
        remaining: latest.remaining,
        damagePerSecond: latest.damagePerSecond,
        timer: zoneTimerLabel(latest.mode, latest.remaining),
        distance: feet ? distanceLabel(meters) : 'Inside the zone',
        inside: meters <= 0.5,
        current: latest.current,
        next: latest.next,
      };
    },
    skip() {
      skipQueued = true;
    },
  };
  window.__zone = api;

  return {
    safeCircle: () => latest.current,
    snapshot: () => latest,
    setSquadMarks(marks: readonly SquadMapDot[]) {
      squadMarks = marks.slice();
      // Redraw with the latest snap so dots appear without waiting a tick.
      publish(latest);
    },
    dispose() {
      offUpdate();
      window.removeEventListener('keydown', onKey);
      if (window.__zone === api) delete window.__zone;
      hud.dispose();
      opts.world.scene.remove(wall);
      opts.world.scene.remove(ring);
      wall.geometry.dispose();
      ring.geometry.dispose();
      wallMat.dispose();
      ringMat.dispose();
    },
  };
}

/** Cameras for the screenshot robot. The wall sits outside the campus rectangle, so we stand near it. */
function addViewpoints(world: World, current: Circle, next: Circle): void {
  const toward = (circle: Circle, radius: number) => {
    const dx = -circle.x;
    const dz = -circle.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: circle.x + (dx / len) * radius, z: circle.z + (dz / len) * radius };
  };
  const wall = toward(current, current.radius - 28);
  const past = toward(current, current.radius + 4);
  world.addViewpoint('zone-wall', {
    position: new THREE.Vector3(wall.x, 2.4, wall.z),
    target: new THREE.Vector3(past.x, 12, past.z),
    fov: 55,
    hour: 14,
  });

  const onLine = toward(next, next.radius);
  const inside = toward(next, next.radius - 10);
  world.addViewpoint('zone-next', {
    position: new THREE.Vector3(inside.x, 3.2, inside.z),
    target: new THREE.Vector3(onLine.x, 0.8, onLine.z),
    fov: 48,
    hour: 14,
  });

  // From the Quad, the safe wall is the blue band on the horizon.
  const far = toward(current, current.radius);
  world.addViewpoint('zone-horizon', {
    position: new THREE.Vector3(0, 4, 0),
    target: new THREE.Vector3(far.x, 30, far.z),
    fov: 46,
    hour: 14,
  });
}

class ZoneHud {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly timer: HTMLDivElement;
  private readonly distance: HTMLDivElement;
  private readonly phase: HTMLDivElement;
  phaseCount = 0;
  private readonly size = 168;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'zone-hud';
    Object.assign(this.root.style, {
      position: 'absolute',
      top: '12px',
      right: '12px',
      width: `${this.size}px`,
      zIndex: '16',
      pointerEvents: 'none',
      fontFamily: 'system-ui, sans-serif',
      textAlign: 'center',
      color: '#f4f7fb',
      textShadow: '0 1px 2px #000',
    } satisfies Partial<CSSStyleDeclaration>);

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'zone-minimap';
    this.canvas.width = this.size * 2;
    this.canvas.height = this.size * 2;
    this.canvas.style.width = `${this.size}px`;
    this.canvas.style.height = `${this.size}px`;
    this.canvas.style.display = 'block';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('zone minimap canvas unavailable');
    this.ctx = ctx;

    this.timer = document.createElement('div');
    this.timer.id = 'zone-timer';
    Object.assign(this.timer.style, {
      marginTop: '6px',
      fontSize: '14px',
      fontWeight: '700',
      lineHeight: '1.25',
    } satisfies Partial<CSSStyleDeclaration>);

    this.distance = document.createElement('div');
    this.distance.id = 'zone-distance';
    Object.assign(this.distance.style, {
      marginTop: '2px',
      fontSize: '13px',
      fontWeight: '650',
    } satisfies Partial<CSSStyleDeclaration>);

    this.phase = document.createElement('div');
    this.phase.id = 'zone-phase';
    Object.assign(this.phase.style, {
      marginTop: '2px',
      fontSize: '12px',
      fontWeight: '600',
      color: '#ffd38a',
    } satisfies Partial<CSSStyleDeclaration>);

    this.root.append(this.canvas, this.timer, this.phase, this.distance);
    parent.appendChild(this.root);
  }

  set(
    snap: ZoneSnapshot,
    player: { x: number; z: number } | null,
    metersOutside: number,
    squadMarks: readonly SquadMapDot[] = [],
  ): void {
    this.timer.textContent = zoneTimerLabel(snap.mode, snap.remaining);
    this.phase.textContent = phaseLabel(snap.phase, this.phaseCount, snap.damagePerSecond);
    this.distance.textContent = player ? distanceLabel(metersOutside) : '';
    this.distance.style.color = metersOutside > 0.5 ? '#ffb089' : '#d7ffe4';
    this.draw(snap, player, squadMarks);
  }

  private draw(
    snap: ZoneSnapshot,
    player: { x: number; z: number } | null,
    squadMarks: readonly SquadMapDot[] = [],
  ): void {
    const ctx = this.ctx;
    const size = this.size * 2;
    const c = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(6, 14, 24, 0.78)';
    ctx.fillRect(0, 0, size, size);

    const current = snap.current;
    let reach = current.radius;
    if (player) {
      const away = Math.hypot(player.x - current.x, player.z - current.z);
      reach = Math.max(reach, Math.min(away * 1.08, current.radius * 1.45));
    }
    const scale = reach > 0 ? (c * 0.78) / reach : 1;
    const toScreen = (x: number, z: number) => ({
      sx: c + (x - current.x) * scale,
      sy: c + (z - current.z) * scale,
    });

    const drawCircle = (circle: Circle, fill: string | null, stroke: string, width: number) => {
      const p = toScreen(circle.x, circle.z);
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, Math.max(1, circle.radius * scale), 0, Math.PI * 2);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.lineWidth = width;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    };

    drawCircle(current, 'rgba(65, 182, 230, 0.28)', '#9fd4f2', 3);
    if (snap.next) drawCircle(snap.next, null, '#ffffff', 3);

    if (player) {
      const p = toScreen(player.x, player.z);
      const inside = metersFrom(current, player) <= 0;
      ctx.fillStyle = inside ? '#f4f7fb' : '#ffb089';
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.stroke();
    }

    for (const mark of squadMarks) {
      const p = toScreen(mark.x, mark.z);
      if (mark.ping) {
        ctx.strokeStyle = mark.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 8, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = mark.color;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.stroke();
        if (mark.yaw != null) {
          const len = 10;
          ctx.beginPath();
          ctx.moveTo(p.sx, p.sy);
          ctx.lineTo(p.sx + Math.sin(mark.yaw) * len, p.sy + Math.cos(mark.yaw) * len);
          ctx.strokeStyle = mark.color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = '#f4f7fb';
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', c, 28);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(c, c, c - 3, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
  }

  dispose(): void {
    this.root.remove();
  }
}

function metersFrom(circle: Circle, point: { x: number; z: number }): number {
  return Math.hypot(point.x - circle.x, point.z - circle.z) - circle.radius;
}
