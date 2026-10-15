import type { FeatureName } from './features';
import { mat } from './mat';
import type { FacadeStyle, StyleName } from './styles';
import type { CampusBuildingExt } from './types';

/**
 * Per-building facade specs, transcribed from docs/research/facades.md (section numbers in
 * `source`). Matched by the Overture building name (all volumes/tiers of a building share it).
 * Anything not listed falls back to the generic style choice in styles.ts — for UIC buildings that
 * is the typical Netsch frame (concrete piers + brick infill + Block-I windows).
 *
 * Materials go through `mat()`: planned names (brickUIC, glassBronze …) resolve to stand-ins until
 * the Graphics Engineer adds them.
 */
export interface FacadeSpec {
  names: string[];
  base: StyleName;
  style?: Partial<FacadeStyle>;
  /** Per-volume adjustments, e.g. ARC tower vs its 2-story academic base. */
  volume?: (v: CampusBuildingExt, tallest: number) => Partial<FacadeStyle> | null;
  /** Signature features, for all volumes or only those the function picks. */
  features?: FeatureName[] | ((v: CampusBuildingExt, tallest: number) => FeatureName[]);
  source: string;
  /** Things to check against the owner's photos. */
  flags?: string[];
}

const concrete = 'concrete' as const;
// Block-I: bronze stem + clear trapezoids. Generic buildings are sealed, so the 'clear' panes use
// the opaque `glass` (fake rooms) rather than the transparent glassBronzeClear.
const bronze = () => ({ glass: mat('glassBronze'), glassAlt: 'glass' as const, frame: 'windowFrame' as const });

/** 1960s Netsch classroom hall: concrete piers, recessed glazed ground floor, upper floors per `upper`. */
const netschHall = (upper: FacadeStyle['upperType'], extra: Partial<FacadeStyle> = {}): Partial<FacadeStyle> => ({
  ...bronze(), wall: concrete, pierMat: concrete, reveal: concrete, frameBays: true, pierW: 0.75, pierD: 0.5, bay: 3.6,
  groundType: 'glazed', upperType: upper, windowsPerBay: 2, winW: 1.0, winH: 2.4, sill: 0.4, groundWinH: 3.4,
  bandH: 0.75, bandD: 0.3, bandMat: concrete, corniceH: 1.1, corniceD: 0.3, corniceMat: concrete, blankBays: 0,
  floorH: 4.0, groundH: 4.2, ...extra,
});

export const FACADE_SPECS: FacadeSpec[] = [
  {
    names: ['Henry Hall', 'Jefferson Hall', 'Stevenson Hall'],
    base: 'brutalist',
    style: netschHall('gallery'),
    source: '§2.15 / §2.16: exterior concrete piers; upper two floors recessed window walls behind open galleries',
    flags: ['Stevenson Hall has no source; treated like Henry/Jefferson'],
  },
  {
    names: ['Grant Hall', 'Lincoln Hall', 'Douglass Hall', 'Douglas Hall'],
    base: 'brutalist',
    style: netschHall('glazed', { glass: 'glass', glassAlt: 'glass', frame: mat('metalBronze'), recess: 0.2, pierD: 0.35, groundWinH: 3.6 }),
    features: ['roofPV'],
    source: '§2.13: reclad in glass 2009–12 keeping the lines of the original frame; rooftop solar',
  },
  {
    names: ['Burnham Hall', 'Addams Hall'],
    base: 'brutalist',
    style: netschHall('grille', { pierMat: mat('concretePrecast') }),
    source: '§2.14: rhythmic bands of pointed precast concrete grilles on the upper two floors',
  },
  {
    names: ['Taft Hall'],
    base: 'brutalist',
    style: netschHall('glazed', { glass: 'glass', recess: 0.2 }),
    source: '§2.14: concrete grilles demolished 2025, new Gensler wall system',
    flags: ['final Taft Hall facade unverified (reopens fall 2026)'],
  },
  {
    names: ['Lecture Center A', 'Lecture Center B', 'Lecture Center C', 'Lecture Center D', 'Lecture Center E', 'Lecture Center F'],
    base: 'brutalist',
    style: {
      ...bronze(), wall: mat('brickUIC'), pierMat: mat('brickUIC'), frameBays: true, pierW: 1.0, pierD: 0.08, bay: 6.5,
      groundType: 'glazed', upperType: 'none', groundWinH: 3.4, bandH: 0, bandD: 0, corniceH: 0, corniceD: 0, blankBays: 0,
      groundH: 4.6, floorH: 4.0, plinth: 0.4,
    },
    features: ['butterflyColonnade'],
    source: '§2.4: brick walls, metal-framed window wall between 45°-twisted butterfly columns, 1-ft granite roof edge',
    flags: ['roof shape kept from Overture (pyramidal) — no source confirms pyramid roofs; check photos'],
  },
  {
    names: ['Student Center East'],
    base: 'brutalist',
    style: {
      ...bronze(), wall: mat('brickUIC'), pierMat: mat('brickUIC'), frameBays: true, pierW: 0.9, pierD: 0.15, bay: 5.2,
      groundType: 'glazed', upperType: 'punched', windowsPerBay: 2, winW: 1.5, winH: 2.1, sill: 0.9, recess: 0.35,
      bandH: 0.8, bandD: 0.22, bandMat: concrete, corniceH: 1.2, corniceD: 0.3, corniceMat: concrete, blankBays: 0.2, groundH: 4.6,
    },
    features: (v, tallest) => (v.height >= tallest - 0.5 ? ['doubleStair'] : []),
    source: '§2.3: C.F. Murphy brick student union, concrete waffle slabs, double semicircular stair to a 2nd-floor entrance',
    flags: ['stair placed on the west (campus) side — exact side unverified'],
  },
  {
    names: ['Student Center East Tower'],
    base: 'brutalist',
    style: {
      ...bronze(), wall: mat('brickUIC'), pierMat: mat('brickUIC'), frameBays: true, pierW: 0.8, pierD: 0.2, bay: 3.4,
      groundType: 'glazed', upperType: 'punched', windowsPerBay: 1, winW: 1.6, winH: 2.0, sill: 0.9, recess: 0.35,
      bandH: 0.6, bandD: 0.18, bandMat: concrete, corniceH: 1.0, corniceD: 0.25, corniceMat: concrete, blankBays: 0,
    },
    source: '§2.3: tower facade unverified — brick piers with concrete floor bands to match the low block',
    flags: ['SCE Tower facade unverified'],
  },
  {
    names: ['Behavioral Sciences Building'],
    base: 'brutalist',
    style: {
      ...bronze(), wall: mat('brickUIC'), pierMat: mat('brickUIC'), frameBays: true, pierW: 0.7, pierD: 0.12, bay: 4.2,
      groundType: 'punched', upperType: 'punched', windowsPerBay: 1, winW: 0.75, winH: 1.4, sill: 1.2, groundSill: 1.0, groundWinH: 2.6,
      recess: 0.55, blankBays: 0.7, bandH: 1.0, bandD: 0.3, bandMat: concrete, corniceH: 1.6, corniceD: 0.35, corniceMat: concrete,
    },
    source: '§2.5: concrete frame, mostly brick walls, windows minimized; rotated-square (45°) plan from the footprint',
  },
  {
    names: ['Science and Engineering Laboratories'],
    base: 'brutalist',
    style: {
      ...bronze(), wall: mat('brickDouble'), pierMat: mat('brickDouble'), frameBays: true, pierW: 1.2, pierD: 0.1, bay: 7.0,
      groundType: 'punched', upperType: 'blockI', windowsPerBay: 1, winW: 1.0, winH: 2.6, recess: 0.5, blankBays: 0.6,
      bandH: 0.5, bandD: 0.12, bandMat: concrete, corniceH: 1.4, corniceD: 0.3, corniceMat: concrete,
    },
    features: (v, tallest) => (v.height >= tallest - 2 ? ['twistedPylons'] : []),
    source: '§2.7: double-size brick "endless pattern of I\'s", huge 45°-twisted concrete pylons, few windows',
  },
  {
    names: ['Science and Engineering - South'],
    base: 'brutalist',
    style: {
      ...bronze(), wall: mat('brickDouble'), pierMat: mat('brickDouble'), frameBays: true, pierW: 0.8, pierD: 0.12, bay: 3.0,
      groundType: 'glazed', upperType: 'blockI', windowsPerBay: 1, winW: 0.95, winH: 2.4, recess: 0.45, blankBays: 0.25,
      bandH: 0.7, bandD: 0.22, bandMat: concrete, corniceH: 1.2, corniceD: 0.3, corniceMat: concrete,
    },
    source: '§2.8: large-module brick with a distinctive color range; narrow recessed windows (est.)',
    flags: ['window pattern unverified; building under scaffolding 2026–27'],
  },
  {
    names: ['Science & Engineering Offices'],
    base: 'brutalist',
    style: netschHall('blockI', {
      wall: mat('concreteExposedAggregate'), bay: 2.0, pierW: 0.55, pierD: 0.45, windowsPerBay: 1, winW: 0.85, winH: 2.4, sill: 0.55,
      recess: 0.55, bandH: 0.55, bandD: 0.2, floorH: 3.7, groundH: 4.6,
    }),
    features: ['scissorStairs'],
    source: '§2.6: 13-story concrete slab in two offset halves, narrow recessed windows, exposed scissor stairs',
  },
  {
    names: ['Engineering Research Facility'],
    base: 'brutalist',
    style: { ...bronze(), wall: mat('brickUIC'), frameBays: true, groundType: 'glazed', upperType: 'blockI', windowsPerBay: 1 },
    source: '§2.9: unverified — campus-style brick-and-concrete lab building',
    flags: ['ERF facade unverified'],
  },
  {
    names: ['Education, Theater, Music, and Social Work Building'],
    base: 'brutalist',
    style: {
      ...bronze(), wall: mat('brickUIC'), pierMat: mat('brickUIC'), frameBays: true, pierW: 0.9, pierD: 0.15, bay: 4.0,
      groundType: 'glazed', upperType: 'punched', windowsPerBay: 1, winW: 1.6, winH: 1.8, recess: 0.4, blankBays: 0.2,
      bandH: 0.6, bandD: 0.2, bandMat: concrete,
    },
    source: '§2.21: Harry Weese brick-faced building (1969–71)',
    flags: ['brick color and window pattern unverified'],
  },
  {
    names: ['Architecture and Design Studios'],
    base: 'brutalist',
    style: {
      ...bronze(), wall: mat('brickUIC'), pierMat: mat('brickUIC'), frameBays: true, pierW: 0.8, pierD: 0.1, bay: 4.5,
      groundType: 'punched', upperType: 'blockI', windowsPerBay: 1, blankBays: 0.5, bandH: 0.8, bandD: 0.25, bandMat: concrete,
    },
    source: '§2.19: first Field-Theory building, brick with unfinished plain walls where wings were never built',
  },
  {
    names: ['Art & Exhibition Hall'],
    base: 'loft',
    style: { wall: mat('brickBeige'), reveal: mat('brickBeige') },
    source: '§2.20: former Formfit industrial building, beige brick, loft windows',
  },
  {
    names: ['College of Urban Planning and Public Affairs'],
    base: 'loft',
    source: '§2.20: adaptive-reuse Formfit loft',
    flags: ['CUPPA Hall facade color unverified'],
  },
  {
    names: ['Academic and Residential Complex'],
    base: 'curtain',
    style: { wall: mat('concretePrecast'), base: mat('concretePrecast'), reveal: mat('concretePrecast'), glass: mat('glassFritted'), frame: 'metal' },
    // 10-story tower: pale precast with punched windows + folded aluminum fins; 2-story base: glassy
    volume: (v, tallest) =>
      v.height >= tallest - 2
        ? { frameBays: false, bay: 1.8, winW: 1.25, winH: 2.2, sill: 0.7, recess: 0.12, mullions: 0, groundWinH: 3.4, groundSill: 0.2, corner: 0.6, floorH: 3.1 }
        : { frameBays: true, pierMat: mat('concretePrecast'), pierW: 0.4, pierD: 0.08, bay: 3.2, groundType: 'glazed', upperType: 'glazed', bandH: 0.7, bandD: 0.1, bandMat: mat('concretePrecast') },
    features: (v, tallest) => (v.height >= tallest - 2 ? ['aluminumFins'] : []),
    source: '§2.12: pale precast tower (70 panel types, 3" projections), folded aluminum fins, fritted glass; glassy curved 2-story base',
  },
  {
    names: ['Computer Design Research and Learning Center'],
    base: 'brutalist',
    style: {
      wall: mat('concretePrecast'), base: mat('concretePrecast'), reveal: mat('concretePrecast'), pierMat: mat('concretePrecast'),
      glass: 'glass', glassAlt: 'glass', frame: mat('metalBronze'), frameBays: true, pierW: 0.9, pierD: 0.12, bay: 4.4,
      groundType: 'glazed', upperType: 'punched', windowsPerBay: 1, winW: 2.8, winH: 1.9, sill: 0.8, recess: 0.45, mullions: 1,
      bandH: 0.55, bandD: 0.05, bandMat: mat('terracotta'), corniceH: 0.6, corniceD: 0.1, corniceMat: mat('metalBronze'), blankBays: 0.1,
      floorH: 4.4, groundH: 4.8,
    },
    source: '§2.10: curving precast (4 finishes) with inset terra-cotta panels, wide recessed windows, bronze trim',
    flags: ['terra-cotta color unverified'],
  },
  {
    names: ['Student Recreation Facility'],
    base: 'brutalist',
    style: {
      wall: mat('metalPanel'), base: 'concreteDark', reveal: mat('metalPanel'), pierMat: mat('metalPanel'), glass: 'glass', glassAlt: 'glass', frame: 'metal',
      frameBays: true, pierW: 0.3, pierD: 0.06, bay: 3.2, groundType: 'glazed', upperType: 'glazed', blankBays: 0.4, groundWinH: 4.5,
      bandH: 0.5, bandD: 0.08, bandMat: mat('metalPanel'), corniceH: 0.8, corniceD: 0.15, corniceMat: mat('metalPanel'), floorH: 5.5, groundH: 6.0,
    },
    source: '§2.11: contemporary metal-panel gym with extensive glass and a tall atrium',
    flags: ['metal panel color unverified'],
  },
  {
    names: ['Jane Addams Hull-House Museum'],
    base: 'rowhouse',
    style: {
      wall: mat('brickHullHouse'), reveal: mat('brickHullHouse'), lintels: true, winW: 1.0, winH: 2.3, bay: 2.4, corniceMat: mat('concretePrecast'),
      corniceH: 0.5, corniceD: 0.35, plinth: 0.9, base: mat('concretePrecast'),
    },
    features: ['porch'],
    source: '§2.22: 1856 Italianate red-brick mansion, Corinthian columned porch, hipped roof, arched windows',
  },
  {
    names: ['Hull House Dining Hall'],
    base: 'rowhouse',
    style: { wall: mat('brickUIC'), reveal: mat('brickUIC'), lintels: true },
    source: '§2.22: 1905 Arts & Crafts brick hall (Pond & Pond)',
  },
];

const byName = new Map<string, FacadeSpec>();
for (const s of FACADE_SPECS) for (const n of s.names) byName.set(n, s);

export function findFacadeSpec(name: string | null | undefined): FacadeSpec | undefined {
  return name ? byName.get(name) : undefined;
}

export function specFeatures(spec: FacadeSpec | undefined, v: CampusBuildingExt, tallest: number): FeatureName[] {
  if (!spec?.features) return [];
  return typeof spec.features === 'function' ? spec.features(v, tallest) : spec.features;
}
