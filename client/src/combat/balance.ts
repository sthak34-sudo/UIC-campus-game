/**
 * Tunable combat numbers. Pure data: no rendering, no physics.
 * Milestone 5's server should import this same table so practice and online matches match.
 * Distances are meters. Times are seconds.
 */

export const COMBAT = {
  maxHealth: 100,
  /** Practice dummies use the same health pool as a player. */
  dummyHealth: 100,
  /** Damage of one body shot at point-blank, before armor. */
  baseDamage: 28,
  /** Headshots multiply damage by this. Locked at 2 for Milestone 1. */
  headshotMultiplier: 2,
  /** Inside this range, shots do full damage. */
  falloffStart: 20,
  /** At and beyond this range, shots do `falloffMin` times damage. */
  falloffEnd: 70,
  falloffMin: 0.5,
  /**
   * Fraction of a hit that armor soaks, capped by the armor points you have left.
   * The rest reaches health. Soaked points are removed from armor.
   */
  armorMitigation: 0.5,
  armorCap: 100,
  armorPickup: 50,
  /** Seconds between shots. Extra clicks during this window do nothing. */
  fireInterval: 0.15,
  magSize: 30,
  startingReserve: 60,
  ammoPickup: 30,
  reserveCap: 180,
  reloadTime: 1.7,
  medkitHeal: 50,
  medkitCap: 3,
  /** Temporary H-key damage. Ignores armor so the death screen is easy to reach. */
  debugHurt: 25,
  /** Seconds a dummy stays down before standing up. */
  dummyRespawn: 5,
  /** Horizontal meters within which E picks up loot. */
  pickupRange: 2.4,
  /** How long a taken crate stays gone, so the range can be tried again. */
  lootRespawn: 15,
  /** Hitscan length. */
  maxRange: 150,
} as const;
