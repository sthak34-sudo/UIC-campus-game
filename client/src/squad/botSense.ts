/**
 * AI-02 / AI-03: how bots notice and react to foes like people do. Pure: no three.js, no DOM.
 * Yaw follows the adapter: a bot facing yaw looks along (sin yaw, cos yaw) in x/z.
 */
type P = { x: number; z: number };

export const BOT_SENSE = {
  /** Field of view, full angle (degrees). */
  fovDeg: 110,
  /** Max turn speed (degrees per second). */
  turnDps: 300,
  /** First-shot delay range on a new target (s). */
  reactMinS: 0.25,
  reactMaxS: 0.6,
  /** Beyond this the delay grows (m)... */
  farM: 20,
  /** ...by up to this much more (s), at full detection range. */
  farExtraS: 0.25,
  /** Seen at the edge of view: up to this much more (s). */
  edgeExtraS: 0.15,
  /** After being hit or hearing a shot, a bot looks all around for this long (s). */
  alertS: 3,
  /** Shots are heard this far away (m). */
  hearM: 45,
  /** Someone this close is noticed even behind the bot (m). */
  feelM: 2.5,
  /** Only fire once the body faces the target within this angle (degrees). */
  aimConeDeg: 12,
  /** Full detection range used by the adapter (m). */
  rangeM: 28,
};

/** Smallest signed difference b - a between two angles (radians), in (-pi, pi]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export const yawTo = (from: P, to: P) => Math.atan2(to.x - from.x, to.z - from.z);

/** How far (degrees) `to` is off the bot's facing. */
export function offAxisDeg(yaw: number, from: P, to: P): number {
  return Math.abs(angleDiff(yaw, yawTo(from, to))) * (180 / Math.PI);
}

/** Can the bot notice a foe at `to`? In its view cone, very close, or while alert (hit / heard a shot). */
export function canNotice(yaw: number, from: P, to: P, alert: boolean, fovDeg = BOT_SENSE.fovDeg): boolean {
  if (alert) return true;
  if (Math.hypot(to.x - from.x, to.z - from.z) <= BOT_SENSE.feelM) return true;
  return offAxisDeg(yaw, from, to) <= fovDeg / 2;
}

/** Turn from `yaw` toward `target` at most `dps` degrees per second. */
export function turnToward(yaw: number, target: number, dt: number, dps = BOT_SENSE.turnDps): number {
  const d = angleDiff(yaw, target);
  const max = dps * (Math.PI / 180) * Math.max(0, dt);
  return Math.abs(d) <= max ? target : yaw + Math.sign(d) * max;
}

/** First-shot delay for a new target (s). `rnd` in [0, 1). */
export function reactionDelay(dist: number, offDeg: number, rnd: number): number {
  const base = BOT_SENSE.reactMinS + (BOT_SENSE.reactMaxS - BOT_SENSE.reactMinS) * rnd;
  const far = dist > BOT_SENSE.farM ? BOT_SENSE.farExtraS * Math.min(1, (dist - BOT_SENSE.farM) / (BOT_SENSE.rangeM - BOT_SENSE.farM)) : 0;
  const edge = BOT_SENSE.edgeExtraS * Math.min(1, Math.max(0, offDeg) / (BOT_SENSE.fovDeg / 2));
  return base + far + edge;
}

export interface Acquire {
  target: string | null;
  wait: number;
}
export const newAcquire = (): Acquire => ({ target: null, wait: 0 });

/**
 * Track the current target. A new target starts a fresh reaction delay; `ready` once it has run out.
 * Losing the target for a frame and getting it back counts as new (a re-peek costs the bot time too).
 */
export function stepAcquire(a: Acquire, target: string | null, dist: number, offDeg: number, dt: number, rnd: () => number): { a: Acquire; ready: boolean } {
  if (!target) return { a: newAcquire(), ready: false };
  if (a.target !== target) return { a: { target, wait: reactionDelay(dist, offDeg, rnd()) }, ready: false };
  const wait = Math.max(0, a.wait - dt);
  return { a: { target, wait }, ready: wait <= 0 };
}
