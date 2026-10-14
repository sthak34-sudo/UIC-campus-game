import { MATERIAL_NAMES, type MaterialName } from '../../render/materials';

/**
 * Facade materials planned by the Graphics Engineer (docs/research/facades.md palette), with the
 * closest existing material as a stand-in. `mat()` picks the real one automatically as soon as it
 * appears in the material library — no code change needed here when their branch merges.
 */
export const PLANNED_MATERIALS = {
  brickUIC: 'brick', // UIC dark red-brown face brick with per-brick variation
  brickDouble: 'brick', // SEL / SES double-size brick (~400 x 135 mm module)
  brickBeige: 'brick', // Formfit loft buildings north of I-290 (Art & Exhibition Hall)
  brickHullHouse: 'brick', // 1960s refaced red Italianate brick
  glassBronze: 'glass', // bronze-tinted centre pane of the Block-I windows
  glassBronzeClear: 'glass', // clear trapezoids of the Block-I windows
  glassFritted: 'glass', // ARC fritted glass
  metalBronze: 'windowFrame', // bronze trim / mullions (1960s frames, CDRLC trim)
  metalPanel: 'metal', // SRF metal panels, ARC folded aluminum fins
  concreteExposedAggregate: 'concreteDark', // Netsch sandblasted / exposed-aggregate finish
  concretePrecast: 'concreteSmooth', // pale precast panels (ARC, CDRLC, Burnham grilles)
  terracotta: 'brick', // CDRLC inset terra-cotta panels
  granite: 'plaza', // Minnesota granite (Lecture Center roof edge, name blocks)
  solarPanel: 'glass', // rooftop PV (reclad halls)
} as const satisfies Record<string, MaterialName>;

export type PlannedMaterial = keyof typeof PLANNED_MATERIALS;

const available = new Set<string>(MATERIAL_NAMES);

/** Real material if the library has it, otherwise the stand-in. */
export function mat(name: PlannedMaterial | MaterialName): MaterialName {
  if (available.has(name)) return name as MaterialName;
  return (PLANNED_MATERIALS as Record<string, MaterialName>)[name] ?? 'concrete';
}
