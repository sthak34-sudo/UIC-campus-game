# Generic campus (`world/campus`)

Builds everything in `campus.json` except the hand-made landmarks (buildings with `landmark` set):
buildings with procedural facades, ground, trees, street props and the `map-*` viewpoints.
Owner: Map Engineer.

| File | What it does |
|---|---|
| `index.ts` | `buildCampus(world, data)`; the `campusBuildings` registry; `hideCampusBuilding(id)` |
| `styles.ts` | Picks a facade style per building (UIC Brutalist, campus brick, Chicago rowhouse, loft, modern, curtain wall, garage, storefront, shed) and its seeded parameters |
| `facade.ts` | One building volume: walls with real recessed windows, doors, bands, cornice, parapet, roof, rooftop units. "Frame mode" builds Netsch facades: projecting concrete piers + floor beams with brick/concrete infill, and per floor Block-I windows, open galleries, pointed precast grilles, glazed window walls or punched windows |
| `facadeSpecs.ts` | Per-building facade table transcribed from `docs/research/facades.md` (matched by Overture name), with `flags` for facts to check against photos |
| `features.ts` | Signature details: Lecture Center butterfly colonnade + granite roof edge, SEL twisted pylons, SEO scissor stairs, SCE double stair, Hull-House porch, ARC aluminum fins, rooftop PV |
| `mat.ts` | `mat(name)`: facade material names, with stand-ins for those the library doesn't have (terracotta, granite, beige brick, pale precast, solar panel) |
| `batcher.ts` | Merges geometry per material (one draw call per material per tile) |
| `ground.ts` | Roads, raised blocks (sidewalk / grass / plaza / parking at +0.15 m), curbs, lane lines, crosswalks |
| `trees.ts` | Instanced trees (honey locust, linden, maple, oak x 2 shapes) with two levels of detail: near trees (within 85 m of `world.focus`) get ~400 leaf cards around a dark inner canopy, far trees get a solid lumpy crown |
| `props.ts` | Street furniture |
| `context.ts` | Low-detail city around the play area from `data/context.json` (blocks, streets, parkway trees, the Loop skyline). No shadows, no colliders, 7 draw calls |
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
- About 225 draw calls before culling, plus 7 for the context. Buildings: 14 tiles (500 m) x ~12 materials. Ground: 7. Trees: 32 (8 prototypes x cards/core/far/trunk). Props: ~10.
- Triangles: about 3.1M in the play area. Buildings 1.8M, far tree crowns 0.75M, near leaf cards about 0.25M when standing on the Quad. The context adds 0.42M (no shadows).
- Tree LOD runs in `world.onUpdate` from `world.focus`. It only re-sorts instances when the focus moves more than 4 m.
- Trees and props are never placed within 1 m of a footprint. For landmarks the margin is max(1.5 m, 0.3 x tree height) from the bounding rectangle. This is filtered in both the pipeline and the builder.
- `campus.test.ts` builds the real campus.json and context.json in Node and checks the budgets.

## Material stand-ins (until the Graphics Engineer adds these names)
- `leafCard` (requested): a single leaf-cluster sprig with a soft transparent border, UV 0..1 per card.
  Cards currently sample the tiling `foliage` texture, which looks patchy up close.
- `foliageSolid` (requested): an opaque leaf-mass look for the tree core, far crowns and context trees.
  These currently use `grass` darkened by instance color.

## Facade specs (round 3)
- To add or fix a building, edit `facadeSpecs.ts`. Each entry has a `base` style, `style` overrides, an optional per-volume function, `features`, a `source` (section of facades.md) and `flags`.
- Unlisted UIC buildings get the generic Netsch frame: concrete piers, brick or concrete infill, Block-I windows or galleries, and a recessed glazed ground floor.
- Generic buildings are sealed, so all their glass is opaque (`glass`, `glassBronze`, `glassFritted`). The transparent `glassClear` / `glassBronzeClear` are only for enterable interiors.
- Open flags, to check against the owner's photos:
  - Lecture Center roofs (pyramidal from Overture; no source)
  - SCE Tower facade
  - which side SCE's double stair is on
  - ERF, ETMSW and SES window patterns
  - Taft Hall's new wall
  - SRF panel color
  - CDRLC terra-cotta color
