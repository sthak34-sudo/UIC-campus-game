/**
 * Squad pings (S4). Pure: place / expire markers. Max one live ping per player.
 * No three.js, no DOM.
 */
import type { PlayerId } from './types';

export const PING = {
  /** Seconds a ping stays visible. */
  duration: 30,
  maxPerPlayer: 1,
} as const;

export interface Ping {
  by: PlayerId;
  x: number;
  y: number;
  z: number;
  placedAt: number;
  expiresAt: number;
}

/** Drop a ping; replaces any existing ping from the same player. */
export function placePing(
  pings: readonly Ping[],
  by: PlayerId,
  pos: { x: number; y: number; z: number },
  now: number,
): Ping[] {
  const kept = pings.filter((p) => p.by !== by && p.expiresAt > now);
  return [
    ...kept,
    {
      by,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      placedAt: now,
      expiresAt: now + PING.duration,
    },
  ];
}

/** Drop expired pings. */
export function tickPings(pings: readonly Ping[], now: number): Ping[] {
  return pings.filter((p) => p.expiresAt > now);
}

type P3 = { x: number; y: number; z: number };

/**
 * Where a ping lands (UI-03): the camera-ray hit point, or where the ray meets the ground under
 * the player when it hits nothing (looking at the sky falls back to your own feet).
 */
export function pingTarget(cam: P3, dir: P3, hitDistance: number | null, feet: P3, maxRange: number): P3 {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
  let t: number | null = hitDistance;
  if (t == null && d.y < -1e-3) {
    const g = (feet.y - cam.y) / d.y;
    if (g > 0 && g <= maxRange) t = g;
  }
  if (t == null) return { ...feet };
  return { x: cam.x + d.x * t, y: cam.y + d.y * t, z: cam.z + d.z * t };
}

/** Distance label next to a ping marker. */
export function pingDistanceLabel(metres: number): string {
  return `${Math.max(0, Math.round(metres))} m`;
}
