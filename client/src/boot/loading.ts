/**
 * Boot loading UI: stage names, progress, timeout error screen.
 * Keeps the spinner honest so a long first load does not look hung.
 */

const LOAD_TIMEOUT_MS = 90_000;

let stageEl: HTMLElement | null = null;
let barEl: HTMLElement | null = null;
let timedOut = false;
let timeoutId: ReturnType<typeof setTimeout> | null = null;
let startedAt = 0;

export function initLoadingUi(): void {
  const root = document.getElementById('loading');
  if (!root) return;
  startedAt = performance.now();
  timedOut = false;
  root.innerHTML =
    '<div id="loading-stage">Starting…</div>' +
    '<div id="loading-bar"><div id="loading-bar-fill"></div></div>' +
    '<div id="loading-hint">First load pulls the campus map and physics. Hang tight.</div>';
  stageEl = document.getElementById('loading-stage');
  barEl = document.getElementById('loading-bar-fill');
  setLoadProgress(0.02, 'Starting…');
  timeoutId = setTimeout(() => {
    timedOut = true;
    failLoading(
      'Load timed out. Try ?quality=low or refresh. If it keeps failing, the GPU may be too busy.',
    );
  }, LOAD_TIMEOUT_MS);
}

export function setLoadProgress(fraction: number, label: string): void {
  if (timedOut) return;
  const f = Math.min(1, Math.max(0, fraction));
  if (stageEl) stageEl.textContent = label;
  if (barEl) barEl.style.width = `${Math.round(f * 100)}%`;
  const root = document.getElementById('loading');
  if (root) root.dataset.stage = label;
}

export function clearLoadingUi(): void {
  if (timeoutId != null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  document.getElementById('loading')?.remove();
}

export function failLoading(message: string): void {
  if (timeoutId != null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  const root = document.getElementById('loading');
  if (!root) return;
  root.classList.add('loading-error');
  root.innerHTML =
    `<div id="loading-stage">Could not start</div>` +
    `<div id="loading-hint">${escapeHtml(message)}</div>` +
    `<button type="button" id="loading-retry">Retry</button>`;
  document.getElementById('loading-retry')?.addEventListener('click', () => location.reload());
}

export function loadElapsedMs(): number {
  return startedAt ? performance.now() - startedAt : 0;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Yield to the browser so the loading UI can paint during heavy sync work. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}
