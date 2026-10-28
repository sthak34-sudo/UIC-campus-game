/**
 * Boot warm-up helpers: start late-boot chunk downloads early, and precompile shaders
 * behind the loading screen (capped) so the first visible frame does not freeze the page.
 */

/** Longest we hold the loading screen for shader warm-up before showing the game anyway. */
export const SHADER_WARM_CAP_MS = 8_000;

/** Resolves 'done' when `p` settles (either way) or 'timeout' after `ms`. Never rejects. */
export function withTimeout(p: Promise<unknown>, ms: number): Promise<'done' | 'timeout'> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve('timeout'), ms);
    p.then(
      () => {
        clearTimeout(t);
        resolve('done');
      },
      () => {
        clearTimeout(t);
        resolve('done');
      },
    );
  });
}

/** Kick off downloads/parsing of the combat, zone and squad chunks; await later. */
export function prefetchLateChunks() {
  const combat = import('../combat');
  const zone = import('../zone');
  const squad = import('../squad/adapter');
  // Avoid unhandled-rejection noise; the real await site reports errors.
  for (const p of [combat, zone, squad]) p.catch(() => {});
  return { combat, zone, squad };
}
