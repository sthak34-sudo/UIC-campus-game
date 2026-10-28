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
  el.style.cssText =
    'position:fixed;top:250px;right:8px;margin:0;padding:6px 10px;z-index:9999;' +
    'background:rgba(0,0,0,.65);color:#7fff7f;font:12px/1.35 ui-monospace,monospace;pointer-events:none;white-space:pre';
  el.textContent = 'measuring…';
  document.body.appendChild(el);
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
