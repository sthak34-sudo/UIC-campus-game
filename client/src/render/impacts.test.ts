import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createImpacts, IMPACT, sparkDir, sparkWidth, surfaceKind } from './impacts';

describe('impacts', () => {
  it('tells walls from ground by the surface normal', () => {
    expect(surfaceKind({ x: 0, y: 1, z: 0 })).toBe('ground');
    expect(surfaceKind({ x: 1, y: 0, z: 0 })).toBe('wall');
    expect(surfaceKind({ x: 0, y: 0.3, z: -0.95 })).toBe('wall');
  });
  it('sparks fly out of the surface, never into it', () => {
    const n = { x: 0, y: 0, z: -1 };
    for (let i = 0; i < 50; i++) {
      const d = sparkDir(n, i / 50, ((i * 7) % 50) / 50);
      expect(d.x * n.x + d.y * n.y + d.z * n.z).toBeGreaterThan(0);
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
    }
  });
  it('bursts, fades and cleans up', () => {
    const scene = new THREE.Scene();
    const fx = createImpacts(scene);
    fx.spawn({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 });
    fx.spawn({ x: 0, y: 0, z: 2 }, { x: 0, y: 1, z: 0 });
    fx.update(0.01);
    expect(fx.activeSparks).toBe(IMPACT.wall.sparks + IMPACT.ground.sparks);
    expect(fx.activePuffs).toBe(2);
    for (let i = 0; i < 20; i++) fx.update(0.05);
    expect(fx.activeSparks).toBe(0);
    expect(fx.activePuffs).toBe(0);
    fx.dispose();
    expect(scene.children.length).toBe(0);
  });
});

describe('impact sounds and thicker sparks', () => {
  it('impacts fade out with distance and walls ring a bit louder', async () => {
    const { impactVolume, IMPACT_SOUND } = await import('../audio/impactSound');
    expect(impactVolume('wall', 1)).toBe(IMPACT_SOUND.volume.wall);
    expect(impactVolume('wall', 1)).toBeGreaterThan(impactVolume('ground', 1));
    expect(impactVolume('ground', 20)).toBeLessThan(impactVolume('ground', 5));
    expect(impactVolume('wall', 100)).toBe(0);
  });
  it('reports each impact with its surface kind', () => {
    const scene = new THREE.Scene();
    const heard: string[] = [];
    const fx = createImpacts(scene, Math.random, (_p, kind) => heard.push(kind));
    fx.spawn({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
    fx.spawn({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(heard).toEqual(['wall', 'ground']);
    fx.dispose();
  });
  it('sparks keep a minimum on-screen width far away', () => {
    expect(sparkWidth(1)).toBe(IMPACT.sparkWidth);
    expect(sparkWidth(50)).toBeGreaterThan(IMPACT.sparkWidth);
  });
});
