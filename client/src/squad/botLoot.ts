/**
 * What bots carry, when they go for loot, and when they bandage. Pure logic: the adapter asks
 * the combat loot field for nearby pickups and applies the results.
 */
import { COMBAT } from '../combat/balance';
import type { LootKind } from '../combat/inventory';

export const BOT_LOOT = {
  /** A bot walks to a pickup at most this far from it (m). */
  seekM: 12,
  /** Teammate bots don't loot farther than this from the leader, so they keep up (m). */
  leashM: 20,
  /** Close enough to pick it up (m). */
  reachM: 1.3,
  /** "Safe" = no foe seen for this long (s). */
  safeS: 5,
  /** Ammo a box (or a spare rifle) adds. */
  ammoPerPickup: 30,
  /** Teammate bots leave pickups this close to the human player for them (m). */
  leaveForPlayerM: 6,
  /** Bandages each bot starts with, so a revived teammate can patch up. */
  startBandages: 1,
} as const;

/** Kinds bots go out of their way for. */
export const BOT_LOOT_KINDS: readonly LootKind[] = ['gun', 'ammo', 'bandage'];

export interface BotKit {
  rifles: number;
  ammo: number;
  bandages: number;
}

export function starterKit(): BotKit {
  return { rifles: 1, ammo: 0, bandages: BOT_LOOT.startBandages };
}

export function botWants(kind: LootKind, kit: BotKit): boolean {
  if (!BOT_LOOT_KINDS.includes(kind)) return false;
  if (kind === 'bandage') return kit.bandages < COMBAT.bandageCap;
  return true;
}

export function grantBotLoot(kit: BotKit, kind: LootKind): BotKit {
  if (kind === 'bandage') return { ...kit, bandages: Math.min(COMBAT.bandageCap, kit.bandages + 1) };
  if (kind === 'gun') return kit.rifles > 0 ? { ...kit, ammo: kit.ammo + BOT_LOOT.ammoPerPickup } : { ...kit, rifles: 1 };
  if (kind === 'ammo') return { ...kit, ammo: kit.ammo + BOT_LOOT.ammoPerPickup };
  return kit;
}

/** Safe = alive and no foe seen for `safeS` seconds. */
export function botSafe(sinceFoeS: number): boolean {
  return sinceFoeS >= BOT_LOOT.safeS;
}

/** Bandage when hurt below the bandage cap, carrying one, and safe. */
export function shouldBandage(health: number, kit: BotKit, sinceFoeS: number): boolean {
  return kit.bandages > 0 && health < COMBAT.bandageMaxHealth && botSafe(sinceFoeS);
}

type XZ = { x: number; z: number };

/** May this bot walk to the pickup at `at`? Within seek range, and (for teammates) near the leader. */
export function lootInReach(bot: XZ, at: XZ, leader: XZ | null): boolean {
  if (Math.hypot(at.x - bot.x, at.z - bot.z) > BOT_LOOT.seekM) return false;
  if (leader && Math.hypot(at.x - leader.x, at.z - leader.z) > BOT_LOOT.leashM) return false;
  return true;
}

/**
 * Teammate bots leave the human's share: nothing within `leaveForPlayerM` of them, and no rifles
 * until the human has one. `human` is null for enemy bots.
 */
export function leaveForHuman(kind: LootKind, at: XZ, human: { pos: XZ; hasGun: boolean } | null): boolean {
  if (!human) return false;
  if (kind === 'gun' && !human.hasGun) return true;
  return Math.hypot(at.x - human.pos.x, at.z - human.pos.z) <= BOT_LOOT.leaveForPlayerM;
}

export function canGrab(bot: XZ, at: XZ): boolean {
  return Math.hypot(at.x - bot.x, at.z - bot.z) <= BOT_LOOT.reachM;
}
