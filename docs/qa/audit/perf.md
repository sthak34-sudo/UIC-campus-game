# Performance audit (round 1)

Auditor: Performance Engineer. Date: 2026-11-02. Branch `claude/uic-campus-game-plan-btnm3c` (= main at 9c65098). Audit only, no code changed.

Status: COMPLETE for round 1 (audit only; nothing in the code changed).

## How this was measured

- Production build (`vite build`, 12 s) served by `vite preview` on 127.0.0.1:5306, driven by headless Chromium (software WebGL / SwiftShader) with a CDP probe (`scratchpad/probe/probe.mjs`, not committed). Raw data: `screenshots/tmp/audit/perf/*.json` (gitignored).
- This machine has 4 CPUs shared with seven other auditors (load average 30+ during the first run), and no GPU. Absolute FPS and absolute stage times here are NOT representative. Counts (draw calls, triangles, textures, bytes) are exact and device-independent. Relative costs and main-thread JS cost are indicative.
- Auto quality on this box resolves to `low` (SwiftShader matches the weak-renderer regex), so any `medium` numbers are forced with `?quality=medium`. A real student laptop (Intel UHD 620 / Iris Xe) would resolve to `medium` (see PERF-05).

## Summary

The game is not yet within the Performance bar on a 2020 integrated-GPU laptop, and the main reason is geometry/draw-call volume, not a single bug. At the spawn view the lowest quality already submits 1,654 draw calls and 8.3 M triangles per frame (budget: about 300 calls). A real UHD 620 / Iris Xe laptop will not take the `low` path (that is only for software GL); it gets `medium` (HDR post stack, AO, bloom, SMAA, HDRI), which nobody has measured on such a GPU, and nothing steps quality down if it runs slowly. My reasoned estimate for that laptop at `medium` is 15-25 FPS in the open, unless the draw-call work below is done.

Download and load are acceptable on broadband but wasteful: about 24 MB over the wire, loaded as one long serial chain, followed by a multi-second shader-compile freeze on the first frame because the warm-up runs before the sun, sky and post pipeline exist. Memory is mostly healthy across 3 Play-agains (JS heap, scene, physics all flat) with two real leaks: GPU textures (+88 per restart) and never-closed audio contexts.

Top 5 (details and evidence in the findings):
1. PERF-04 (P0) 1,654 draws / 8.3 M triangles per frame on `low`; fix shadows, merge/cull, fix character/loot/tree culling. Gain: about half the CPU submit time (-5 to -8 ms/frame) and about half the GPU geometry load.
2. PERF-05 (P1) No GPU tiers and no runtime quality governor; add a frame-time based step-down plus render scale. Gain: turns a 15-20 FPS first impression into a playable 30 on UHD 620.
3. PERF-06 (P1) Shader warm-up compiles the wrong programs (41 at warm-up vs 113 after the first frame); the real compile freeze (seconds on a laptop) happens after the loading screen is gone. Gain: moves a 2-6 s freeze behind the loading bar.
4. PERF-07 (P1) Nine always-on point lights (six in the Daley Library) make every campus pixel run the light loop. Gain: about 10-15% of fragment cost outdoors.
5. PERF-01/02/03 (P1) Serial boot and 24 MB payload (14.7 MB uncompressible textures, 48 JPEGs = 185 MB GPU memory). Gain: first-load wire size 24 -> about 14 MB, 5-8 s less dead network time, -160 MB GPU memory.

## Measured numbers

| Metric | Value | Conditions |
|---|---|---|
| Build time | 12.5 s | `vite build`, this box |
| JS chunks (raw / gzip) | index 331 KB / 123 KB; post (three + postprocessing + n8ao) 935 KB / 309 KB; rapier (wasm inlined) 4.33 MB / 1.67 MB; others < 50 KB each | production build |
| First-load requests | 119 (108 files + 11 blob fetches) | `low`, solo |
| First-load bytes | 28.7 MB raw, about 23.8 MB on the wire with Pages gzip (about 24.5 MB at `medium`, +0.72 MB HDRI) | measured request list |
| Of which textures | 14.7 MB (48 JPEG 8.75 MB, 24 KTX2 5.2 MB, 2 PNG 0.74 MB) | not gzipped by Pages |
| Of which GLB | 10.55 MB raw / 5.9 MB gz (player_base 4.29 MB, 10 buildings 5.4 MB) | |
| Live Pages headers | `cache-control: max-age=600`, gzip on js/json/glb/hdr/wasm, none on ktx2/jpg/png | curl |
| Boot stages (CPU, ms) | renderer 97, campus.json 403, campus build 5,030, landmarks 758, building GLBs 592, physics 1,515, character 1,354, loot 58, match mount 126, shader warm 281 = 10.2 s | SwiftShader box, load ~8 (CPU stages inflate on this box; network was localhost) |
| Network idle windows | 1.3-5.0 s and 13.7-18.2 s with nothing in flight | first full load |
| First `render()` call | 9.5 s (23 s under heavier load) | SwiftShader recompiling 113 programs |
| Programs at warm-up end / after first frames | 41 / 113 | `info.programs` |
| Draw calls | 1,654 total (992 main + 662 shadow) | `low`, bots, spawn view |
| Triangles | 8.32 M total (6.01 M main + 2.31 M shadow) | same |
| `renderer.render()` JS time | 10.9-13.8 ms main only; 13.3-19.6 ms with shadows | SwiftShader box, 4 samples |
| Scene | 3,330 meshes, 52 instanced, 418 skinned (19 characters), 930 shadow casters, 13 lights (9 point), 221 geometries, 188 textures | bots mode |
| JS heap | 501 MB used at playable, 37.9 MB after GC; flat across 3 restarts (37.0-37.9 MB) | `performance.memory`, CDP GC |
| Textures across 3 Play-agains | 188 -> 276 -> 364 -> 452 (+88 each) | `renderer.info.memory` |
| Geometries / programs / scene children / bodies / colliders | flat (about 221 / 106-113 / 282 / 16 / 2,593) | |
| GPU memory estimate for textures | about 210 MB (185 MB from JPEG) | computed from file sizes |
| FPS, frame times | Not measured: SwiftShader on a shared 4-CPU box gives 10-20 s per frame, so these are meaningless here | needs a real iGPU laptop playtest |

What I could not measure and why: real FPS, GPU time, `medium`/`high` frame costs and driver compile times all need an actual iGPU; this box has only software GL. The estimates for those in the findings are reasoned from counts and are marked as estimates. The first thing to do when a student-laptop playtest is available is to run `?debug=perf` at `medium` and `low` and record FPS/draws/worst frame.

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

### PERF-06 (P1) The shader warm-up runs before the sun, post pipeline and sky exist, so it compiles programs the game never uses; the real compile freeze happens after the loading screen is already gone

Evidence (code):
- `main.ts:230` calls `renderer.compileAsync(world.scene, camera)` and `main.ts:233` then clears the loading screen; the render loop only starts at `main.ts:274`.
- At that moment the scene has none of the lights/state the first real frame has. `CascadeSun` (two or three shadow-casting directional lights) is created lazily inside the first `render()` (`render/renderer.ts:191-193`, called at `renderer.ts:370`). `hookCascadeMaterial` then changes every standard material's `onBeforeCompile` and `customProgramCacheKey` and sets `needsUpdate = true` (`render/shadows.ts:257-271`). `scene.environment` (HDRI/room/sky) is also only assigned inside `render()` (`renderer.ts:405-412`; the HDRI itself arrives asynchronously, `renderer.ts:304-323`). `PostPipeline` (N8AO, bloom, SMAA, tone-map effect passes, `render/post.ts`) is built on the first frame too (`renderer.ts:427-432`).
- three's program cache key includes `numDirLights`, `numDirLightShadows`, `envMapMode` and `shadowMapEnabled` (`node_modules/three/src/renderers/webgl/WebGLPrograms.js:219,341,349,363`). All four differ between the warm-up state and the first frame, so every lit material compiles again, synchronously, in frame 1.
Evidence (measured): in the first full load the main thread had a single 31.0 s long task starting at exactly the moment the `shaders(done)` stage ended (long task [23094 ms, +31032 ms]; `shaders(done)` mark at 23094 ms; machine at load average 30+ and SwiftShader, so only the ordering is meaningful, not the length). `renderer.info.programs` = 109 live programs after the first frames.
Why it matters on the target laptop: with Intel drivers each of ~100 programs (PBR + CSM + custom surface chunk) takes tens of milliseconds to link; even with `KHR_parallel_shader_compile` the first draw of each waits for its link. Expect a freeze of roughly 2-6 s on the first frame(s) with a blank or half-drawn canvas, after the loading bar says "Almost ready". This breaks the "no hitches over 100 ms" bar at the very first impression and gets worse with `medium` (post-processing programs are extra). Texture uploads add to it (see PERF-03: 48 JPEGs upload RGBA8 + mipmaps on first use).

Suggested fix: do the warm-up with the real state. Create `CascadeSun`, `PostPipeline` and apply the environment before `compileAsync`, then render two frames behind the loading overlay and call `clearLoadingUi()` only after `gfx.ready` (with the existing timeout). Also call `renderer.initTexture(t)` for the large textures during load. Expected gain: moves a 2-6 s freeze behind the loading screen (no change to total load time, large change to perceived quality); also the likely cause of the first-frame "GPU stall" warnings. Effort M. Owner: Art Director (`render/renderer.ts`, `shadows.ts`), Project Lead (`main.ts`), Performance Engineer to measure.

### PERF-04 (P0) 1,654 draw calls and 8.3 million triangles per frame at the spawn view on the LOWEST quality; the project budget is about 300 draw calls

Measured in the production build, `?squad=bots` (19 characters), `quality=low`, spawn view, 960x540 headless (counts are exact and do not depend on resolution or GPU). One `renderer.render()` with `info.autoReset`, then the same with the shadow pass skipped (`shadowMap.autoUpdate=false`):

| | draw calls | triangles |
|---|---|---|
| full frame (2 shadow cascades + main) | 1,654 | 8.32 M |
| main pass only | 992 | 6.01 M |
| shadow passes only (difference) | 662 | 2.31 M |

Scene at the same moment: 3,330 meshes (1,597 flagged visible), 52 instanced meshes, 418 skinned meshes (19 characters x 22 prims; only the current LOD is drawn), 930 shadow casters, 13 lights, 113 shader programs, 221 geometries, 188 textures. `CLAUDE.md` sets "total draw calls under about 300 outdoors"; this is 3.3x over in the main pass and 5.5x over counting shadows, and `low` is the lightest preset (`medium` adds post passes on top; `high` adds a third cascade and the ~1M-triangle leaf cards as shadow casters, per `quality.ts:25-29` and the `detailCasters` comment, not measured here).

CPU cost: `renderer.render()` took 10.9-13.8 ms of main-thread time without the shadow pass and 13.3-19.6 ms with it (4 samples, SwiftShader box at load average ~8, so GPU waits are mixed in; typical three.js JS cost is about 8 us per draw, which matches). A 2020 laptop CPU will land in the same 10-15 ms range, which is a third to half of a 33 ms frame spent only submitting draws, before physics, 15 bots and the HUD. The CPU profile (below) agrees: `bindVertexArray` is the single largest native cost and three.js renderer functions are 70-85% of all JS self time.

GPU cost: 6.0 M triangles in the main pass at 30 FPS is 180 M triangles/s plus the shadow passes (about 250 M/s total); that is at or beyond what a UHD 620 sustains with a PBR fragment shader on top, and it will not shrink with resolution.

Where it comes from (from code; not yet broken down by object name, which is the first step of the fix): per-material draw groups in every ~250 m building tile (`world/campus/index.ts:65`, merged per material per tile but not culled per cascade), tree instance sets with `frustumCulled = false` and drawn again in every cascade (`world/campus/trees.ts:262-283`, 5 instanced meshes per tree prototype), 19 characters with `frustumCulled = false` (PERF-12), 156 loot crates each made of several meshes plus a label sprite (`combat/loot.ts`), 10 landmark GLBs with 13-30 primitives each, and the 662 shadow draws (cascade frustums use `lightMargin: 80` and `lightFar: 2500`, `render/shadows.ts:53-54`, so each cascade pulls in everything within a very deep slab).

Suggested fix, in order of payoff: (1) add a per-name draw/triangle breakdown to the `?debug=perf` overlay (one `traverseVisible` pass that groups by `userData`/name prefix) so owners can see their own cost; (2) shadows: tighten `lightMargin`/`lightFar` to the campus extent, render the far cascade every 2nd-4th frame, drop trees' `farCore`/`trunk` from cascade 2, stop casting from landmark interiors and small props; (3) merge landmark/building primitives per material and set `frustumCulled`/bounding spheres correctly on characters and trees; (4) distance-cull loot crates and labels (squared-distance check every 0.25 s like `installTileLod`). Expected gain: 1,654 -> about 700 calls and 8.3 M -> about 4 M triangles, i.e. about 5-8 ms/frame of CPU submit and roughly halving GPU geometry load. Effort L (split across owners). Owner: Performance Engineer drives, with World Builder (tiles, landmarks, trees), Art Director (shadows), Gameplay (characters, loot).

### PERF-07 (P1) Nine point lights are always in the scene, so every lit pixel on the campus pays for them

`renderer.info`/scene dump at spawn: 13 lights = 2 shadow-casting sun cascades, 1 combat fill, 1 hemisphere fill, and 9 `PointLight`s: six Daley Library lights (`world/landmarks/daleyInterior.ts:150-164`, intensity 12, range 24, live all the time although the library is a single building), the player's muzzle-flash light (`combat/weapon.ts:106`) and two bot muzzle lights (`render/muzzleFlashes.ts:15-16,74`, comment says "kept in the scene at zero so shaders never recompile"). In three.js forward shading `numPointLights` is a compile-time constant, so every `MeshStandardMaterial` in the game (ground, buildings, trees, characters) runs the 9-light loop for every pixel, outdoors included; each iteration computes distance attenuation even when out of range and the BRDF when in range. Estimated 10-20% extra fragment ALU on an ALU-bound iGPU, for lights that only matter inside one building or for 80 ms after a shot. Also, adding or removing a light changes the program cache key (`WebGLPrograms.js:341`), which is why the light pool had to stay at fixed size.

Suggested fix: keep a fixed pool of 2-3 point lights total. Move the pool to the nearest library lights when the player is inside the library zone (`world.interiorAt`), and to the muzzle position for flashes (one light, two slots). Expected gain: fragment cost down by the 6 library lights everywhere outside the library (about 10-15% of main-pass fragment time estimated; not measurable on SwiftShader). Effort S-M. Owner: World Builder (`daleyInterior.ts`), Art Director (muzzle flash pool).

### PERF-08 (P1) Play again leaks GPU textures (+88 per restart) and audio contexts; one DOM node per restart

Three Play-agains, two independent headless runs (960x540 and 480x270, `?squad=bots`, `quality=low`), numbers identical:

| after | JS heap after forced GC | geometries | textures (`renderer.info.memory`) | programs | scene children | physics bodies / colliders | listeners (`updateCount`) | DOM nodes |
|---|---|---|---|---|---|---|---|---|
| first match | 37.9 MB | 221 | **188** | 113 | 282 | 16 / 2,593 | 16 | 105 |
| Play again 1 | 37.0 MB | 221 | **276** | 106 | 282 | 16 / 2,593 | 16 | 106 |
| Play again 2 | 37.5 MB | 219 | **364** | 106 | 282 | 16 / 2,593 | 16 | 107 |
| Play again 3 | 37.5 MB | 223 | **452** | 106 | 282 | 16 / 2,593 | 16 | 108 |

JS heap, scene graph, physics bodies and update callbacks are flat: the restart handler in `main.ts:191-207` disposes correctly for those. Two things are not flat:
1. **Textures grow by exactly 88 per restart** (188 -> 276 -> 364 -> 452). Most likely cause: each restart creates 15 new bot characters (cloned skeletons) and `AnimatedCharacter.dispose()` (`player/characterLoader.ts:816-820`) only stops the mixer and detaches the root. It never calls `skeleton.dispose()` on the cloned skinned meshes, so each one's bone-matrix texture stays allocated on the GPU. (The attribution is by reading; the +88 count itself is measured.) Each bone texture is small (a few KB), so the memory impact is low (about 0.4 MB per restart), but it is an unbounded leak of GPU objects and the `textures` count is the number the bar ("no memory growth across 3 Play-agains") will be checked against.
2. **Four `AudioContext`s per match are never closed.** `createGunSound` and `createImpactSound` each create their own context on first sound (`audio/gunSound.ts:47-49`, `audio/impactSound.ts:42-44`); they are instantiated both in `combat/index.ts:131,243` and `squad/adapter.ts:153,156` per mount and have no `dispose`. After 3 Play-agains with shooting that is up to 16 live contexts, each holding an audio render thread and decoded buffers. Chromium 141 here accepts at least 20 (no hard cap), so this costs CPU/battery and memory rather than crashing, but other browsers cap contexts. Fix: one shared lazily created context for the whole page.
3. +1 DOM node per restart (105 -> 108): a small HUD/end-screen element is added on each mount and not removed (not identified).

Also at each restart the live program count drops from 113 to 106 and stays there (the muzzle-flash and weapon lights are removed and re-added, `render/muzzleFlashes.ts`, `combat/weapon.ts:106`), which suggests a shader-program set change around every restart (a possible recompile hitch); on this box every frame is 10-20 s so I could not isolate it (two long tasks of about 20 s per restart in both runs, vs one normal frame). Needs a check on a real GPU.

Suggested fix: dispose skeletons (`mesh.skeleton.dispose()` for every `SkinnedMesh` under the avatar, plus `mixer.uncacheRoot`) in `AnimatedCharacter.dispose`; share one `AudioContext`; add a regression test that counts `renderer.info.memory.textures` before/after a restart. Expected gain: textures flat across restarts, no accumulating audio contexts. Effort S. Owner: Gameplay & Combat Designer (`player/characterLoader.ts`, `audio/*`, `combat/*`), AI Engineer (`squad/adapter.ts`).

### PERF-12 (P2) Every character is drawn and re-LODed every frame regardless of visibility

- `player/characterLoader.ts:425` sets `frustumCulled = false` on all character meshes, so the 19 characters (player, 15 bots, 3 dummies) submit their current-LOD primitives (4-7 draws each) every frame in the main pass even when behind the camera or 200 m away, and re-skin them.
- `AnimatedCharacter.update` calls `setLod()` every frame (`characterLoader.ts:803`, `893-905`), which does `node.traverse(...)` over all four LOD subtrees and rewrites `castShadow` on every mesh each frame, 22 meshes x 19 characters = about 420 property writes per frame, even though the LOD changes a few times per minute.
- Each bot also runs a full `AnimationMixer.update`, foot-IK ground probes (`player/footIk.ts`, Rapier rays per foot per frame) and a rifle-IK solve per frame, with no distance or visibility gating; at LOD3 (> 40 m) the pose is not visible but is still evaluated.

Suggested fix: compute a bounding sphere per character and cull manually (or enable frustum culling with a padded bounding sphere), early-return from `setLod` when the index is unchanged, and skip IK and mixer updates (or step at 15 Hz) for characters beyond about 40 m or outside the view. Expected gain: about 100-150 fewer draws in typical views and 1-2 ms/frame CPU with 15 bots. Effort S-M. Owner: Gameplay & Combat Designer (`player/characterLoader.ts`), AI Engineer for bot-side gating.

### PERF-13 (P2) Boot allocates about 460 MB of short-lived JS, which leaves a large major GC pending for the middle of the first match

At the moment the game becomes playable `performance.memory.usedJSHeapSize` is 501 MB (total 506 MB); after a forced GC it is 37.9 MB (identical in both runs and in the first full load: 495 MB vs 32.9 MB). So about 460 MB of boot garbage (campus geometry building, `campus.json`/`context.json` parsing, GLB parsing, `Matrix4` arrays in `trees.ts`) is sitting in the old generation. V8 will collect it with a mark-compact at some point during play; on a 2020 laptop a 500 MB major GC is typically a 50-200 ms main-thread pause, i.e. a hitch that violates "no hitches over 100 ms". The cost is invisible on a fast desktop. Suggested fix: find the top allocators with a heap-allocation sampling profile of the boot (`HeapProfiler.startSampling`), reuse typed arrays in `world/campus/batcher.ts` and `geom.ts`, and parse JSON in a worker or stream it. Expected gain: smaller boot heap and less risk of a mid-game major GC. Effort M. Owner: World Builder (campus build), Performance Engineer (profile).

### Per-frame CPU (indicative)

Source: CDP sampling profile (0.5 ms interval) of a few frames of `?squad=bots` play, production build, SwiftShader. Absolute times are inflated because GL work happens in-process waits ("(program)" is 99% of samples here and is GPU/driver wait); the JS self-time split is what is useful:
- three.js renderer + scene graph (`post-*.js` chunk, which contains three): 114-260 ms of the sampled JS self time, i.e. 70-85% (`renderBufferDirect`, `setProgram`, `updateMatrixWorld`, `uniformMatrix4fv`; native `bindVertexArray` alone is 242 ms in the longest profile).
- Rapier (wasm + glue): 15-95 ms, 14-25% (bot sight/wall rays, foot-IK probes, player physics).
- Squad/bot logic (`adapter-*.js`): 10-19 ms (`updateMarkers` 6-8 ms is the biggest single entry, which is the HUD marker DOM work in `squad/hud.ts:354`), combat/zone/HUD (`combat-*`, `zone-*`, `index-*`): about 2-8 ms.
- GC: 30-34 ms ("(garbage collector)"), mostly from per-frame allocations in the bot loop (`state = {...state, members: {...}}` per bot per frame, `squad/adapter.ts:684-700, 930-935`; `new THREE.Vector3` in the combat tick).
So the first-order cost is draw submission (PERF-04/12), then physics rays; bot decision logic and HUD DOM are second order (PERF-09). Profiles: `screenshots/tmp/audit/perf/play-low.cpuprofile`, `run1/play-low.cpuprofile`.

## Findings table (sorted by severity)

| ID | Sev | Title | Evidence | Suggested fix and expected gain | Effort | Owner |
|---|---|---|---|---|---|---|
| PERF-04 | P0 | 1,654 draws / 8.3 M tris per frame on `low` (budget ~300 draws) | `renderer.info`: 992 main + 662 shadow draws; 6.0 M + 2.3 M tris; render() 11-20 ms JS | Per-name breakdown in perf overlay; tighten cascade extents and stagger far cascade; merge/cull landmarks, trees, characters, loot. -5 to -8 ms/frame CPU, ~half GPU geometry | L | Performance Eng. with World Builder, Art Director, Gameplay |
| PERF-01 | P1 | Serial boot chain, network idle most of the time | request timeline; `main.ts:67-100`, `buildings/index.ts:32-35`, `characterLoader.ts:370-389` | Start independent fetches at top of `start()`, parallelise GLBs and character files. -5 to -8 s cold load | M | Project Lead, World Builder, Gameplay |
| PERF-02 | P1 | ~24 MB first-load wire size; 3.7 MB interior-only textures at boot | 119 requests; Pages does not gzip KTX2/JPG/PNG | Lazy-load interior textures, KTX2 for all, slim player_base, defer context.json. 24 -> ~14 MB | M | Art Director, World Builder |
| PERF-03 | P1 | 48 JPEG textures = ~185 MB GPU memory, 4x sampling bandwidth | `render/textures.ts:96-131`, file dimensions | Re-encode to KTX2 with existing tool. -160 MB GPU, -3-4 MB download | S-M | Art Director |
| PERF-05 | P1 | No GPU tiers, no runtime quality step-down; iGPU lands on unmeasured `medium` | `render/quality.ts:83-126`; no frame-time feedback | Frame-time governor + render scale + Intel tier rules. 15-20 -> 30 FPS on UHD 620 (estimate) | M | Art Director, Performance Eng. |
| PERF-06 | P1 | Shader warm-up runs before CSM/sky/post exist; first-frame compile freeze after the loading screen | `main.ts:230-233`, `renderer.ts:191,370,405,427`; 41 vs 113 programs; first render 9.5 s | Warm with the real state behind the overlay, clear it after `gfx.ready`. Moves a 2-6 s freeze behind loading | M | Art Director, Project Lead |
| PERF-07 | P1 | 9 always-on point lights hit every lit pixel | scene dump; `daleyInterior.ts:157-164`, `muzzleFlashes.ts:15,74`, `weapon.ts:106` | Fixed pool of 2-3 lights moved to the player's interior / muzzle. ~10-15% fragment cost outdoors | S-M | World Builder, Art Director |
| PERF-08 | P1 | Play again leaks 88 GPU textures per restart; 4 AudioContexts per match never closed; +1 DOM node | textures 188/276/364/452; `characterLoader.ts:816-820`; `audio/*Sound.ts` | `skeleton.dispose()`, one shared AudioContext, regression test. Flat counts | S | Gameplay & Combat, AI Engineer |
| PERF-09 | P2 | HUD/minimap/combat DOM rebuilt or redrawn every frame | `squad/hud.ts:200-275`, `zone/index.ts:159-197,360`, `combat/index.ts:164-183,406-414` | Dirty-check writes, 10 Hz minimap, throttle muzzle ray. -1 to -3 ms/frame, less GC | S | UI/UX, Gameplay |
| PERF-10 | P2 | `preserveDrawingBuffer: true` for all players | `render/renderer.ts:161` | Only with `?view=`/test. ~0.3-1 ms/frame on iGPU (estimate) | S | Art Director |
| PERF-11 | P2 | Indoor exposure metering uses synchronous `readPixels` every 30 frames | `renderer.ts:417-418`, `post.ts:205-233` | Async readback of an RGBA8 target. Removes a periodic indoor stall | S-M | Art Director |
| PERF-12 | P2 | Characters never frustum-culled, re-LODed (traverse) every frame, IK always on | `characterLoader.ts:425,803,893-905` | Bounding-sphere culling, early-out in `setLod`, distance gating. ~100-150 fewer draws, 1-2 ms/frame | S-M | Gameplay, AI Engineer |
| PERF-13 | P2 | ~460 MB of boot garbage leaves a big major GC pending for mid-match | `performance.memory` 501 MB vs 37.9 MB after GC | Heap-sampling profile of boot, reuse typed arrays, worker JSON parse. Less hitch risk | M | World Builder, Performance Eng. |

Minor, not worth separate IDs: `main.ts:236` uses the deprecated `THREE.Clock` (console warning every load; `THREE.Timer` is already used in the renderer); `quality.ts` creates up to two throwaway WebGL contexts at startup; `between_bridges_1k.hdr` (1.7 MB) is hosted but only loaded with `?sky=bridges`.

Raw data (gitignored): `screenshots/tmp/audit/perf/load-auto.json`, `play-low.json`, `run1/play-low.json`, and the two `.cpuprofile` files.
