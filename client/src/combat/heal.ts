/**
 * Channelled healing (bandages and med kits). Pure: the caller ticks it with dt and applies the
 * result. Taking damage, firing, or getting downed cancels the channel and keeps the item.
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
