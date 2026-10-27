/**
 * Offline match roster helpers (S5). Pure: no three.js / Rapier / DOM.
 */
import { SQUAD_SIZE } from './balance';
import type { SquadSpec } from './roster';

const ENEMY_NAMES = ['Rex', 'Nova', 'Volt', 'Knox', 'Rae', 'Vex', 'Jax', 'Nyx'];

/**
 * Build the offline roster: squad A is the local player + 3 bots; then N enemy
 * bot squads (B, C, ...) of SQUAD_SIZE. Clamps N to 0..4.
 */
export function offlineRoster(enemySquads: number): SquadSpec[] {
  const n = Math.max(0, Math.min(4, Math.floor(enemySquads)));
  const specs: SquadSpec[] = [
    { id: 'A', names: ['You', 'Bot1', 'Bot2', 'Bot3'], bots: [false, true, true, true] },
  ];
  for (let i = 0; i < n; i++) {
    const id = String.fromCharCode(66 + i); // B, C, D, ...
    const names: string[] = [];
    const bots: boolean[] = [];
    for (let s = 0; s < SQUAD_SIZE; s++) {
      names.push(ENEMY_NAMES[(i * SQUAD_SIZE + s) % ENEMY_NAMES.length]!);
      bots.push(true);
    }
    specs.push({ id, names, bots });
  }
  return specs;
}

/** Placement line for the local player's squad (or null if still alive). */
export function localPlacementLine(
  placement: number | null,
  squadsAlive: number,
  won: boolean,
): string | null {
  if (won) return 'Victory! Your squad wins.';
  if (placement == null) return null;
  const suffix = placement === 1 ? 'st' : placement === 2 ? 'nd' : placement === 3 ? 'rd' : 'th';
  return `#${placement}${suffix} place · ${squadsAlive} squad${squadsAlive === 1 ? '' : 's'} still alive`;
}
