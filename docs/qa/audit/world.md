# World audit (World Builder, Round 1)

Audit only: no code or data changed. Scope: collider vs visual, Atlas glb vs code vs OSM buildings, landmark accuracy, battle-royale map design, props and trees.
Screenshots (gitignored): `screenshots/tmp/audit/world/` (`world-edge-west.png`, `world-edge-south.png`, `world-plant-lab-trench.png`). The brown strip along the greenhouse wall in the last one is the missing-ground ditch of WORLD-03.

## Summary

The world is solid where it was built to a recipe: 57 of the 60 glb door markers walk through, all 7 glb stairs climb to the upper floor, every building loot marker snaps to a floor (100 of 100), no glb is duplicated by a generic copy (all replaced ids are skipped), and 300 random-walk runners (30 s each, 4.5 m/s) never got truly stuck. The problems are at the seams and in the map design: the map edge is open on every side, one ditch swallows players, three doors face neighbouring buildings, and as a battle-royale map the matches end in sealed housing blocks while the two best landmarks have no loot and the glb buildings stop at the second floor.

Method: a headless Node harness (not committed) builds the real campus.json, both code landmarks and the ten Atlas glbs into one `World`, loads every collider into real Rapier and probes it: ground grid at 3 m (190k rays), 16-ray cover samples at 8 m (20k points, 128 ha), every door walked, every stair walked, edge walks, 300 random-walk agents, 20k generic-facade collider-vs-visual rays, 40 zone seeds. Plan coords are (x east, y north); world z = -y.

Already reported by others, confirmed or refined here (not re-derived): QA-05 (= WORLD-04, with cause), CMB-16 (= WORLD-05, with where zones end up), QA-06 (loot inside geometry; here 0 of 100 building pickups were dropped by the 0.5 m floor snap, so the 9/160 is something other than the glb floor snap (sidewalk pickups or a different check)), ART-01 (UH and Daley far shells; bounding boxes agree to 1 to 5 m: UH code 105.7 m vs glb 103.6 m, Daley code x[-23.9,30.9] vs glb x[-20.9,21.8], the code side includes the apron and entrance props), ART-02/03/04 (glb materials, not re-checked).

## Findings table

| ID | Sev | Title | Effort | Owner |
|---|---|---|---|---|
| WORLD-01 | P1 | Map edge is open on all sides: walk off, fall 60 m, teleport to spawn | S | World Builder (walls), Gameplay (zone, killY) |
| WORLD-02 | P1 | University Hall and Daley Library have no loot | M | World Builder + Gameplay |
| WORLD-03 | P1 | Floor-less ditch along the Plant Research Laboratory | S-M | World Builder (pipeline, ground) |
| WORLD-04 | P1 | 3 of 9 SEL/SEO doors open into ERF / CDRLC walls; CDRLC overlaps SEL | S + M | World Builder |
| WORLD-05 | P1 | Safe zones end in sealed housing blocks (default seed: plan -508, 146) | M | Gameplay (zone) + World Builder (loot, map) |
| WORLD-06 | P1 | Glb interiors are one floor deep: no stairs in 3 of 8, upper floors and roofs unreachable | L | World Builder |
| WORLD-07 | P2 | Large open fields with no cover on the east and west of the map | M | World Builder |
| WORLD-08 | P2 | Parking structures: solid invisible wall 2.5 m in front of the visible open bays | S | World Builder |
| WORLD-09 | P2 | Courtyards of generic buildings have no ground (about 1,330 m2, unreachable) | S | World Builder |
| WORLD-10 | P2 | 220 trees and 17 props stand on road asphalt, floating 0.15 m | S | World Builder |
| WORLD-11 | P2 | Brutalist generic facades: collider 0.45 m proud of the glass, piers poke 0.4 m out of the collider | M | World Builder |

Not verified (code only, no render): the facade specs and signature features for the Lecture Centers (butterflyColonnade), SCE (doubleStair), SEL (twistedPylons), SEO (scissorStairs), Grant/Lincoln/Douglas (roofPV) live in `world/campus/facadeSpecs.ts` / `features.ts`, but those buildings are replaced by glbs (`isReplacedByModel` skips them), so the code features no longer run. Whether the glbs carry those details needs a render by the Art Director. Also not checked: UH and Daley accuracy vs `facades.md` beyond heights (UH 103.6 m and Daley 18.9 m in the data match the research: 103 m, 18.0 m LiDAR roof).

## Findings (detail, appended as verified)

Method notes: all numbers come from a headless Node harness (not committed) that builds the real campus.json, the two code landmarks and all ten Atlas glbs into one `World`, loads every collider into real Rapier (`PlayerPhysics`) and probes it (ground grid at 3 m, 16-ray cover samples at 8 m, door walks, edge walks, 300 random-walk bots, stair walks). Plan coords are (x east, y north); world z = -y.

### WORLD-01 (P1) The edge of the map is open: you can walk off the ground and fall 60 m
- Evidence: `campus-ground` ends exactly at `data.bounds` (minX -887, maxX 513.9, minY -541.8, maxY 685.6). There is no wall or collider beyond it (`surroundings` and the Loop context are visual only). Running (4.5 m/s) at the west, north and south edges: the player passes the edge, drops through y=-2 about 3 m past the bounds and keeps falling to `killY` -60 (about 7 s). West: from (-881,-71.9) he ends at y=-335 after 12 s, so no floor is caught. Same at north (z -688) and south (z 545). East too: 6 of 300 random-walk agents fell off the east edge at x 515.8..518.7 (bounds maxX 513.9). Then `player/index.ts` teleports the player to the spawn point.
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

### WORLD-05 (P1) Safe zones end in sealed housing blocks, far from anything you can enter
- Evidence: `buildZone` over 40 seeds on the real bounds. The opening circle has radius 931 m (area 272 ha) on a 172 ha map, so 37 % of it is off the map (matches CMB-16); the phase-1 end circle is still 10 % off the map on average (19 % at worst). Final circles (r 36 m) land anywhere from x -645 to 237 and y -331 to 329. In 27 of 40 seeds there is no enterable building (the 8 glbs, Daley or UH) within about 100 m of the final circle. The default seed 1 ends at plan (-508, 146), about 535 m west of the spawn, among sealed apartment and house blocks (5 generic buildings within 60 m, none enterable); the median final circle is 371 m from the spawn.
- Loot: 100 building pickups, all in the 8 glbs between x -230 and 260 (core), plus up to 56 sidewalk/plaza pickups (28 m spacing). So the late game happens where there is only sidewalk loot and no interiors.
- Fix (map side): enter more buildings in the west and north (see WORLD-06), or bias zone centres toward the core in `buildZone` (Gameplay), and place loot in the west blocks. Needs a design decision from the Project Lead.
- Effort: M / Owner: Gameplay (zone) + World Builder.

### WORLD-06 (P1) Glb interiors are one floor deep; upper floors and every roof are unreachable
- Evidence: stair colliders per glb (from meta and walked): SCE 2, Douglass 1, Grant 1, Lincoln 1, Architecture & Design Studios 2, **Lecture Centers 0, SEL/SEO 0, Behavioral Sciences 0**. The 7 stairs all work (player ends at y 4.06 to 4.21, from a 4.2 to 4.5 m floor) but only go from the ground to the second floor. Down-ray floor levels: Douglass/Grant/Lincoln have floors at 0, 4, 7.5 to 8 and roof 11.5 (third floor and roof unreachable); BSB 0, 4, 9.5 to 10, 17.5 to 18; SEL 0, 4 to 4.5, 11.5 to 12, roof 21.5; SEO roof 49 (13 storeys). The Lecture Centers' second slab at y 4 to 4.5 (386 samples) has no way up. All loot sits at y 0 (LC, SEL/SEO, BSB) or on a reachable second floor. The roof colliders, parapets and `roof_walkable: true` in the metas are built and tested, but nothing leads to them.
- Impact: PUBG-style play needs rooftops and upper-floor fights. Right now 10 enterable buildings out of 1,340 give one or two floors each; the tall ones (SEO 13 floors, SEL 4, BSB 4, UH 28) are ground-floor shells.
- Fix: add one stair per extra floor and one roof stair per building to the glb pipeline (Atlas `tools/map-pipeline` or the glb source), extend `EXPECTED_STAIRS`. Cheapest high value: roof access for LC, SCE and SEL.
- Effort: L / Owner: World Builder.

### WORLD-07 (P2) Wide open fields with no cover on the east and west of the map
- Evidence (cover samples, 16 rays to 120 m at eye height 1.3 m, 20,072 outdoor points): 49 % of outdoor ground has mean line of sight of 70 m or more; 24 % has no solid object within 25 m. Biggest open clusters (mean sight 60 m or more, nothing solid within 10 m): about 27 ha east of Halsted around the Student Recreation Facility (plan x 317, y 1; 600 x 1,224 m extent), 13 ha around the Credit Union 1 Arena (-491, 306), 8 ha near the Jane Addams Homes (-707, -216), 1.6 ha around University Hall (-6, 129). By contrast the core is well covered: straight-line routes spawn to University Hall / SCE / SEL-SEO / ERF have a longest bare stretch of 0 to 40 m, spawn to BSB 48 m; the arena route has a 96 m bare stretch.
- Cover objects are small: trees only have a 0.45 x 0.45 x 3 m trunk collider, benches are 0.9 m high, bike racks 0.1 m thick, bins 0.6 m. Players can step onto 1.05 m benches/bins (fuzz agents reached y 1.05 to 1.5).
- Fix: add low walls, planters, parked cars or container props along the open east and west fields; consider a smaller playable rectangle (see WORLD-05).
- Effort: M / Owner: World Builder.

### WORLD-08 (P2) Parking structures: invisible wall in front of visible open bays
- Evidence: facade style `garage` uses `recess: 2.5` (open bays 2.5 m deep) but the physics volume is the full footprint prism. 20,789 collider/visual ray pairs: for `garage` the collider is a median 2.5 m nearer than the visible back wall (Halsted Street Parking Structure 152 samples, Harrison Street Parking Structure 112). Bullets and players stop at the façade plane, so the open decks look enterable and are not.
- Fix: either make the garage collider the deck slabs and columns (real cover and enterable) or fill the bays visually. A good BR location if opened up.
- Effort: S (fill) / M (open it up) / Owner: World Builder.

### WORLD-09 (P2) Courtyards of generic buildings have no ground
- Evidence: 239 of 190,594 ground cells have no ground and nothing above. 148 are courtyard holes: Student Residence Commons Courtyard (about 1,251 m2 at plan x 179..236, y 182..215), Science and Engineering - South (54 m2 at 137..143, -363..-357), an unnamed building at (-558, 30..36). Not reachable on foot (verified: no walker reached them), but the ground is missing, so anything seen from a roof or by a bullet falling in has nothing under it. 16 more cells inside generic footprints (e.g. Plant Research Lab, Henry Hall at (-10, 198), ARC at (-16, 309)) have no collider on top (ray leaks in the prism triangulation, vertical only).
- Fix: fill courtyards with grass in `ground.ts` (holes of building footprints) and close the prism roof leaks.
- Effort: S / Owner: World Builder.

### WORLD-10 (P2) Trees and props sit on the road at curb height
- Evidence: 237 of 4,565 instanced items have a ground height of 0 under them but are placed at +0.15 m (`CURB_H`): 220 trees (5.8 % of 3,778), 7 bus signs, 4 bike racks, 4 bus shelters, 2 street lamps. Examples: trees at world (-821.4, -223.8), (-713.6, -226.3), (-425.5, -232.7), (152.7, -246.2). They float 15 cm over asphalt and their 0.45 m trunk collider sits in the carriageway.
- Fix: in `trees.ts` / `props.ts`, drop the item to the local ground height (or filter out road-surface points).
- Effort: S / Owner: World Builder.

### WORLD-11 (P2) Brutalist generic facades: collider and visible wall disagree by up to 0.4 to 0.6 m
- Evidence: 16,981 collider/visual pairs on generic buildings. Most styles match within 0.15 m (71 % overall). `brutalist` (the UIC Netsch frame style: ERF, CDRLC, Stevenson, Jefferson, ETMSW and others) has a median 0.45 m (p90 0.60 m) gap where the collider is nearer than the window glass (deep recess), and p10 -0.40 m where the projecting piers stick out past the collider (a player can stand inside a pier, shots stop 0.45 m before the glass). 89 samples are over 0.6 m.
- Impact is small (cosmetic clipping and shots a little early), listed because the owner's bar says "no shooting through walls": the rays never pass through walls, they only stop early.
- Fix: grow the prism by the pier depth for frame-mode volumes, or add the pier boxes to the feature collider batch.
- Effort: M / Owner: World Builder.

## Checked and fine
- 57 of 60 glb door markers walk through in the real world (progress 7.8 to 8.3 m of 8.4 m; the 3 failures are WORLD-04). The Daley main door walks in; the UH east door walks 6.65 m of 8.4 m (stops about 3 m inside, probably the lobby core; not investigated).
- 7 of 7 glb stairs climb to the second floor; Daley and UH are code-built and covered by `walkability.test.ts`.
- Loot: 100 of 100 glb markers kept after floor snap, all on reachable floors.
- No duplicates or holes between OSM, glb and code buildings: every replaced id is present in campus.json and skipped by the generic builder; glb floor/wall colliders cover 90 to 100 % of each replaced footprint (BSB 90 %, Grant 92 %, SCE 95 %, rest 98 to 100 %), no glb collider vertex is more than 3.5 m outside its footprint except the Lecture Centers, whose colliders reach up to 22 m outside the OSM footprints (190 sample cells outside the footprints have collider tops from 0.9 to 11 m; likely colonnade, apron and roof overhang, not investigated). The only overlap is CDRLC (9 % of its area lies inside SEL/other replaced footprints).
- Random-walk fuzz, 300 agents x 30 s: 0 stuck in geometry (the one flagged was in a dead-end slot between two sheds but could leave, moving 2 m in 9 of 16 directions), 8 falls: 6 at the east edge, 1 at the south edge, 1 in the WORLD-03 ditch.
