/**
 * Node naming contract for Atlas's building glbs (see /docs or fixes-v2):
 *   <slug>_LOD0 / <slug>_LOD1, <slug>_<group>_LOD0/1   render meshes (extras lod_level, lod_group, lod1_distance_m)
 *   <slug>_walls_col, <slug>_floor_col, <slug>_stairNN_col   invisible colliders (extras.collider)
 *   door_NN   empties at door centers (extras width_m, height_m, part; local +X points inside)
 *   loot_spawn_NN   loot points
 *   part_<name>     footprint centroids (extras osm_id, osm_name, height_m)
 * Pure: no three.js imports, so tests can run on parsed glb JSON.
 */
export type NodeKind = 'lod' | 'wall-col' | 'floor-col' | 'stair-col' | 'door' | 'loot' | 'part' | 'other';

export function classifyNode(name: string): NodeKind {
  if (/_LOD\d$/.test(name)) return 'lod';
  if (/_walls_col$/.test(name)) return 'wall-col';
  if (/_floor_col$/.test(name)) return 'floor-col';
  if (/_stair\d{2}_col$/.test(name)) return 'stair-col';
  if (/^door_\d{2}$/.test(name)) return 'door';
  if (/^loot_spawn_\d{2}$/.test(name)) return 'loot';
  if (/^part_[a-z0-9_]+$/.test(name)) return 'part';
  return 'other';
}

export function isColliderKind(k: NodeKind): boolean {
  return k === 'wall-col' || k === 'floor-col' || k === 'stair-col';
}

/** Blender duplicate suffixes like ".001" mean a broken export. */
export function hasDuplicateSuffix(name: string): boolean {
  return /\.\d{3}$/.test(name);
}
