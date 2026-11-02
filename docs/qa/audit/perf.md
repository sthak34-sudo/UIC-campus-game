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


### PERF-03 (P1) 48 JPEG textures decode to uncompressed RGBA8 with full mip chains: about 185 MB of GPU memory and 4x the sampling bandwidth of the KTX2 sets

Evidence: `public/textures` holds 29 JPEGs at 1024x1024, 16 at 512x512, 4 at 256x256 (`render/materials.ts:171-177` `loadTexture(...jpg)`; `render/textures.ts:96-131` uses `THREE.ImageLoader` + `THREE.Texture`, so three uploads RGBA8 and generates mipmaps). Size per 1024 JPEG on the GPU = 1024*1024*4*1.33 = 5.6 MB, so 29*5.6 + 16*1.4 + 4*0.35 = about 185 MB, versus about 25 MB if the same images were BC7/ASTC KTX2 (the 24 KTX2 files already are; the outdoor hero sets are KTX2). `renderer.info.memory.textures` = 119 at spawn (probe, `quality=low`).

Why it matters on a 2020 iGPU: UHD 620 / Iris Xe share system RAM and bandwidth. Uncompressed albedo+normal+ORM sampled for every lit pixel is the first thing to hit the bandwidth ceiling, and the decoded JPEGs also stay in CPU memory as `HTMLImageElement`s. First use of each texture uploads 4-5 MB and builds mips on the render thread, which is a frame hitch (see PERF-06).

Suggested fix: re-encode the remaining JPEG sets with `tools/textures/encode_ktx2.py` (already exists), at least all normal+ORM maps; drop 1024 to 512 for sets that only appear indoors or on small props. Expected: -160 MB GPU memory, -3 to -4 MB download, lower bandwidth cost per pixel on the iGPU. Effort S-M (tool exists; needs visual check by Art Director). Owner: Art Director.

### PERF-05 (P1) Quality choice is a one-shot string match with no GPU tiers and no runtime adaptation; a real iGPU laptop lands on `medium`, which has never been measured on one

Evidence:
- `render/quality.ts:83-110` (`detectPreferredQuality`) only returns `low` for software renderers (`swiftshader|llvmpipe|...`), a failed `failIfMajorPerformanceCaveat` context, or `MAX_TEXTURE_SIZE < 4096`. Every other GPU returns `null`, and `parseQuality` (`quality.ts:112-126`) maps that to `DEFAULT_QUALITY = 'medium'`. An Intel UHD 620 or Iris Xe (both report `Intel(R) UHD Graphics 620` / `Intel(R) Iris(R) Xe Graphics`, 16384 max texture) gets `medium`: HalfFloat HDR pipeline + half-res N8AO (8 samples + 4-tap denoise) + 6-level mip bloom + SMAA + 2 x 1024 cascades + the HDRI/PMREM sky, at full 1080p (`maxPixelRatio: 1` but no render-scale control).
- The preset cost table in the file header (`quality.ts:5-9`: "medium ... ~40-60 fps class") is an estimate in a comment; nothing in the repo has measured it on integrated graphics. My estimate for UHD 620 at 1080p (approx. 0.4 TFLOPS, ~35 GB/s shared memory): the main pass alone (PBR + CSM sampling + fog + custom surface shader on ~1,000+ draws, see PERF-04) is already the whole budget; HalfFloat targets, AO, bloom and SMAA add roughly 40-70% on top. Expected 15-25 FPS on UHD 620 at `medium`, and `high` is not usable there.
- Both branches inside the `!gl` case return `'low'` (`quality.ts:92-99`): the `WEAK_RENDERER.test` result is unused. `parseQuality` can create two throwaway WebGL contexts (`detectPreferredQuality` is called again at `quality.ts:121`).
- There is no feedback loop: nothing watches frame time and steps `high -> medium -> low`, and nothing lowers resolution. The only user control is the URL parameter `?quality=`. A student on a bad laptop cannot find it and sees a slideshow.
- `allowMetering` is switched off for "weak" but the same weak check decides nothing else.

Suggested fix: (1) add a tiny runtime governor: sample the existing frame-time window (the `perfStats` code already computes avg/worst), and if the 2-second average is above 33 ms for 3 windows, drop one tier (or first drop resolution scale to 0.75, then AO, then shadows to 1 cascade). Never step back up automatically in the same session. (2) Treat Intel UHD/HD Graphics (`/Intel\(R\) (UHD|HD) Graphics/`) as `low`+AO-off by default and Iris Xe as `medium` without AO, based on the measurements the first real-laptop playtest produces. (3) Add a `renderScale` field to the presets and apply it with `renderer.setPixelRatio` (fractional ratios work) so 1080p can render at 0.75. Expected gain: converts a 15-20 FPS first impression into 30+ on UHD 620 with a visible but small quality drop; no effect on strong GPUs. Effort M. Owner: Art Director (`render/quality.ts`, `render/renderer.ts`), with Performance Engineer for the governor.

### PERF-09 (P2) Play-again and per-frame HUD code rebuilds DOM and redraws canvases every frame

Evidence (all per-frame, through `world.onUpdate`):
- `squad/hud.ts:200-275` (`update()` called every frame from `squad/adapter.ts:989`): for each of the 4 squad rows it does `row.innerHTML = ''` and then creates a swatch span, a body div, a name div, a bar div and a fill div. That is about 20 element creations, 20 style writes and a layout invalidation per frame, with identical output almost every frame. The marker refresh in the same file is already throttled to 20 Hz (`squad/hud.ts:297-302`), the rows are not.
- `zone/index.ts:159-170` `publish()` runs every frame (`zone/index.ts:183-197`): it updates the wall/ring meshes, rewrites three text nodes, and fully redraws the 2x-density minimap canvas (`zone/index.ts:360-420`, clear + clip + circles + dots) 60 times a second. The zone only changes once per second.
- `combat/index.ts:164-183` `syncHud()` runs every frame and `combat/hud.ts:133-149` assigns `textContent` on five elements each time even when the string is unchanged (each assignment replaces the child text node). Also each frame `combat/index.ts:406-414` casts a Rapier ray (`castAimedShot`, `COMBAT.maxRange`) just to dim the crosshair when the muzzle is blocked, and allocates a new `THREE.Vector3`.

Why it matters: none of these is large alone (each is roughly 0.2-1 ms of main-thread time on a laptop), but together they are a steady 1.5-3 ms/frame and a stream of short-lived DOM objects (GC churn), on a game that has to hold 30 FPS on an iGPU laptop where the CPU is also feeding the GPU. See the measured profile in "Per-frame CPU" below.

Suggested fix: write only when a value changed (cache last string/number per element), rebuild a squad row only when that member's displayed state changes (name, life, hp bucket), redraw the minimap at 10 Hz or on phase change, and run the muzzle-blocked ray at 15-20 Hz. Expected gain: 1-3 ms/frame CPU and less GC. Effort S. Owner: UI/UX Designer (`squad/hud.ts`, `combat/hud.ts`, zone HUD class in `zone/index.ts`), Gameplay & Combat Designer for the call frequency in `combat/index.ts`.

### PERF-10 (P2) `preserveDrawingBuffer: true` is on for every player

`render/renderer.ts:161` creates the WebGL context with `preserveDrawingBuffer: true` in all modes. It exists so the screenshot robot can read the canvas. For a real player it disables the browser's buffer-flip optimisation: every presented frame is copied instead of swapped (an extra full-screen read+write, roughly 8 MB of traffic at 1080p per frame), which is a measurable cost on shared-memory iGPUs and in Chrome's compositor. Suggested fix: enable it only when the URL has `?view=` or a test flag (the code already parses `view`). Expected gain: small but free (about 0.3-1 ms/frame on UHD-class GPUs; I could not measure it without a real GPU). Effort S. Owner: Art Director.

### PERF-11 (P2) Indoor auto-exposure does a synchronous GPU readback every 30 frames on medium and high

`render/renderer.ts:417-418` sets `post.meterNext = indoors && (!isReady || frameNo % 30 === 0)` and `render/post.ts:205-233` then calls `renderer.readRenderTargetPixels` on a 32x18 float target. A synchronous `readPixels` makes the CPU wait until the GPU has finished the whole frame (the browser even logs "GPU stall due to ReadPixels", which appeared in the console during my run). On an iGPU running 25-40 ms frames that is a stall of one full frame time every half second while the player is inside a building, i.e. a visible hitch each time. Suggested fix: use `readRenderTargetPixelsAsync` (exists in three r186, `WebGLRenderer.js:3216`) on an RGBA8 target holding encoded log-luminance, apply the result one frame late; the exposure smoothing already hides one frame of latency. Expected gain: removes a periodic stall indoors. Effort S-M. Owner: Art Director.
