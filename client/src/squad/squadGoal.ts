/**
 * AI-01 / AI-16: a goal for a squad with no human to follow. The leader walks it, the rest follow
 * the leader. Phases: loot nearby, then rotate into the next circle, then hunt the nearest squad.
 * Pure: no three.js, no DOM.
 */
import type { BotZoneView } from './botZone';

type P = { x: number; z: number };

export type SquadPhase = 'loot' | 'rotate' | 'hunt';

export interface SquadGoal {
  phase: SquadPhase;
  /** Where the leader is heading, or null when it needs a new target. */
  target: P | null;
  /** Seconds in this phase. */
  inPhase: number;
  /** Seconds since the target was picked. */
  age: number;
}

export const SQUAD_GOAL = {
  /** Loot this long at most before rotating. */
  lootS: 45,
  /** How far the leader looks for loot (m). */
  lootSeekM: 45,
  /** Re-pick the hunt target this often (s). */
  huntRetargetS: 6,
  /** Give up on any target after this long (s), e.g. it can't be reached. */
  maxAgeS: 25,
  /** Close enough to a target (m). */
  arriveM: 3,
  /** Hunting knows roughly where the nearest squad is: snapped to this grid (m). */
  huntGridM: 15,
  /** Rotate to this fraction of the target circle's radius from its centre. */
  rotateDepth: 0.6,
};

export const newSquadGoal = (): SquadGoal => ({ phase: 'loot', target: null, inPhase: 0, age: 0 });

export interface SquadGoalCtx {
  leader: P;
  dt: number;
  zone: BotZoneView | null;
  /** Nearest loot the squad still wants, within `SQUAD_GOAL.lootSeekM`. Called only when needed. */
  findLoot: () => P | null;
  /** Living foes (other squads), positions. */
  foes: readonly P[];
}

function rotatePoint(zone: BotZoneView | null, leader: P): P | null {
  if (!zone) return null;
  const c = zone.next ?? zone.current;
  const dx = leader.x - c.x;
  const dz = leader.z - c.z;
  const d = Math.hypot(dx, dz);
  const r = c.radius * SQUAD_GOAL.rotateDepth;
  if (d <= r) return null; // already deep enough inside
  return { x: c.x + (dx / d) * r, z: c.z + (dz / d) * r };
}

function huntPoint(foes: readonly P[], leader: P): P | null {
  let best: P | null = null;
  let bestD = Infinity;
  for (const f of foes) {
    const d = Math.hypot(f.x - leader.x, f.z - leader.z);
    if (d < bestD) { bestD = d; best = f; }
  }
  if (!best) return null;
  const g = SQUAD_GOAL.huntGridM;
  return { x: Math.round(best.x / g) * g, z: Math.round(best.z / g) * g };
}

const near = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z) < SQUAD_GOAL.arriveM;

export function stepSquadGoal(g: SquadGoal, ctx: SquadGoalCtx): SquadGoal {
  let next: SquadGoal = { ...g, inPhase: g.inPhase + ctx.dt, age: g.age + ctx.dt };
  const set = (phase: SquadPhase, target: P | null): SquadGoal => ({
    phase,
    target,
    inPhase: phase === next.phase ? next.inPhase : 0,
    age: 0,
  });
  if (next.target && (near(ctx.leader, next.target) || next.age > SQUAD_GOAL.maxAgeS)) next = { ...next, target: null };

  if (next.phase === 'loot') {
    if (next.inPhase > SQUAD_GOAL.lootS) next = { ...set('rotate', null), inPhase: 0 };
    else if (!next.target) {
      const l = ctx.findLoot();
      if (l) return set('loot', l);
      next = { ...set('rotate', null), inPhase: 0 };
    } else return next;
  }
  if (next.phase === 'rotate') {
    if (next.target) return next;
    const r = rotatePoint(ctx.zone, ctx.leader);
    if (r) return set('rotate', r);
    next = { ...set('hunt', null), inPhase: 0 };
  }
  // Hunt: head for roughly where the nearest squad is; a new circle sends the squad rotating again.
  if (next.target && next.age < SQUAD_GOAL.huntRetargetS) return next;
  const r = rotatePoint(ctx.zone, ctx.leader);
  if (r && ctx.zone?.mode === 'shrink') return { ...set('rotate', r), inPhase: 0 };
  return set('hunt', huntPoint(ctx.foes, ctx.leader));
}

