/**
 * Play-again hook. main.ts registers an in-place restart; without one (or if it throws)
 * Play again falls back to reloading the page.
 */
type Handler = () => void | Promise<void>;
let handler: Handler | null = null;

export function setRestartHandler(fn: Handler | null): void {
  handler = fn;
}

/** Run the registered restart, or `fallback` (page reload) when none is set or it fails. */
export async function requestRestart(fallback: () => void = () => location.reload()): Promise<'restarted' | 'reloaded'> {
  if (!handler) {
    fallback();
    return 'reloaded';
  }
  try {
    await handler();
    return 'restarted';
  } catch (e) {
    console.error('[restart] in-place restart failed, reloading', e);
    fallback();
    return 'reloaded';
  }
}
