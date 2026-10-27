/**
 * Boot stage timings (ms since navigation start). Cheap, prod-safe, read-only once published.
 * `mark('campus')` records how long the stage that just finished took and when it ended.
 */
export interface BootStage { name: string; ms: number; at: number }
const stages: BootStage[] = [];
let last = performance.now();

export function mark(name: string): void {
  const now = performance.now();
  stages.push({ name, ms: Math.round(now - last), at: Math.round(now) });
  last = now;
}

export function bootStages(): readonly BootStage[] {
  return stages.map((s) => ({ ...s }));
}

export interface UicStatus {
  readonly ready: true; readonly bootMs: number; readonly readyMs: number; readonly quality: string;
  readonly stages: readonly BootStage[]; readonly reason: 'frames' | 'fallback';
}

/**
 * Publishes `__uicReady` and a frozen `__uicStatus` once, as non-writable, non-configurable
 * properties. Production-safe: read-only status, no setters, no cheats. Returns false if already set.
 */
export function publishReady(target: object, info: { bootMs: number; quality: string; reason: UicStatus['reason'] }, now = performance.now()): boolean {
  if ((target as { __uicReady?: boolean }).__uicReady) return false;
  const frozen = Object.freeze(bootStages().map((st) => Object.freeze(st)));
  const status: UicStatus = Object.freeze({ ready: true as const, bootMs: info.bootMs, readyMs: Math.round(now), quality: info.quality, stages: frozen, reason: info.reason });
  Object.defineProperty(target, '__uicStatus', { value: status, writable: false, configurable: false, enumerable: false });
  Object.defineProperty(target, '__uicReady', { value: true, writable: false, configurable: false, enumerable: false });
  console.info(`[boot] ready ${status.readyMs} ms ${frozen.map((st) => `${st.name}=${st.ms}`).join(' ')}`);
  return true;
}
