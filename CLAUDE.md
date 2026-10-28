# UIC Campus Game: Team Handbook (read first)

This is a realistic battle-royale game on the real UIC East Campus, played in the browser (squads of 4; see `PLAN.md`). Graphics stay on three.js. Walking and hitscan stay on Rapier. The dev server stays on Vite.
The owner is a non-programmer. AI agents write all the code. The **Project Lead** (the main session) plans, assigns, reviews and merges. Team charters and quality bars are in `docs/TEAM.md`.
**Current phase: Quality Pass. No new features** unless the owner asks for them.
Explain things to the owner in plain English.

## Commands
- `npm install`: install everything (npm workspaces; the only workspace is `client/`)
- `npm run dev`: run the game locally at http://127.0.0.1:5173
- `npm run typecheck`, `npm test`, `npm run build`: must all pass before you hand work back
- `npm run screenshot -- [viewpoint ...] [--out=dir] [--hour=14]`: renders viewpoints in headless Chromium using software WebGL. It works without a GPU, but each shot takes 10–90 s. With no names it renders every registered viewpoint.
- Map data: `python3 tools/map-pipeline/build_campus.py` regenerates `client/public/data/campus.json`.

## Tech (pinned; do not upgrade casually)
- **Language and libraries:** TypeScript 7 (strict), Vite 8, three.js **0.186.1**, Rapier `@dimforge/rapier3d-compat` 0.21.0, Vitest 5.
- **Renderer:** use **`THREE.WebGLRenderer`**, not WebGPURenderer. Our headless test browser only has WebGL2 (SwiftShader), and every visual change must be verifiable by screenshot. For post-processing, use `three/addons/postprocessing/*` (EffectComposer, RenderPass, GTAOPass/SAOPass, UnrealBloomPass, OutputPass, SMAAPass).
- **Python:** Python 3.13 for data tools. pyarrow, shapely, laspy and numpy are pip-installable.
- **No new runtime dependencies without the Project Lead's OK.** Dev-only tools are fine if small.

## Coordinates and units (critical)
- **Units:** 1 unit = **1 meter**.
- **Plan coordinates** (map data, `campus.json`): x = east, y = north.
- **three.js world:** x = east, **y = up**, z = **south**. Use `planToWorld()` in `client/src/core/geo.ts`. Origin is near the Quad (41.8722, -87.6505).
- **Texture UVs are in meters** (1 UV unit = 1 m of surface). Materials set their own texture repeat to match. This keeps every wall consistent.

## Who owns what (only edit your own files; ask the Project Lead for changes to shared files)
| Role | Owns |
|---|---|
| Project Lead | `client/src/main.ts`, `client/src/core/*`, `CLAUDE.md`, `PLAN.md`, `docs/TEAM.md`, `README.md`, package.json files |
| QA & Playtest Lead | `client/src/integration/**`, `tools/playtest/**`, `tools/player-test/**`, `tools/screenshot/**`, `docs/qa/**` |
| Art Director | `client/src/render/**` (renderer, sky, sun, shadows, post-processing, **material library**), `tools/textures/**`, `tools/anim-bake/**`, `client/public/{textures,hdri,models/characters,models/weapons}/**` |
| World Builder | `tools/map-pipeline/**`, `client/public/data/**`, `client/public/models/buildings/**`, `client/src/world/**` (campus, buildings, landmarks) |
| Gameplay & Combat Designer | `client/src/combat/**`, `client/src/zone/**`, `client/src/match/**`, `client/src/audio/**`, `client/src/player/**` (movement, controls, camera, character) |
| AI Engineer | `client/src/squad/**` (bot teammates, enemy squads, bot steering and targeting) |
| Performance Engineer | `client/src/boot/**`, `client/src/debug/perf*` and performance changes anywhere, done with the owning role's review |
| UI/UX Designer | HUD and screen files (`*/hud.ts`, `match/matchEndScreen.ts`, `squad/placementScreen.ts`, `boot/loading.ts`), `client/index.html`, `client/src/style.css` |
| Code Steward | `.github/**`, `client/src/debug/debugKeys*`, repo hygiene, cross-cutting refactors, done with the owning role's review |

When two roles share a file (for example, a HUD file inside `combat/`), the listed owner of the **folder** reviews.

## Shared contracts (`client/src/core/`)
- **`campusData.ts`:** the `campus.json` format. Buildings with `landmark` set are skipped by the generic campus builder.
- **`world.ts`:** the `World` object.
  - `scene`
  - `addCollider(mesh)`: everything solid, **including floors, stairs and ramps** the player walks on
  - `onUpdate`
  - `addViewpoint(name, …)`: named cameras for screenshots
  - `addInterior(zone)`: indoor areas, so lighting can switch
  - `spawn`
- **`render/materials.ts`:** `getMaterial(name)` is the only way to get surface materials like concrete or glass. Only the Graphics Engineer adds new names.

## Realism rules
- **The goal is "looks like the real UIC".** Accuracy first: real footprints, LiDAR heights, real proportions and window rhythms.
- **Every building must be enterable over time.** Landmarks get full interiors. Generic buildings start sealed, but must leave room for doors and floors to be added later, so don't build things that make interiors impossible.
- **UIC's East Campus is 1960s Brutalist** (Walter Netsch): board-formed and precast exposed concrete, deep-set windows, brick, granite pavers. Weathering (stains, darker bases, rain streaks) matters more than shine.
- **Performance budget:** must run on a 2020 laptop with integrated graphics.
  - Merge static geometry by material.
  - Use `InstancedMesh` for repeated items.
  - Keep total draw calls under about 300 outdoors.
  - Shadows are cast by buildings and trees, not tiny props.
- **Viewpoint names:** short kebab-case, prefixed by owner area: `map-*`, `gfx-*`, `uh-*`, `library-*`, `player-*`, `combat-*`, `qa-*`.

## Legal rules
- **No UIC logos, seals, Flames or Sparky artwork,** and no restaurant or CTA logos. Real building names are fine.
- **No Google 3D Tiles, Photorealistic Tiles, Maps imagery, or Street View imagery or geometry.**
- **Map data is ODbL.** Keep the "© OpenStreetMap contributors" credit visible (it's in `client/index.html`).
- **CC0 and self-made assets may be committed.** Record every one in `CREDITS.md`.
- **Mixamo may be used at runtime.** Mixamo files — raw downloads or baked into glTF/FBX — must **never** be committed. The same ban covers RenderPeople and any other non-redistributable file. Put those only in gitignored `client/public/models/private/` (for example `anims.glb`). Code must still run when that folder is empty and fall back to the procedural character.
- A CC0 body, if we add one, may live at `client/public/models/characters/player_base.glb` and must be listed in `CREDITS.md` before it is committed.
- **No real people's names.** Professors and staff in the game are fictional.

## Done means
1. Typecheck, tests and build pass.
2. You added or updated viewpoints and looked at your screenshots yourself (before and after for any visible change).
3. You met the quality bar for your area in `docs/TEAM.md`, or you said exactly where you fell short.
4. You committed on your branch with a clear message. The Project Lead opens the pull request and merges.

In your hand-back, report what works, what doesn't, and screenshot paths.
