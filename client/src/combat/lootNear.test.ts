import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LootField } from './loot';

// Label sprites draw on a canvas; tests run without a DOM, so give them a no-op 2D context.
const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
(globalThis as unknown as { document: unknown }).document ??= {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
};

describe('loot near a bot', () => {
  const spots = [
    { kind: 'medkit' as const, position: { x: 1, y: 0, z: 0 }, once: true },
    { kind: 'ammo' as const, position: { x: 5, y: 0, z: 0 }, once: true },
    { kind: 'bandage' as const, position: { x: 3, y: 4, z: 0 }, once: true },
    { kind: 'gun' as const, position: { x: 30, y: 0, z: 0 }, once: true },
  ];
  it('finds the nearest accepted pickup on the same floor, within range', () => {
    const f = new LootField(new THREE.Scene(), spots);
    const accept = (k: string) => k !== 'medkit';
    expect(f.nearestWithin({ x: 0, y: 0, z: 0 }, 12, 0, accept)?.kind).toBe('ammo');
    expect(f.nearestWithin({ x: 25, y: 0, z: 0 }, 4, 0, accept)).toBeNull();
  });
  it('a taken once-only pickup is gone for good', () => {
    const f = new LootField(new THREE.Scene(), spots);
    const a = f.nearestWithin({ x: 0, y: 0, z: 0 }, 12, 0, (k) => k === 'ammo')!;
    expect(f.take(a.index, 0)).toBe('ammo');
    expect(f.nearestWithin({ x: 0, y: 0, z: 0 }, 12, 1e6, (k) => k === 'ammo')).toBeNull();
  });
});
