/**
 * Hit feedback rules, both ways (CMB-04 / UI-04 and CMB-05 / UI-05). Pure, no DOM, no three.
 *
 * Incoming: everything that hurts the player goes through `playerDamaged` (core/hitEvents).
 * `incomingReaction` says what each source does: a bot bullet gets a direction indicator, a
 * flinch and a hurt sound; the zone keeps its edge glow only (CMB-01: no flinch, no heal cancel).
 *
 * Outgoing: the player's hits go through `playerHitEnemy`. `hitmarkerStyle` gives the X marker:
 * white on a hit, thicker on a head shot, red and longer on a knock or kill.
 */
import type { DamageSource as HitSource, HitZone } from '../core/hitEvents';
import { damageReaction, type DamageSource } from './damageRules';

type V3 = { x: number; y: number; z: number };

/** Hit-event source to the combat damage rules (a fall reacts like a bullet: flinch, cancel heal). */
export function ruleSource(source: HitSource): DamageSource {
  return source === 'zone' ? 'zone' : source === 'debug' ? 'debug' : 'bullet';
}

export interface IncomingReaction {
  flinch: boolean;
  cancelHeal: boolean;
  /** Red wedge at the screen edge pointing at the attacker (needs a `from`). */
  indicator: boolean;
  /** Short hurt thump. */
  sound: boolean;
  /** The soft red zone edge glow. */
  zoneGlow: boolean;
}

export function incomingReaction(source: HitSource): IncomingReaction {
  const r = damageReaction(ruleSource(source));
  if (source === 'zone') return { ...r, indicator: false, sound: false, zoneGlow: true };
  return { ...r, indicator: source !== 'fall', sound: true, zoneGlow: false };
}

/**
 * Screen angle (radians) of an attacker at `from`, seen by a player at `at` looking along
 * `forward` (three.js world, y up). 0 = straight ahead (top of the screen), +PI/2 = right,
 * +-PI = behind. Only the horizontal plane counts.
 */
export function indicatorAngle(forward: V3, at: V3, from: V3): number {
  const fl = Math.hypot(forward.x, forward.z) || 1;
  const fx = forward.x / fl;
  const fz = forward.z / fl;
  const tx = from.x - at.x;
  const tz = from.z - at.z;
  if (Math.hypot(tx, tz) < 1e-6) return 0;
  // right = forward x up = (-fz, 0, fx)
  const side = tx * -fz + tz * fx;
  const ahead = tx * fx + tz * fz;
  return Math.atan2(side, ahead);
}

export const INDICATOR = {
  /** Seconds a wedge stays up (full for the first half, then fades). */
  life: 1.4,
  /** Most wedges on screen at once; the oldest goes first. */
  max: 4,
  /** Hits from within this angle (radians) of a live wedge refresh it instead of adding one. */
  merge: (25 * Math.PI) / 180,
};

export interface Indicator {
  /** Attacker world position; the angle is recomputed every frame as you turn. */
  from: V3;
  age: number;
  /** 0..1, from the damage (a 20-point bot hit is about 0.6). */
  weight: number;
}

/** Weight 0..1 for a hit of `amount` health+armor. */
export function indicatorWeight(amount: number): number {
  return Math.max(0.35, Math.min(1, amount / 35));
}

/** Adds (or refreshes) a wedge for a hit from `from`. `angleOf` maps a world point to its screen angle. */
export function addIndicator(list: Indicator[], from: V3, amount: number, angleOf: (p: V3) => number): Indicator[] {
  const a = angleOf(from);
  const w = indicatorWeight(amount);
  const out = list.slice();
  const i = out.findIndex((d) => Math.abs(wrapAngle(angleOf(d.from) - a)) < INDICATOR.merge);
  if (i >= 0) {
    out[i] = { from: { ...from }, age: 0, weight: Math.max(out[i]!.weight, w) };
    return out;
  }
  out.push({ from: { ...from }, age: 0, weight: w });
  while (out.length > INDICATOR.max) out.shift();
  return out;
}

export function stepIndicators(list: Indicator[], dt: number): Indicator[] {
  const out: Indicator[] = [];
  for (const d of list) {
    const age = d.age + dt;
    if (age < INDICATOR.life) out.push({ ...d, age });
  }
  return out;
}

/** Opacity 0..1 of a wedge: solid for the first half of its life, then a linear fade. */
export function indicatorAlpha(d: Indicator): number {
  const half = INDICATOR.life / 2;
  const fade = d.age <= half ? 1 : Math.max(0, 1 - (d.age - half) / half);
  return fade * (0.55 + 0.45 * d.weight);
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export interface HitmarkerStyle {
  color: string;
  /** Line thickness in px. */
  thickness: number;
  /** Seconds on screen. */
  life: number;
  kind: 'hit' | 'head' | 'kill';
}

/** The X hitmarker for one of your hits (UI-05: white, thicker on head, red on a kill, ~0.2 s). */
export function hitmarkerStyle(zone: HitZone, killed: boolean): HitmarkerStyle {
  if (killed) return { color: '#ff3b3b', thickness: 3, life: 0.45, kind: 'kill' };
  if (zone === 'head') return { color: '#ffffff', thickness: 3, life: 0.22, kind: 'head' };
  return { color: '#ffffff', thickness: 2, life: 0.2, kind: 'hit' };
}
