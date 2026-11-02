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

### WORLD-03 (P1) A ditch with no floor runs along the Plant Research Laboratory (player falls through the world)
- Evidence: campus.json building `da946c72` (greenhouse, 3.78 m, plan about x 337..379, y -343..-330). Down-rays at x 366..377 show: roof top at z 330..341 (world), then **no ground and no roof at z 342..343**, then ground again from z 344 (campus-ground cut-out is wider than the building and the building prism's south wall sits inside the cut). Walking east/west along z 342.5 from (360,342.5) falls to y -78 (fuzz agent 225 fell at world (371.8, 342.5); 2 of 4 crossing directions of the void cell at plan (366,-342) fall). The result is the killY teleport back to the Daley spawn.
- This is the only floor hole outside the world edge among the 74 sliver-sized void cells tested (the other 73 crossed safely).
- Fix: in the map pipeline, cut ground only at the cleaned building footprint (or snap the cut to the same ring the prism uses); add a regression test that casts a grid of down-rays over every `sidewalk/grass/plaza` polygon and reports cells with no hit and no building above.
- Effort: S-M / Owner: World Builder (`tools/map-pipeline`, `world/campus/ground.ts`).

### WORLD-04 (P1) Three of the nine SEL/SEO doors open into another building
- Evidence: in the full world, doors `sel-seo:door_01` (world 213.9, 230.7), `door_04` (90.9, 195.4) and `door_05` (118.1, 232.8) cannot be walked through: a ray from 3.5 m outside at 0.3/1.0/1.8/2.3 m height hits a solid wall right at the door plane (3.42 / 3.71 / 3.45 m), while doors 02, 03 and 06..09 are open. The footprint lookup shows what stands in front of each: door_01 faces the Engineering Research Facility (14.9 m), door_04 and door_05 face the Computer Design Research and Learning Center (9.5 m / 23 m). Both are generic walled prisms. The CI door test (`buildings.walk.test.ts`) builds each glb alone on flat ground, so it cannot see this.
- Impact: dead doors on a model the glb author reported with `wall_gaps 0`; a player or bot routed to those doors gets stuck on a wall. ERF and CDRLC also overlap SEL's footprint (CDRLC: 9 % of its sample points lie inside replaced footprints), so the two buildings are drawn through each other.
- Fix: remove the three door markers from sel-seo.glb (or open real connections), and trim/clip ERF and CDRLC footprints against SEL in the pipeline. Add a full-world walk test (all glbs + generic campus) to `world/buildings`.
- Effort: S (doors) + M (footprint clip + test) / Owner: World Builder.
