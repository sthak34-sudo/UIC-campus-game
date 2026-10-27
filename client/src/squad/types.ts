/**
 * Squad match types. Plain serializable objects so a server can snapshot them.
 * No three.js, no Rapier, no DOM.
 */
import type { Combatant } from '../combat/health';

export type PlayerId = string;
export type SquadId = string;
export type LifeState = 'alive' | 'downed' | 'dead';

export interface ReviveAction {
  reviver: PlayerId;
  startedAt: number;
}

export interface SquadMember {
  id: PlayerId;
  squad: SquadId;
  /** Color / HUD order within the squad. */
  slot: 0 | 1 | 2 | 3;
  name: string;
  isBot: boolean;
  life: LifeState;
  combatant: Combatant;
  /** Knock health. Starts at DOWN.hp when downed; enemies can finish you by draining it. */
  downHp: number;
  /** Match clock seconds when knocked, or null. */
  downedAt: number | null;
  /** Each knock shortens bleed-out. Not reset on revive. */
  timesDowned: number;
  /** Set on the DOWNED player while a revive is in progress. */
  reviving: ReviveAction | null;
  pos: { x: number; y: number; z: number };
  killedBy: PlayerId | null;
}

export interface Squad {
  id: SquadId;
  members: PlayerId[];
  eliminated: boolean;
  placement: number | null;
}

export interface SquadMatchState {
  t: number;
  seed: number;
  members: Record<PlayerId, SquadMember>;
  squads: Record<SquadId, Squad>;
  squadsAlive: number;
}

export type SquadEvent =
  | { type: 'downed'; id: PlayerId; by: PlayerId | null }
  | { type: 'killed'; id: PlayerId; by: PlayerId | null }
  | { type: 'revived'; id: PlayerId; by: PlayerId }
  | { type: 'reviveCancelled'; id: PlayerId; reason: string }
  | { type: 'squadWiped'; squad: SquadId; placement: number }
  | { type: 'matchWon'; squad: SquadId };
