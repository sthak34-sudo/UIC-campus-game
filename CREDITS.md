# Credits

## Data
- Map data © OpenStreetMap contributors, available under the Open Database License (ODbL), via Overture Maps Foundation releases.
- Building heights: USGS 3D Elevation Program (3DEP) LiDAR, Cook County 2017 (public domain).
- City of Chicago building footprints (MIT License, © 2013 City of Chicago), used for LiDAR height validation.

## Art
- Buildings, furniture, trees, props, the default player, and the practice dummies are procedural meshes written in this repository. No downloaded character file is required to play.

## Characters and animation
- **CC0 and self-made files** may be committed. Add a line here before you commit one. A future CC0 MakeHuman body would live at `client/public/models/characters/player_base.glb`.
- **Mixamo animations are allowed for use** while the game is running. Mixamo files, raw or baked into glTF or FBX, are not redistributable and must **never** be committed. Put them in `client/public/models/private/` (gitignored), for example `anims.glb`.
- **RenderPeople** scans and any other non-redistributable asset follow the same rule: use locally if the license allows, never commit, same private folder.
- If those private files are missing, the game uses the procedural character above. That is the version in this public repository.
- Do not add UIC logos, seals, Flames or Sparky artwork, restaurant or CTA logos, or Google 3D Tiles, Photorealistic Tiles, Maps, or Street View imagery or geometry.

## Surface textures (photo-scanned PBR, CC0)
Downloaded by `tools/textures/fetch_cc0.py`; files in `client/public/textures/<folder>/`. All are licensed **CC0 1.0 (public domain)**.

Concrete, red brick, campus brick, asphalt, grass, sidewalk, and the pale stone used for plazas are stored as **KTX2** (ETC1S color, sRGB; UASTC normals). The JPEG downloads for those sets are not in git. `tools/textures/encode_ktx2.py` can rebuild the KTX2 files. Other surfaces are still JPEG.

The GPU transcoder is `client/public/basis/basis_transcoder.js` and `basis_transcoder.wasm`, copied from three.js examples (MIT License, © three.js authors).

- `asphalt` ← Poly Haven "Asphalt 02" (https://polyhaven.com/a/asphalt_02), 3 m tile, by Rob Tuytel — CC0 1.0
- `bark` ← Poly Haven "Bark Brown 02" (https://polyhaven.com/a/bark_brown_02), 1 m tile, by Rob Tuytel — CC0 1.0
- `bookshelf` ← Poly Haven "Dark Wood" (https://polyhaven.com/a/dark_wood), 2 m tile, by Dario Barresi, Dimitrios Savva, Rico Cilliers — CC0 1.0
- `brick` ← Poly Haven "Red Brick 03" (https://polyhaven.com/a/red_brick_03), 1 m tile, by Rob Tuytel — CC0 1.0
- `brickUIC`, `brickDouble`, `brickCommon` ← Poly Haven "Brick Wall 001" (https://polyhaven.com/a/brick_wall_001), 3 m tile, by Rob Tuytel, Dimitrios Savva — CC0 1.0
- `brickDark` ← Poly Haven "Brick Wall 10" (https://polyhaven.com/a/brick_wall_10), 1.9 m tile, by Dimitrios Savva — CC0 1.0
- `concrete` ← Poly Haven "Concrete Layers 02" (https://polyhaven.com/a/concrete_layers_02), 2 m tile, by Rob Tuytel — CC0 1.0
- `concreteExposedAggregate` ← Poly Haven "Gravel Embedded Concrete" (https://polyhaven.com/a/gravel_embedded_concrete), 2 m tile, by Charlotte Baglioni — CC0 1.0
- `concreteDark` ← Poly Haven "Concrete Wall 006" (https://polyhaven.com/a/concrete_wall_006), 2 m tile, by Dario Barresi, Charlotte Baglioni — CC0 1.0
- `concreteSmooth` ← ambientCG "Concrete 046" (https://ambientcg.com/view?id=Concrete046), 2.4 m tile, by ambientCG (Lennart Demes) — CC0 1.0
- `concreteWarm` ← Poly Haven "Concrete Wall 007" (https://polyhaven.com/a/concrete_wall_007), 2.16 m tile, by Dario Barresi, Rico Cilliers, Charlotte Baglioni — CC0 1.0
- `grass` ← ambientCG "Grass 004" (https://ambientcg.com/view?id=Grass004), 1.4 m tile, by ambientCG (Lennart Demes) — CC0 1.0
- `interiorCeiling` ← ambientCG "Office Ceiling 001" (https://ambientcg.com/view?id=OfficeCeiling001), 3.85 m tile, by ambientCG (Lennart Demes) — CC0 1.0
- `interiorFloor` ← ambientCG "Carpet 012" (https://ambientcg.com/view?id=Carpet012), 1 m tile, by ambientCG (Lennart Demes) — CC0 1.0
- `interiorFloorHard` ← Poly Haven "Terrazzo Tiles" (https://polyhaven.com/a/terrazzo_tiles), 2 m tile, by Amal Kumar — CC0 1.0
- `interiorWall` ← Poly Haven "Painted Plaster Wall" (https://polyhaven.com/a/painted_plaster_wall), 2 m tile, by Amal Kumar — CC0 1.0
- `metalPanel` ← Poly Haven "Blue Metal Plate" (https://polyhaven.com/a/blue_metal_plate), 2.5 m tile, by Rob Tuytel — CC0 1.0
- `plaza`, `limestone` ← Poly Haven "White Sandstone Blocks 02" (https://polyhaven.com/a/white_sandstone_blocks_02), 2 m tile, by Rob Tuytel — CC0 1.0. Poly Haven has no scan named limestone; this pale cut stone is the stand-in for limestone and for the granite plaza.
- `sidewalk` ← Poly Haven "Concrete Floor Worn 001" (https://polyhaven.com/a/concrete_floor_worn_001), 3 m tile, by Dimitrios Savva, Rico Cilliers — CC0 1.0
- ambientCG "Paving Stones 128" (https://ambientcg.com/view?id=PavingStones128), 3.5 m tile, by ambientCG (Lennart Demes) — CC0 1.0. Still in the texture folder; plazas no longer use it.
- `roof` ← Poly Haven "Bicolour Gravel" (https://polyhaven.com/a/bicolour_gravel), 1.9 m tile, by Dimitrios Savva — CC0 1.0
- `soil` ← Poly Haven "Yellow Flower Mulch" (https://polyhaven.com/a/yellow_flower_mulch), 2 m tile, by Dimitrios Savva — CC0 1.0
- `wood` ← Poly Haven "Oak Veneer 01" (https://polyhaven.com/a/oak_veneer_01), 1.83 m tile, by Jenelle van Heerden — CC0 1.0

Self-made textures (CC0), generated by `tools/textures/generate.py`: fabric weave, metal roughness, water ripples, foliage leaf cut-out, world-space variation noise (`macro`).

## Skies (HDRI, CC0)
Loaded at runtime into a PMREM environment map (`client/src/render/hdri.ts`). Both are **CC0 1.0**, photographed by Greg Zaal, from Poly Haven. The 2k `.hdr` files live in `client/public/hdri/`.

- Default (`?sky=kloofendal`, also the default when `sky` is omitted): "Kloofendal Overcast (Pure Sky)" (https://polyhaven.com/a/kloofendal_overcast_puresky) — `kloofendal_overcast_puresky_2k.hdr`. Published sun direction about (0.80, 0.39, 0.45).
- Late afternoon (`?sky=bridges`): "Between Bridges" (https://polyhaven.com/a/between_bridges) — `between_bridges_2k.hdr`. Published sun direction about (0.73, 0.24, 0.63).

## Disclaimer
Unofficial fan project. Not affiliated with or endorsed by the University of Illinois Chicago.
