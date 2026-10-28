# Credits

## Data
- Map data © OpenStreetMap contributors, available under the Open Database License (ODbL), via Overture Maps Foundation releases.
- Building heights: USGS 3D Elevation Program (3DEP) LiDAR, Cook County 2017 (public domain).
- City of Chicago building footprints (MIT License, © 2013 City of Chicago), used for LiDAR height validation.

## Art
- Buildings, furniture, trees, props, the fallback player, and the fallback practice dummies are procedural meshes written in this repository. The game still runs if the private animation file is missing.

## Characters and animation
- `client/public/models/characters/player_base.glb` — **CC0 1.0**. Player body made by the project artist with MPFB2 / MakeHuman. 1.75 m, Y-up, facing +Z, mixamorig skeleton (53 bones, including a `root` at the feet), meshes `player_LOD0` through `player_LOD3`, KTX2 textures. This file is committed. Normal maps were removed (they rendered blotchy) and roughness was tuned: 4.29 MB, down from 11.04 MB.
- `client/public/models/characters/player_anims_cc0.glb` — **CC0 1.0**. Animations from the [Universal Animation Library (Standard)](https://quaternius.itch.io/universal-animation-library) by Quaternius (also listed at https://quaternius.com/packs/universalanimationlibrary.html; licence: CC0, public domain). Sixteen clips (Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Crouch_Idle_Loop, Crouch_Fwd_Loop, Pistol_Aim_Neutral, Pistol_Shoot, Pistol_Reload, Jump_Loop, Death01, Jump_Loop and Jump_Land again as the fall loop and landing (fall/land), plus the no-weapon set Idle_Loop, Walk_Loop, Sprint_Loop and Jump_Start as unarmed_idle/walk/run/jump) retargeted offline onto the player_base skeleton (rest poses matched; script in tools/anim-bake) and renamed to the game's clip names. 0.87 MB. Committed. This is what the public build (GitHub Pages) uses.
- `client/public/models/weapons/rifle_m4_cc0.glb` — **CC0 1.0**. The "M4A1" model by 3DModelsCC0, from the [Free CC0 Guns & Explosives Pack](https://3dmodelscc0.itch.io/free-cc0-guns-explosives-pack) (licence: CC0 public domain, stated on the itch.io page; the author confirms there they modelled every asset themselves). GLB export from [BoQsc/cc0-guns-explosives-pack-glb](https://github.com/BoQsc/cc0-guns-explosives-pack-glb/releases/tag/0) (repo licence CC0-1.0). Flattened, textures cut to 1024 px WebP (base colour, normal, metal/roughness) and given Grip, Foregrip and Muzzle sockets by `tools/anim-bake/rifle.mjs`. 9.2k triangles, 530 KB. Committed. Credit is not legally required under CC0 but given anyway.
- **Mixamo animations are allowed for use** while the game is running. Mixamo files, raw or baked into glTF or FBX, are not redistributable and must **never** be committed. Put them in `client/public/models/private/` (gitignored), for example `anims.glb`.
- **RenderPeople** scans and any other non-redistributable asset follow the same rule: use locally if the license allows, never commit, same private folder.
- If the private files are missing, the game uses the CC0 clips above. Only if both clip files are missing does it fall back to the procedural figure.
- Do not add UIC logos, seals, Flames or Sparky artwork, restaurant or CTA logos, or Google 3D Tiles, Photorealistic Tiles, Maps, or Street View imagery or geometry.

## Sound
- `client/public/audio/gunshot_cc0.ogg` — **CC0 1.0**. "Random gunfire SFX" (`gunfire_sfx.wav`) by iamoneabe on OpenGameArt: https://opengameart.org/content/random-gunfire-sfx (licence on that page: CC0, https://creativecommons.org/publicdomain/zero/1.0/). Cut to 0.8 s with a fade-out, mixed to mono, and encoded as Ogg Vorbis (10 KB). Used for bot gunshots. Credit is not legally required under CC0 but given anyway.

## Surface textures (photo-scanned PBR, CC0)
Downloaded by `tools/textures/fetch_cc0.py`; files in `client/public/textures/<folder>/`. All are licensed **CC0 1.0 (public domain)**.

Concrete, red brick, campus brick, asphalt, grass, sidewalk, and the pale stone used for plazas are stored as **KTX2** (ETC1S color, sRGB; UASTC normals). The JPEG downloads for those sets are not in git. `tools/textures/encode_ktx2.py` can rebuild the KTX2 files. Other surfaces are still JPEG.

Normal maps that were over 1 MB — red brick, campus brick, board-formed concrete, and the pale stone — are stored at 512 px. Their color and ORM maps stay at 1024.

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
- `concreteSmooth` ← Poly Haven "Concrete Wall 009" (https://polyhaven.com/a/concrete_wall_009), 2 m tile, by Poly Haven — CC0 1.0
- `concreteWarm` ← Poly Haven "Concrete Wall 007" (https://polyhaven.com/a/concrete_wall_007), 2.16 m tile, by Dario Barresi, Rico Cilliers, Charlotte Baglioni — CC0 1.0
- `grass` ← Poly Haven "Leafy Grass" (https://polyhaven.com/a/leafy_grass), 2 m tile, by Poly Haven — CC0 1.0
- `interiorCeiling` ← ambientCG "Office Ceiling 001" (https://ambientcg.com/view?id=OfficeCeiling001), 3.85 m tile, by ambientCG (Lennart Demes) — CC0 1.0
- `interiorFloor` ← ambientCG "Carpet 012" (https://ambientcg.com/view?id=Carpet012), 1 m tile, by ambientCG (Lennart Demes) — CC0 1.0
- `interiorFloorHard` ← Poly Haven "Terrazzo Tiles" (https://polyhaven.com/a/terrazzo_tiles), 2 m tile, by Amal Kumar — CC0 1.0
- `interiorWall` ← Poly Haven "Painted Plaster Wall" (https://polyhaven.com/a/painted_plaster_wall), 2 m tile, by Amal Kumar — CC0 1.0
- `metalPanel` ← Poly Haven "Blue Metal Plate" (https://polyhaven.com/a/blue_metal_plate), 2.5 m tile, by Rob Tuytel — CC0 1.0
- `plaza`, `limestone` ← Poly Haven "White Sandstone Blocks 02" (https://polyhaven.com/a/white_sandstone_blocks_02), 2 m tile, by Rob Tuytel — CC0 1.0. Poly Haven has no scan named limestone; this pale cut stone is the stand-in for limestone and for the granite plaza.
- `sidewalk` ← Poly Haven "Concrete Pavement" (https://polyhaven.com/a/concrete_pavement), 3 m tile, by Poly Haven — CC0 1.0
- `roof` ← Poly Haven "Bicolour Gravel" (https://polyhaven.com/a/bicolour_gravel), 1.9 m tile, by Dimitrios Savva — CC0 1.0
- `soil` ← Poly Haven "Yellow Flower Mulch" (https://polyhaven.com/a/yellow_flower_mulch), 2 m tile, by Dimitrios Savva — CC0 1.0
- `wood` ← Poly Haven "Oak Veneer 01" (https://polyhaven.com/a/oak_veneer_01), 1.83 m tile, by Jenelle van Heerden — CC0 1.0

Self-made textures (CC0), generated by `tools/textures/generate.py`: fabric weave, metal roughness, water ripples, foliage leaf cut-out, world-space variation noise (`macro`).

## Skies (HDRI, CC0)
Loaded at runtime into a PMREM environment map (`client/src/render/hdri.ts`). Both are **CC0 1.0**, photographed by Greg Zaal, from Poly Haven. The files in `client/public/hdri/` are the 1k (1024×512) versions, downsampled in linear light from Poly Haven's 2k releases.

- Default (`?sky=kloofendal`, also the default when `sky` is omitted): "Kloofendal Overcast (Pure Sky)" (https://polyhaven.com/a/kloofendal_overcast_puresky) — `kloofendal_overcast_puresky_1k.hdr`. Published sun direction about (0.80, 0.39, 0.45).
- Late afternoon (`?sky=bridges`): "Between Bridges" (https://polyhaven.com/a/between_bridges) — `between_bridges_1k.hdr`. Published sun direction about (0.73, 0.24, 0.63).

## Disclaimer
Unofficial fan project. Not affiliated with or endorsed by the University of Illinois Chicago.

## Building models

- `client/public/models/buildings/quad-lecture-centers.glb` (Lecture Centers A to F): modeled for this project by Atlas, released under the project license. Footprints derived from map data © OpenStreetMap contributors (ODbL). No external textures.
- `client/public/models/buildings/student-center-east.glb` (Student Center East and Tower): modeled for this project by Atlas, released under the project license. Footprints derived from map data © OpenStreetMap contributors (ODbL). No external textures.
- `client/public/models/buildings/sel-seo.glb` (SEL East, SEL West, SEL bridge and SEO): modeled for this project by Atlas, released under the project license. Footprints derived from map data © OpenStreetMap contributors (ODbL). No external textures.
- `client/public/models/buildings/{behavioral-sciences,douglass-hall,grant-hall,lincoln-hall,architecture-design-studios}.glb`: modeled for this project by Atlas, released under the project license. Footprints derived from map data © OpenStreetMap contributors (ODbL). No external textures. In-game names are fictional.
- `client/public/models/buildings/university-hall.glb` (University Hall far LOD1 only): modeled for this project by Atlas, released under the project license. Footprints derived from map data © OpenStreetMap contributors (ODbL). No external textures. Used only past 120 m; the up-close building is the code landmark.
- `client/public/models/buildings/daley-library.glb` (Daley Library far LOD1 only): modeled for this project by Atlas, released under the project license. Footprints derived from map data © OpenStreetMap contributors (ODbL). No external textures. Used only past 120 m; the up-close building is the code landmark.
