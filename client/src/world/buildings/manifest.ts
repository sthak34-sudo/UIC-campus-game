/**
 * Atlas-made building models (client/public/models/buildings/<slug>.glb) that REPLACE the
 * procedural campus building for the listed campus.json ids. Kept static so buildCampus() can
 * skip those footprints before any glb is loaded. A test checks these ids against the glb parts.
 */
export interface BuildingModel {
  slug: string;
  /** campus.json building ids (CampusBuilding.id) this model replaces. */
  replaces: readonly string[];
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
];

export const REPLACED_BUILDING_IDS: ReadonlySet<string> = new Set(BUILDING_MODELS.flatMap((m) => m.replaces));

/** True when a glb model replaces this campus.json building (match by id or shared buildingId). */
export function isReplacedByModel(b: { id: string; buildingId?: string | null }): boolean {
  return REPLACED_BUILDING_IDS.has(b.id) || (!!b.buildingId && REPLACED_BUILDING_IDS.has(b.buildingId));
}
