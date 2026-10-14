import type { MaterialName } from '../../render/materials';
import type { CampusBuildingExt } from './types';
import type { Rng } from './rng';
import { mat } from './mat';

/**
 * Window treatment of one floor in frame mode (see FacadeStyle.frameBays):
 * - punched: `windowsPerBay` recessed windows in the infill wall
 * - blockI: Netsch "Block I" windows — narrow I-shaped glass (bronze stem, clear trapezoid ends)
 * - gallery: open gallery ledge between the piers, window wall with Block-I windows set far back
 * - grille: pointed precast concrete grille over dark glass (Burnham / Addams Halls)
 * - glazed: full-bay glass window wall between the piers (lobbies, reclad halls)
 * - none: solid infill
 */
export type WinType = 'punched' | 'blockI' | 'gallery' | 'grille' | 'glazed' | 'none';

/**
 * Facade styles found around UIC East Campus.
 * - brutalist: 1960s Netsch campus (exposed concrete, floor bands, deep-set windows, solid corners)
 * - campusBrick: later UIC buildings (residence halls, SRF, Student Services): brick + punched windows
 * - rowhouse: Little Italy brick 2–4 flats / cottages (tall sash windows, stone lintels, cornice)
 * - loft: West Loop / Van Buren brick warehouses (big windows, cornice)
 * - modern: 2000s+ mid-rise apartments / commercial (panel or brick, large glazing)
 * - curtain: glass curtain wall (ARC tower, CDRLC, glass-tagged buildings)
 * - garage: open parking structures (slabs, openings, columns)
 * - shed: small utility / garages / sheds (no windows)
 * - storefront: one-story retail strips (big shop windows, sign band)
 */
export type StyleName = 'brutalist' | 'campusBrick' | 'rowhouse' | 'loft' | 'modern' | 'curtain' | 'garage' | 'shed' | 'storefront';

export interface FacadeStyle {
  name: StyleName;
  wall: MaterialName;
  /** Ground-floor / base material (darker plinth). */
  base: MaterialName;
  /** Plinth height (m) drawn in `base`. */
  plinth: number;
  /** Window reveal (jamb) material. */
  reveal: MaterialName;
  glass: MaterialName;
  frame: MaterialName;
  floorH: number;
  groundH: number;
  bay: number;
  winW: number;
  winH: number;
  sill: number;
  /** Ground floor: window head height and sill (storefronts / lobbies). */
  groundWinH: number;
  groundSill: number;
  recess: number;
  /** Solid pier width kept at each wall end (corners). */
  corner: number;
  /** Protruding floor band: height, depth (0 = none). */
  bandH: number;
  bandD: number;
  bandMat: MaterialName;
  /** Stone lintel + sill boxes around windows. */
  lintels: boolean;
  /** Cornice at the roofline: height, projection (0 = none). */
  corniceH: number;
  corniceD: number;
  corniceMat: MaterialName;
  parapet: number;
  /** Vertical mullions per window (0, 1, 2…) and a horizontal transom/meeting rail. */
  mullions: number;
  transom: boolean;
  /** Full-height vertical fins between bays (Brutalist variant). */
  fins: boolean;
  /** Probability that a bay is left blank (solid wall) — Brutalist buildings have blank stretches. */
  blankBays: number;
  /** Ground floor of the street-facing wall is a shop front (mixed-use buildings on commercial streets). */
  shopFront: boolean;
  /**
   * Netsch frame mode: the exposed structure is the facade. Piers (`pierMat`, `pierW` wide,
   * projecting `pierD`) at every bay, floor beams as bands, and each floor's bay filled per
   * `groundType` / `upperType` / `topType` with `wall` as the infill (brick or concrete).
   */
  frameBays: boolean;
  pierW: number;
  pierD: number;
  pierMat: MaterialName;
  groundType: WinType;
  upperType: WinType;
  /** Optional different treatment for the top floor. */
  topType?: WinType;
  /** Secondary glass (clear trapezoids of Block-I windows). */
  glassAlt: MaterialName;
  /** Depth of open galleries (m behind the pier face). */
  galleryDepth: number;
  windowsPerBay: number;
}

const BASE: FacadeStyle = {
  name: 'modern', wall: 'concrete', base: 'concreteDark', plinth: 0.6, reveal: 'concrete', glass: 'glass', frame: 'windowFrame',
  floorH: 3.4, groundH: 4.2, bay: 3, winW: 1.8, winH: 1.9, sill: 0.9, groundWinH: 2.9, groundSill: 0.5, recess: 0.2,
  corner: 0.8, bandH: 0, bandD: 0, bandMat: 'concrete', lintels: false, corniceH: 0, corniceD: 0, corniceMat: 'concrete',
  parapet: 0.9, mullions: 1, transom: false, fins: false, blankBays: 0, shopFront: false,
  frameBays: false, pierW: 0.6, pierD: 0.3, pierMat: 'concrete', groundType: 'punched', upperType: 'punched',
  glassAlt: 'glass', galleryDepth: 1.2, windowsPerBay: 1,
};

export function makeStyle(name: StyleName, rng: Rng, b: CampusBuildingExt): FacadeStyle {
  const fm = b.facadeMaterial;
  switch (name) {
    case 'brutalist': {
      // Typical Netsch building (docs/research/facades.md §1): exterior concrete piers and floor
      // beams, brick (or concrete) infill, deep-set bronze Block-I windows, recessed glazed ground floor.
      const brickInfill = rng.chance(0.6);
      const bay = rng.range(3.0, 3.8);
      return {
        ...BASE, name, wall: brickInfill ? mat('brickUIC') : mat('concreteExposedAggregate'), base: 'concreteDark', plinth: rng.range(0.5, 0.9),
        reveal: 'concrete', glass: mat('glassBronze'), glassAlt: mat('glassBronzeClear'), frame: mat('metalBronze'),
        floorH: rng.range(3.8, 4.2), groundH: rng.range(4.4, 5.0), bay,
        winW: rng.range(1.0, 1.2), winH: rng.range(2.3, 2.6), sill: rng.range(0.6, 0.8),
        groundWinH: rng.range(3.2, 3.6), groundSill: 0.15, recess: rng.range(0.35, 0.5), corner: 0.4,
        bandH: rng.range(0.6, 0.8), bandD: rng.range(0.18, 0.28), bandMat: 'concrete',
        corniceH: rng.range(1.0, 1.4), corniceD: rng.range(0.2, 0.3), corniceMat: 'concrete',
        parapet: rng.range(0.9, 1.3), mullions: 0, fins: false, blankBays: rng.range(0.0, 0.12),
        frameBays: true, pierW: rng.range(0.5, 0.75), pierD: rng.range(0.3, 0.45), pierMat: 'concrete',
        groundType: 'glazed', upperType: rng.chance(0.4) ? 'gallery' : 'blockI', windowsPerBay: bay > 3.4 ? 2 : 1,
      };
    }
    case 'campusBrick':
      return {
        ...BASE, name, wall: 'brick', base: 'concreteDark', plinth: 0.7, reveal: 'brick',
        floorH: rng.range(3.1, 3.5), groundH: rng.range(3.8, 4.4), bay: rng.range(2.4, 3.2), winW: rng.range(1.2, 1.6), winH: rng.range(1.5, 1.8),
        sill: 0.85, recess: 0.18, corner: 1.2, lintels: false, bandH: 0.35, bandD: 0.05, bandMat: 'concrete',
        corniceH: 0.5, corniceD: 0.15, corniceMat: 'concrete', parapet: 0.8, mullions: 1,
      };
    case 'rowhouse': {
      const brick = fm !== 'wood' && fm !== 'plaster';
      return {
        ...BASE, name, wall: brick ? 'brick' : 'wood', base: 'concrete', plinth: rng.range(0.7, 1.1), reveal: brick ? 'brick' : 'wood',
        glass: 'glass', frame: 'windowFrame', floorH: rng.range(3.0, 3.4), groundH: rng.range(3.6, 4.0),
        bay: rng.range(1.8, 2.3), winW: rng.range(0.85, 1.0), winH: rng.range(1.7, 2.0), sill: rng.range(0.75, 0.9),
        groundWinH: rng.range(2.9, 3.2), groundSill: rng.range(1.1, 1.3), recess: rng.range(0.12, 0.2), corner: rng.range(0.5, 0.8),
        lintels: brick, corniceH: rng.range(0.4, 0.7), corniceD: rng.range(0.25, 0.45), corniceMat: rng.pick(['metal', 'wood', 'concreteDark'] as const),
        parapet: rng.range(0.5, 1.0), mullions: 0, transom: true,
      };
    }
    case 'loft':
      return {
        ...BASE, name, wall: 'brick', base: 'concreteDark', plinth: 0.8, reveal: 'brick',
        floorH: rng.range(3.6, 4.2), groundH: rng.range(4.2, 4.8), bay: rng.range(2.4, 3.0), winW: rng.range(1.5, 1.9), winH: rng.range(2.1, 2.5),
        sill: 0.8, groundWinH: 3.2, groundSill: 0.4, recess: 0.22, corner: 1.0, lintels: true,
        corniceH: 0.8, corniceD: 0.4, corniceMat: 'concreteDark', parapet: 1.0, mullions: 1, transom: true,
      };
    case 'modern': {
      const wall: MaterialName = fm === 'brick' ? 'brick' : fm === 'metal' ? 'metal' : rng.pick(['brick', 'concrete', 'brick'] as const);
      return {
        ...BASE, name, wall, base: 'concreteDark', plinth: 0.4, reveal: wall,
        floorH: rng.range(3.0, 3.3), groundH: rng.range(4.0, 4.6), bay: rng.range(2.6, 3.4), winW: rng.range(1.7, 2.3), winH: rng.range(1.9, 2.2),
        sill: 0.6, groundWinH: 3.3, groundSill: 0.3, recess: 0.15, corner: 0.6, frame: 'metal', parapet: 0.9, mullions: 1,
        bandH: rng.chance(0.4) ? 0.3 : 0, bandD: 0.05, bandMat: 'concrete',
      };
    }
    case 'curtain':
      return {
        ...BASE, name, wall: 'metal', base: 'concreteDark', plinth: 0.3, reveal: 'metal', frame: 'metal',
        floorH: rng.range(3.2, 3.8), groundH: rng.range(4.2, 5.0), bay: rng.range(1.5, 1.8), winW: 0, winH: 0,
        sill: 0.0, groundWinH: 3.6, groundSill: 0.1, recess: 0.06, corner: 0.3, parapet: 1.0, mullions: 0, transom: false,
      };
    case 'garage':
      return {
        ...BASE, name, wall: 'concrete', base: 'concreteDark', plinth: 0, reveal: 'concreteDark', glass: 'concreteDark',
        floorH: rng.range(3.0, 3.3), groundH: 3.3, bay: rng.range(7.5, 8.5), winW: 0, winH: 0, sill: 1.05,
        groundWinH: 2.6, groundSill: 0.9, recess: 2.5, corner: 0.6, parapet: 1.1, mullions: 0,
      };
    case 'shed':
      return {
        ...BASE, name, wall: fm === 'metal' ? 'metal' : rng.pick(['brick', 'brick', 'wood'] as const), base: 'concreteDark', plinth: 0.3,
        floorH: 3, groundH: 3, bay: 99, winW: 0, winH: 0, corner: 99, parapet: 0.3, mullions: 0,
      };
    case 'storefront':
      return {
        ...BASE, name, wall: fm === 'brick' || rng.chance(0.6) ? 'brick' : 'concrete', base: 'concreteDark', plinth: 0.4, reveal: 'metal', frame: 'metal',
        floorH: 3.3, groundH: rng.range(4.0, 4.6), bay: rng.range(2.6, 3.4), winW: rng.range(1.0, 1.3), winH: 1.7, sill: 0.9,
        groundWinH: 3.0, groundSill: 0.45, recess: 0.15, corner: 0.5, corniceH: 0.6, corniceD: 0.2, corniceMat: 'metal', parapet: 0.9, mullions: 1,
      };
  }
}

const UIC_NAMES = /\b(Hall|Building|Center|Lecture|Science|Laborator|Library|Facility|Pavilion|Offices|Theatre|Engineering|Annex|Studios|College|Institute)\b/i;
const MODERN_UIC = /Academic and Residential|Computer Design|Engineering Innovation|Recreation|Student Services|Residence|Commons|Courtyard|Taylor Street Building|Teaching Excellence/i;
const HOUSEY = new Set(['house', 'residential', 'terrace', 'detached', 'semidetached_house', 'semi', 'bungalow', 'cabin']);

/**
 * Choose a facade style from the building's kind, name, location and size.
 * `south`/`west` = plan coords (Little Italy lies south/west of the campus core).
 */
export function chooseStyle(b: CampusBuildingExt, area: number, _cx: number, cy: number): StyleName {
  const kind = b.kind ?? '';
  const name = b.name ?? '';
  const h = b.height;
  if (kind === 'roof' || kind === 'shelter' || kind === 'carport') return 'shed';
  if (/parking|garage/i.test(name) || kind === 'parking' || ((kind === 'garages' || kind === 'garage') && area > 400)) return 'garage';
  if (kind === 'garage' || kind === 'garages' || kind === 'shed' || kind === 'service' || kind === 'hut' || h < 3.6 || area < 25) return 'shed';
  if (b.facadeMaterial === 'glass') return 'curtain';
  const uic = kind === 'university' || kind === 'college' || (UIC_NAMES.test(name) && kind !== 'apartments' && kind !== 'commercial');
  if (uic) {
    if (/Academic and Residential|Computer Design/i.test(name)) return 'curtain';
    if (MODERN_UIC.test(name)) return 'campusBrick';
    if (/Hull-House|Hull House/i.test(name)) return 'rowhouse';
    return 'brutalist';
  }
  if (kind === 'industrial' || kind === 'warehouse') return area > 1500 ? 'loft' : 'shed';
  if (kind === 'retail' || kind === 'commercial' || kind === 'office' || kind === 'hotel' || kind === 'school' || kind === 'public' || kind === 'fire_station' || kind === 'church') {
    if (h <= 6.5 && kind === 'retail') return 'storefront';
    if (h > 18) return cy > 300 ? 'loft' : 'modern';
    return h <= 9 && area < 600 ? 'storefront' : (cy > 300 ? 'loft' : 'campusBrick');
  }
  if (kind === 'apartments' || kind === 'dormitory') {
    if (h <= 14 && area < 500) return 'rowhouse';
    return cy > 300 && b.facadeMaterial === 'brick' ? 'loft' : 'modern';
  }
  if (kind === 'train_station') return 'storefront';
  if (HOUSEY.has(kind)) return 'rowhouse';
  // unknown kind: decide by size (Chicago residential lots are 7.5 m x 38 m -> ~200-300 m2 footprints)
  if (area < 450 && h < 16) return 'rowhouse';
  if (cy > 300) return 'loft'; // north of the expressway: West Loop warehouses
  if (area > 3000) return h > 12 ? 'loft' : 'modern';
  return h > 14 ? 'modern' : 'storefront';
}
