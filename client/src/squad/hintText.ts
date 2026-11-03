/**
 * Bottom-left squad key hint (UI-09) and kill-feed placement (UI-17). Pure.
 */

export interface HintInput {
  debug: boolean;
  bleedFast?: boolean;
  enemySquads?: number;
  pings?: number;
  spectating?: string | null;
}

/** Public builds: just the two squad keys. Counters and cheat keys only with ?debug. */
export function squadHintText(s: HintInput): string {
  if (!s.debug) return 'P ping · hold F revive';
  return 'K knock/finish you · J knock Bot1 · L heal · P ping · hold F revive · O wipe' +
    (s.bleedFast ? ' · bleedFast' : '') +
    (s.enemySquads ? ` · enemy×${s.enemySquads}` : '') +
    (s.pings ? ` · ping×${s.pings}` : '') +
    (s.spectating ? ` · spectate ${s.spectating}` : '');
}

export const FEED_FALLBACK_TOP_PX = 200;
export const FEED_GAP_PX = 8;

/**
 * Kill-feed top, in px inside the squad HUD root: just under the zone HUD's measured bottom,
 * never above the old 200 px spot, so the feed can't print over the zone timer.
 */
export function feedTopPx(zoneBottom: number | null, rootTop: number): number {
  if (zoneBottom == null || !Number.isFinite(zoneBottom)) return FEED_FALLBACK_TOP_PX;
  return Math.max(FEED_FALLBACK_TOP_PX, Math.ceil(zoneBottom - rootTop + FEED_GAP_PX));
}
