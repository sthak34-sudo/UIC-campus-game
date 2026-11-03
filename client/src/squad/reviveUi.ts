/**
 * Revive / downed status line for the local player (UI-01, UI-02). Pure: no DOM.
 */
import { DOWN } from './balance';
import { canRevive, horizontalDistance } from './revive';
import type { PlayerId, SquadMatchState } from './types';

export type ReviveStatusKind = 'prompt' | 'reviving' | 'beingRevived' | 'downed';

export interface ReviveStatus {
  kind: ReviveStatusKind;
  text: string;
  /** 0..1 bar fill: revive progress, or bleed-out left while downed. */
  bar: number | null;
}

function name(state: SquadMatchState, id: PlayerId): string {
  return state.members[id]?.name ?? id;
}

function progress(state: SquadMatchState, startedAt: number): number {
  return Math.max(0, Math.min(1, (state.t - startedAt) / DOWN.reviveSeconds));
}

export function reviveStatus(state: SquadMatchState, localId: PlayerId): ReviveStatus | null {
  const me = state.members[localId];
  if (!me) return null;
  if (me.life === 'downed') {
    if (me.reviving) {
      return { kind: 'beingRevived', text: `Being revived by ${name(state, me.reviving.reviver)}`, bar: progress(state, me.reviving.startedAt) };
    }
    return {
      kind: 'downed',
      text: 'You are down. Crawl to cover, wait for a teammate',
      bar: Math.max(0, Math.min(1, me.downHp / DOWN.hp)),
    };
  }
  if (me.life !== 'alive') return null;
  let near: { id: PlayerId; d: number } | null = null;
  for (const m of Object.values(state.members)) {
    if (m.id === localId || m.life !== 'downed') continue;
    if (m.reviving?.reviver === localId) {
      return { kind: 'reviving', text: `Reviving ${m.name}`, bar: progress(state, m.reviving.startedAt) };
    }
    if (!canRevive(state, localId, m.id)) continue;
    const d = horizontalDistance(me, m);
    if (!near || d < near.d) near = { id: m.id, d };
  }
  if (near) return { kind: 'prompt', text: `Hold F to revive ${name(state, near.id)}`, bar: null };
  return null;
}
