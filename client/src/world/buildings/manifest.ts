/**
 * Atlas-made building models (client/public/models/buildings/<slug>.glb) that REPLACE the
 * procedural campus building for the listed campus.json ids. Kept static so buildCampus() can
 * skip those footprints before any glb is loaded. A test checks these ids against the glb parts.
 */
export interface BuildingModel {
  slug: string;
  /** campus.json building ids (CampusBuilding.id) this model replaces. */
  replaces: readonly string[];
  /** Extra campus.json ids to hide that are not modeled parts (tiny OSM slivers inside the model). */
  alsoHides?: readonly string[];
}

export const BUILDING_MODELS: readonly BuildingModel[] = [
  {
    slug: 'quad-lecture-centers',
    replaces: [
      'f91c7f32-ff12-4bd0-b2c4-e232a1516de1', // Lecture Center A
      'c77fb1ae-1ebd-4a1e-a5f3-0c5939b8a49a', // Lecture Center B
      'eeb925ff-9b59-4859-9ddd-964375f75b00', // Lecture Center C
      '33f76a96-9119-4bff-9ce5-d0a29df32a34', // Lecture Center D
      '59ca1cfa-c292-4bfb-bf25-b64458616663', // Lecture Center E
      '6d030286-61fc-4774-8f24-370f0bc5c5b1', // Lecture Center F
    ],
  },
  {
    slug: 'student-center-east',
    replaces: [
      'e0524bbe-eb73-4e33-a627-09c00e3326b4', // Student Center East
      '8aa0a812-c6c7-4b6a-b8c0-db3e4a803bb6#0', // Student Center East Tower
      '8aa0a812-c6c7-4b6a-b8c0-db3e4a803bb6#1',
      '8aa0a812-c6c7-4b6a-b8c0-db3e4a803bb6#2',
    ],
  },
  {
    slug: 'behavioral-sciences',
    replaces: [0, 1, 2, 3].map((i) => `a7ec57dd-7aa8-4f8e-9f29-bed200fe2ed4#${i}`),
    alsoHides: ['a7ec57dd-7aa8-4f8e-9f29-bed200fe2ed4#4'], // 1 m2 sliver inside part #0
  },
  { slug: 'douglass-hall', replaces: ['d3bc6e4f-6363-42a0-8bed-1edfa8249ede'] },
  { slug: 'grant-hall', replaces: [0, 1].map((i) => `b137170e-4135-4e53-8391-bc0c571b4fbc#${i}`) },
  { slug: 'lincoln-hall', replaces: [0, 1].map((i) => `a971b33b-ac0f-4b1d-b711-4d4c857e6782#${i}`) },
  {
    slug: 'architecture-design-studios',
    replaces: [0, 1].map((i) => `02eea501-41af-4a13-b500-0790ffbfa0a0#${i}`),
  },
];

export const REPLACED_BUILDING_IDS: ReadonlySet<string> = new Set(
  BUILDING_MODELS.flatMap((m) => [...m.replaces, ...(m.alsoHides ?? [])]),
);

/** True when a glb model replaces this campus.json building (match by id or shared buildingId). */
export function isReplacedByModel(b: { id: string; buildingId?: string | null }): boolean {
  return REPLACED_BUILDING_IDS.has(b.id) || (!!b.buildingId && REPLACED_BUILDING_IDS.has(b.buildingId));
}
