# Landmarks: enterable buildings

Owner: Landmarks Engineer. This folder builds the hand-made landmarks (University Hall, Daley Library).
It also holds a **kit** for making *any* building enterable. The owner's rule is "we must be able to go
inside every building we work on", so every new building should follow the pattern below.

```
landmarks/
  index.ts            buildLandmarks(world, data): finds footprints by `landmark` id, viewpoints, spawn
  universityHall.ts   University Hall: tiered tower + enterable lobby
  daleyLibrary.ts     Daley Library: facade, slabs, stairs, core, doors, zones
  daleyInterior.ts    Daley Library furnishing, floor by floor
  kit/                reusable helpers (no building-specific code)
    frame.ts          fit a footprint -> local frame (x across, z along, y up) + local<->world
    batch.ts          MeshBatch: boxes merged into ONE mesh per material (meter UVs)
    colliders.ts      ColliderSet: invisible BoxGeometry colliders; slopedBox() for ramps
    walls.ts          buildWall(): straight wall with door/window openings (+ inner finish skin)
    rects.ts          rectMinusHoles(): floor slabs with stair/shaft openings
    stairs.ts         switchbackStair(): U-stair between two floors (steps, landing, rails, ramp colliders)
    railings.ts       guard rails (flat or sloped) with a collider
    doors.ts          slidingDoors(): automatic glass doors that open when you approach
    furniture.ts      Furnisher (chairs, desks, computer benches, carrels, tables, stacks, counters...),
                      BookFiller (instanced books), lightPanelGrid()
    lod.ts            interiorLod(): furniture is only drawn on/near the floor you are on
    zones.ts          addInteriorVolume(): world.addInterior() boxes for a rotated building
    focus.ts          where the player is (camera probe until World exposes a focus)
    materials.ts      TEMPORARY local materials (books, light panels, fire) - see "Requests"
```

## The pattern: 8 steps for an enterable building

1. **Frame.** `fitFootprint(building.footprint.outer)` gives a tidy local frame centered on the real
   footprint. Local x runs across the building, z runs along its long side, and y is up. Create a
   `THREE.Group` at `frame.origin` with `rotation.y = frame.rotY` and model everything in local
   coordinates. If the footprint has annexes, trim them like `analyseFootprint()` in `daleyLibrary.ts`.
2. **Constants first.** Put floor levels, bay sizes, wall thickness, door sizes and window rhythm in a
   const object at the top of the module (`LIB`, `UH`). Derive positions from the bay grid
   (`zk(k)` = column line k). Then a correction from the owner's photos is a one-number change.
3. **Shell.** Build columns, floor beams and parapet with `MeshBatch.box`. Build the infill walls per bay
   and per floor with `buildWall`, using window openings (`glass`) and a `skin` for the interior
   finish. One `ext` batch casts shadows; interior batches don't.
4. **Door cut.** On the ground floor, add `{ door: true }` openings at least **1.2 m wide and 2.3 m
   tall**; we use 2.0 to 2.2 by 2.6 m. Doorway openings get **no collider**. Put `slidingDoors()` in
   them: they slide open when the player is within 4 m. Leaves have no colliders, so a door can never
   lock anyone in or out. Add paving (an apron) with a floor collider outside each door so the step
   from the map ground is at most 5 cm.
5. **Floors.** Every floor is a slab: an `interiorFloor` top, a structural core, and an
   `interiorCeiling` underside. Build each slab with `rectMinusHoles(inner, [stairHole, ...])` and give
   each piece a `floor` collider. Floor-to-floor heights are constants.
6. **Stairs.** Call `switchbackStair()` once per floor pair. It returns the `hole` to cut out of the
   upper slab. Use the same `x0/z0` for every pair so the flights stack, and the same far end (`zEnd`)
   so the well lines up. Rise is at most 0.18 m (we get 0.175), run is 0.28 m, and each flight is at
   least 1.5 m wide (we use 2.0). Put guard rails around each hole on the upper floor. On the top floor,
   also close the start edge of the hole.
7. **Interior zone + LOD.** Call `addInteriorVolume()` once per floor so the renderer can switch to
   interior exposure. Put each floor's furniture in its own group and pass the groups to
   `interiorLod()`.
8. **Furnish.** Use `Furnisher` through a floor plan with obstacle checks. See `FloorPlan` in
   `daleyInterior.ts`, which skips pieces that would hit columns, cores or stair wells. All furniture
   merges into one batch per floor. Books are the only instanced items: one InstancedMesh per floor,
   with a color for each book. Then add a few `PointLight`s (no shadows) and emissive ceiling panels
   with `lightPanelGrid()`.

Then add viewpoints (`<area>-*`) and **look at the screenshots**. Add a walk test like
`walkability.test.ts`, which probes a path with rays against the colliders, from the spawn through the
doors and up every stair.

## Collider contract (for the Player Engineer)

- Every collider is an invisible (`visible = false`) **unscaled `THREE.BoxGeometry` mesh**. Only yaw
  and pitch rotations are used. `userData.collider = { kind: 'box', size: [sx, sy, sz], tag }`.
- **Stairs use hidden ramps.** Each flight has one smooth sloped box (tag `stair-ramp`) whose top face
  runs through the step nosings, at about 32°. The visible steps are **not** colliders. Landings are
  boxes (tag `landing`).
- Rails (`rail`) are 1.2 m tall thin boxes along stair edges and around stair holes. Walls (`wall`)
  follow the wall pieces with doorways left open. Floors use `floor`. Columns use `column`. Furniture
  gets one box per piece (`furniture`); chairs and stools deliberately have no collider.
- Automatic doors have **no** collider and are always passable.

## Performance

| Item | Budget used |
|---|---|
| University Hall exterior | about 3 draw calls (concrete, glass, roof/metal); every facade bay is real geometry, merged |
| Library shell + structure | about 12 draw calls |
| Library furniture | about 8 draw calls per floor (one per material) plus 1 for books. **Hidden** when you are outside, except the glazed ground floor within 70 m. Inside, only your floor and the floors above and below are drawn. |
| Books | about 75k instances on 4 floors (4 triangles each) |
| Lights | 6 PointLights without shadows, 1.3 m below the ceiling at 10 to 12 cd; the renderer's bounce light does the rest |

## Research findings

Facts marked † are unverified: they came from search snippets only, because the sites were blocked
from this container.

**University Hall** (601 S Morgan; Netsch/SOM; completed 1965, though some sources say 1967)
- 28 floors. Published height is 338 ft (103 m). LiDAR gives a roof of 103.3 m (h50) and a peak of
  104.3 m (h98).
- Seen from the east and west, it is 150 ft wide on floors 1–8, 160 ft on floors 9–16 and 170 ft on
  floors 17–28. Seen from the north and south, the width stays the same. Cantilevers carry the steps.
- It has an exposed reinforced-concrete skeleton and narrow recessed windows. Massive columns carry
  the ground floor.
- The original 1960s plaza had curved ramps up to a 2nd-floor entrance; these were removed with the
  walkways.
- The model uses a 5 ft (1.524 m) facade module, giving 30, 32 and 34 bays for 150, 160 and 170 ft.
  The narrow faces have 14 bays across the footprint depth of about 22 m.

**Daley Library** (801 S Morgan; Netsch/SOM; 1963–65, with additions at both ends around 1967–68†)
- 4 storeys. LiDAR gives a roof of 18.0 m (h50) and a peak of 19.5 m (h98); the City data says 3
  storeys.
- The structure is exposed-aggregate concrete columns and beams at every floor, filled with precast
  panels. The end bays (phase 2) are faced in brick. Stucco panels on the west face mark two west wings
  that were planned but never built†.
- It faces Morgan St to the west and the Quad to the east. It has three step-free entrances: the
  **Main Doors** (east, revolving in real life), the **IDEA Commons doors** (east, south of the main
  doors) and the **West Doors**.
- The **IDEA Commons** (2011, Woodhouse Tinucci) fills half of the 1st floor. It has a café, 100+
  computers, group space and a support/printing desk. Its glass curtain wall is 16 ft tall. You enter
  it between two lit "prisms" of steel grating.
- The **Circle Reading Room** has a fireplace and a gold accent color. It sits in the NE quadrant of
  the 1st floor, behind the reserve desk.
- Group study is on floors 1–2 and quiet study on floors 1, 3 and 4. Special Collections is on the 3rd
  floor. The 4th floor is an open "talking" floor.
- Some walkway bridges still stick out of the library and lead nowhere.

## Assumptions to check against the owner's photos

Each of these is one constant or a few lines to change.

1. **UH facade:** the corners are solid for one module (`UH.cornerW`). Exterior piers are 0.55 m wide
   and 0.55 m deep, with a 0.85 m floor-edge upstand. The gallery ledge is 1.3 m deep
   (`UH.galleryDepth`). Windows are 0.95 m wide per 1.524 m module, with 0.35 m clear bands at top and
   bottom; floor-to-floor is 3.58 m. Floor 2 has no gallery (the source names floors 3–28). Floor 28
   is a continuous curtain wall behind the piers.
2. **UH ground floor:** the lobby is 5.5 m tall, with glass set back 2.8 m behind giant 1.6 m square columns.
   There is a column every 5 modules. The doors are mid-span on the east and west faces. The lobby has
   a central elevator core.
3. **UH roof:** a small elevator machine room and two mechanical units sit on the roof; the parapet top
   is at about 103.9 m.
4. **Library bay grid:** 15 bays of about 8.8 m along the length and 4 across. The end 2 bays at each
   end are brick, on all floors (`LIB.brickEndBays`).
5. **Library upper windows:** deep-set Block-I slots, 0.8 m wide. There are 3 per bay on the
   precast east bays and 1 per bay on brick bays and on the stucco west bays. The north and south end
   walls are brick with 2 slots per bay. The west-face stucco and the precast central east bays are
   inferred from the research ("brick facing not added on some west walls").
6. **Library entrances:** the main doors are at mid-length on the east, and the IDEA doors are 3 bays
   further south. The west doors are at mid-length. All are automatic sliding doors; in real life the
   main doors are revolving.
7. **Walkway stub:** one 2nd-floor walkway stub (6.5 m) above the main doors serves as a canopy. Its
   real location and number are not verified.
8. **Annexes:** the two small footprint bumps at the north and south ends are modelled as 2-storey
   brick service blocks.
9. **Floor heights:** L1 is 4.9 m (the 16 ft curtain wall) and L2–L4 are 4.2 m each. The roof is at
   17.55 m and the parapet at 18.05 m.
10. **Interior layout** (stair position, core, rooms, café spot, number of computers and stacks) is a
    plausible reconstruction, not a survey. The main stair is a switchback just south-west of the main
    lobby. The elevator and restroom core is on the west side, north of the lobby.

11. **Entrance street furniture** on the east apron (benches, bike racks, planters, litter bins and two
    plain fabric banners) is generic. Move or remove it to match photos. Keep the straight path from
    the spawn point to the main doors clear.

## Materials used (round 3, per `docs/research/facades.md`)

**University Hall**
- **Skeleton:** `concrete` (cast-in-place, board-formed) for the piers, floor-edge upstands, corner
  columns and the giant ground columns (1.6 m).
- **Panels:** `concreteSmooth` for the precast panels between windows, gallery ledges, curbs and lintels.
- **Windows (floors 2–27):** Block-I windows set 1.3 m behind the pier face, behind an open gallery
  ledge on floors 3–28. The top and bottom bands are `glass` (opaque clear) with a `glassBronze`
  centre and `metalBronze` frames.
- **Floor 28:** the 2017–18 curtain wall in `glassBronze` with `metalBronze` mullions.
- **Lobby:** `glassClear`.

**Daley Library**
- **Frame:** `concreteExposedAggregate` for the columns and floor beams.
- **Infill:**
  - `brickUIC` in the phase-2 end bays, the north and south ends and the annexes.
  - `concreteSmooth` precast in the central east bays.
  - `concreteWarm` (stucco-like) in the central west bays, which have only 1 slot per bay.
- **Windows:** deep-set Block-I slots: `glassClear` top and bottom, `glassBronzeClear` centre,
  `metalBronze` frames.
- **Ground floor east:** the 2011 curtain wall in `glassClear` with `windowFrame`.

## Requests to other owners

- **Graphics:** please add the materials `books` (white base so instance colors show unmodified) and
  `fire` (emissive). They would replace the last local materials in `kit/materials.ts`.
