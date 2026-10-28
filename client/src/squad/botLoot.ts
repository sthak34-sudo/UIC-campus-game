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
  /** Bandages each bot starts with (same as the player: none). */
  startBandages: 0,
  /** Spare rounds each bot starts with on top of a full magazine (one spare magazine). */
  startReserve: 30,
  /** Calm bots top up when the magazine is at or below this share of a full one. */
  topUpShare: 0.5,
} as const;

/** Kinds bots go out of their way for. */
export const BOT_LOOT_KINDS: readonly LootKind[] = ['gun', 'ammo', 'bandage'];

export interface BotKit {
  rifles: number;
  /** Rounds in the rifle. */
  mag: number;
  /** Spare rounds (what ammo pickups add to). */
  ammo: number;
  bandages: number;
  /** Seconds left on a reload, or 0. */
  reloading: number;
}

/** A full magazine plus one spare, no bandages. */
export function starterKit(): BotKit {
  return { rifles: 1, mag: COMBAT.magSize, ammo: BOT_LOOT.startReserve, bandages: BOT_LOOT.startBandages, reloading: 0 };
}

/** Can pull the trigger: has a rifle, rounds in it, not reloading. */
export function botCanShoot(kit: BotKit): boolean {
  return kit.rifles > 0 && kit.mag > 0 && kit.reloading <= 0;
}

/** Out of rounds altogether (magazine and spares). */
export function botDry(kit: BotKit): boolean {
  return kit.mag <= 0 && kit.ammo <= 0;
}

export function spendRound(kit: BotKit): BotKit {
  return kit.mag > 0 ? { ...kit, mag: kit.mag - 1 } : kit;
}

/**
 * Start a reload when the magazine is empty (any time) or low (`calm` only), with spares left.
 * Same reload time as the player.
 */
export function maybeStartReload(kit: BotKit, calm: boolean): BotKit {
  if (kit.reloading > 0 || kit.rifles <= 0 || kit.ammo <= 0 || kit.mag >= COMBAT.magSize) return kit;
  const low = kit.mag <= COMBAT.magSize * BOT_LOOT.topUpShare;
  if (kit.mag <= 0 || (calm && low)) return { ...kit, reloading: COMBAT.reloadTime };
  return kit;
}

/** Tick a reload; when it lands, move spares into the magazine. `done` is true on that tick. */
export function stepBotReload(kit: BotKit, dt: number): { kit: BotKit; done: boolean } {
  if (kit.reloading <= 0) return { kit, done: false };
  const left = kit.reloading - dt;
  if (left > 0) return { kit: { ...kit, reloading: left }, done: false };
  const add = Math.min(COMBAT.magSize - kit.mag, kit.ammo);
  return { kit: { ...kit, mag: kit.mag + add, ammo: kit.ammo - add, reloading: 0 }, done: true };
}

export function botWants(kind: LootKind, kit: BotKit): boolean {
  if (!BOT_LOOT_KINDS.includes(kind)) return false;
  if (kind === 'bandage') return kit.bandages < COMBAT.bandageCap;
  return true;
}

export function grantBotLoot(kit: BotKit, kind: LootKind): BotKit {
  if (kind === 'bandage') return { ...kit, bandages: Math.min(COMBAT.bandageCap, kit.bandages + 1) };
  if (kind === 'gun') return kit.rifles > 0 ? { ...kit, ammo: kit.ammo + BOT_LOOT.ammoPerPickup } : { ...kit, rifles: 1, mag: COMBAT.magSize };
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
