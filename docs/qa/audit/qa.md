# QA & Playtest audit, round 1 (Stability and bugs)

Status: IN PROGRESS. Findings are appended as they are verified. Audit only, no code changed.
Date: 2026-11-02. Branch: claude/uic-campus-game-plan-btnm3c (9c65098).
Environment: 4 CPUs shared with 7 other auditors, headless Chromium, software WebGL (quality auto-picked "low"), so FPS and boot times in this report are NOT representative of a student laptop.

## Checks that passed (verified)

| Check | Result |
|---|---|
| `npm test` | 84 files, 566 tests, all pass (82 s while the machine was loaded) |
| `npm run typecheck` | clean (5 s) |
| Daley Library: 3 outside doors, walk in 4-4.4 m and back out | pass |
| University Hall: 2 lobby doors, walk in 3.5 m and back out | pass |
| Daley staircase: all 6 flights, ground floor to 13.5 m | all climbable |
| Atlas glb stair colliders (SCE, Douglass, Grant, Lincoln, ADS) | 6 of 7 climbable (see QA-03) |
| Atlas glb roofs (25 roof boxes across 8 buildings) | all can be stood on and walked on; none fell through |

## Findings

| ID | Sev | Title | Evidence | Suggested fix | Effort | Owner |
|---|---|---|---|---|---|---|
| QA-01 | P2 | "Survived" time on the end screen includes the loading screen and the "Click to play" wait | Code: `newStats(performance.now() / 1000)` runs when the match is mounted (`squad/adapter.ts:~411`, `combat/index.ts:~160`), which happens during boot, before the first frame is drawn. Measured with `?squad=bots&zoneFast=1`: the match was over about 100 game-seconds after the player could move, but the end screen said "SURVIVED 15:53" (the clock had been running through the 228 s software-render boot, time-warped x4). On a real laptop the error is the boot time (10-30 s) plus however long the player takes to click. Play again is correct because the remount happens when the player is already in. | Start the stats clock on the first frame the player can move (or when pointer lock is first taken), not at mount. Add a unit test for `newStats` start. | S | Gameplay & Combat Designer (`match/**`, `squad/` wiring) |
| QA-02 | P2 | Cheat and debug hooks are live in the public build | `zone/index.ts:219` sets `window.__zone` (`getState()` and `skip()`) with no dev/debug gate, so in the deployed game `__zone.skip()` in the console skips the zone timer (the Z key is gated, this is not). `render/renderer.ts:463` sets `window.__gfx` (renderer, scene, lighting) unconditionally. `player/index.ts:429` exposes the full `__player` API (teleport, setInput, physics rays) whenever the address has `?test`, on the live site as well as dev. `main.ts` also publishes `__restarts` and `__leakCounts`. `core/bootTimings.ts` and `tools/playtest/playtest.mjs` both say live builds expose only read-only `__uicReady`/`__uicStatus`, so the docs and the code disagree. Against the Code bar "no debug leftovers in the public build". | Gate `__zone` and `__gfx` behind `import.meta.env.DEV \|\| ?debug \|\| ?test` like `__player`; make `?test` dev-only or keep it and document it. | S | Gameplay (`zone`), Art Director (`render`), Project Lead (`main.ts`) |
| QA-03 | P2 | Sound effect audio contexts are created per match and never closed | `audio/gunSound.ts:49` and `audio/impactSound.ts:44` each call `new AudioContext()` on first sound; `createGunSound`/`createImpactSound` are called in both `combat/index.ts` (131, 243) and `squad/adapter.ts` (153, 156), so each match makes up to 4 contexts. Neither factory has a dispose, and combat/squad `dispose()` never closes them. After 3 Play-agains that is up to 16 live contexts, each holding an audio thread. Chromium 141 allows 40 in a test page without error, so it is not a crash today, but it grows with every restart and older Chrome had a hard limit of 6. | Create one shared audio context per page (lazy), reuse it for all four sound makers, close nothing on restart. | S | Gameplay & Combat Designer (`audio/**`) |
| QA-04 | P2 | Play again leaves the "Spectating..." banner of the old match behind, one more each time | `squad/adapter.ts:412-420` creates `#spectate-banner` and appends it to `#hud`, but `dispose()` (line ~1010) never removes it (the team HUD, minimap, debug panel and end screen are all removed). Measured over 4 rounds of `?squad=bots&zoneFast=1` with Play again: `document.querySelectorAll('#spectate-banner').length` = 1, 2, 3, 4 after each round (DOM node count also drifts 93, 94, 95). The banner is hidden when the match ends in a wipe, so today the stale nodes are invisible. If the match ends in a **Victory while you are dead and spectating a living teammate** (line ~950 sets it to `display:block` and nothing hides it on victory), that old "Spectating Bot2 (1/2)" banner stays on screen over every later match until the page is reloaded. The state is reachable: die early, bots win the zone fight. | `specBanner.remove()` in `dispose()` (one line); add a restart regression test that counts `#spectate-banner`. | S | Gameplay & Combat Designer (`squad/` is AI Engineer's folder; banner wiring is the adapter) |
