# World audit (World Builder, Round 1)

Status: IN PROGRESS. Findings are appended as they are verified.
Scope: building colliders vs visuals, Atlas glb vs code vs OSM buildings, landmark accuracy, battle-royale map design, props and trees.

## Findings (detail, appended as verified)

Method notes: all numbers come from a headless Node harness (not committed) that builds the real campus.json, the two code landmarks and all ten Atlas glbs into one `World`, loads every collider into real Rapier (`PlayerPhysics`) and probes it (ground grid at 3 m, 16-ray cover samples at 8 m, door walks, edge walks, 300 random-walk bots, stair walks). Plan coords are (x east, y north); world z = -y.

### WORLD-01 (P1) The edge of the map is open: you can walk off the ground and fall 60 m
- Evidence: `campus-ground` ends exactly at `data.bounds` (minX -887, maxX 513.9, minY -541.8, maxY 685.6). There is no wall or collider beyond it (`surroundings` and the Loop context are visual only). Running (4.5 m/s) at the west, north and south edges: the player passes the edge, drops through y=-2 about 3 m past the bounds and keeps falling to `killY` -60 (about 7 s). West: from (-881,-71.9) he ends at y=-335 after 12 s, so no floor is caught. Same at north (z -688) and south (z 545). Then `player/index.ts` teleports the player to the spawn point.
- Why it matters: the first zone circle is `circleCoveringPlanBounds`, so the whole rectangle (and its corners) is inside the safe zone. A player, or a bot with a bad route, can leave the map in the first minutes, and the fall-reset teleports him back to the Daley spawn, which is a free teleport in a battle royale. The visuals (ground fog plane, Loop skyline) make the edge look like more walkable city.
- Fix: add a ring of tall invisible walls (or a lethal-ish "out of bounds" wall with a HUD warning) at `data.bounds` inset about 1 m; also stop the killY teleport from being usable in-match (Gameplay). Make the zone circle fit inside the bounds, not around them.
- Effort: S (walls in `world/campus/ground.ts`) / Owner: World Builder (walls), Gameplay (zone + killY).

### WORLD-02 (P1) University Hall and Daley Library have no loot at all
- Evidence: `world/buildings/index.ts` strips `loot` markers for `farOnly` glbs (UH 10 and Daley 12 markers are thrown away), `collectBuildingLootMarkers` skips `farOnly` buildings, and the code landmarks (`universityHall.ts`, `daleyLibrary.ts`) place none. Kept building loot after floor snap, by building: Lecture Centers 17, SCE 20, SEL/SEO 12, BSB 8, Douglass 8, Grant 7, Lincoln 8, Architecture & Design Studios 20 (100 total, 0 dropped). UH and Daley: 0.
- Why it matters: Daley is the spawn building and the only large fully furnished interior (4 floors, full furniture); UH is the landmark every UIC student knows. Nothing to find inside means nobody has a reason to enter, which wastes the best interiors on the map and the "landmarks get full interiors" rule.
- Fix: add loot spots inside both code landmarks (use the glb marker positions, which are already in the meta: UH 10, Daley 12, re-snapped to the code floors) and feed them into `extraLoot`.
- Effort: M / Owner: World Builder (landmarks) with Gameplay (loot table).
