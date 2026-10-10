import type { CampusBuilding, CampusData } from '../../core/campusData';
import type { PlanPoint } from '../../core/geo';

/**
 * Optional fields the map pipeline writes into campus.json that are not (yet) in the shared
 * contract `core/campusData.ts`. The Tech Lead will merge them there; until then the campus
 * module reads them through these local types.
 */
export interface CampusBuildingExt extends CampusBuilding {
  /** Overture building id shared by all volumes (tiers/parts) of one building. */
  buildingId?: string;
  /** Overture roof shape: "flat" | "gabled" | "hipped" | "pyramidal" | "skillion" | … */
  roofShape?: string;
  /** Height of the pitched roof part (ridge minus eaves), meters. */
  roofHeight?: number;
  /** Overture facade material: "brick" | "concrete" | "glass" | "stone" | "metal" | … */
  facadeMaterial?: string;
  facadeColor?: string;
  roofMaterial?: string;
  roofColor?: string;
}

export interface RoadLineExt {
  kind: string;
  width: number;
  points: PlanPoint[];
  /** Street name, e.g. "South Halsted Street" (when known). */
  name?: string;
}

export type CampusDataExt = Omit<CampusData, 'buildings' | 'roadLines'> & {
  buildings: CampusBuildingExt[];
  roadLines: RoadLineExt[];
};
