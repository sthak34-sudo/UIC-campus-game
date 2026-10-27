/**
 * Tunable squad numbers. Pure data: no rendering, no physics.
 * A future server should import this same table.
 */
export const DOWN = {
  /** Knock health. Enemies finish you by draining this to 0. */
  hp: 100,
  /** downHp lost per second at the first knock (100 s baseline). */
  bleedPerSec: 1.0,
  /** 2nd knock bleeds 1.5x faster, 3rd 2.25x, and so on. */
  bleedMultPerKnock: 1.5,
  /** Crawl speed while downed (m/s). */
  crawlSpeed: 0.9,
  reviveSeconds: 6,
  /** Horizontal revive range (m). */
  reviveRange: 1.8,
  /** Health after being picked up. Armor is kept. */
  reviveHealth: 20,
  /** Zone hurts downHp at this multiple of the normal zone rate. */
  zoneDamageMult: 1.0,
} as const;

export const SQUAD_SIZE = 4;

/** Future hardcore mode. Off means same-squad bullets, melee and grenades deal no damage. */
export const FRIENDLY_FIRE = false;
