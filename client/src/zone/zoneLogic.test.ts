import { describe, expect, it } from 'vitest';
import { planToWorld } from '../core/geo';
import { createCombatant, takeDirectDamage } from '../combat/health';
import {
  PHASE_TABLE,
  buildZone,
  circleCoveringPlanBounds,
  containsCircle,
  distanceLabel,
  distanceToSafe,
  formatClock,
  lerpCircle,
  parseZoneOptions,
  placeInside,
  skipStage,
  stateAt,
  zoneDamage,
  zoneTimerLabel,
  type Circle,
  type PlanBounds,
} from './zoneLogic';

/** East Campus play area from campus.json, plan meters. */
const CAMPUS: PlanBounds = { minX: -887, minY: -541.8, maxX: 513.9, maxY: 685.6 };

function corners(bounds: PlanBounds): { x: number; z: number }[] {
  const pts: [number, number][] = [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.minX, bounds.maxY],
    [bounds.maxX, bounds.maxY],
  ];
  return pts.map(([x, y]) => {
    const [wx, , wz] = planToWorld([x, y]);
    return { x: wx, z: wz };
  });
}

describe('safe zone math', () => {
  it('covers every corner of the playable campus', () => {
    const circle = circleCoveringPlanBounds(CAMPUS);
    expect(circle.radius).toBeGreaterThan(500);
    for (const corner of corners(CAMPUS)) {
      expect(distanceToSafe(circle, corner)).toBe(0);
    }
    const outside = { x: circle.x + circle.radius + 5, z: circle.z };
    expect(distanceToSafe(circle, outside)).toBeCloseTo(5, 6);
  });

  it('places every next circle fully inside the current one, for any seed', () => {
    for (const seed of [1, 2, 7, 99, 2026, 0xabcdef]) {
      const phases = buildZone(CAMPUS, seed, false);
      expect(phases).toHaveLength(PHASE_TABLE.length);
      let previous: Circle | null = null;
      for (const phase of phases) {
        expect(containsCircle(phase.start, phase.end)).toBe(true);
        expect(phase.end.radius).toBeLessThan(phase.start.radius);
        if (previous) expect(phase.start).toEqual(previous);
        previous = phase.end;
        for (const u of [0, 0.25, 0.5, 0.75, 1]) {
          expect(containsCircle(phase.start, lerpCircle(phase.start, phase.end, u))).toBe(true);
        }
      }
      expect(phases[phases.length - 1]!.end.radius).toBeLessThanOrEqual(36);
    }
  });

  it('is deterministic for a seed and moves when the seed changes', () => {
    const a = buildZone(CAMPUS, 4, false);
    const b = buildZone(CAMPUS, 4, false);
    expect(a).toEqual(b);
    const c = buildZone(CAMPUS, 5, false);
    const moved = a.some((phase, i) => phase.end.x !== c[i]!.end.x || phase.end.z !== c[i]!.end.z);
    expect(moved).toBe(true);
  });

  it('keeps a hand-placed circle inside its parent', () => {
    const parent = { x: 10, z: -4, radius: 50 };
    const rng = (() => {
      const values = [0, 0.25, 0.999, 0.5, 1 - 1e-12, 0];
      let i = 0;
      return () => values[i++] ?? 0;
    })();
    for (let n = 0; n < 3; n++) {
      const next = placeInside(parent, 12, rng);
      expect(containsCircle(parent, next)).toBe(true);
      expect(next.radius).toBe(12);
    }
  });

  it('interpolates the shrink halfway in space and time', () => {
    const phases = buildZone(CAMPUS, 3, false);
    const phase = phases[0]!;
    const mid = stateAt(phases, phase.wait + phase.shrink / 2);
    expect(mid.mode).toBe('shrink');
    expect(mid.phase).toBe(0);
    expect(mid.remaining).toBeCloseTo(phase.shrink / 2, 6);
    expect(mid.current.radius).toBeCloseTo((phase.start.radius + phase.end.radius) / 2, 6);
    expect(mid.current.x).toBeCloseTo((phase.start.x + phase.end.x) / 2, 6);
    expect(mid.current.z).toBeCloseTo((phase.start.z + phase.end.z) / 2, 6);
    expect(mid.next).toEqual(phase.end);

    const holding = stateAt(phases, 0);
    expect(holding.mode).toBe('wait');
    expect(holding.current).toEqual(phase.start);
    expect(zoneTimerLabel(holding.mode, holding.remaining)).toBe('Zone shrinking in 1:30');

    const closed = stateAt(phases, 10_000);
    expect(closed.mode).toBe('final');
    expect(closed.next).toBeNull();
    expect(closed.current).toEqual(phases[phases.length - 1]!.end);
    expect(zoneTimerLabel('final', 0)).toBe('Final zone');
  });

  it('deals no damage inside or on the edge, and more damage in later phases', () => {
    const circle = { x: 0, z: 0, radius: 10 };
    expect(zoneDamage(4, 0.5, { x: 0, z: 0 }, circle)).toBe(0);
    expect(zoneDamage(4, 0.5, { x: 10, z: 0 }, circle)).toBe(0);
    expect(zoneDamage(4, 0.5, { x: 6, z: 8 }, circle)).toBe(0);
    expect(zoneDamage(4, 0.25, { x: 14, z: 0 }, circle)).toBeCloseTo(1, 6);
    expect(zoneDamage(4, 0, { x: 40, z: 0 }, circle)).toBe(0);
    expect(zoneDamage(0, 1, { x: 40, z: 0 }, circle)).toBe(0);

    const phases = buildZone(CAMPUS, 1, false);
    for (let i = 1; i < phases.length; i++) {
      expect(phases[i]!.damagePerSecond).toBeGreaterThan(phases[i - 1]!.damagePerSecond);
    }
    const outside = { x: 1e6, z: 1e6 };
    const early = zoneDamage(phases[0]!.damagePerSecond, 2, outside, phases[0]!.start);
    const late = zoneDamage(phases[4]!.damagePerSecond, 2, outside, phases[4]!.start);
    expect(late).toBeGreaterThan(early);

    const hurt = takeDirectDamage(createCombatant(), late);
    expect(hurt.combatant.health).toBeCloseTo(100 - late, 6);
    expect(hurt.combatant.armor).toBe(0);
    expect(distanceLabel(0)).toBe('Inside the zone');
    expect(distanceLabel(12.4)).toBe('12 m to safe zone');
  });

  it('shortens timers in fast mode without moving the circles or the damage', () => {
    const slow = buildZone(CAMPUS, 11, false);
    const fast = buildZone(CAMPUS, 11, true);
    expect(fast[0]!.wait).toBeCloseTo(slow[0]!.wait / 10, 6);
    expect(fast[0]!.shrink).toBeCloseTo(slow[0]!.shrink / 10, 6);
    expect(fast.map((p) => p.end)).toEqual(slow.map((p) => p.end));
    expect(fast.map((p) => p.damagePerSecond)).toEqual(slow.map((p) => p.damagePerSecond));
    expect(parseZoneOptions('?zoneFast=1&zoneSeed=11')).toEqual({ fast: true, seed: 11 });
    expect(parseZoneOptions('')).toEqual({ fast: false, seed: 1 });
    expect(parseZoneOptions('?zoneSeed=nope')).toEqual({ fast: false, seed: 1 });
  });

  it('skips the current stage with Z and stops on the final circle', () => {
    const phases = buildZone(CAMPUS, 1, false);
    expect(skipStage(phases, 0)).toBe(phases[0]!.wait);
    expect(stateAt(phases, skipStage(phases, 0)).mode).toBe('shrink');
    const afterShrink = skipStage(phases, phases[0]!.wait);
    expect(afterShrink).toBe(phases[0]!.wait + phases[0]!.shrink);
    expect(stateAt(phases, afterShrink).mode).toBe('wait');
    expect(stateAt(phases, afterShrink).phase).toBe(1);
    expect(skipStage(phases, 10_000)).toBe(10_000);
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(0.2)).toBe('0:01');
  });
});
