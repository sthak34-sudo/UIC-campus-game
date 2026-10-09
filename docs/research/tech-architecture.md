> **Note:** This is raw research gathered while planning (October 2026). The decisions we actually made are in [`../../PLAN.md`](../../PLAN.md); where they differ, PLAN.md wins. Facts marked "(unverified)" or "(est.)" need checking before we rely on them.

# UIC Campus Game: Technical Architecture Recommendation (October 2026)

Package versions were checked directly against the npm registry on 2026-10-09. Pricing comes from web search summaries of official docs, because the container's proxy blocks direct page fetches. Third-party or unconfirmed claims are marked (unverified). No files were written to the repo.

**Short version:** use TypeScript everywhere. The client is plain three.js plus Rapier, built with Vite. The map is built once from a committed OSM snapshot by a script. The multiplayer server is Colyseus on Render. The website is on Cloudflare Pages. There is no login in v1. Cost is $0/month while building and about $10–15/month once you run regular 50-player sessions.

---

## 1. 3D engine

| | three.js (plain) | React Three Fiber | Babylon.js | PlayCanvas |
|---|---|---|---|---|
| Current version | 0.186.1 (MIT) | fiber 9.8.1 + drei 10.7.9 (needs React 19) | @babylonjs/core 9.30.0 (Apache-2.0) | 2.23.2 (MIT) |
| Popularity / examples | Very large: millions of npm downloads a week and the most tutorials | Large; built on three.js | Mid-sized: about 10–15k/week for the `babylonjs` package (third-party figure) | Small for code-only use |
| What's built in | Renderer only. You add physics, input and UI yourself | Same as three.js, plus React helpers (ecctrl, @react-three/rapier) | Full engine: Havok physics, character controller (unverified), inspector | Full engine, but it is editor-first |
| Fit for AI-written code | **Best.** Most training data, small explicit API, and the official examples cover exactly what we need | Good, but agents often put per-frame updates into React state (slow), and four packages must stay version-matched | Good, but a larger API means more wrong or outdated calls | Weakest. Scenes live in a visual editor that agents can't drive |

**Pick: plain three.js + TypeScript, without React.**
- A game loop is imperative code, and plain three.js matches that.
- It has the most examples for agents to copy from.
- Fewer dependencies means fewer version clashes.
- The HUD and menus can be plain HTML/CSS laid over the canvas.
- Use the classic `WebGLRenderer`. Most examples still target it, and `WebGPURenderer` offers nothing we need.
- Babylon.js is a close second. Revisit it only if hand-built physics or camera code becomes a recurring pain.

**Physics and character controller: Rapier (`@dimforge/rapier3d-compat` 0.21.0, Apache-2.0).**
- It is WASM bundled inside the package, so it works in Vite with no setup.
- Its built-in `KinematicCharacterController` (`world.createCharacterController()` + `computeColliderMovement()`) handles sliding along walls, stepping up curbs and snapping to the ground. I confirmed it is in the 0.21 typings.

**How a third-person character walks:**
1. **Body.** A kinematic capsule collider. Physics steps at a fixed 60 Hz. WASD moves relative to the camera's facing, Shift runs, and gravity is applied by hand. Rapier corrects the requested move, and the corrected position is copied to the visible model.
2. **Buildings.** Static triangle-mesh colliders, made from the same extruded geometry that is drawn on screen.
3. **Model.** A glTF character loaded with `GLTFLoader`. Clone it per player with `SkeletonUtils.clone`. An `AnimationMixer` blends idle, walk and run by speed (three.js example `webgl_animation_skinning_blending`).
4. **Camera.** An orbit-follow camera rotated by right-drag or pointer lock. A spring arm casts a ray from the player to the camera and pulls the camera in when a building is in the way. Movement is smoothed with lerp.
5. **Other players.** No physics. Draw them about 100 ms in the past, interpolating between server updates, and pick their animation from their velocity.

## 2. OpenStreetMap → 3D campus pipeline

**Main rule: fetch once, commit the data, build from the committed copy.** The game never calls OSM at runtime.

1. **Fetch once.** Overpass is blocked in this container. Either the owner runs the query at overpass-turbo.eu and uses Export → GeoJSON, or we unblock the domain later. A one-off export is well within Overpass's fair-use guidance (under 10k queries and 1 GB per day). Example query; the bounding box is approximate, so check it on the map:
   ```
   [out:json][timeout:90];
   ( nwr["building"](41.860,-87.682,41.881,-87.640);
     nwr["building:part"](41.860,-87.682,41.881,-87.640);
     way["highway"](41.860,-87.682,41.881,-87.640);
     nwr["leisure"](...); nwr["landuse"](...); nwr["natural"](...); nwr["amenity"](...); );
   out body; >; out skel qt;
   ```
2. **Commit the raw file.** Save it as `data/osm/uic.geojson`, with a README recording the date and the query.
3. **Build script** (`tools/map-pipeline/build-campus.ts`, run with `npm run build:map`):
   - Converts with `osmtogeojson` 2.2.12 if starting from raw Overpass JSON. Use 2.2.12, not the 3.0 beta that has been stuck since 2022.
   - **Projects to local meters** from one origin point kept in `/shared/geo.ts`, so the server uses the same coordinates:
     - x = (lon − lon0) × 111,320 × cos(lat0)
     - z = −(lat − lat0) × 110,574
     - Error is negligible across a 3 km campus.
   - **Heights**, applied in this order (the usual Simple 3D Buildings convention):
     1. the `height` tag, parsing units like "m" and "ft"
     2. `building:levels` × 3.6 m (University Hall is 103 m over 28 floors, about 3.7 m per floor)
     3. a default by building type: university ≈ 4 levels, dormitory/apartments ≈ 5, house 2, parking garage 3, otherwise 3
     4. `min_height` / `building:min_level` for skywalks and canopies; if `building:part` shapes exist, draw those instead of the outline
     5. `overrides.json` keyed by OSM id, for hand fixes
   - **Roads and sidewalks.** OSM stores these as lines. Widen them into polygons with `@turf/buffer` (7.4.0), using a width per road type, and draw them at slightly different heights to avoid flicker. Green spaces are flat polygons. Trees and benches mapped as points become instanced models.
   - **Coverage report.** Print the percentage of buildings that have height or levels data, so we know how much guessing is involved.
   - **Output.** A compact `campus.json` (polygons in meters, heights, types), used by both client and server.
4. **Client.** Build a `THREE.Shape` per building and extrude it with `ExtrudeGeometry` (which uses earcut internally), then rotate it upright. Merge buildings into a few meshes, one per material. Later, if loading gets slow, bake the meshes to a compressed `.glb` with `@gltf-transform` 4.5.1.
5. **Tests.** A Vitest test with small fixture files covers height parsing, defaults and projection.

**License (ODbL): what we must show.**
- **In-game credit.** Show "**© OpenStreetMap contributors**", with "OpenStreetMap" linking to **https://www.openstreetmap.org/copyright**, in these places:
  - small text in a corner of the loading screen, main menu and in-game HUD, visible without clicking anything (OSMF guideline for interactive maps);
  - again on a Credits screen that names the ODbL.
- **Share-alike on the data.** `uic.geojson` and `campus.json` are a "derivative database" shipped publicly in the repo and in the client. They must stay under the ODbL; put a `data/osm/LICENSE.md` next to them saying so. The game's code can use any license.

**If OSM height coverage at UIC is weak** (I could not check this; the first pipeline run will show it):
1. Hand overrides for the roughly 30 landmark buildings, from the owner's own floor counts. Optionally fix them in OSM too, using your own observation, not Google.
2. Overture Maps buildings (2026-08 release). It has a `height` column, including lidar-based estimates. Licensing is mixed: ODbL for OSM-derived buildings, CDLA-Permissive for the rest.
3. City of Chicago Building Footprints. The city re-licensed this for the 2013 OSM import; whether it has a "stories" field is unverified.
4. Do not use Google 3D tiles. Their terms forbid extracting the geometry.

## 3. Multiplayer server and hosting

**Authoritative server, in one sentence:** the server, not the players' browsers, decides what really happened (timers, who reached the checkpoint first, who won); browsers only send inputs and requests.

**Do we need it? Yes, for the rules; a light version for movement.**
- **Server decides:** mission timers, checkpoints, item spawns and pickups, race start, finish order and scores.
- **Movement:** each browser moves its own character and sends position 10–20 times a second. The server rejects anything impossible: speed above a cap, teleports, or a position inside a building footprint, using shared point-in-polygon code.
- That is enough anti-cheat for a fan project. Colyseus 0.18 has built-in client-side prediction, which gives a path to fully server-simulated movement later if cheating becomes a problem.

**Frameworks**

| | Colyseus 0.18 | Socket.IO 4.8 | PartyServer (Cloudflare Durable Objects) |
|---|---|---|---|
| What you get | Rooms, matchmaking, automatic binary state sync (only changes are sent), reconnection, client prediction (new in 0.18, May 2026), test helpers | A bare message pipe; you build state sync yourself | Rooms on Cloudflare, message broadcast; no state sync |
| Examples | Good, game-specific | Huge | Fewer |
| Runs on | Any Node host | Any Node host | Cloudflare only (not a normal Node runtime) |

**Pick: Colyseus.** Its fixed room/state structure keeps code written by different agents consistent, and it is made for exactly this kind of game. Known trap: agents trained on older versions will import `colyseus.js`. The 0.18 client package is `@colyseus/sdk`. Pin versions and write this into the agent instructions.

**Hosting (2026)**

| Host | Real free tier? | Limits that matter | Est. cost at ~50 players | Beginner difficulty |
|---|---|---|---|---|
| **Render** | Yes. 750 instance-hours/month per workspace | Free instance sleeps after 15 min with no HTTP or WebSocket traffic and takes about 1 min to wake; may restart at any time; about 512 MB RAM and 0.1 CPU (unverified). **New 2026 plans cut Hobby bandwidth from 100 GB to 5 GB/month, then $0.15/GB** | Starter $7 + bandwidth → about **$10–15/mo** | **Easiest**: GitHub auto-deploy, web dashboard |
| Fly.io | No. New accounts get a short trial only (about 2 machine-hours or 7 days, third-party figure) | Card required; command-line tool + Docker | about $3.19 (512 MB) + $0.02/GB → **about $4–5/mo** | Medium |
| Railway | Sort of. $5 trial, then a permanent $1/month credit, which is too little to stay online | Hobby $5/mo includes $5 usage; 512 MB online all month ≈ $5; bandwidth $0.05/GB | **about $8–10/mo** | Easy |
| Cloudflare Durable Objects (PartyServer) | Yes. 100k requests/day; incoming WebSocket messages count 20 per request; outgoing messages free | Free tier **fails hard** when the daily cap is hit, until 00:00 UTC (7 pm Chicago in summer). 50 players at 10 Hz use the free day in about 1 hour | Workers Paid $5 + about $1 → **about $5–6/mo**, never sleeps | Medium (Workers runtime is not Node) |
| Colyseus Cloud | No. From $15/mo | Managed for you | $15+/mo | Easiest operations, but paid |
| Koyeb | One free instance; sleeps after about 1 h idle; acquired by Mistral in Feb 2026 | | | Easy, but its future is uncertain |

**Bandwidth estimate (rough).**
- Each update costs about 15–20 bytes per moving player.
- 50 players × 50 recipients × 20 updates/s ≈ 1 MB/s, about **3.5 GB per hour** of full 50-player play. At 10 updates/s it is about 1.7 GB/h.
- Example month: 10 two-hour 50-player events plus casual play ≈ 30–60 GB.
- On Render that is $7 + roughly $4–8 overage, so about **$10–15/month**.
- Ways to lower it:
  - update 10 times a second instead of 20;
  - only send each player the others within about 150 m (Colyseus `StateView`);
  - choose Render's **Ohio** region, the closest to Chicago (helps latency, not cost).

**Recommendation: Colyseus on Render.**
- Use the Free instance while building; it costs $0. The client shows "Waking server…" during the 1-minute wake-up, and Colyseus reconnection handles restarts.
- Switch to Starter ($7) before running scheduled 50-player events.
- Set a billing alert.
- Keep a Dockerfile in `/server`. If the Render bill bothers you, the same server moves to Fly.io (about $4–5/mo) in an afternoon.

## 4. Hosting the game website

**Pick: Cloudflare Pages ($0).** Connect the GitHub repo, build command `npm run build -w client`, output folder `client/dist`, and set the env var `VITE_SERVER_URL=wss://<app>.onrender.com`. The server's CORS settings must allow the `*.pages.dev` domain.

- **Why Cloudflare:**
  - Serving static files is free with no bandwidth limit, which matters because 3D models are big.
  - Every pull request gets its own preview URL, so the owner can playtest each change before it is merged.
  - Limits are 20,000 files and 25 MiB per file on the free plan.
  - Cloudflare now steers new projects toward "Workers with static assets". Either option is free; Pages is the simpler Git setup.
- **Alternatives:**
  - GitHub Pages: 1 GB site, about 100 GB/month soft bandwidth cap, no PR previews. A fine fallback.
  - Netlify: now runs on 300 credits/month, roughly 15 GB of bandwidth; all sites pause when credits run out.
  - Vercel Hobby: 100 GB, and non-commercial use only.

## 5. Accounts, login and saving progress

**v1: no login.**
- The player picks a nickname (length limit, profanity filter, block names like "Admin" or "UIC").
- Store a random device ID, the nickname and personal bests in `localStorage`.
- The server keeps the current leaderboard in memory. Losing it on restart is acceptable for v1, because Render's disk is wiped on restart.

**Later: Supabase free tier.**
- Free tier: 500 MB Postgres, 50k monthly users, anonymous sign-in, optional email magic link.
- Free projects pause after 7 days without activity; restore them from the dashboard.
- It pairs well with Colyseus 0.18's optional `@colyseus/database`, which uses Postgres.
- Firebase's free Spark plan, with anonymous auth, is the alternative.

**Privacy**
- Don't collect real names, emails, NetIDs or student IDs, real-world GPS location, photos, or free-text chat in v1. Use preset emotes or quick-chat instead.
- FERPA covers university records, not a student fan project. Still, don't build on UIC login or rosters without university approval.
- If you ever collect emails:
  - publish a short privacy policy;
  - add a "13+" age line (COPPA);
  - let users delete their data;
  - let Supabase handle passwords rather than storing them yourself.
- Use "UIC" only as plain fact. Don't use logos, and add "Unofficial fan project, not affiliated with the University of Illinois Chicago." (General guidance, not legal advice.)

## 6. Project structure and tooling

```
/client              Vite 8 + TS + three.js + Rapier (game, HTML HUD)
/server              Colyseus 0.18 (start from `npm create colyseus-app@latest`), Dockerfile
/shared              types, message formats, geo.ts (projection), movement limits, mission definitions
/tools/map-pipeline  build-campus.ts, overrides.json, fixtures + tests
/data/osm            uic.geojson (raw snapshot) + README (date/query) + LICENSE.md (ODbL)
/client/public/assets  optimized .glb models + CREDITS.md (every asset: author, license, URL)
/e2e                 Playwright smoke tests
/docs                decisions log, "how to run" for the owner
AGENTS.md / CLAUDE.md  pinned versions, API rules ("@colyseus/sdk not colyseus.js", "no React"), commands
.github/workflows/ci.yml
```

- **Monorepo:** npm workspaces (built into npm; no pnpm or Turborepo). Node 22 LTS, pinned in `.nvmrc` and `engines`.
- **One command to run everything:** `npm run dev` starts client and server together (via `concurrently`).
- **TypeScript (strict), used only for type-checking:** `tsc --noEmit`. TS 7.0.2 is about 10× faster. Its programmatic API doesn't exist until 7.1, so typescript-eslint can't run on it. Use **Biome 2.5** for lint and format instead. If any tool rejects TS 7, pin `typescript@6`.
- **Build:** Vite 8.3 (client); `tsx` for the server, as the Colyseus template does.
- **Tests:**
  - **Vitest 5.0** for shared rules, the map pipeline and server rooms (with `@colyseus/testing`). It needs Node ≥ 22.12.
  - **Playwright 1.64** smoke test: start client and server, open two browser windows, check that a WebGL canvas renders and that each player sees the other.
  - Headless Chromium no longer falls back to software WebGL automatically. Launch it with `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader`.
- **CI (GitHub Actions)** on every pull request: `npm ci` → Biome → typecheck → Vitest → build → Playwright. Free for public repos; private repos get 2,000 minutes/month.
- **Deploys:** Cloudflare and Render deploy automatically from `main`.

## 7. Free 3D assets

| Need | Source | License | Notes |
|---|---|---|---|
| Characters with walk/run | **Quaternius Universal Base Characters** + **Universal Animation Library** (free "Standard" tier, about 45 clips including walk/jog/sprint in 8 directions; UAL 2 released Jan 2026) | CC0 | glTF available. Shared skeleton claimed (unverified), so test pairing in Milestone 1. Newer Quaternius releases may use the "Quaternius Asset Licence" (free for games, no reselling the raw pack) (unverified) |
| Backup characters | Kenney Animated Characters 1–3 | CC0 | Clips are idle/run/jump only, no walk |
| Cars | Kenney Car Kit (40+ vehicles, glTF) | CC0 | |
| Trees, benches, props | Kenney Nature / City / Furniture kits; Quaternius nature packs | CC0 | Check each zip for GLB/glTF files |
| Odd items | Poly Pizza | **Per model: CC0 or CC-BY 3.0** (unverified; I couldn't open the site) | CC-BY needs credit in the form "Name by Author [CC-BY] via Poly Pizza" |
| Avoid in a public repo | Mixamo | Adobe terms | Fine inside a game, but committing the raw FBX files counts as redistribution |

Run every model through `gltf-transform` (compression, smaller textures) and log it in `CREDITS.md`.

## 8. Biggest technical risks

| Risk | How to reduce it |
|---|---|
| AI agents use outdated APIs (three.js updates monthly; Colyseus 0.18 renamed packages; TS 7) | Pin exact versions and commit the lockfile. List versions and doc links in AGENTS.md. Keep PRs small with CI on each. Upgrade on purpose, not by accident. |
| Weak or wrong OSM heights and footprints | Coverage report, per-type defaults, `overrides.json`, owner walk-through; Overture as a fallback |
| Slow on school laptops with integrated graphics | Merge static buildings into a few meshes; instance trees and benches; cap pixel ratio at about 1.5; one shadow light or none; keep the whole download under about 30 MB; test on a cheap laptop each milestone |
| Netcode jitter and cheating in races | Server-owned timers and checkpoints; speed and teleport checks; about 100 ms interpolation for other players; load-test with bot players (Colyseus loadtest tool) before events |
| Hosting price or policy changes (Render's 2026 bandwidth cut is a live example) | Billing alerts; static files on Cloudflare; a Dockerfile so the server can move; lower update rate and send only nearby players |
| Free server sleeping or restarting mid-session | "Waking server" screen; Colyseus `allowReconnection`; paid Starter for events |
| Legal: OSM credit, asset licenses, UIC trademarks | Persistent OSM credit + ODbL file; CREDITS.md; no logos; disclaimer |
| Abuse: offensive names, harassment | No free chat in v1; name filter; admin kick/ban command |
| Scope creep | Milestones: (1) walk the campus alone, (2) see other players, (3) one timed "go to X" mission, (4) races, (5) item collection |

---

## Recommended stack

| Component | Choice | Cost | Why |
|---|---|---|---|
| Language | TypeScript (strict), Node 22 | $0 | One language for client, server and tools; types catch agent mistakes |
| 3D rendering | three.js 0.186 (plain, WebGLRenderer) | $0 | Most examples and agent training data; smallest API |
| Physics / character | Rapier 0.21 `KinematicCharacterController` | $0 | Ready-made walking and collision; works in browser and Node |
| UI / HUD | Plain HTML/CSS overlay (+ lil-gui for debug sliders) | $0 | No React layer to manage |
| Map data | One-time OSM export → committed GeoJSON → `build-campus` script (osmtogeojson 2.2.12, turf 7.4, three ExtrudeGeometry) | $0 | Repeatable, testable, works offline |
| Multiplayer | Colyseus 0.18 + `@colyseus/sdk` | $0 | Rooms, state sync, reconnection and prediction built in |
| Server hosting | Render, Ohio region: Free for development → Starter for live events | $0 now; ≈ $10–15/mo with regular 50-player sessions | Easiest to keep running; GitHub auto-deploy. Fallback: Fly.io at about $5 |
| Website hosting | Cloudflare Pages | $0 | Unlimited static bandwidth; preview link for every PR |
| Accounts / saves | v1: nickname + localStorage; later: Supabase free | $0 | Avoids handling student data |
| Assets | Quaternius characters + animations, Kenney cars/props/nature (CC0); Poly Pizza checked per model | $0 | Free, licensed for games, include walk/run |
| Asset optimization | gltf-transform CLI | $0 | Smaller downloads |
| Build / lint | Vite 8 + Biome 2 | $0 | Fast, little configuration, unaffected by TS 7's missing API |
| Tests / CI | Vitest 5 + @colyseus/testing + Playwright 1.64 on GitHub Actions | $0 | Automatic safety net for code the owner doesn't read |
| **Total** | | **$0/mo while building; ≈ $10–15/mo during live play** | Optional domain about $10/yr |

## Sources
- npm registry (versions and licenses verified directly 2026-10-09): https://registry.npmjs.org
- https://render.com/docs/free
- https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages
- https://render.com/docs/outbound-bandwidth
- https://render.com/docs/new-workspace-plans
- https://render.com/changelog/updated-plans-for-render-workspaces
- https://jwatte.com/blog/render-com-platform-review/ (third-party: Free 0.1 CPU, Starter $7)
- https://fly.io/docs/about/discontinued-plans/
- https://fly.io/docs/about/pricing/
- https://temps.sh/blog/fly-io-pricing-2026
- https://docs.railway.com/reference/pricing/free-trial
- https://docs.railway.com/pricing/plans
- https://station.railway.com/billing/the-pricing-page-says-the-free-tier-is-aa5cf208
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/changelog/2025-04-07-durable-objects-free-tier/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/static-assets/compatibility-matrix
- https://github.com/cloudflare/partykit
- https://blog.cloudflare.com/cloudflare-acquires-partykit
- https://www.koyeb.com/docs/faq/pricing
- https://www.colyseus.io/pricing
- https://colyseus.io/blog/colyseus-018-is-here/
- https://docs.colyseus.io/migrating/0.18
- https://docs.colyseus.io/deployment/
- https://docs.colyseus.io/state/optimization
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- https://netli.fyi/blog/netlify-free-plan-limits-2026
- https://vercel.com/docs/limits/fair-use-policy
- https://www.openstreetmap.org/copyright
- https://osmfoundation.org/wiki/Licence/Attribution_Guidelines
- https://lists.openstreetmap.org/pipermail/osmf-talk/2021-June/007856.html
- https://wiki.openstreetmap.org/wiki/Overpass_API
- https://wiki.openstreetmap.org/wiki/Overpass_turbo/GeoJSON
- https://wiki.openstreetmap.org/wiki/Simple3DBuildingsV1
- https://wiki.openstreetmap.org/wiki/Chicago,_Illinois/Buildings_Import
- https://docs.overturemaps.org/blog/2026/08/19/release-notes/
- https://en.wikipedia.org/wiki/University_Hall_(University_of_Illinois_Chicago)
- https://rapier.rs/docs/user_guides/javascript/character_controller
- https://threejs.org/manual/en/webgpurenderer
- https://www.utsubo.com/blog/threejs-vs-babylonjs-vs-playcanvas-comparison
- https://app.cinevva.com/blog/2026-06-09-web-game-engines-2026-comparison
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/
- https://infoq.com/news/2026/08/typescript-7-released/
- https://vite.dev/blog/announcing-vite8
- https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/oLrB5up_BwAJ
- https://kenney.nl/support
- https://kenney-assets.itch.io/car-kit
- https://kenney-assets.itch.io/animated-characters-3
- https://quaternius.com/packs/universalanimationlibrary.html
- https://quaternius.itch.io/universal-base-characters
- https://opengameart.org/content/universal-animation-library-2
- https://flat.social/credits (example of Poly Pizza CC-BY credits)
- https://community.adobe.com/questions-696/redistribute-mixamo-animations-as-part-of-589455
- https://supabase.com/pricing
- https://firebase.google.com/docs/auth/limits
