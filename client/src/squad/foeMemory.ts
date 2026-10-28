/**
 * What a bot remembers about foes, and what counts as seeing one. Pure logic: the sight ray is
 * passed in, so this file stays free of physics and rendering.
 */
import type { PlayerId } from './types';

type V3 = { x: number; y: number; z: number };

export const FOE_MEMORY = {
  /** Seconds a bot keeps hunting a foe's last-seen spot after losing sight of it. */
  keep: 6,
  /** Within this distance (m) of the spot, the bot has looked and gives up. */
  reached: 1.2,
};

/** Head height above the feet (standing / downed). */
export function headY(downed: boolean): number { return downed ? 0.75 : 1.68; }

/**
 * A foe counts as visible when the bot can see its chest or its head, so someone peeking over
 * low cover is not hidden. Checks the chest first (most common) and only then the head.
 */
export function canSeeFoe(
  eye: V3,
  foe: V3,
  downed: boolean,
  chest: (downed: boolean) => number,
  clear: (a: V3, b: V3) => boolean,
): boolean {
  if (clear(eye, { x: foe.x, y: foe.y + chest(downed), z: foe.z })) return true;
  return clear(eye, { x: foe.x, y: foe.y + headY(downed), z: foe.z });
}

export interface FoeMemory { foe: PlayerId; x: number; y: number; z: number; age: number }

/**
 * One frame of memory for a bot. `seen` is the foe it can see now (with its position), or null.
 * `gone(id)` is true when that foe is dead or no longer a foe. Returns the memory to keep, or null.
 */
export function stepFoeMemory(
  mem: FoeMemory | null,
  seen: { id: PlayerId; pos: V3 } | null,
  self: V3,
  dt: number,
  gone: (id: PlayerId) => boolean,
): FoeMemory | null {
  if (seen) return { foe: seen.id, x: seen.pos.x, y: seen.pos.y, z: seen.pos.z, age: 0 };
  if (!mem) return null;
  if (gone(mem.foe)) return null;
  const age = mem.age + dt;
  if (age > FOE_MEMORY.keep) return null;
  if (Math.hypot(mem.x - self.x, mem.z - self.z) < FOE_MEMORY.reached) return null;
  return { ...mem, age };
}
