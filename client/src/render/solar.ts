/**
 * Sun position for the campus (NOAA solar-position algorithm, accurate to ~0.1° for our purposes).
 * OWNER: Graphics Engineer.
 */
import { ORIGIN_LATLON } from '../core/geo';

const DEG = Math.PI / 180;

export interface SunAngles {
  /** Elevation above the horizon, radians (negative = below). */
  elevation: number;
  /** Azimuth measured from north, clockwise (east = +90°), radians. */
  azimuth: number;
}

/** Sun elevation/azimuth for a UTC instant at a given latitude/longitude (degrees, east positive). */
export function solarAngles(date: Date, latDeg: number, lonDeg: number): SunAngles {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * DEG;
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;
  const omega = (125.04 - 1934.136 * T) * DEG;
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * DEG;
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * DEG;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const y = Math.tan(eps / 2) ** 2;
  const L0r = L0 * DEG;
  const eqTimeMin =
    4 /
    DEG *
    (y * Math.sin(2 * L0r) -
      2 * e * Math.sin(Mr) +
      4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) -
      0.5 * y * y * Math.sin(4 * L0r) -
      1.25 * e * e * Math.sin(2 * Mr));
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const tst = utcMin + eqTimeMin + 4 * lonDeg;
  const ha = (tst / 4 - 180) * DEG;
  const lat = latDeg * DEG;
  const cosZen = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen)));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;
  return { elevation: Math.PI / 2 - zen, azimuth: ((az % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) };
}

export interface CampusDate {
  year: number;
  month: number; // 1-12
  day: number;
  /** Local clock offset from UTC in hours (Chicago in October = CDT = -5). */
  utcOffset: number;
}

/** Default game date: mid-October (autumn semester), Central Daylight Time. */
export const DEFAULT_DATE: CampusDate = { year: 2026, month: 10, day: 15, utcOffset: -5 };

/** Sun angles at the campus for a local clock hour (0-24, fractional allowed). */
export function campusSunAngles(hour: number, d: CampusDate = DEFAULT_DATE): SunAngles {
  const ms = Date.UTC(d.year, d.month - 1, d.day, 0, 0, 0) + (hour - d.utcOffset) * 3600000;
  return solarAngles(new Date(ms), ORIGIN_LATLON.lat, ORIGIN_LATLON.lon);
}

/**
 * Unit vector pointing TOWARD the sun in three.js world space (x = east, y = up, z = south).
 * Returned as a plain tuple so this module stays three-free and unit-testable.
 */
export function sunDirectionWorld(a: SunAngles): [number, number, number] {
  const ce = Math.cos(a.elevation);
  return [Math.sin(a.azimuth) * ce, Math.sin(a.elevation), -Math.cos(a.azimuth) * ce];
}
