# UIC Campus Game: Project Plan

*Last updated: October 28, 2026 · Status: **Milestones 1–4 are built (single player with bots). Current phase: Quality Pass, with no new features.***

## 0. The plan in one minute

We're building a **realistic battle royale on the real UIC campus, played in a web browser**.
You drop in with a **squad of four**, loot weapons and armor, and fight until one squad is left standing.
The map is the real East Campus: real building shapes, real heights, brutalist concrete.

A team of AI agents writes the code. You're the **Producer**: you decide what the game should be and you playtest it.
The **Project Lead** reviews the work and explains it in plain English.

The game stays in the browser. It is built with **three.js** (graphics), **Rapier** (walking, bullets hitting walls), and **Vite** (the tool that runs the game on your computer). We are staying on that stack.

We build in **6 milestones**. Each one ends with something you can actually try:

1. ✅ **Practice combat:** shooting, damage, loot, training dummies, and a lighting pass.
2. ✅ **Safe zone:** a 6-phase shrinking circle that hurts anyone outside it.
3. ✅ **Real characters:** a CC0 human body with CC0 animations, aiming, a two-handed rifle, and foot IK on stairs.
4. ✅ **Squads of 4 (with bots):** bot teammates, downed and revive, spectate, pings, enemy bot squads, and an end-of-match screen.
5. ⏸️ **Online matches:** a game server that decides who got hit. Not started, and on hold during the Quality Pass.
6. ⏸️ **Bigger map:** the wider campus with simpler far-away buildings. On hold.

**Current phase: Quality Pass.** No new features. The team raises what already exists to the owner's standards. See section 8a.

**Play it:** https://sthak34-sudo.github.io/UIC-campus-game/ (rebuilt automatically from `main`).

**Cost:** $0 while we build. A server for real online matches comes only when you say so.

## 1. What we decided

| Question | Decision | What it means |
|---|---|---|
| What kind of game | **Battle royale, squads of 4** | Loot, fight, stay inside a shrinking safe zone, last squad wins. Inspired by the pace and readability of PUBG, set on UIC. |
| Look | **Realistic UIC** | Real footprints, laser-scan heights, brutalist concrete, brick, weathering. People and guns should read clearly in daylight and shade. |
| Where it runs | **Web browser** | A link, nothing to install. |
| Engine | **three.js + Rapier + Vite** | The stack we already have. Graphics, physics, and the local dev server. |
| Who decides hits | **Shared rules, server later** | Damage, headshots, falloff, and loot rules are plain functions. Today they run in your browser. Milestone 5 runs the same rules on a server that everyone has to trust. |
| Map | **Real East Campus first** | OpenStreetMap shapes, USGS heights. Wider map and streaming come in Milestone 6. |
| Characters | **CC0 realistic body + CC0 animations** | The public game uses a committed CC0 MakeHuman body and Quaternius CC0 clips. A private Mixamo `anims.glb` is used instead when present locally, and is never committed. |
| Interiors | **Buildings stay enterable** | Fighting outside comes first. Doors and floors we already have stay; we don't seal buildings off. |
| Setting | **Real UIC, as is** (owner's decision, Oct 28) | The game keeps the real campus and realistic weapons. The repo and the GitHub Pages build stay public. |
| Scope (Oct 28) | **Quality before features** | No new features until the owner says the current version meets their standards. |

## 2. The team

The owner asked for a real team setup. The **Project Lead** (the main Claude session) manages everything and has specialists working under them. Full role charters, quality bars and how work flows are in [`docs/TEAM.md`](docs/TEAM.md).

| Role | What they own |
|---|---|
| **Producer / Owner (you)** | What the game should be, the quality standards, and the final yes or no on every change you care about. |
| **Project Lead** (main session) | Plans the work, writes tasks, assigns them, reviews and merges every change, keeps the docs true, and reports to you in plain English. |
| **QA & Playtest Lead** | Plays the game (robot playtests and screenshots), finds and reproduces bugs, writes regression tests, and keeps the bug list. |
| **Art Director** | How the game looks: lighting, materials, characters, weapons, effects, and matching the real UIC. |
| **World Builder** | The campus: building shapes and models, colliders, roofs, doors, interiors, props, and map accuracy. |
| **Gameplay & Combat Designer** | How the game feels: movement, shooting, recoil, damage and time-to-kill, loot spread, and zone pacing. |
| **AI Engineer** | Bot teammates and enemies: smart, fair, never stuck, and readable. |
| **Performance Engineer** | Smooth on a 2020 school laptop: FPS, load time, memory, download size, and draw calls. |
| **UI/UX Designer** | The HUD, menus, loading and end screens, prompts, and readability for a first-time player. |
| **Code Steward** | Code health: tests, CI, cleanup, the repo (branches, licence), and docs that match the code. |

## 3. How we work

1. You say what you want, in plain English.
2. The Project Lead writes a small task with a definition of "done".
3. An agent builds on a **branch** (a draft copy of the project).
4. Tests run, and a robot takes screenshots.
5. The Project Lead reviews. Good work is merged. The rest goes back.
6. You playtest.

Everything lives in the GitHub repository `UIC-campus-game`. The repository is **public**, so anything committed can be seen by anyone. That is why non-shareable art files stay off GitHub (see section 6).

| Word | Plain-English meaning |
|---|---|
| **Repository** | The project folder on GitHub. |
| **Branch** | A draft copy where someone can work safely. |
| **Commit** | A saved checkpoint with a note. |
| **Pull request** | "Please review this draft and merge it." |
| **Client** | The part that runs in the player's browser. |
| **Server** | A computer that will connect players and judge hits. Not used yet. |
| **Hitscan** | The shot hits instantly along the crosshair. No travel time. |
| **Authoritative server** | The server, not each player's browser, decides who was hit. |

## 4. The map

**Version 1 battlefield = East Campus core**, about 1 km × 1.2 km:

- **North:** just past the I-290 / Eisenhower trench (UIC-Halsted Blue Line)
- **South:** just past Taylor Street
- **West:** just past Racine Avenue (Credit Union 1 Arena)
- **East:** just past Halsted Street (Student Recreation Facility, Hull-House)

Map box (south, west, north, east): `41.8685, -87.6600, 41.8772, -87.6455`

Walking corner to corner is about 15–25 real minutes. In a match, people sprint, so the first version will feel tight on purpose. Milestone 6 grows it.

**Landmarks players will fight around:**

- University Hall (the 28-story tower)
- Daley Library (walkable interior)
- The Quad and the Lecture Centers
- Student Center East, BSB, the science and engineering buildings
- Student Recreation Facility, ARC, Credit Union 1 Arena
- The Blue Line stations and Taylor Street

The old elevated walkways and the removed statues stay out. They are not on campus today.

## 5. How a match works

What exists today is the single-player version with bots. Online play with real people comes in Milestone 5.

- A squad is **four players**.
- Everyone starts with empty or light pockets and **loots** rifles, ammo, med kits, and armor around campus.
- **Body shots** and **headshots** land differently. Shots do less damage far away.
- A **safe zone** shrinks over the match. Outside it, you take damage.
- When your health hits zero you go down. A teammate can revive you (Milestone 4). The last squad alive wins.
- The browser draws what you see. From Milestone 5, the **server** is the referee for hits, health, loot, and the zone.

**What you can play now:**
- **The start:** you begin **unarmed** in front of Daley Library, with a rifle on the ground nearby. Loot (rifles, ammo, bandages, med kits, armor) is spread around campus inside the first safe circle. Practice dummies stand along the library walkway.
- **The zone:** it shrinks in 6 phases.
- **Squads:** `?squad=bots` adds 3 bot teammates and 3 enemy bot squads. Bots loot, heal, reload, follow the zone and fight. You can be downed and revived, then spectate teammates after you die.
- **The end:** a results screen shows placement, kills, damage and survival time, with **Play again**.
- **Test keys** (H, Z, K, J, L, O) only work in a local dev build or with `?debug` in the address. All controls are in [`README.md`](README.md).

## 6. Branding and asset rules

UIC has a trademark program. This is an unofficial fan project.

- **Don't use** the UIC logo, the seal, Flames or Sparky artwork, or restaurant and CTA logos.
- **Don't use** Google 3D Tiles, Photorealistic Tiles, Maps imagery, or Street View imagery or geometry.
- **Do use** real building and street names, and the real map shape, with the credit **© OpenStreetMap contributors** kept on screen.
- **People in the game are fictional.** No real professors or staff.
- **Title screen disclaimer:** *Unofficial fan project. Not affiliated with or endorsed by the University of Illinois Chicago.*
- **CC0 and self-made files** may be committed, and each one is listed in `CREDITS.md`.
- **Mixamo animations may be used** when we run the game. Mixamo files, raw or baked into another format, **must never be committed**. The same ban covers RenderPeople and anything else we are not allowed to redistribute. Those files live only in `client/public/models/private/`, which git ignores. If they are missing, the game uses the procedural character that is already in the repository.

Colors we may echo, without copying official marks: Fire Engine Red `#D50032`, Navy Pier Blue `#001E62`, Chicago Blue `#41B6E6`, Champions Gold `#FFBF3F`.

Full rules for agents: `CLAUDE.md`. Credits: `CREDITS.md`.

## 7. Technology

| Part | Tool | Why | Cost |
|---|---|---|---|
| Language | **TypeScript** | Catches a lot of mistakes before you play. | Free |
| 3D | **three.js 0.186** | Draws the campus in the browser. WebGL, so screenshots work on our test machines. | Free |
| Walking and shots | **Rapier** | Walls stop you. Shots ask Rapier what they hit. | Free |
| Dev server | **Vite** | `npm run dev` opens the game on your computer. | Free |
| Map | **OpenStreetMap / Overture + USGS LiDAR** | Real shapes and heights, saved in the repo. | Free |
| Characters (M3) | **CC0 MakeHuman body on a mixamorig skeleton, Mixamo clips** | Human motion. Clips stay out of git. Until then, the procedural character. | Free to use, not committed |
| Tests | **Vitest** | Checks damage math and the rest on every change. | Free |
| Match server (M5) | A small authoritative server | Same damage functions as the practice game. Hosting choice waits until you want online play. | $0 until you approve a host |

Pinned versions live in `CLAUDE.md`. We don't upgrade them casually.

**Server authority:** `client/src/combat/damage.ts`, `health.ts`, and `inventory.ts` don't touch the screen. They only do numbers. Today the browser calls them. Milestone 5 will call the same functions on the server, and the browser will only show the result.

## 8. Milestones

### Already in the game (before the battle royale)
Walkable East Campus, University Hall, Daley Library interior, sun, sky, shadows, and post-processing. You move with WASD, the mouse, Shift to run, Space to jump, V for camera, E to use, F3 for debug.

### ✅ Milestone 1: Practice combat and a lighting pass
- **Goal:** fight training dummies on campus, alone.
- **Work:**
  - Crosshair and left-click shooting. Hitscan through the Rapier world. Bullet marks and a muzzle flash.
  - Headshots do double damage. Damage falls off with distance. Fire rate, a magazine, and R to reload.
  - Dummies with health bars. At 0 they fall and stand back up after 5 seconds.
  - Your health bar. H (temporary) damages you. At 0, a death screen and a respawn.
  - Loot crates: rifle, ammo, med kit, armor. Walk up and press E. A "Press E" prompt and an inventory line.
  - Q uses a med kit.
  - A character loader that uses a realistic body and clips **when those files are present**, and the procedural character when they are not.
  - **Lighting:** a soft fill from the shadow side of the sun so characters stay readable. The existing sky and sun stay.
- **You'll see:** the library entrance, three dummies, and four crates. The test steps are in the Milestone 1 pull request.

### ✅ Milestone 2: Shrinking safe zone
- **Goal:** the battle-royale ring.
- **Work:** a circle on the campus, a warning before it moves, damage outside it, a simple on-screen guide to the next circle.
- **You'll see:** stand in the ring and stay safe; step out and the health bar drops.

### ✅ Milestone 3: Realistic animated characters
- **Goal:** people who move like people.
- **Work:**
  - A **CC0 MakeHuman** body, rigged to a **mixamorig** skeleton, loaded from `client/public/models/characters/player_base.glb` when that file is committed (CC0 only).
  - **Mixamo** clips for `idle`, `walk`, `run`, `crouch_idle`, `crouch_walk`, `aim_idle`, `fire`, `hit`, `death`, loaded from gitignored `client/public/models/private/anims.glb`.
  - If the clip skeleton doesn't match the body, retarget with `SkeletonUtils.retargetClip`.
  - Crouch and aim. **Upper body and lower body split at the bone `mixamorig:Spine`** so you can aim and shoot while the legs walk or crouch.
  - If the files are absent, keep today's procedural character. The public repo must still run.
- **You'll see:** crouch, aim down the sights, and shoot, with the legs still moving.

### ✅ Milestone 4: Squads of 4 (with bots)
- **Goal:** a team, still local or lightly networked.
- **Work:** four-player squads, a downed state, revive, teammate markers, names that are fictional.
- **You'll see:** a teammate go down and get back up.

### ⏸️ Milestone 5: Authoritative multiplayer server (on hold)
- **Goal:** real matches where one machine judges the fight.
- **Work:** a server that receives inputs and runs the same damage, health, loot, and (from M2) zone rules. Clients predict and correct. No trust in the shooter's own computer for the final hit.
- **You'll see:** two browsers in one match, and a shot that only counts when the server agrees.

### ⏸️ Milestone 6: Larger map and streaming (on hold)
- **Goal:** a bigger fight without melting a 2020 laptop.
- **Work:** a wider campus, level-of-detail (far buildings get simpler), and streaming so only the nearby blocks are fully loaded. Draw-call budget stays about 300 outdoors. Shadows stay on buildings and trees, not on tiny props.
- **You'll see:** a long sightline that still runs smoothly.

### 🔧 8a. Current phase: Quality Pass (from Oct 28)
- **Goal:** bring the existing game up to the owner's standards. No new features until the owner says so.
- **How:**
  1. The owner sets the standards.
  2. The team audits the game against them.
  3. The Project Lead turns the findings into a ranked list of fixes.
  4. Specialists fix them in small, reviewed pull requests.
  5. The owner playtests each batch.
- **Done when:** the owner signs off. Quality bars per area are in `docs/TEAM.md`.

### Later ideas (not promises)
Sound, a public link, accounts, seasonal events, phone controls. A public launch gets an explicit "unofficial fan project" disclaimer. If the project ever makes money or is promoted as official, ask UIC's Marketing & Brand Management office first.

## 9. Costs

| Item | When | Cost |
|---|---|---|
| Tools, map data, local play | Now | **$0** |
| Mixamo / MakeHuman use | On your machine | **$0**, and those non-CC0 files are not uploaded |
| Public game (GitHub Pages) | Now | **$0** |
| Match server | Only after you approve hosting | To be priced then. Nothing is deployed yet. |

## 10. How to playtest

**Play online:** https://sthak34-sudo.github.io/UIC-campus-game/

**Run it locally:** `npm install`, then `npm run dev`, then open http://127.0.0.1:5173.

**A full match:**
1. Open the game with `?squad=bots` at the end of the address.
2. Pick up the rifle in front of the library.
3. Loot, and stay inside the zone.
4. Fight the enemy squads.
5. Get downed and revived.
6. Finish on the end screen and press **Play again**.

**Quick zone test:** add `&zoneFast=1` to make the zone timers run 10× faster.

**Feedback:** tell the Project Lead what feels wrong, in plain English. That's the most useful input in the Quality Pass. Photos of campus buildings are still welcome (`docs/photo-guide.md`).

## 11. Risks

| Risk | How we handle it |
|---|---|
| Public repo and licensed art | Mixamo, RenderPeople, and anything we cannot redistribute stay in a gitignored folder. The game runs without them. |
| Cheating once matches are online | Milestone 5's server is the referee. The damage functions are already written so they can move there. |
| The campus is a small map for a battle royale | The zone makes a small map tense. M6 grows the map. |
| School laptops | Merged geometry, instancing, a draw-call budget, shadows only on big objects. |
| Trademark and public perception | No UIC logos, our own UI, a fan-project disclaimer, fictional people. The owner chose to keep the real campus and realistic weapons public (Oct 28). |
| Agents break pinned tools | Locked versions, tests on every change, small pull requests. |

## 12. Open questions

- **Title.** It should not sound like an official UIC product.
- **Match start.** Decided: you start unarmed, with a rifle on the ground nearby.
- **Voice and text chat.** Not planned. Squads use preset pings (P).
- **Quality standards.** The owner will define them at the start of the Quality Pass (see `docs/TEAM.md`).

---

*Map data © OpenStreetMap contributors, available under the Open Database License.*
