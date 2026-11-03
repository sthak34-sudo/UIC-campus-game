/**
 * Tunable combat numbers. Pure data: no rendering, no physics.
 * Milestone 5's server should import this same table so practice and online matches match.
 * Distances are meters. Times are seconds.
 */

export const COMBAT = {
  maxHealth: 100,
  /** Practice dummies use the same health pool as a player. */
  dummyHealth: 100,
  /** Damage of one body shot at point-blank, before armor. M416-like (CMB-06). */
  baseDamage: 41,
  /** Headshots multiply damage by this (PUBG-like, CMB-06). */
  headshotMultiplier: 2.1,
  /** Arm and leg hits multiply damage by this. */
  limbMultiplier: 0.9,
  /** Inside this range, shots do full damage. */
  falloffStart: 60,
  /** At and beyond this range, shots do `falloffMin` times damage. */
  falloffEnd: 300,
  falloffMin: 0.8,
  /**
   * Fraction of a body hit that armor (a vest) soaks, capped by the armor points you have left.
   * The rest reaches health. Soaked points are removed from armor. Head and limb hits skip
   * the vest (a helmet is a later item).
   */
  armorMitigation: 0.4,
  armorCap: 100,
  armorPickup: 50,
  /** Seconds between shots (~667 RPM, full-auto while the trigger is held). Extra clicks in this window do nothing. */
  fireInterval: 0.09,
  magSize: 30,
  startingReserve: 60,
  ammoPickup: 30,
  reserveCap: 180,
  reloadTime: 1.7,
  /** Med kit heals to full (PUBG: +100 over 8 s, CMB-07). */
  medkitHeal: 100,
  medkitCap: 3,
  /** Bandage: heals this much after a short channel, but never above `bandageMaxHealth`. */
  bandageHeal: 10,
  bandageChannel: 4,
  bandageMaxHealth: 75,
  bandageCap: 10,
  /** Med kit: channelled too, so healing mid-fight is a risk. */
  medkitChannel: 8,
  /** Temporary H-key damage. Ignores armor so the death screen is easy to reach. */
  debugHurt: 25,
  /** Seconds a dummy stays down before standing up. */
  dummyRespawn: 5,
  /** Horizontal meters within which E picks up loot. */
  pickupRange: 2.4,
  /** How long a taken crate stays gone, so the range can be tried again. */
  lootRespawn: 15,
  /** Hitscan length. */
  maxRange: 300,
} as const;

/**
 * Gun feel: recoil, spread and bloom (CMB-02, CMB-03). Angles are degrees; the spread values are
 * half-angles of the cone a shot can leave in. Starting numbers from the combat audit, tune by feel.
 */
export const GUN_FEEL = {
  /** Upward kick per shot, hip fire and aiming down sights. */
  recoilPitchHip: 0.45,
  recoilPitchAds: 0.3,
  /** Random sideways kick per shot, plus or minus this. */
  recoilYaw: 0.15,
  /** Degrees per second the view drifts back to the aim point once you stop shooting. */
  recoilRecovery: 6,
  /** Seconds after a shot before recovery starts, so a spray climbs. */
  recoilRecoveryDelay: 0.12,
  /** Most recoil that can pile up (degrees). */
  recoilMax: 15,
  spreadStand: 1.2,
  spreadCrouch: 0.8,
  /** Added at full jog speed (`spreadMoveFullSpeed`), scaled down when moving slower. */
  spreadMove: 1.0,
  spreadMoveFullSpeed: 3,
  /** Below this speed (m/s) you count as standing still. */
  spreadMoveMinSpeed: 0.3,
  spreadAir: 2.5,
  /** Aiming down sights multiplies the whole cone. */
  spreadAdsMult: 0.25,
  /** Each shot widens the cone by this much... */
  bloomPerShot: 0.1,
  /** ...and the extra shrinks with this time constant (seconds). */
  bloomDecay: 0.3,
  bloomMax: 1.5,
} as const;
