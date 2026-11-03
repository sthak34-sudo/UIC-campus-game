/**
 * What taking damage does besides lowering health, by where it came from. Pure, no DOM.
 * CMB-01: the zone ticks every frame, so it must not kick the camera or cancel a heal.
 */

/** 'bullet' is a real shot, 'debug' the H key, 'zone' the blue-zone tick. */
export type DamageSource = 'bullet' | 'debug' | 'zone';

export interface DamageReaction {
  /** Camera kick and the flinch animation. */
  flinch: boolean;
  /** Stop an active bandage / med kit channel. */
  cancelHeal: boolean;
}

export function damageReaction(source: DamageSource): DamageReaction {
  if (source === 'zone') return { flinch: false, cancelHeal: false };
  return { flinch: true, cancelHeal: true };
}

/** Seconds between red edge pulses while the zone keeps hurting you. */
export const ZONE_PULSE_EVERY = 1;

/**
 * Zone pulse timer. Pulses on the first tick of damage, then at most once per `ZONE_PULSE_EVERY`
 * while damage continues. `cooldown` is seconds until the next pulse is allowed.
 */
export function zonePulseStep(cooldown: number, dt: number, damaged: boolean): { cooldown: number; pulse: boolean } {
  const c = Math.max(0, cooldown - dt);
  if (!damaged || c > 0) return { cooldown: c, pulse: false };
  return { cooldown: ZONE_PULSE_EVERY, pulse: true };
}
