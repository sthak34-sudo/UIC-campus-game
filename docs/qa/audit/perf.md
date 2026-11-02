# Performance audit (round 1)

Auditor: Performance Engineer. Date: 2026-11-02. Branch `claude/uic-campus-game-plan-btnm3c` (= main at 9c65098). Audit only, no code changed.

Status: IN PROGRESS. Findings are appended as they are verified (so a usage limit cannot lose them). The summary and the measured-numbers table are filled in at the end.

## How this was measured

- Production build (`vite build`, 12 s) served by `vite preview` on 127.0.0.1:5306, driven by headless Chromium (software WebGL / SwiftShader) with a CDP probe (`scratchpad/probe/probe.mjs`, not committed). Raw data: `screenshots/tmp/audit/perf/*.json` (gitignored).
- This machine has 4 CPUs shared with seven other auditors (load average 30+ during the first run), and no GPU. Absolute FPS and absolute stage times here are NOT representative. Counts (draw calls, triangles, textures, bytes) are exact and device-independent. Relative costs and main-thread JS cost are indicative.
- Auto quality on this box resolves to `low` (SwiftShader matches the weak-renderer regex), so any `medium` numbers are forced with `?quality=medium`. A real student laptop (Intel UHD 620 / Iris Xe) would resolve to `medium` (see PERF-05).

## Findings

(appended below as verified)

