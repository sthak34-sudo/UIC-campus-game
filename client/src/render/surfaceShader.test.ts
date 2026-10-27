import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applySurfaceFx } from './surfaceShader';

describe('surface fx program sharing', () => {
  it('materials with the same switches share a program key; tuning numbers are uniforms', () => {
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    const c = new THREE.MeshStandardMaterial();
    applySurfaceFx(a, { macroAmp: 0.1, streaks: 0.3 }, 'brick');
    applySurfaceFx(b, { macroAmp: 0.05, streaks: 0.2, baseGrime: 0.4 }, 'concrete');
    applySurfaceFx(c, { interior: true }, 'glass');
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    expect(a.customProgramCacheKey()).not.toBe(c.customProgramCacheKey());
    expect(a.userData.gfxP.value[1].x).toBeCloseTo(0.3);
    expect(b.userData.gfxP.value[1].x).toBeCloseTo(0.2);
  });
});
