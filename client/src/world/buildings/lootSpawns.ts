/**
 * Collect glb loot_spawn markers from loaded buildings and snap them to floors
 * via a Rapier downward raycast. farOnly buildings (UH, Daley) keep their own
 * landmark loot and are skipped here.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type { LoadedBuilding } from './index';

export interface LootMarker {
  slug: string;
  x: number;
  y: number;
  z: number;
}

export interface DroppedLootMarker extends LootMarker {
  reason: string;
}

export interface SnappedLoot {
  kept: LootMarker[];
  dropped: DroppedLootMarker[];
}

/** Max vertical gap (m) between marker and a floor hit for the spawn to count. */
export const LOOT_FLOOR_GAP_M = 0.5;

/** Gather world-space loot markers from every non-farOnly building. */
export function collectBuildingLootMarkers(buildings: readonly LoadedBuilding[]): LootMarker[] {
  const out: LootMarker[] = [];
  for (const b of buildings) {
    if (b.farOnly) continue;
    for (const p of b.loot) {
      out.push({ slug: b.slug, x: p.x, y: p.y, z: p.z });
    }
  }
  return out;
}

/**
 * Cast straight down from just above each marker. Keep markers whose floor hit
 * is within LOOT_FLOOR_GAP_M of the marker height; snap Y to the floor.
 */
export function snapLootToFloor(
  rapierWorld: RAPIER.World,
  markers: readonly LootMarker[],
  maxGap = LOOT_FLOOR_GAP_M,
): SnappedLoot {
  const kept: LootMarker[] = [];
  const dropped: DroppedLootMarker[] = [];
  // Start a little above the marker so a marker sitting on the floor still hits.
  const lift = 0.25;
  const maxToi = maxGap + lift + 0.05;

  for (const m of markers) {
    const origin = { x: m.x, y: m.y + lift, z: m.z };
    const hit = rapierWorld.castRay(
      new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 }),
      maxToi,
      true,
    );
    if (!hit) {
      dropped.push({ ...m, reason: 'no floor hit' });
      continue;
    }
    const floorY = origin.y - hit.timeOfImpact;
    if (Math.abs(floorY - m.y) > maxGap) {
      dropped.push({ ...m, reason: `floor ${Math.abs(floorY - m.y).toFixed(2)} m away` });
      continue;
    }
    kept.push({ slug: m.slug, x: m.x, y: floorY, z: m.z });
  }
  return { kept, dropped };
}

/** Warn about every dropped marker (one line each). */
export function warnDroppedLoot(dropped: readonly DroppedLootMarker[]): void {
  for (const d of dropped) {
    console.warn(
      `[buildings] loot marker dropped (${d.reason}): ${d.slug} @ ${d.x.toFixed(1)}, ${d.y.toFixed(1)}, ${d.z.toFixed(1)}`,
    );
  }
}

/** Top of the ray used to find outdoor floors (m above datum). */
const FLOOR_PROBE_TOP_M = 150;

/**
 * Walkable outdoor floor at (x, z): the first surface straight down from high above, as long as
 * there is no second floor under it (that would mean a roof or canopy). Null when there is none.
 */
export function walkableFloorAt(rapierWorld: RAPIER.World, x: number, z: number): number | null {
  const top = rapierWorld.castRay(new RAPIER.Ray({ x, y: FLOOR_PROBE_TOP_M, z }, { x: 0, y: -1, z: 0 }), FLOOR_PROBE_TOP_M * 2, true);
  if (!top) return null;
  const y = FLOOR_PROBE_TOP_M - top.timeOfImpact;
  const under = rapierWorld.castRay(new RAPIER.Ray({ x, y: y - 0.3, z }, { x: 0, y: -1, z: 0 }), 25, true);
  return under ? null : y;
}
