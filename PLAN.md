# UIC Campus Game: Project Plan

*Last updated: October 25, 2026 · Status: **The campus is walkable. Current build is Milestone 1: practice combat.***

## 0. The plan in one minute

We're building a **realistic battle royale on the real UIC campus, played in a web browser**.
You drop in with a **squad of four**, loot weapons and armor, and fight until one squad is left standing.
The map is the real East Campus: real building shapes, real heights, brutalist concrete.

A team of AI agents writes the code. You're the **Producer**: you decide what the game should be and you playtest it.
The **Tech Lead** reviews the work and explains it in plain English.

The game stays in the browser. It is built with **three.js** (graphics), **Rapier** (walking, bullets hitting walls), and **Vite** (the tool that runs the game on your computer). We are staying on that stack.

We build in **6 milestones**. Each one ends with something you can actually try:

1. 🎯 **Practice combat:** shoot, take damage, pick up loot, knock down training dummies. Plus a lighting pass so people in shadow are still easy to see.
2. ⭕ **Safe zone:** a circle on the campus that shrinks and hurts anyone outside it.
3. 🧍 **Real characters:** a proper human body and animations (walk, run, crouch, aim, shoot), with the upper body able to aim while the legs keep moving.
4. 👥 **Squads of 4:** teammates, downed-but-revivable players, squad markers.
5. 🖥️ **Online matches:** a game server that decides who got hit, so matches stay fair.
6. 🗺️ **Bigger map:** the wider campus, with far-away buildings drawn more simply so laptops keep up.

**Already built:** you can walk the East Campus, enter University Hall and Daley Library, and the sun, sky, and shadows are in place. Milestone 1 adds fighting on top of that.

**Cost:** $0 while we build. A server for real online matches comes only when you say so, and not in this milestone.

## 1. What we decided

| Question | Decision | What it means |
|---|---|---|
| What kind of game | **Battle royale, squads of 4** | Loot, fight, stay inside a shrinking safe zone, last squad wins. Inspired by the pace and readability of PUBG, set on UIC. |
| Look | **Realistic UIC** | Real footprints, laser-scan heights, brutalist concrete, brick, weathering. People and guns should read clearly in daylight and shade. |
| Where it runs | **Web browser** | A link, nothing to install. |
| Engine | **three.js + Rapier + Vite** | The stack we already have. Graphics, physics, and the local dev server. |
| Who decides hits | **Shared rules, server later** | Damage, headshots, falloff, and loot rules are plain functions. Milestone 1 runs them on your computer. Milestone 5 runs the same rules on a server that everyone has to trust. |
| Map | **Real East Campus first** | OpenStreetMap shapes, USGS heights. Wider map and streaming come in Milestone 6. |
| Characters | **Procedural now, realistic body in M3** | The public game uses a character built from code. A CC0 body and animation clips can be dropped in locally later. See the asset rules in `CLAUDE.md` and `CREDITS.md`. |
| Interiors | **Buildings stay enterable** | Fighting outside comes first. Doors and floors we already have stay; we don't seal buildings off. |

## 2. The team

| Role | Who | What they do |
|---|---|---|
| **Producer / Owner** | **You** | Decide the game, playtest each milestone, approve or send it back. You never need to write code. |
| **Tech Lead** | The main session | Turn your notes into tasks, review every change, keep the pieces fitting together. |
| **Map Engineer** | Agent | Campus ground, buildings, streets, trees, from the map data. |
| **Graphics Engineer** | Agent | Sky, sun, shadows, materials, the lighting pass. |
| **Landmarks Engineer** | Agent | University Hall, Daley Library, and their interiors. |
| **Player Engineer** | Agent | Walking, camera, the character you see. |
| **Combat Engineer** | Agent | Shooting, health, dummies, loot, the combat HUD. |
| **Multiplayer Engineer** | Agent | From Milestone 4–5: squads and the match server. |
| **QA** | Agent | Tests and screenshots before you play. |

## 3. How we work

1. You say what you want, in plain English.
2. The Tech Lead writes a small task with a definition of "done".
3. An agent builds on a **branch** (a draft copy of the project).
4. Tests run, and a robot takes screenshots.
5. The Tech Lead reviews. Good work is merged. The rest goes back.
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

This is the target. Only the practice version exists in Milestone 1.

- A squad is **four players**.
- Everyone starts with empty or light pockets and **loots** rifles, ammo, med kits, and armor around campus.
- **Body shots** and **headshots** land differently. Shots do less damage far away.
- A **safe zone** shrinks over the match. Outside it, you take damage.
- When your health hits zero you go down. A teammate can revive you (Milestone 4). The last squad alive wins.
- The browser draws what you see. From Milestone 5, the **server** is the referee for hits, health, loot, and the zone.

**Milestone 1 practice range** (what you can play now): you already have a rifle and some ammo. Training dummies stand near the Daley Library entrance. Colored crates on the ground are loot. There is no zone and no other players yet. The H key is a temporary way to hurt yourself so you can try the health bar and the death screen.

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

**Server authority:** `client/src/combat/damage.ts`, `health.ts`, and `inventory.ts` don't touch the screen. They only do numbers. Milestone 1 calls them from the browser. Milestone 5 will call the same functions on the server, and the browser will only show the result.

## 8. Milestones

### Already in the game
Walkable East Campus, University Hall, Daley Library interior, sun, sky, shadows, and post-processing. You move with WASD, the mouse, Shift to run, Space to jump, V for camera, E to use, F3 for debug.

### Milestone 1: Practice combat and a lighting pass
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

### Milestone 2: Shrinking safe zone
- **Goal:** the battle-royale ring.
- **Work:** a circle on the campus, a warning before it moves, damage outside it, a simple on-screen guide to the next circle.
- **You'll see:** stand in the ring and stay safe; step out and the health bar drops.

### Milestone 3: Realistic animated characters
- **Goal:** people who move like people.
- **Work:**
  - A **CC0 MakeHuman** body, rigged to a **mixamorig** skeleton, loaded from `client/public/models/characters/player_base.glb` when that file is committed (CC0 only).
  - **Mixamo** clips for `idle`, `walk`, `run`, `crouch_idle`, `crouch_walk`, `aim_idle`, `fire`, `hit`, `death`, loaded from gitignored `client/public/models/private/anims.glb`.
  - If the clip skeleton doesn't match the body, retarget with `SkeletonUtils.retargetClip`.
  - Crouch and aim. **Upper body and lower body split at the bone `mixamorig:Spine`** so you can aim and shoot while the legs walk or crouch.
  - If the files are absent, keep today's procedural character. The public repo must still run.
- **You'll see:** crouch, aim down the sights, and shoot, with the legs still moving.

### Milestone 4: Squads of 4
- **Goal:** a team, still local or lightly networked.
- **Work:** four-player squads, a downed state, revive, teammate markers, names that are fictional.
- **You'll see:** a teammate go down and get back up.

### Milestone 5: Authoritative multiplayer server
- **Goal:** real matches where one machine judges the fight.
- **Work:** a server that receives inputs and runs the same damage, health, loot, and (from M2) zone rules. Clients predict and correct. No trust in the shooter's own computer for the final hit.
- **You'll see:** two browsers in one match, and a shot that only counts when the server agrees.

### Milestone 6: Larger map and streaming
- **Goal:** a bigger fight without melting a 2020 laptop.
- **Work:** a wider campus, level-of-detail (far buildings get simpler), and streaming so only the nearby blocks are fully loaded. Draw-call budget stays about 300 outdoors. Shadows stay on buildings and trees, not on tiny props.
- **You'll see:** a long sightline that still runs smoothly.

### Later ideas (not promises)
Sound, a public link, accounts, seasonal events, phone controls. A public launch gets an explicit "unofficial fan project" disclaimer. If the project ever makes money or is promoted as official, ask UIC's Marketing & Brand Management office first.

## 9. Costs

| Item | When | Cost |
|---|---|---|
| Tools, map data, local play | Now | **$0** |
| Mixamo / MakeHuman use | Milestone 3, on your machine | **$0**, and those non-CC0 files are not uploaded |
| Match server | Only after you approve hosting | To be priced then. Nothing is deployed in Milestone 1. |

## 10. What to playtest in Milestone 1

Install and run are in the pull request. In short: `npm install`, then `npm run dev`, then open http://127.0.0.1:5173.

Try shooting the dummies (including a headshot), reloading, picking up each crate with E, using a med kit with Q, and pressing H until the death screen appears. Then respawn.

Photos of buildings are still welcome (`docs/photo-guide.md`). They are not required for this milestone.

## 11. Risks

| Risk | How we handle it |
|---|---|
| Public repo and licensed art | Mixamo, RenderPeople, and anything we cannot redistribute stay in a gitignored folder. The game runs without them. |
| Cheating once matches are online | Milestone 5's server is the referee. The damage functions are already written so they can move there. |
| The campus is a small map for a battle royale | Milestone 1 is a practice range on purpose. The zone (M2) makes a small map tense. M6 grows the map. |
| School laptops | Merged geometry, instancing, a draw-call budget, shadows only on big objects. |
| Trademark | No UIC logos, our own UI, a fan-project disclaimer, fictional people. |
| Agents break pinned tools | Locked versions, tests on every change, small pull requests. |

## 12. Open questions

- **Title.** It should not sound like an official UIC product.
- **Match start.** Practice gives you a rifle. A real match may start with empty pockets. We can decide before Milestone 4.
- **Voice and text chat.** Not in Milestone 1. Preset pings are safer than free typing when squads arrive.

---

*Map data © OpenStreetMap contributors, available under the Open Database License.*
