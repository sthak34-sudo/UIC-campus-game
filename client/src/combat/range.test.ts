import { describe, expect, it } from 'vitest';
import { practiceLayout } from './range';

describe('practice range layout', () => {
  it('puts dummies farther from spawn than the loot, and spaces the dummies apart', () => {
    const layout = practiceLayout({ x: 10, y: 1, z: -4 }, 0);
    expect(layout.dummies).toHaveLength(3);
    expect(layout.loot.map((l) => l.kind)).toEqual(['gun', 'ammo', 'medkit', 'armor']);
    const dist = (p: { x: number; z: number }) => Math.hypot(p.x - 10, p.z - (-4));
    const nearestDummy = Math.min(...layout.dummies.map(dist));
    for (const crate of layout.loot) expect(dist(crate.position)).toBeLessThan(nearestDummy);
    for (const dummy of layout.dummies) {
      expect(dist(dummy)).toBeGreaterThan(6);
      expect(dist(dummy)).toBeLessThan(16);
      expect(dummy.y).toBe(1);
    }
    for (let i = 0; i < layout.dummies.length; i++) {
      for (let j = i + 1; j < layout.dummies.length; j++) {
        const a = layout.dummies[i]!;
        const b = layout.dummies[j]!;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(2);
      }
    }
    expect(layout.camera.y).toBeGreaterThan(layout.dummies[0]!.y);
  });
});
