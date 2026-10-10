# Generic campus (`world/campus`)

Builds everything in `campus.json` except the hand-made landmarks (buildings with `landmark` set):
buildings with procedural facades, ground, trees, street props and the `map-*` viewpoints.
Owner: Map Engineer.

| File | What it does |
|---|---|
| `index.ts` | `buildCampus(world, data)`; the `campusBuildings` registry; `hideCampusBuilding(id)` |
| `styles.ts` | Picks a facade style per building (UIC Brutalist, campus brick, Chicago rowhouse, loft, modern, curtain wall, garage, storefront, shed) and its seeded parameters |
| `facade.ts` | One building volume: walls with real recessed windows, doors, bands, cornice, parapet, roof, rooftop units |
| `batcher.ts` | Merges geometry per material (one draw call per material per tile) |
| `ground.ts` | Roads, raised blocks (sidewalk / grass / plaza / parking at +0.15 m), curbs, lane lines, crosswalks |
| `trees.ts`, `props.ts` | Instanced trees (4 species x 2 shapes) and street furniture |
| `viewpoints.ts` | `map-aerial`, `map-quad-ground`, `map-halsted`, `map-harrison`, `map-taylor-street`, `map-lecture-centers`, `map-little-italy-low` |
| `types.ts` | Optional campus.json fields not yet in `core/campusData.ts` |

All randomness is seeded by building id (`rng.ts`), so a building looks the same on every load and every machine.

## Making a generic building enterable (future interiors)

Every generic building is kept addressable in `campusBuildings` (key = Overture building id, the
`buildingId` field in campus.json; tiers and parts of one building share it):

```ts
import { campusBuildings, hideCampusBuilding } from '../campus';
const b = campusBuildings.get(id)!;
b.volumes;   // per volume: cleaned footprint (plan coords), floors[] (floor bottoms in m), roofY, collider
b.doors;     // door openings already cut into the facade: world position, outward normal, width, height
b.mesh;      // the merged tile mesh that holds this building's triangles
b.ranges;    // where those triangles are inside b.mesh's index buffer
```

How an interior plugs in:

1. **Doors already exist.** Each building's main volume gets a recessed door on its longest
   street-facing wall (`b.doors`). Today the door pane is a solid panel. An interior module can
   remove the pane and open a doorway there.
2. **Floors line up with the facade.** `volume.floors` holds the floor heights used for the window
   rhythm. Put interior floor slabs at these heights so windows match the rooms behind them.
   Windows are real openings (wall, then a recess, then glass at 0.06–0.5 m depth), so rooms seen
   through the glass will look right once the glass becomes see-through.
3. **Colliders.** Each volume has its own invisible prism collider (`volume.collider`, already
   registered with `world.addCollider`). To let the player in, replace that prism with wall
   colliders that have a door gap, plus the interior floors and stairs.
4. **Swapping the exterior.** To replace a whole building with a hand-made model,
   `hideCampusBuilding(id)` collapses its triangles in the merged tile mesh. No rebuild is needed.
5. Register the interior with `world.addInterior({ id, name, box })` so lighting switches.

## Performance notes
- About 190 draw calls before culling (buildings: 20 tiles x ~8 materials; ground 7; trees 16; props ~10).
  Measured in headless Chrome: 107–162 calls per frame, with no shadow pass yet.
- About 3.1M triangles: buildings 1.8M, tree crowns 1.0M. Window frames, lintels and sills are only
  added on street fronts and lower floors.
- Buildings and trees cast shadows. Props, ground and road markings do not.
- `campus.test.ts` builds the real campus.json in Node and fails if the draw-call or triangle budget is exceeded.

## Material stand-ins (until the Graphics Engineer adds these names)
- Road paint uses `sidewalk` (`PAINT` in `ground.ts`).
- Foliage uses `grass`.
- Bark uses `wood` darkened by per-instance color.
