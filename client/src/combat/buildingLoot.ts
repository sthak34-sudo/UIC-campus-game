/**
 * Turn snapped building loot markers into LootSpot entries for LootField.
 */
import type { LootKind } from './inventory';
import type { LootSpot } from './range';

const KINDS: LootKind[] = ['gun', 'ammo', 'medkit', 'armor'];

export interface BuildingLootPos {
  x: number;
  y: number;
  z: number;
  slug?: string;
}

/** Cycle gun / ammo / medkit / armor across building spawn points. */
export function buildingLootSpots(markers: readonly BuildingLootPos[]): LootSpot[] {
  return markers.map((m, i) => ({
    kind: KINDS[i % KINDS.length]!,
    position: { x: m.x, y: m.y, z: m.z },
  }));
}
