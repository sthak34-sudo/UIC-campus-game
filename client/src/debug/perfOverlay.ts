import type * as THREE from 'three';
import { addFrame, emptyWindow, formatPerf, perfEnabled } from './perfStats';

export interface PerfOverlay {
  /** Call right before rendering the frame. */
  begin(): void;
  /** Call right after rendering the frame. */
  end(): void;
}

const NOOP: PerfOverlay = { begin() {}, end() {} };

/** Returns a no-op unless the URL has ?debug=perf, so it costs nothing in normal play. */
export function createPerfOverlay(renderer: THREE.WebGLRenderer, search = location.search): PerfOverlay {
  if (!perfEnabled(search)) return NOOP;
  // Count every pass in the frame (shadows, post effects), not just the last one.
  renderer.info.autoReset = false;
  const el = document.createElement('pre');
  el.id = 'perf-overlay';
  // Top-right, directly under the minimap and zone timers when they exist, so it never covers
  // other HUD text (help bar, F3 debug line, click-to-play prompt) at any window size.
  const anchor = document.getElementById('zone-hud');
  el.style.cssText =
    'margin:0;padding:6px 10px;z-index:9999;background:#0b0f14;border:1px solid #2f3b48;border-radius:4px;' +
    'color:#7fff7f;font:12px/1.35 ui-monospace,monospace;text-align:left;text-shadow:none;pointer-events:none;white-space:pre;' +
    (anchor ? 'position:absolute;top:100%;right:0;margin-top:8px;' : 'position:fixed;top:12px;right:12px;');
  el.textContent = 'measuring…';
  (anchor ?? document.body).appendChild(el);
  let w = emptyWindow();
  let last = -1;
  return {
    begin() {
      renderer.info.reset();
    },
    end() {
      const now = performance.now();
      if (last >= 0) {
        const r = addFrame(w, now - last);
        w = r.w;
        if (r.report) el.textContent = formatPerf(r.report, renderer.info.render.calls, renderer.info.render.triangles);
      }
      last = now;
    },
  };
}
