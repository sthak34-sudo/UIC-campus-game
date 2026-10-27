import { describe, expect, it } from 'vitest';
import { PING, placePing, tickPings } from './pings';

describe('pings', () => {
  it('places a 30 s ping and replaces the previous one from the same player', () => {
    const a = placePing([], 'p0', { x: 1, y: 0, z: 2 }, 10);
    expect(a).toHaveLength(1);
    expect(a[0]!.expiresAt).toBe(10 + PING.duration);
    const b = placePing(a, 'p0', { x: 5, y: 1, z: 5 }, 12);
    expect(b).toHaveLength(1);
    expect(b[0]!.x).toBe(5);
    const c = placePing(b, 'p1', { x: 0, y: 0, z: 0 }, 12);
    expect(c).toHaveLength(2);
  });

  it('tickPings drops expired entries', () => {
    const pings = placePing([], 'p0', { x: 0, y: 0, z: 0 }, 0);
    expect(tickPings(pings, PING.duration - 0.01)).toHaveLength(1);
    expect(tickPings(pings, PING.duration + 0.01)).toHaveLength(0);
  });
});
