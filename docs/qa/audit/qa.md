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
