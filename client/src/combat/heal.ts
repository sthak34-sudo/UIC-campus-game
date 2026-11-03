/**
 * Channelled healing (bandages and med kits). Pure: the caller ticks it with dt and applies the
 * result. Bullet hits, firing, sprinting, jumping and getting downed cancel the channel and keep
 * the item; zone damage does not (CMB-01, CMB-07). You cannot heal and reload at the same time.
 */
import { COMBAT } from './balance';

export type HealItem = 'bandage' | 'medkit';

export interface HealChannel {
  item: HealItem;
  /** Seconds left before the heal lands. */
  left: number;
}

export function healSpec(item: HealItem): { channel: number; amount: number; cap: number } {
  return item === 'bandage'
    ? { channel: COMBAT.bandageChannel, amount: COMBAT.bandageHeal, cap: COMBAT.bandageMaxHealth }
    : { channel: COMBAT.medkitChannel, amount: COMBAT.medkitHeal, cap: COMBAT.maxHealth };
}

/** Why an item can't be used right now, or null when it can. */
export function healBlocked(item: HealItem, health: number, count: number): string | null {
  const name = item === 'bandage' ? 'bandage' : 'med kit';
  if (count <= 0) return `No ${name}`;
  const { cap } = healSpec(item);
  if (health >= cap) return item === 'bandage' ? `Bandages only heal to ${cap}` : 'Already at full health';
  return null;
}

export function startHeal(item: HealItem): HealChannel {
  return { item, left: healSpec(item).channel };
}

/** Advance the channel. `done` is true on the tick it finishes. */
export function stepHeal(ch: HealChannel, dt: number): { channel: HealChannel | null; done: boolean } {
  const left = ch.left - dt;
  if (left <= 0) return { channel: null, done: true };
  return { channel: { ...ch, left }, done: false };
}

/** Health points a finished channel restores (respecting the item's cap). */
export function healAmount(item: HealItem, health: number, maxHealth: number): number {
  const { amount, cap } = healSpec(item);
  const ceiling = Math.min(cap, maxHealth);
  return Math.max(0, Math.min(amount, ceiling - health));
}

export function channelLabel(ch: HealChannel): string {
  return `${ch.item === 'bandage' ? 'Bandaging' : 'Using med kit'}… ${ch.left.toFixed(1)}s`;
}

/** Things you do that stop a heal (CMB-07). Bullet hits are in `damageReaction`. */
export type HealInterrupt = 'fire' | 'sprint' | 'jump';

export function healInterruptHint(why: HealInterrupt): string {
  return why === 'fire' ? 'Healing cancelled' : why === 'sprint' ? 'Healing cancelled: sprinting' : 'Healing cancelled: jumped';
}

/** Why R does nothing while healing, or null. */
export function reloadBlockedByHeal(healing: boolean): string | null {
  return healing ? "Can't reload while healing" : null;
}

/** Why Q / B does nothing while reloading, or null. */
export function healBlockedByReload(reloading: boolean): string | null {
  return reloading ? "Can't heal while reloading" : null;
}
