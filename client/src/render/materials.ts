import * as THREE from 'three';
import { loadTexture } from './textures';
import { applySurfaceFx, surfaceUniforms, type SurfaceFx } from './surfaceShader';

/**
 * Central material library. OWNER: Graphics Engineer.
 * Everyone else asks for materials by name; never create ad-hoc materials for surfaces listed here.
 *
 * UV CONVENTION: 1 UV unit = 1 meter of surface. On walls use u = horizontal distance along the
 * wall, v = height (up). On the ground use u = x (east), v = -z (north). Each material sets its own
 * texture repeat from the texture's real-world size, so bricks, board marks, pavers etc. come out at
 * real scale.
 *
 * Textures: photo-scanned CC0 PBR sets from Poly Haven and ambientCG (tools/textures/fetch_cc0.py,
 * credited in CREDITS.md) plus a few self-made ones (tools/textures/generate.py). The outdoor hero
 * sets (concrete, brick, sidewalk, asphalt, grass, limestone) are KTX2; everything else is JPEG.
 * Colors are tinted toward the campus palette in docs/research/facades.md. Large-scale variation,
 * rain streaks and base grime are added in world space by the shader (surfaceShader.ts).
 *
 * Materials are shared: don't mutate them (color, opacity …). If you need a variant, ask the
 * Graphics Engineer for a new name.
 */
export type MaterialName =
  // --- concrete (Netsch: "six different finishes")
  | 'concrete' // board-formed cast-in-place, weathered warm grey (UIC default: piers, beams, UH frame)
  | 'concreteWarm' // smoother cast concrete, lighter warm grey with pour lines
  | 'concreteDark' // darker, stained concrete (bases, shaded volumes, drip-stained walls)
  | 'concreteSmooth' // smooth precast panels / curbs / sills (cooler, lighter)
  | 'concreteExposedAggregate' // sandblasted / exposed-aggregate precast (speckled)
  // --- brick
  | 'brick' // red-brown face brick, running bond (generic)
  | 'brickUIC' // Netsch campus brick: dark red-brown with purple-brown range (facades.md #7a4636)
  | 'brickDouble' // same family at double size (SEL, SES: ~400 x 135 mm modules)
  | 'brickDark' // dark brown/purple brick
  | 'brickCommon' // mixed Chicago common brick (older non-Netsch buildings)
  // --- glass & metal
  | 'glass' // OPAQUE clear window glass for sealed buildings: reflections + fake rooms behind it
  | 'glassBronze' // OPAQUE bronze-tinted glass (Netsch "Block-I" windows, UH) with fake rooms
  | 'glassFritted' // OPAQUE fritted glass (ARC): lighter, rooms only faintly visible
  | 'glassClear' // TRANSPARENT glass for enterable buildings (see-through both ways)
  | 'glassBronzeClear' // TRANSPARENT bronze-tinted glass
  | 'windowFrame' // dark bronze anodized aluminum (1960s frames, #3d3329)
  | 'metalBronze' // brushed bronze trim / mesh / fins (#6b5137)
  | 'metalPanel' // painted metal cladding panels, silver-grey (SRF)
  | 'metal' // galvanized / painted steel (rails, posts, benches)
  // --- ground
  | 'asphalt'
  | 'sidewalk' // worn cast-concrete pavement
  | 'plaza' // pale cut stone (quads and granite stand-in)
  | 'limestone' // same pale cut stone, untinted
  | 'grass'
  | 'soil' // mulch planting beds
  | 'water'
  | 'roof' // gravel-ballasted flat roof
  | 'roadMarking' // white thermoplastic paint (put a few mm above the road)
  | 'roadMarkingYellow'
  // --- interiors
  | 'interiorWall' // painted plaster / drywall
  | 'interiorFloor' // dark blue-grey commercial carpet
  | 'interiorFloorHard' // terrazzo tiles (lobbies, corridors)
  | 'interiorCeiling' // 2' x 2' acoustic tiles in a T-bar grid
  | 'lightFixture' // emissive ceiling light panel (pair with a real light)
  | 'wood'
  | 'fabric'
  | 'bookshelf' // dark stained wood
  | 'screen' // computer monitors (dark glossy, faint glow)
  // --- trees
  | 'foliage' // tree leaves (October green with autumn tints), alpha-tested, double-sided
  | 'bark';

export const MATERIAL_NAMES: readonly MaterialName[] = [
  'concrete', 'concreteWarm', 'concreteDark', 'concreteSmooth', 'concreteExposedAggregate',
  'brick', 'brickUIC', 'brickDouble', 'brickDark', 'brickCommon',
  'glass', 'glassBronze', 'glassFritted', 'glassClear', 'glassBronzeClear', 'windowFrame', 'metalBronze', 'metalPanel', 'metal',
  'asphalt', 'sidewalk', 'plaza', 'limestone', 'grass', 'soil', 'water', 'roof', 'roadMarking', 'roadMarkingYellow',
  'interiorWall', 'interiorFloor', 'interiorFloorHard', 'interiorCeiling', 'lightFixture', 'wood', 'fabric', 'bookshelf', 'screen',
  'foliage', 'bark',
];

/**
 * Physical size (m) of one texture tile per texture folder. Must match client/public/textures/tiles.json
 * (written by fetch_cc0.py from each asset's real-world dimensions, and by generate.py).
 */
export const TILE: Record<string, [number, number]> = {
  ph_concrete_layers_02: [2.0, 2.0],
  ph_concrete_wall_007: [2.16, 2.16],
  ph_concrete_wall_006: [2.0, 2.0],
  ph_gravel_embedded_concrete: [2.0, 2.0],
  ph_red_brick_03: [1.0, 1.0],
  ph_brick_wall_10: [1.9, 1.9],
  ph_brick_wall_001: [3.0, 3.0],
  ph_asphalt_02: [3.0, 3.0],
  ph_concrete_pavement: [3.0, 3.0],
  ph_concrete_wall_009: [2.0, 2.0],
  ph_white_sandstone_blocks_02: [2.0, 2.0],
  ph_leafy_grass: [2.0, 2.0],
  ph_yellow_flower_mulch: [2.0, 2.0],
  ph_bicolour_gravel: [1.9, 1.9],
  acg_Carpet012: [1.0, 1.0],
  acg_OfficeCeiling001: [3.85, 3.85],
  ph_terrazzo_tiles: [2.0, 2.0],
  ph_painted_plaster_wall: [2.0, 2.0],
  ph_oak_veneer_01: [1.83, 1.83],
  ph_dark_wood: [2.0, 2.0],
  ph_bark_brown_02: [1.0, 1.0],
  ph_blue_metal_plate: [2.5, 2.5],
  fabric: [0.2, 0.2],
  metal: [1.0, 1.0],
  foliage: [1.5, 1.5],
  water: [4.0, 4.0],
};

/**
 * Mean linear albedo of each photo texture (from client/public/textures/credits.json). Used to tint a
 * texture so its average color hits a target hex from the campus palette while keeping its detail.
 */
export const MEAN_ALBEDO: Record<string, [number, number, number]> = {
  ph_concrete_layers_02: [0.206, 0.196, 0.176],
  ph_concrete_wall_007: [0.257, 0.224, 0.156],
  ph_concrete_wall_006: [0.107, 0.083, 0.061],
  ph_leafy_grass: [0.315, 0.232, 0.103],
  ph_concrete_pavement: [0.214, 0.176, 0.135],
  ph_concrete_wall_009: [0.356, 0.318, 0.261],
  ph_gravel_embedded_concrete: [0.3, 0.273, 0.23],
  ph_brick_wall_001: [0.136, 0.074, 0.048],
  acg_OfficeCeiling001: [0.909, 0.909, 0.909],
  ph_terrazzo_tiles: [0.251, 0.152, 0.095],
  ph_painted_plaster_wall: [0.407, 0.365, 0.35],
  ph_dark_wood: [0.111, 0.024, 0.009],
  ph_blue_metal_plate: [0.042, 0.042, 0.042],
};

/** Color multiplier that moves `dir`'s average albedo to the sRGB hex `target` (palette estimate). */
export function tintTo(dir: string, target: number): THREE.Color {
  const t = new THREE.Color(target); // three converts hex (sRGB) to linear working space
  const m = MEAN_ALBEDO[dir];
  return new THREE.Color(t.r / m[0], t.g / m[1], t.b / m[2]);
}

/** Photo sets stored as KTX2 (ETC1S color, UASTC normal). JPG originals are not in git. */
export const KTX_TEXTURE_DIRS = [
  'ph_concrete_layers_02',
  'ph_red_brick_03',
  'ph_brick_wall_001',
  'ph_asphalt_02',
  'ph_leafy_grass',
  'ph_concrete_pavement',
  'ph_concrete_wall_009',
  'ph_white_sandstone_blocks_02',
] as const;

const KTX_EXT = new Set<string>(KTX_TEXTURE_DIRS);

interface TexSet {
  /** texture folder under client/public/textures */
  dir: string;
  albedo?: boolean;
  /** albedo file name (default albedo.jpg) */
  albedoFile?: string;
  normal?: boolean;
  orm?: boolean;
  /** scale the physical tile size (e.g. 2 = features twice as big) */
  scale?: number;
}

function textured(m: THREE.MeshStandardMaterial, t: TexSet, normalScale = 1, aoIntensity = 1): void {
  const base = TILE[t.dir];
  const k = t.scale ?? 1;
  const tile: [number, number] = [base[0] * k, base[1] * k];
  const ext = KTX_EXT.has(t.dir) ? 'ktx2' : 'jpg';
  if (t.albedo !== false) m.map = loadTexture(`${t.dir}/${t.albedoFile ?? `albedo.${ext}`}`, { srgb: true, tile });
  if (t.normal !== false) {
    m.normalMap = loadTexture(`${t.dir}/normal.${ext}`, { tile });
    m.normalScale.set(normalScale, normalScale);
  }
  if (t.orm !== false) {
    const orm = loadTexture(`${t.dir}/orm.${ext}`, { tile });
    m.roughnessMap = orm;
    m.aoMap = orm;
    m.aoMapIntensity = aoIntensity;
  }
}

function std(p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(p);
}

const EXTERIOR_WALL: SurfaceFx = { macroScale: 37, macroAmp: 0.1, macroAmp2: 0.06, roughAmp: 0.04, streaks: 0.28, baseGrime: 0.3, topDirt: 0.25, antiTileShift: [0.4137, 0] };
const BRICK_FX: SurfaceFx = { macroScale: 31, macroAmp: 0.08, macroAmp2: 0.05, streaks: 0.15, baseGrime: 0.3, topDirt: 0.2 };

/** Opaque window glass with fake rooms; `bronze` = 1960s bronze-tinted glass. */
function windowGlass(name: MaterialName, kind: 'clear' | 'bronze' | 'fritted'): THREE.Material {
  if (kind === 'bronze') {
    const g = new THREE.MeshPhysicalMaterial({ name, color: 0x000000, metalness: 0, roughness: 0.04, ior: 2.3, specularColor: new THREE.Color(1.25, 1.05, 0.82) });
    applySurfaceFx(g, { interior: true, glassTint: [0.42, 0.31, 0.2] }, name);
    return g;
  }
  if (kind === 'fritted') {
    const g = new THREE.MeshPhysicalMaterial({ name, color: new THREE.Color(0.17, 0.18, 0.18), metalness: 0, roughness: 0.18, ior: 1.6 });
    applySurfaceFx(g, { interior: true, glassTint: [0.6, 0.66, 0.7], interiorScale: 0.45, macroAmp: 0.04 }, name);
    return g;
  }
  const g = new THREE.MeshPhysicalMaterial({ name, color: 0x000000, metalness: 0, roughness: 0.04, ior: 2.0, specularColor: new THREE.Color(0.85, 0.95, 0.95) });
  applySurfaceFx(g, { interior: true }, name);
  return g;
}

/**
 * See-through architectural glass. Transmission lets the real room show through
 * (University Hall, Daley Library). Opaque window materials keep the fake-interior shader.
 */
function seeThroughGlass(name: MaterialName, tint: THREE.Color, transmission: number): THREE.Material {
  return new THREE.MeshPhysicalMaterial({
    name,
    color: tint,
    metalness: 0,
    roughness: 0.05,
    ior: 1.5,
    transmission,
    thickness: 0.015,
    attenuationColor: tint,
    attenuationDistance: 0.55,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function build(name: MaterialName): THREE.Material {
  let m: THREE.MeshStandardMaterial;
  switch (name) {
    // ------------------------------------------------------------------ concrete
    case 'concrete':
      // Poly Haven "Concrete Layers 02": horizontal board / lift marks, tinted to weathered Netsch grey
      m = std({ name, color: tintTo('ph_concrete_layers_02', 0xa39d92), roughness: 1 });
      textured(m, { dir: 'ph_concrete_layers_02' }, 1, 1);
      applySurfaceFx(m, { ...EXTERIOR_WALL, macroAmp: 0.13, macroAmp2: 0.08, streaks: 0.32 }, name);
      return m;
    case 'concreteWarm':
      m = std({ name, color: tintTo('ph_concrete_wall_007', 0xb3ada1), roughness: 1 });
      textured(m, { dir: 'ph_concrete_wall_007' }, 1, 1);
      applySurfaceFx(m, { ...EXTERIOR_WALL, antiTileShift: [0.4137, 0] }, name);
      return m;
    case 'concreteDark':
      m = std({ name, color: tintTo('ph_concrete_wall_006', 0x77726a), roughness: 1 });
      textured(m, { dir: 'ph_concrete_wall_006' }, 1, 1);
      applySurfaceFx(m, { ...EXTERIOR_WALL, antiTileShift: [0.4137, 0], macroAmp: 0.12, streaks: 0.3, baseGrime: 0.35 }, name);
      return m;
    case 'concreteSmooth':
      // Poly Haven "Concrete Wall 009": weathered precast with pores and pour marks
      m = std({ name, color: tintTo('ph_concrete_wall_009', 0xb4afa6), roughness: 1.2 });
      textured(m, { dir: 'ph_concrete_wall_009' }, 1, 1);
      applySurfaceFx(m, { ...EXTERIOR_WALL, antiTileShift: [0.4137, 0], macroAmp: 0.08, streaks: 0.2 }, name);
      return m;
    case 'concreteExposedAggregate':
      m = std({ name, color: tintTo('ph_gravel_embedded_concrete', 0xa29c91), roughness: 1 });
      textured(m, { dir: 'ph_gravel_embedded_concrete' }, 1, 1);
      applySurfaceFx(m, { ...EXTERIOR_WALL, antiTileShift: undefined, antiTile: true, streaks: 0.24 }, name);
      return m;
    // ------------------------------------------------------------------ brick
    case 'brick':
      m = std({ name, roughness: 1.6 });
      textured(m, { dir: 'ph_red_brick_03' }, 1, 1);
      applySurfaceFx(m, BRICK_FX, name);
      return m;
    case 'brickUIC':
    case 'brickDouble':
      // mixed-color brick gives the per-brick "color range" Netsch specified; tinted to the facades.md estimate
      m = std({ name, color: tintTo('ph_brick_wall_001', 0x70493c), roughness: 1 }); // facades.md #7a4636, slightly browner: the mixed scan reads redder than its mean
      textured(m, { dir: 'ph_brick_wall_001', scale: name === 'brickDouble' ? 2 : 1 }, 1, 1);
      applySurfaceFx(m, BRICK_FX, name);
      return m;
    case 'brickDark':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'ph_brick_wall_10' }, 1, 1);
      applySurfaceFx(m, BRICK_FX, name);
      return m;
    case 'brickCommon':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'ph_brick_wall_001' }, 1, 1);
      applySurfaceFx(m, BRICK_FX, name);
      return m;
    // ------------------------------------------------------------------ glass & metal
    case 'glass':
      return windowGlass(name, 'clear');
    case 'glassBronze':
      return windowGlass(name, 'bronze');
    case 'glassFritted':
      return windowGlass(name, 'fritted');
    case 'glassClear':
      return seeThroughGlass(name, new THREE.Color().setRGB(0.94, 0.97, 0.96), 1);
    case 'glassBronzeClear':
      return seeThroughGlass(name, new THREE.Color().setRGB(0.55, 0.36, 0.2), 0.86);
    case 'windowFrame':
      m = std({ name, color: new THREE.Color(0x3d3329), metalness: 0.85, roughness: 1 });
      m.roughnessMap = loadTexture('metal/orm.jpg', { tile: TILE.metal });
      applySurfaceFx(m, { macroAmp: 0.1, roughAmp: 0.08 }, name);
      return m;
    case 'metalBronze':
      m = std({ name, color: new THREE.Color(0x8a6a48), metalness: 1, roughness: 1.15 });
      m.roughnessMap = loadTexture('metal/orm.jpg', { tile: TILE.metal });
      applySurfaceFx(m, { macroAmp: 0.12, macroAmp2: 0.08, roughAmp: 0.08, topDirt: 0.15 }, name);
      return m;
    case 'metalPanel':
      m = std({ name, color: tintTo('ph_blue_metal_plate', 0x9ea3a6), metalness: 0.35, roughness: 1.6 });
      textured(m, { dir: 'ph_blue_metal_plate' }, 0.8, 1);
      applySurfaceFx(m, { macroScale: 29, macroAmp: 0.06, macroAmp2: 0.04, streaks: 0.12, baseGrime: 0.2 }, name);
      return m;
    case 'metal':
      m = std({ name, color: new THREE.Color(0.4, 0.41, 0.42), metalness: 0.7, roughness: 1.7 }); // weathered galvanized / painted steel: ~0.65 rough
      m.roughnessMap = loadTexture('metal/orm.jpg', { tile: TILE.metal });
      applySurfaceFx(m, { macroAmp: 0.12, macroAmp2: 0.08, roughAmp: 0.1, topDirt: 0.2 }, name);
      return m;
    // ------------------------------------------------------------------ ground
    case 'asphalt':
      m = std({ name, color: new THREE.Color(0.92, 0.92, 0.95), roughness: 1 });
      textured(m, { dir: 'ph_asphalt_02' }, 1, 1);
      applySurfaceFx(m, { macroScale: 53, macroAmp: 0.12, macroAmp2: 0.07, roughAmp: 0.06, antiTile: true }, name);
      return m;
    case 'sidewalk':
      m = std({ name, roughness: 1 });
      // Poly Haven "Concrete Pavement": poured slabs with saw-cut joints, like Chicago sidewalks
      m.color = tintTo('ph_concrete_pavement', 0xa7a39b);
      textured(m, { dir: 'ph_concrete_pavement' }, 1, 1);
      applySurfaceFx(m, { macroScale: 29, macroAmp: 0.12, macroAmp2: 0.07, roughAmp: 0.05, antiTile: true }, name);
      return m;
    case 'limestone':
    case 'plaza':
      // Poly Haven has no scan named limestone. White sandstone blocks are the pale cut stone.
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'ph_white_sandstone_blocks_02' }, 1, 1);
      applySurfaceFx(m, { macroScale: 33, macroAmp: 0.08, macroAmp2: 0.05, roughAmp: 0.05 }, name);
      return m;
    case 'grass':
      // Poly Haven "Leafy Grass": a real lawn scan with clover and blade depth (less flat than a mown-carpet scan)
      m = std({ name, color: tintTo('ph_leafy_grass', 0x5f6b3c), roughness: 1.6 });
      textured(m, { dir: 'ph_leafy_grass' }, 1.2, 1);
      applySurfaceFx(m, { macroScale: 43, macroAmp: 0.16, macroAmp2: 0.1, antiTile: true, dryTint: 0.25 }, name);
      return m;
    case 'soil':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'ph_yellow_flower_mulch' }, 1, 1);
      applySurfaceFx(m, { macroAmp: 0.12, macroAmp2: 0.08, antiTile: true }, name);
      return m;
    case 'roof':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'ph_bicolour_gravel' }, 1, 1);
      applySurfaceFx(m, { macroScale: 47, macroAmp: 0.15, macroAmp2: 0.08, antiTile: true }, name);
      return m;
    case 'water': {
      m = std({ name, color: new THREE.Color(0.02, 0.035, 0.035), metalness: 0, roughness: 0.04 });
      m.normalMap = loadTexture('water/normal.jpg', { tile: TILE.water });
      m.normalScale.set(0.35, 0.35);
      waterNormals.push(m.normalMap);
      return m;
    }
    case 'roadMarking':
    case 'roadMarkingYellow': {
      const c = name === 'roadMarking' ? new THREE.Color(0.62, 0.62, 0.6) : new THREE.Color(0.62, 0.42, 0.06);
      m = std({ name, color: c, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      // reuse asphalt texture detail so paint looks worn and grainy
      m.normalMap = loadTexture('ph_asphalt_02/normal.ktx2', { tile: TILE.ph_asphalt_02 });
      m.aoMap = loadTexture('ph_asphalt_02/orm.ktx2', { tile: TILE.ph_asphalt_02 });
      applySurfaceFx(m, { macroScale: 11, macroAmp: 0.18, macroAmp2: 0.12 }, name);
      return m;
    }
    // ------------------------------------------------------------------ interiors
    case 'interiorWall':
      m = std({ name, color: tintTo('ph_painted_plaster_wall', 0xd9d5cc), roughness: 1 });
      textured(m, { dir: 'ph_painted_plaster_wall' }, 0.6, 1);
      applySurfaceFx(m, { macroScale: 17, macroAmp: 0.025 }, name);
      return m;
    case 'interiorFloor':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'acg_Carpet012' }, 1, 1);
      applySurfaceFx(m, { macroScale: 13, macroAmp: 0.05, macroAmp2: 0.03, antiTile: true }, name);
      return m;
    case 'interiorFloorHard':
      m = std({ name, color: tintTo('ph_terrazzo_tiles', 0x9f988d), roughness: 1.5 });
      textured(m, { dir: 'ph_terrazzo_tiles' }, 1, 1);
      applySurfaceFx(m, { macroScale: 19, macroAmp: 0.05, macroAmp2: 0.03 }, name);
      return m;
    case 'interiorCeiling':
      m = std({ name, color: tintTo('acg_OfficeCeiling001', 0xdedbd3), roughness: 1 });
      textured(m, { dir: 'acg_OfficeCeiling001' }, 1, 1);
      applySurfaceFx(m, { macroScale: 23, macroAmp: 0.02 }, name);
      return m;
    case 'lightFixture':
      // ~ luminance of a diffused LED troffer under interior exposure; pair with real lights
      return std({ name, color: 0xffffff, emissive: new THREE.Color(1.0, 0.97, 0.92), emissiveIntensity: 1.6, roughness: 0.4 });
    case 'wood':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'ph_oak_veneer_01' }, 1, 1);
      return m;
    case 'bookshelf':
      m = std({ name, color: tintTo('ph_dark_wood', 0x5a4030), roughness: 1 });
      textured(m, { dir: 'ph_dark_wood' }, 1, 1);
      return m;
    case 'fabric':
      m = std({ name, color: new THREE.Color(0.2, 0.25, 0.36), roughness: 1 });
      textured(m, { dir: 'fabric' }, 1, 1);
      return m;
    case 'screen':
      // dark glossy panel with a dim desktop glow; reflections of the room do most of the work
      return std({ name, color: 0x07090b, emissive: new THREE.Color(0.016, 0.024, 0.036), emissiveIntensity: 1, roughness: 0.12, metalness: 0 });
    // ------------------------------------------------------------------ trees
    case 'foliage':
      m = std({ name, color: new THREE.Color(0.58, 0.62, 0.42), roughness: 1, side: THREE.DoubleSide, alphaTest: 0.5 });
      textured(m, { dir: 'foliage', albedoFile: 'albedo.png' }, 1, 1);
      applySurfaceFx(m, { macroScale: 19, macroAmp: 0.15, macroAmp2: 0.1, dryTint: 0.6 }, name);
      return m;
    case 'bark':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'ph_bark_brown_02' }, 1, 1);
      applySurfaceFx(m, { macroScale: 7, macroAmp: 0.1, macroAmp2: 0.08 }, name);
      return m;
  }
}

const cache = new Map<MaterialName, THREE.Material>();
const waterNormals: THREE.Texture[] = [];

export function getMaterial(name: MaterialName): THREE.Material {
  let m = cache.get(name);
  if (!m) {
    if (!surfaceUniforms.gfxMacro.value) {
      const macro = loadTexture('macro/macro.png');
      macro.anisotropy = 4;
      surfaceUniforms.gfxMacro.value = macro;
    }
    m = build(name);
    cache.set(name, m);
  }
  return m;
}

/** Called by the renderer every frame (animated water, etc.). */
export function updateMaterials(elapsed: number): void {
  surfaceUniforms.gfxTime.value = elapsed;
  for (const t of waterNormals) t.offset.set(elapsed * 0.004, elapsed * 0.0025);
}

/** Set by the renderer from the time of day: how bright rooms behind 'glass' look. */
export function setInteriorLighting(daylight: number, electric: number): void {
  surfaceUniforms.gfxInterior.value.set(daylight, electric);
}
