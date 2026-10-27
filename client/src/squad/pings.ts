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
