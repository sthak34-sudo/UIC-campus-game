/**
 * Shared hit events. Owned by the Project Lead (core contract).
 *
 * - Anything that damages the PLAYER (bots, zone, falls, debug) calls `playerDamaged.emit(...)`.
 *   Combat reacts (flinch, hit sound, cancel healing), the HUD draws the direction indicator.
 * - The player's shots call `playerHitEnemy.emit(...)` so the HUD can show hitmarkers and kill confirms.
 * - Every player shot calls `playerFired.emit(...)` so bots can hear it.
 *
 * Every subscriber must keep the unsubscribe function `on()` returns and call it on dispose,
 * so "Play again" doesn't stack listeners.
 */
export type DamageSource = 'bot' | 'zone' | 'fall' | 'debug';

export interface PlayerDamagedEvent {
  /** Health + armor points actually lost. */
  amount: number;
  source: DamageSource;
  /** World position (three.js coords) of the attacker, when known. Used for the direction indicator. */
  from?: { x: number; y: number; z: number };
  /** True when this hit knocked the player down or killed them. */
  lethal?: boolean;
}

export type HitZone = 'head' | 'body' | 'limb';

export interface PlayerHitEnemyEvent {
  zone: HitZone;
  damage: number;
  /** True when this shot knocked down or killed the target. */
  killed: boolean;
  /** Meters from the muzzle to the target. */
  distance: number;
}

export class EventBus<T> {
  private listeners = new Set<(e: T) => void>();

  /** Subscribe. Returns the function that unsubscribes. */
  on(fn: (e: T) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  emit(e: T): void {
    for (const fn of [...this.listeners]) fn(e);
  }

  get count(): number {
    return this.listeners.size;
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const playerDamaged = new EventBus<PlayerDamagedEvent>();
export const playerHitEnemy = new EventBus<PlayerHitEnemyEvent>();

/** The player fired a shot from here (world position). Bots that hear it turn to look (AI-03). */
export interface PlayerFiredEvent {
  from: { x: number; y: number; z: number };
}
export const playerFired = new EventBus<PlayerFiredEvent>();
