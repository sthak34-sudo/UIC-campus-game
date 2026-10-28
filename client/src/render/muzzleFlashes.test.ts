import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createMuzzleFlashes, flashFade, MUZZLE } from './muzzleFlashes';

describe('bot muzzle flashes', () => {
  it('fade from full to nothing over their short life', () => {
    expect(flashFade(0)).toBe(1);
    expect(flashFade(MUZZLE.life / 2)).toBeLessThan(1);
    expect(flashFade(MUZZLE.life)).toBe(0);
  });
  it('show up when a bot fires and disappear right after', () => {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera();
    const fx = createMuzzleFlashes(scene);
    fx.spawn({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -10 });
    fx.update(0.01, cam);
    expect(fx.active).toBe(1);
    fx.update(MUZZLE.life, cam);
    expect(fx.active).toBe(0);
    fx.dispose();
    expect(scene.children.length).toBe(0);
  });
  it('sit slightly in front of the barrel and reuse a fixed pool', () => {
    const scene = new THREE.Scene();
    const fx = createMuzzleFlashes(scene);
    fx.spawn({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -5 });
    const g = scene.getObjectByName('botMuzzleFlashes')!;
    const m = g.children.find((c) => c instanceof THREE.Mesh && c.visible)!;
    expect(m.position.z).toBeCloseTo(-MUZZLE.forward);
    for (let i = 0; i < 50; i++) fx.spawn({ x: i, y: 0, z: 0 });
    expect(g.children.length).toBe(MUZZLE.pool + MUZZLE.lights);
    fx.dispose();
  });
});
