import * as THREE from 'three';
import { getMaterial } from '../../../render/materials';

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

/** Glowing fireplace embers (Circle Reading Room). */
export function fireMaterial(): THREE.MeshStandardMaterial {
  fire ??= new THREE.MeshStandardMaterial({ name: 'fire(local)', color: 0x331100, emissive: 0xff7a24, emissiveIntensity: 1.2, roughness: 1 });
  return fire;
}
