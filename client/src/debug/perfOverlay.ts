import type * as THREE from 'three';
import { addFrame, emptyWindow, formatPerf, perfEnabled, perfPanelPlacement } from './perfStats';

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
  // Top-right, right-aligned under the minimap + zone timers (looked up each update, so it
  // survives the zone HUD being rebuilt on Play again), scaled down on narrow screens so it
  // never covers the help bar, squad list or click-to-play prompt.
  el.style.cssText =
    'position:fixed;margin:0;padding:6px 10px;z-index:9999;background:#0b0f14;border:1px solid #2f3b48;border-radius:4px;' +
    'color:#7fff7f;font:12px/1.35 ui-monospace,monospace;text-align:left;text-shadow:none;pointer-events:none;white-space:pre;' +
    'transform-origin:top right;top:12px;right:12px;';
  el.textContent = 'measuring…';
  document.body.appendChild(el);
  const place = () => {
    const anchor = document.getElementById('zone-hud');
    const p = perfPanelPlacement(anchor ? anchor.getBoundingClientRect() : null, innerWidth, el.offsetWidth);
    el.style.top = `${p.top}px`;
    el.style.right = `${p.right}px`;
    el.style.transform = p.scale < 1 ? `scale(${p.scale})` : '';
  };
  place();
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
        if (r.report) {
          el.textContent = formatPerf(r.report, renderer.info.render.calls, renderer.info.render.triangles);
          place();
        }
      }
      last = now;
    },
  };
}
