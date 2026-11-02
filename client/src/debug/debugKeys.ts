/**
 * Cheat / test keys (K knock or finish yourself, J knock Bot1, L heal, O wipe squad,
 * H hurt, Z skip zone). Off in real games: only with bare ?debug or ?debug=cheats (also inside a
 * comma list, e.g. ?debug=perf,cheats), or in a dev build. ?debug=perf alone shows the perf panel only.
 */
export const DEBUG_KEYS: ReadonlySet<string> = new Set(['KeyK', 'KeyJ', 'KeyL', 'KeyO', 'KeyH', 'KeyZ']);

export function debugKeysEnabled(search: string, devBuild: boolean = import.meta.env.DEV): boolean {
  if (devBuild) return true;
  return new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
    .getAll('debug')
    .some((v) => v === '' || v.split(',').includes('cheats'));
}

/** True when this key press should run (non-debug keys always pass). */
export function allowKey(code: string, enabled: boolean): boolean {
  return enabled || !DEBUG_KEYS.has(code);
}

/** Help-bar text without the debug entries when they're off. */
export function helpText(full: string, enabled: boolean): string {
  if (enabled) return full;
  return full.split(' · ').filter((s) => !/^(H hurt|Z skip zone)/.test(s)).join(' · ');
}
