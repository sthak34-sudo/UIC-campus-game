import * as THREE from 'three';
import { getMaterial, MATERIAL_NAMES, type MaterialName } from '../../../render/materials';

/**
 * TEMPORARY local materials for surfaces the shared material library (render/materials.ts, owned by
 * the Graphics Engineer) does not have yet. Requested names: 'books' (white base, multiplied by
 * per-instance colors) and 'lightPanel' (emissive ceiling luminaire). When those exist, replace these
 * with getMaterial('books') / getMaterial('lightPanel').
 */
let books: THREE.MeshStandardMaterial | null = null;
let fire: THREE.MeshStandardMaterial | null = null;

/** Book covers/spines: white so InstancedMesh.setColorAt() colors show unmodified. */
export function booksMaterial(): THREE.MeshStandardMaterial {
  books ??= new THREE.MeshStandardMaterial({ name: 'books(local)', color: 0xffffff, roughness: 0.8, metalness: 0 });
  return books;
}

/** Ceiling light panel (emissive). */
export function lightPanelMaterial(): THREE.Material {
  return getMaterial('lightFixture');
}

// ---------------------------------------------------------------------------------------------------
// Planned shared materials (Graphics Engineer, round 3). Until they exist in render/materials.ts we
// alias them to the closest existing name. `lm()` switches over AUTOMATICALLY as soon as the real
// name appears in MATERIAL_NAMES, so no landmark code has to change.
// ---------------------------------------------------------------------------------------------------
export type PlannedMaterial =
  | 'brickUIC' // UIC dark red-brown face brick with per-brick variation
  | 'glassBronze' // opaque bronze-tinted glass (sealed floors, centre of Block-I windows)
  | 'glassBronzeClear' // see-through bronze-tinted glass (enterable buildings)
  | 'metalBronze' // dark bronze anodized frames / mullions
  | 'concreteExposedAggregate' // sandblasted / exposed-aggregate Netsch concrete (frames, piers)
  | 'metalPanel' // steel grating / metal panel
  | 'glassFritted';

export const PLANNED_ALIAS: Record<PlannedMaterial, MaterialName> = {
  brickUIC: 'brick',
  glassBronze: 'glass',
  glassBronzeClear: 'glassClear',
  metalBronze: 'windowFrame',
  concreteExposedAggregate: 'concrete',
  metalPanel: 'metal',
  glassFritted: 'glass',
};

/** Landmark material lookup: a shared name, or a planned name (aliased until it exists). */
export function lm(name: PlannedMaterial | MaterialName): THREE.Material {
  if ((MATERIAL_NAMES as readonly string[]).includes(name)) return getMaterial(name as MaterialName);
  return getMaterial(PLANNED_ALIAS[name as PlannedMaterial]);
}

/** Glowing fireplace embers (Circle Reading Room). */
export function fireMaterial(): THREE.MeshStandardMaterial {
  fire ??= new THREE.MeshStandardMaterial({ name: 'fire(local)', color: 0x331100, emissive: 0xff7a24, emissiveIntensity: 1.2, roughness: 1 });
  return fire;
}
