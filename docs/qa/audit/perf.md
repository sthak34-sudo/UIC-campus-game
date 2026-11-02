# Performance audit (round 1)

Auditor: Performance Engineer. Date: 2026-11-02. Branch `claude/uic-campus-game-plan-btnm3c` (= main at 9c65098). Audit only, no code changed.

Status: IN PROGRESS. Findings are appended as they are verified (so a usage limit cannot lose them). The summary and the measured-numbers table are filled in at the end.

## How this was measured

- Production build (`vite build`, 12 s) served by `vite preview` on 127.0.0.1:5306, driven by headless Chromium (software WebGL / SwiftShader) with a CDP probe (`scratchpad/probe/probe.mjs`, not committed). Raw data: `screenshots/tmp/audit/perf/*.json` (gitignored).
- This machine has 4 CPUs shared with seven other auditors (load average 30+ during the first run), and no GPU. Absolute FPS and absolute stage times here are NOT representative. Counts (draw calls, triangles, textures, bytes) are exact and device-independent. Relative costs and main-thread JS cost are indicative.
- Auto quality on this box resolves to `low` (SwiftShader matches the weak-renderer regex), so any `medium` numbers are forced with `?quality=medium`. A real student laptop (Intel UHD 620 / Iris Xe) would resolve to `medium` (see PERF-05).

## Findings

### PERF-01 (P1) Boot is one long serial chain; the network sits idle for most of it

Evidence (prod build, `quality=low`, request timeline from CDP, ms since navigation; this run had the box at load average 30+, so read the shape, not the absolute seconds):

| t (ms) | what | note |
|---|---|---|
| 560-1300 | `campus.json` (367 KB gz) | only big request in the first 5 s |
| 1300-5000 | nothing on the wire | `buildCampus` is CPU-building geometry (stage `campus` = 7.6 s) |
| 5000-7400 | 73 texture files (13+ MB) | requested only when materials are first created inside `buildCampus` |
| 11500-13660 | 10 building GLBs, one after another | `world/buildings/index.ts:32-35` `for (...) await loader.loadAsync(...)` |
| 13660-18230 | nothing (Rapier init + physics) | `main.ts:90-93` dynamic imports then `initRapier()` (wasm is inlined in the 4.3 MB rapier chunk) |
| 18229 / 18483 / 20913 | `player_anims_cc0.glb`, then `player_base.glb`, then `rifle_m4_cc0.glb` | three dependent fetches: `characterLoader.ts:370-389` then `characterLoader.ts:455` (`loadRifleTemplate` awaited after parsing) |

`main.ts:67-85` awaits every stage in order (campus.json, campus, landmarks, buildings, player, physics), although the building GLBs, the character GLBs, the rifle, `context.json`, the KTX2 transcoder and the HDRI do not depend on the campus build. Stage `ms` from `__uicStatus`: renderer 173, campus.json 1063, campus 7631, landmarks 2269, buildings 2139, player.physics 4591, player.character 3996, physics+loot 220, combat+zone+squad 328, shaders 318 (total 22.7 s under heavy contention).

Why it matters on a student laptop: the CPU stages shrink on a real CPU, but the fetch stages do not. On broadband every serial fetch costs a full round trip plus transfer, and the GLBs/character wait behind CPU work they could overlap with. The bar is first load under 30 s; a cold visit currently downloads about 24 MB in this pattern.

Suggested fix: kick off all independent fetches at the top of `start()` (building GLBs with `Promise.all` or a small pool, `player_anims`+`player_base`+rifle in parallel, `context.json`, `import('./player/physics')` + `initRapier()`, the first KTX2 sets) and only await them where used. Expected gain: removes about 5-8 s of dead network time on a cold load at 50 Mbps (estimate: every idle window above becomes overlap). Effort M. Owner: Project Lead (`main.ts`), with World Builder (`world/buildings/index.ts`) and Gameplay (`player/characterLoader.ts`, `player/rifle.ts`).

### PERF-02 (P1) First load is about 24 MB over the wire, 62% of it textures that GitHub Pages cannot compress

Measured request list for a full load (119 requests; `low` quality, so the 1.2 MB sky HDRI is not included; `medium`/`high` add `kloofendal_overcast_puresky_1k.hdr`, 0.72 MB gzipped):

| group | files | raw MB | on the wire (gzip where Pages applies it) |
|---|---|---|---|
| GLB (10 building, player_base, player_anims, rifle) | 13 | 10.55 | 5.91 |
| JPEG textures | 48 | 8.75 | 8.75 (not gzipped) |
| KTX2 textures | 24 | 5.20 | 5.20 (not gzipped) |
| JS (index, post, rapier, small chunks) | 17 | 6.0 | 2.16 |
| PNG (`macro.png` 0.68 MB, foliage) | 2 | 0.74 | 0.74 |
| JSON (`campus.json`, `context.json`) | 2 | 2.57 | 0.74 |
| basis transcoder wasm + js | 2 | 0.59 | 0.26 |
| **Total** | **108 files** (+ 11 blob/fetch) | **~34** | **~23.8** |

Live headers (curl on the Pages site): `cache-control: max-age=600`, gzip on js/json/glb/hdr/wasm, none on ktx2/jpg/png. Details that stand out:
- `models/characters/player_base.glb` is 4.29 MB (3.49 MB gz): a 75k-triangle body in four LODs plus 7 KTX2 textures, needed before the player can spawn.
- Seven interior-only texture sets (terrazzo, office ceiling, plaster, fabric, dark wood, carpet, oak) are fetched at boot: 3.7 MB, although the player starts outdoors and the interiors are `addInterior` zones.
- `macro/macro.png` 0.68 MB and `ph_concrete_wall_006/normal.jpg` 0.59 MB are the two largest single textures.
- `context.json` (1.2 MB raw, 0.37 MB gz) is the low-detail surroundings beyond the play area, fetched inside the campus build (`world/campus/context.ts:29`), on the critical path.
- Revisit: with `max-age=600` a revisit within 10 minutes is served from cache; after that the browser sends about 108 conditional requests (Pages sends ETag, so mostly 304s). That is fine for the "under 10 s on a revisit" bar on broadband but costs one round trip each; hashed Vite chunks cannot be marked immutable on Pages (no header control).

Suggested fix: (a) lazy-load the interior texture sets when the player nears an interior zone (or load them after first frame, idle priority): -3.7 MB before play. (b) Convert the 48 JPEGs to KTX2/UASTC (see PERF-03): -3 to -4 MB and 4x less GPU memory. (c) Drop the unused second HDRI from the build (`between_bridges_1k.hdr`, 1.7 MB, not fetched unless `?sky=bridges`, so it is only hosting weight, no gain). (d) Strip the player body down: ship LOD1-3 as a separate lazy file, or decimate LOD0. (e) Split `context.json` out of the boot path (fetch in parallel, build after first frame). Expected total: first-load wire size from about 24 MB to about 14 MB. Effort M. Owner: Art Director (textures, characters), World Builder (`context.json`, buildings).

