/**
 * Pure bot decisions (design §5). Physics and raycasts live in the adapter.
 * No three.js, no Rapier, no DOM.
 */
import { DOWN } from './balance';
import { canRevive, horizontalDistance } from './revive';
import { teammates } from './roster';
import type { PlayerId, SquadMatchState } from './types';

export type BotAction =
  | { type: 'idle' }
  | { type: 'follow'; target: PlayerId; spacing: number }
  | { type: 'revive'; target: PlayerId }
  | { type: 'moveTo'; x: number; z: number }
  | { type: 'shoot'; target: PlayerId };

export interface BotWorldView {
  /** Leader (usually the human) the bots follow. */
  leaderId: PlayerId;
  /** True when this bot can see an enemy right now (adapter raycast). */
  enemyVisible: boolean;
  /** Nearest visible enemy id, if any. */
  nearestEnemyId: PlayerId | null;
  /** True when the bot is outside the safe zone. */
  inZoneDanger: boolean;
  /** Safe-zone center in world XZ. */
  zoneCenter: { x: number; z: number };
}

const REVIVE_SEEK_M = 40;
const FOLLOW_SPACING = 6;

/**
 * Priority: revive nearby downed mate (no enemy visible) -> zone safety -> follow leader -> shoot.
 */
export function botIntent(
  state: SquadMatchState,
  botId: PlayerId,
  world: BotWorldView,
): BotAction {
  const bot = state.members[botId];
  if (!bot || bot.life !== 'alive') return { type: 'idle' };

  if (!world.enemyVisible) {
    let best: PlayerId | null = null;
    let bestDist = REVIVE_SEEK_M;
    for (const mate of teammates(state, botId)) {
      if (mate.life !== 'downed') continue;
      const d = horizontalDistance(bot, mate);
      if (d <= bestDist && canRevive(state, botId, mate.id)) {
        best = mate.id;
        bestDist = d;
      } else if (d <= REVIVE_SEEK_M && mate.life === 'downed' && !best) {
        // Walk toward a downed mate even if not yet in revive range.
        best = mate.id;
        bestDist = d;
      }
    }
    if (best) {
      const target = state.members[best]!;
      if (canRevive(state, botId, best)) return { type: 'revive', target: best };
      return { type: 'moveTo', x: target.pos.x, z: target.pos.z };
    }
  }

  if (world.inZoneDanger) {
    return { type: 'moveTo', x: world.zoneCenter.x, z: world.zoneCenter.z };
  }

  if (world.enemyVisible && world.nearestEnemyId) {
    return { type: 'shoot', target: world.nearestEnemyId };
  }

  const leader = state.members[world.leaderId];
  if (leader && leader.life !== 'dead') {
    return { type: 'follow', target: world.leaderId, spacing: FOLLOW_SPACING };
  }

  return { type: 'idle' };
}

/** Horizontal crawl/follow step used by the adapter. Pure helper for tests. */
export function stepToward(
  from: { x: number; z: number },
  to: { x: number; z: number },
  speed: number,
  dt: number,
  stopAt = 0,
): { x: number; z: number; moved: boolean } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= stopAt || speed <= 0 || dt <= 0) return { x: from.x, z: from.z, moved: false };
  const step = Math.min(speed * dt, Math.max(0, dist - stopAt));
  const k = step / dist;
  return { x: from.x + dx * k, z: from.z + dz * k, moved: step > 1e-6 };
}

export const BOT_FOLLOW_SPACING = FOLLOW_SPACING;
export const BOT_REVIVE_SEEK_M = REVIVE_SEEK_M;
export { DOWN };
