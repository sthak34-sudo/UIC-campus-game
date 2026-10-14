import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getMaterial, MATERIAL_NAMES, MEAN_ALBEDO, TILE, type MaterialName } from './materials';
import creditsJson from '../../public/textures/credits.json?raw';
import tilesJson from '../../public/textures/tiles.json?raw';

// Names other modules already depend on (from the original stub contract) must keep working.
const CONTRACT: MaterialName[] = [
  'concrete', 'concreteDark', 'brick', 'glass', 'windowFrame', 'metal', 'asphalt', 'sidewalk', 'plaza', 'grass',
  'soil', 'water', 'roof', 'interiorWall', 'interiorFloor', 'interiorCeiling', 'wood', 'fabric', 'bookshelf', 'screen',
];

describe('material library', () => {
  it('provides every contract name, cached', () => {
    for (const n of CONTRACT) expect(MATERIAL_NAMES).toContain(n);
    for (const n of MATERIAL_NAMES) {
      const m = getMaterial(n);
      expect(m).toBeInstanceOf(THREE.Material);
      expect(getMaterial(n)).toBe(m);
    }
  });
  it('glass variants: opaque window glass vs. see-through glass', () => {
    expect(getMaterial('glass').transparent).toBe(false);
    expect(getMaterial('glassClear').transparent).toBe(true);
  });
  it('screens and light fixtures glow', () => {
    for (const n of ['screen', 'lightFixture'] as const) {
      const m = getMaterial(n) as THREE.MeshStandardMaterial;
      expect(m.emissive.getHex()).not.toBe(0);
    }
  });
  it('texture tile sizes match the generator (tiles.json)', () => {
    const tiles = JSON.parse(tilesJson) as Record<string, number[]>;
    for (const [dir, [w, h]] of Object.entries(TILE)) {
      expect(tiles[dir], dir).toBeDefined();
      expect(tiles[dir][0]).toBeCloseTo(w, 6);
      expect(tiles[dir][1]).toBeCloseTo(h, 6);
    }
  });
  it('tint table matches the fetched textures (credits.json) and every photo texture is credited CC0', () => {
    const credits = JSON.parse(creditsJson) as Record<string, { meanLinearAlbedo: number[]; license: string; url: string }>;
    for (const [dir, mean] of Object.entries(MEAN_ALBEDO)) {
      expect(credits[dir], dir).toBeDefined();
      mean.forEach((v, i) => expect(credits[dir].meanLinearAlbedo[i]).toBeCloseTo(v, 3));
    }
    for (const dir of Object.keys(TILE)) {
      if (dir.startsWith('ph_') || dir.startsWith('acg_')) {
        expect(credits[dir], dir).toBeDefined();
        expect(credits[dir].license).toBe('CC0 1.0');
      }
    }
  });
});
