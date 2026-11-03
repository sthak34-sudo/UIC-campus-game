import { describe, expect, it } from 'vitest';
import {
  INDICATOR, addIndicator, hitmarkerStyle, incomingReaction, indicatorAlpha, indicatorAngle, indicatorWeight,
  ruleSource, stepIndicators, wrapAngle,
} from './hitFeedback';

const at = { x: 0, y: 0, z: 0 };
// three.js: camera looks down -z by default.
const fwd = { x: 0, y: 0, z: -1 };

describe('incomingReaction (CMB-04)', () => {
  it('a bot bullet: wedge, flinch, heal cancel, hurt sound, no zone glow', () => {
    expect(incomingReaction('bot')).toEqual({ flinch: true, cancelHeal: true, indicator: true, sound: true, zoneGlow: false });
  });
  it('the zone keeps its edge glow only: no flinch, no heal cancel, no wedge, no sound', () => {
    expect(incomingReaction('zone')).toEqual({ flinch: false, cancelHeal: false, indicator: false, sound: false, zoneGlow: true });
  });
  it('a fall reacts like a hit but has no direction', () => {
    const r = incomingReaction('fall');
    expect(r.flinch && r.cancelHeal && r.sound).toBe(true);
    expect(r.indicator).toBe(false);
  });
  it('the debug key behaves like a bot hit', () => {
    expect(incomingReaction('debug')).toEqual(incomingReaction('bot'));
    expect(ruleSource('bot')).toBe('bullet');
    expect(ruleSource('zone')).toBe('zone');
  });
});

describe('indicatorAngle', () => {
  it('ahead is 0, right is +90°, left is -90°, behind is ±180°', () => {
    expect(indicatorAngle(fwd, at, { x: 0, y: 5, z: -10 })).toBeCloseTo(0);
    expect(indicatorAngle(fwd, at, { x: 10, y: 0, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(indicatorAngle(fwd, at, { x: -10, y: 0, z: 0 })).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(indicatorAngle(fwd, at, { x: 0, y: 0, z: 10 }))).toBeCloseTo(Math.PI);
  });
  it('follows the camera: turn right 90° and an attacker ahead moves to the left', () => {
    const right = { x: 1, y: 0, z: 0 };
    expect(indicatorAngle(right, at, { x: 0, y: 0, z: -10 })).toBeCloseTo(-Math.PI / 2);
  });
  it('ignores pitch and a zero-length offset', () => {
    expect(indicatorAngle({ x: 0, y: -0.9, z: -0.3 }, at, { x: 10, y: 0, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(indicatorAngle(fwd, at, at)).toBe(0);
  });
});

describe('indicator list', () => {
  const angleOf = (p: { x: number; y: number; z: number }) => indicatorAngle(fwd, at, p);
  it('adds one wedge per direction, refreshes a repeat from the same side', () => {
    let l = addIndicator([], { x: 10, y: 0, z: 0 }, 20, angleOf);
    l = stepIndicators(l, 0.5);
    l = addIndicator(l, { x: 10, y: 0, z: 1 }, 20, angleOf);
    expect(l).toHaveLength(1);
    expect(l[0]!.age).toBe(0);
    l = addIndicator(l, { x: -10, y: 0, z: 0 }, 20, angleOf);
    expect(l).toHaveLength(2);
  });
  it('keeps at most INDICATOR.max, dropping the oldest', () => {
    let l: ReturnType<typeof addIndicator> = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      l = addIndicator(l, { x: Math.sin(a) * 10, y: 0, z: -Math.cos(a) * 10 }, 20, angleOf);
    }
    expect(l).toHaveLength(INDICATOR.max);
  });
  it('fades after half its life and is gone at the end', () => {
    let l = addIndicator([], { x: 0, y: 0, z: -5 }, 35, angleOf);
    expect(indicatorAlpha(l[0]!)).toBeCloseTo(1);
    l = stepIndicators(l, INDICATOR.life * 0.75);
    expect(indicatorAlpha(l[0]!)).toBeLessThan(0.6);
    expect(stepIndicators(l, INDICATOR.life)).toHaveLength(0);
  });
  it('weight grows with damage within 0.35..1', () => {
    expect(indicatorWeight(1)).toBe(0.35);
    expect(indicatorWeight(20)).toBeGreaterThan(0.5);
    expect(indicatorWeight(200)).toBe(1);
  });
  it('wrapAngle', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI / 2 - Math.PI * 2)).toBeCloseTo(-Math.PI / 2);
  });
});

describe('hitmarkerStyle (CMB-05 / UI-05)', () => {
  it('white on a hit, thicker on a head shot, red and longer on a knock or kill', () => {
    const hit = hitmarkerStyle('body', false);
    const head = hitmarkerStyle('head', false);
    const kill = hitmarkerStyle('limb', true);
    expect(hit.color).toBe('#ffffff');
    expect(hit.life).toBeCloseTo(0.2);
    expect(head.thickness).toBeGreaterThan(hit.thickness);
    expect(kill.color).not.toBe('#ffffff');
    expect(kill.life).toBeGreaterThan(hit.life);
    expect(hitmarkerStyle('head', true).kind).toBe('kill');
  });
});
