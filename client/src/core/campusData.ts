// Format of client/public/data/campus.json, produced by tools/map-pipeline (Python).
// All coordinates are PLAN coordinates (see core/geo.ts): meters, x = east, y = north.
// Rings are open (first point is NOT repeated at the end) and counter-clockwise for outer rings.

import type { PlanPoint } from './geo';

export interface Polygon2D {
  outer: PlanPoint[];
  holes: PlanPoint[][];
}

export interface CampusBuilding {
  /** Stable id (Overture id). */
  id: string;
  name: string | null;
  /** Overture / OSM class, e.g. "university", "house", "apartments", or null. */
  kind: string | null;
  /** Roof height above ground, meters (LiDAR-corrected when available). */
  height: number;
  /** Bottom of this volume above ground (for overhangs / tiers / skywalks). */
  minHeight: number;
  floors: number | null;
  /** Where the height came from: "lidar" | "overture" | "floors" | "default" | "override". */
  heightSource: string;
  footprint: Polygon2D;
  /** If a hand-built landmark replaces this building, its landmark id (see world/landmarks). */
  landmark?: string;
}

export interface CampusData {
  version: number;
  generated: string;
  origin: { lat: number; lon: number };
  /** Play-area bounds in plan meters. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  buildings: CampusBuilding[];
  /** Ground surfaces as polygons (already widened from center lines where needed). */
  surfaces: {
    road: Polygon2D[];
    sidewalk: Polygon2D[];
    plaza: Polygon2D[];
    grass: Polygon2D[];
    pitch: Polygon2D[];
    water: Polygon2D[];
    parking: Polygon2D[];
  };
  /** Road center lines with class, for lane markings / curbs. */
  roadLines: { kind: string; width: number; points: PlanPoint[] }[];
  trees: { p: PlanPoint; height: number }[];
  props: {
    bench: PlanPoint[];
    streetLamp: PlanPoint[];
    wasteBasket: PlanPoint[];
    bicycleParking: PlanPoint[];
    busStop: PlanPoint[];
  };
  attribution: string[];
}
