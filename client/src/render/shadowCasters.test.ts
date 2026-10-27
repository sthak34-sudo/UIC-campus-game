import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { QUALITY_PRESETS } from './quality';
import { CascadeSun } from './shadows';

function caster(detail: boolean): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  m.castShadow = true;
  if (detail) m.userData.shadowDetail = true;
  return m;
}

describe('cheaper medium shadows', () => {
  it('medium uses fewer/shorter cascades than high and drops detail casters', () => {
    const { medium, high } = QUALITY_PRESETS;
    expect(medium.cascades).toBeLessThan(high.cascades);
    expect(medium.shadowFar).toBeLessThan(200);
    expect(medium.detailCasters).toBe(false);
    expect(high.detailCasters).toBe(true);
  });
  for (const q of ['medium', 'high'] as const) {
    it(`${q}: leaf-card casters ${q === 'high' ? 'keep' : 'lose'} shadows, solid casters always keep them`, () => {
      const scene = new THREE.Scene();
      const sun = new CascadeSun(scene, new THREE.PerspectiveCamera(), QUALITY_PRESETS[q]);
      const card = caster(true), solid = caster(false);
      scene.add(card, solid);
      sun.adopt(scene);
      expect(card.castShadow).toBe(q === 'high');
      expect(solid.castShadow).toBe(true);
    });
  }
});
