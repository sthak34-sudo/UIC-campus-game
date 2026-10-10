import type { CampusData } from '../../core/campusData';
import type { World } from '../../core/world';

/**
 * Hand-crafted landmark buildings (exterior + enterable interiors). OWNER: Landmarks Engineer.
 * Each landmark has an id that the map pipeline writes into CampusBuilding.landmark so the
 * generic campus builder skips that footprint.
 */
export const LANDMARK_IDS = ['university-hall', 'daley-library'] as const;
export type LandmarkId = (typeof LANDMARK_IDS)[number];

export async function buildLandmarks(_world: World, _data: CampusData): Promise<void> {
  // stub
}
