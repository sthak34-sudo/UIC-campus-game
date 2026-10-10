// Shared coordinate system. Every part of the game (client, map pipeline, future server)
// must agree on this.
//
// "Plan" coordinates: meters on a flat map. x = east, y = north. Origin = ORIGIN_LATLON.
// "World" coordinates (three.js): x = east, y = up, z = south  →  world = (plan.x, height, -plan.y)

export const ORIGIN_LATLON = { lat: 41.8722, lon: -87.6505 } as const; // near the Quad

const KX = 111320 * Math.cos((ORIGIN_LATLON.lat * Math.PI) / 180);
const KY = 110574;

export type PlanPoint = [x: number, y: number];

export function lonLatToPlan(lon: number, lat: number): PlanPoint {
  return [(lon - ORIGIN_LATLON.lon) * KX, (lat - ORIGIN_LATLON.lat) * KY];
}

export function planToLonLat([x, y]: PlanPoint): { lon: number; lat: number } {
  return { lon: x / KX + ORIGIN_LATLON.lon, lat: y / KY + ORIGIN_LATLON.lat };
}

/** Plan (x east, y north) + height → three.js world [x, y(up), z(south)]. */
export function planToWorld(p: PlanPoint, height = 0): [number, number, number] {
  return [p[0], height, -p[1]];
}
