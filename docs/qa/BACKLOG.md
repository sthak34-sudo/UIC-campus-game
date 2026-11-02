# Quality Pass Backlog (ranked)

Built by the Project Lead from the eight round-1 audits in [`docs/qa/audit/`](audit/). The audits found **127 problems: 6 game-breaking (P0), 53 major vs the owner's bar (P1) and 68 polish items (P2)**.

**Standards:** PUBG as the reference, all four areas, a normal student laptop. See `docs/TEAM.md`.

**IDs** point at the full evidence in the audit files, for example `CMB-01` is in `audit/combat.md`.

## What the audits agree on

1. **The game has a match loop but no real fights.** Enemy bots stand still and get killed by the zone, and the player gets no feedback when shot.
2. **The gun doesn't feel like PUBG.** It has no hold-to-fire, no recoil or spread, and kills take about 2.5× too long.
3. **It's too heavy for a student laptop.** About 1,650 draw calls per frame, with a budget of about 300.
4. **The Atlas building models don't match the rest of the world.** They are blank concrete with textures 3× too big.
5. **The game is stable.** Five full matches had zero errors and no leaks across Play-agains in logic.

## Batch 1: Fights that feel real (Gameplay + AI + UI)

*Goal: a match where enemies actually fight, and you can feel every shot, hit and heal.*

| Order | Item | Findings | Owner |
|---|---|---|---|
| 1 | Zone damage must not kick the camera or cancel healing | CMB-01 | Gameplay |
| 2 | Hold-to-fire rifle, recoil, spread, moving and jumping penalties, crosshair that tells the truth | CMB-02, CMB-03 | Gameplay |
| 3 | PUBG-like time to kill: damage, fire rate, falloff, armor | CMB-06 | Gameplay |
| 4 | Movement tiers: walk, sprint, crouch speeds, and no firing while sprinting | CMB-08 | Gameplay |
| 5 | Heal rules, ADS zoom, crouched headshots, crouched muzzle height | CMB-07, CMB-10, CMB-11, CODE-14, CMB-12 | Gameplay |
| 6 | **Damage feedback.** Direction indicator, hit flinch and sound when a bot shoots you. A new `notifyHit` call that AI wires to bot hits and UI draws. | CMB-04, UI-04 | Gameplay defines it, AI wires it, UI draws it |
| 7 | Hitmarker and kill confirmation | CMB-05, UI-05 | Gameplay + UI |
| 8 | Enemy squads move: loot, rotate, hunt. Sprint to the zone. Validated start spots. Stuck watchdog. | AI-01, AI-05, AI-06, AI-07, QA-11 | AI |
| 9 | Bots play like people: reaction delay, field of view and turn rate, a first pass at cover and crouch | AI-02, AI-03, AI-04 | AI |
| 10 | Bot planner can hitch a frame; bots stuck at no ammo; zone damage on downed bots; wrong "Victory"; crawl | AI-08, AI-13, AI-14, AI-15, AI-17 | AI |
| 11 | Revive prompt and progress bar; downed banner text; ping at the aimed point | UI-01, UI-02, UI-03 | UI/UX |
| 12 | Kill feed no longer prints over the zone timer; objective and clean help text for new players; remove debug text from the public HUD | UI-17, UI-07, UI-09, UI-22 | UI/UX |
| 13 | Small bugs: spectate banner leak, "Health 0" while downed, survived time includes loading | QA-04, QA-07, QA-01 | AI / UI / Gameplay |

## Batch 2: Fast and solid (Performance + World + Code Steward)

*Goal: smooth on a student laptop, no holes in the world, a clean public build.*

| Order | Item | Findings | Owner |
|---|---|---|---|
| 1 | Cut about 1,650 draw calls toward 300. Fix shadow cascades, merge and cull trees, characters, landmarks and crates. | PERF-04 | Performance |
| 2 | Frame-time quality governor, render scale, iGPU rules | PERF-05 | Performance |
| 3 | Shader warm-up with real lights, behind the loading screen | PERF-06 | Performance |
| 4 | Play again leaks: 88 GPU textures and 4 audio contexts per restart | PERF-08, QA-03 | Performance |
| 5 | Faster load: parallel fetches, lazy interior textures, KTX2 for all, about 24 MB toward 14 MB | PERF-01, 02, 03 | Performance |
| 6 | Point-light pool and HUD dirty-checking | PERF-07, PERF-09 | Performance |
| 7 | **Invisible walls at the map edge** | WORLD-01 | World Builder |
| 8 | Fix the ditch by the Plant Research Lab; 3 blocked SEL/SEO doors; loot crates inside walls | WORLD-03, WORLD-04, QA-05, QA-06 | World Builder |
| 9 | Zone pacing and loot placement: 37% of the first circle is off the map, final circles end in sealed housing, and Daley and University Hall have no loot | WORLD-05, WORLD-02, CMB-16, CMB-15 | World Builder + Gameplay (needs owner input) |
| 10 | Remove debug hooks from the public build (`__zone`, `__gfx`, `?test`) and gate cheat keys | CODE-01, QA-02 | Code Steward |
| 11 | CI: tests and typecheck before Pages deploy, no duplicate runs, test timeouts, Python tests | CODE-06, CODE-07, QA-09 | Code Steward + QA |
| 12 | Docs match the code: post-processing library, README options | CODE-08, CODE-15 | Code Steward |

## Batch 3: Looks (Art Director + World Builder)

*Goal: one consistent, believable, PUBG-toned world.*

| Order | Item | Findings | Owner |
|---|---|---|---|
| 1 | Atlas buildings match the rest: 1 texture unit per metre, real materials, brick where facades.md says, window rhythm | ART-02, ART-03, ART-04 | World Builder + Art Director |
| 2 | University Hall and Daley far shells: close the tier gaps, add window bands | ART-01 | World Builder |
| 3 | Horizon seam and one consistent PUBG-like lighting look at every quality level | ART-05, ART-06 | Art Director |
| 4 | Rifle that doesn't render black, held in a ready pose | ART-07 | Art Director + Gameplay |
| 5 | Character variety: 4 to 6 muted outfits | ART-08 | Art Director |
| 6 | Vertical play: stairs and roofs in the Atlas interiors | WORLD-06 | World Builder (large) |
| 7 | Cover and polish: open fields, garage fronts, courtyards, floating trees | WORLD-07 to 11 | World Builder |

## Batch 4: Interface and polish

*Goal: it feels like a finished game.*

- **Shared HUD style** (colors, fonts, sizes, scaling) and a PUBG-like layout (UI-10, UI-11, UI-12, UI-13, UI-20, UI-21)
- **Minimap** with heading arrow, roads and a map key (UI-06)
- **Pause and settings menu**, loading screen, end-screen focus (UI-14, UI-15, UI-23)
- **Audio:** footsteps, hit, reload and heal sounds, and distance falloff (CMB-09)
- **Smaller combat items:** fall damage, reload variants, bullet decals, tree cores (CMB-13, CMB-14, ART-09 to 13)

## Needs the owner's decision

1. **Licence (CODE-03).** There is no LICENSE file in a public repo, and the credits say "released under the project license". Options: MIT (anyone can reuse the code), all rights reserved (nobody may), or a non-commercial licence.
2. **Branch cleanup (CODE-04).** 69 of 73 remote branches are merged or obsolete and safe to delete. This is easy to undo only on GitHub for 90 days. OK to delete them?
3. **History size (CODE-05).** The repo is 237 MB, mostly old screenshots. Shrinking it means rewriting history, which breaks other copies. The proposal is not to rewrite and instead stop committing routine screenshots from now on.
4. **Zone and loot design (WORLD-05).** The safe zone can end in places with nothing to fight over. Should the final circles be pulled toward the campus core and the buildings with loot?
5. **Deploy rule.** Everything so far is on the working branch. Should finished batches go to the public GitHub Pages site (via a pull request to `main`) after each review, or stay private until you say so?
