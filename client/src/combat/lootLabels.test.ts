import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { labelInRange, LOOT_LABEL_RANGE_M, LootField } from './loot';

// Label sprites draw on a canvas; tests run without a DOM, so give them a no-op 2D context.
const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
(globalThis as unknown as { document: unknown }).document ??= {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
};

describe('pickup labels only near the player', () => {
  it('labelInRange uses a 3D distance and the 15 m default', () => {
    expect(LOOT_LABEL_RANGE_M).toBe(15);
    expect(labelInRange({ x: 0, y: 0, z: 0 }, { x: 14, y: 0, z: 0 })).toBe(true);
    expect(labelInRange({ x: 0, y: 0, z: 0 }, { x: 16, y: 0, z: 0 })).toBe(false);
    expect(labelInRange({ x: 0, y: 0, z: 0 }, { x: 10, y: 12, z: 0 })).toBe(false);
    expect(labelInRange(null, { x: 999, y: 0, z: 0 })).toBe(true);
  });
  it('LootField hides far tags and shows near ones', () => {
    const scene = new THREE.Scene();
    const field = new LootField(scene, [
      { kind: 'ammo', position: { x: 5, y: 0, z: 0 } },
      { kind: 'bandage', position: { x: 60, y: 0, z: 0 } },
    ]);
    field.update(0, { x: 0, y: 0, z: 0 });
    const tags = scene.children.map((g) => g.children.find((c) => (c as THREE.Sprite).isSprite)!);
    expect(tags[0]!.visible).toBe(true);
    expect(tags[1]!.visible).toBe(false);
    field.update(0, { x: 58, y: 0, z: 0 });
    expect(tags[0]!.visible).toBe(false);
    expect(tags[1]!.visible).toBe(true);
  });
});
