import type { CampusData } from '../../core/campusData';
import type { World } from '../../core/world';

/**
 * Builds the whole campus from campus.json: generic buildings (with procedural facades),
 * ground surfaces, trees and street props. OWNER: Map Engineer.
 * Buildings whose `landmark` field is set are SKIPPED here — world/landmarks builds them.
 */
export async function buildCampus(_world: World, _data: CampusData): Promise<void> {
  // stub
}
