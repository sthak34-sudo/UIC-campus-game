import * as THREE from 'three';

/**
 * Central material library. OWNER: Graphics Engineer.
 * Everyone else asks for materials by name; never create ad-hoc materials for surfaces listed here.
 * This stub returns flat colors; the Graphics Engineer replaces it with realistic PBR
 * (procedurally generated textures until photo textures are available).
 */
export type MaterialName =
  | 'concrete' // weathered Brutalist exposed concrete (UIC default)
  | 'concreteDark'
  | 'brick'
  | 'glass' // window glass (exterior)
  | 'windowFrame'
  | 'metal'
  | 'asphalt'
  | 'sidewalk'
  | 'plaza' // granite / concrete pavers
  | 'grass'
  | 'soil'
  | 'water'
  | 'roof'
  | 'interiorWall'
  | 'interiorFloor' // carpet / tile
  | 'interiorCeiling'
  | 'wood'
  | 'fabric'
  | 'bookshelf'
  | 'screen'; // computer monitors (emissive)

const FALLBACK: Record<MaterialName, number> = {
  concrete: 0xb9b4aa, concreteDark: 0x8c8780, brick: 0x8a4b3a, glass: 0x334455, windowFrame: 0x2a2a2a,
  metal: 0x888888, asphalt: 0x3d3f42, sidewalk: 0xbdb8ae, plaza: 0xa9a49a, grass: 0x56803a, soil: 0x6b5a45,
  water: 0x2f5068, roof: 0x77736c, interiorWall: 0xe8e4dc, interiorFloor: 0x7d6f62, interiorCeiling: 0xf2f0ea,
  wood: 0x9b7650, fabric: 0x3b4a6b, bookshelf: 0x6e5236, screen: 0x111a22,
};

const cache = new Map<MaterialName, THREE.Material>();

export function getMaterial(name: MaterialName): THREE.Material {
  let m = cache.get(name);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: FALLBACK[name], roughness: 0.9 });
    cache.set(name, m);
  }
  return m;
}
