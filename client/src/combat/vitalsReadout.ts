/**
 * What the bottom-left health line says (QA-07). Pure: no DOM.
 * While knocked, the bar shows knock health (the bleed-out timer) instead of a misleading
 * "Health 0", in the same words as the downed banner.
 */
export interface VitalsReadout {
  /** Bar fill 0..1. */
  fill: number;
  color: string;
  text: string;
}

export const HEALTH_COLOR = '#d24b4b';
export const KNOCK_COLOR = '#ff8a3d';

export function vitalsReadout(s: {
  health: number; maxHealth: number; armor: number; knock?: { hp: number; max: number } | null;
}): VitalsReadout {
  if (s.knock) {
    const fill = s.knock.max <= 0 ? 0 : Math.max(0, Math.min(1, s.knock.hp / s.knock.max));
    return { fill, color: KNOCK_COLOR, text: `Knocked down · ${Math.round(fill * 100)}% before bleed-out` };
  }
  const fill = s.maxHealth <= 0 ? 0 : Math.max(0, Math.min(1, s.health / s.maxHealth));
  return { fill, color: HEALTH_COLOR, text: `Health ${Math.ceil(s.health)}    Armor ${Math.ceil(s.armor)}` };
}
