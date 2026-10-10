import * as THREE from 'three';
import { loadTexture } from './textures';
import { applySurfaceFx, surfaceUniforms, type SurfaceFx } from './surfaceShader';

/**
 * Central material library. OWNER: Graphics Engineer.
 * Everyone else asks for materials by name; never create ad-hoc materials for surfaces listed here.
 *
 * UV CONVENTION: 1 UV unit = 1 meter of surface. On walls use u = horizontal distance along the
 * wall, v = height (up). On the ground use u = x (east), v = -z (north). Each material sets its own
 * texture repeat, so bricks, slab joints, board-form marks etc. come out at real-world scale.
 * Exception: 'foliage' / 'bark' also work in meters (canopy shells / trunks).
 *
 * Textures are self-made (tools/textures/generate.py → client/public/textures/). Large-scale
 * color variation, rain streaks and base grime are added in world space by the shader
 * (surfaceShader.ts), so geometry doesn't need any special UVs for weathering.
 *
 * Materials are shared: don't mutate them (color, opacity …). If you need a variant, ask the
 * Graphics Engineer for a new name.
 */
export type MaterialName =
  | 'concrete' // weathered board-formed Brutalist concrete (UIC default)
  | 'concreteDark' // darker, dirtier concrete (bases, stair towers, shaded volumes)
  | 'concreteSmooth' // precast panels / curbs / sills (University Hall)
  | 'brick' // Chicago red-brown face brick, running bond
  | 'glass' // OPAQUE window glass for sealed buildings: reflections + fake rooms behind it
  | 'glassClear' // TRANSPARENT glass for enterable buildings (see-through both ways)
  | 'windowFrame' // dark bronze anodized aluminum
  | 'metal' // galvanized / painted steel (rails, posts, benches)
  | 'asphalt'
  | 'sidewalk' // 1.5 m concrete slabs with tooled joints
  | 'plaza' // granite pavers 60 x 30 cm
  | 'grass'
  | 'soil' // mulch planting beds
  | 'water'
  | 'roof' // gravel-ballasted flat roof
  | 'roadMarking' // white thermoplastic paint (put a few mm above the road)
  | 'roadMarkingYellow'
  | 'interiorWall'
  | 'interiorFloor' // carpet tile
  | 'interiorFloorHard' // polished concrete / terrazzo-like hard floor (lobbies, corridors)
  | 'interiorCeiling' // 2' x 2' acoustic tiles in a T-bar grid
  | 'lightFixture' // emissive ceiling light panel (pair with a real light)
  | 'wood'
  | 'fabric'
  | 'bookshelf' // dark stained wood
  | 'screen' // computer monitors (emissive)
  | 'foliage' // tree leaves (October green with autumn tints), double-sided
  | 'bark';

export const MATERIAL_NAMES: readonly MaterialName[] = [
  'concrete', 'concreteDark', 'concreteSmooth', 'brick', 'glass', 'glassClear', 'windowFrame', 'metal',
  'asphalt', 'sidewalk', 'plaza', 'grass', 'soil', 'water', 'roof', 'roadMarking', 'roadMarkingYellow',
  'interiorWall', 'interiorFloor', 'interiorFloorHard', 'interiorCeiling', 'lightFixture', 'wood', 'fabric',
  'bookshelf', 'screen', 'foliage', 'bark',
];

/** Physical size (m) of one texture tile; must match tools/textures/generate.py TILE_METERS. */
export const TILE: Record<string, [number, number]> = {
  concrete: [2.4, 2.4],
  concreteSmooth: [2.0, 2.0],
  brick: [1.76, 1.2],
  asphalt: [4.0, 4.0],
  sidewalk: [3.0, 3.0],
  plaza: [2.4, 2.4],
  grass: [2.0, 2.0],
  soil: [1.5, 1.5],
  roof: [2.0, 2.0],
  interiorWall: [2.0, 2.0],
  interiorFloor: [2.0, 2.0],
  interiorCeiling: [1.22, 1.22],
  wood: [1.0, 1.0],
  fabric: [0.2, 0.2],
  metal: [1.0, 1.0],
  foliage: [1.5, 1.5],
  bark: [1.0, 2.0],
  water: [4.0, 4.0],
};

interface TexSet {
  /** texture folder under client/public/textures */
  dir: string;
  albedo?: boolean;
  /** albedo file name (default albedo.jpg) */
  albedoFile?: string;
  normal?: boolean;
  orm?: boolean;
  /** override physical tile size */
  tile?: [number, number];
}

function textured(m: THREE.MeshStandardMaterial, t: TexSet, normalScale = 1, aoIntensity = 1): void {
  const tile = t.tile ?? TILE[t.dir];
  if (t.albedo !== false) m.map = loadTexture(`${t.dir}/${t.albedoFile ?? 'albedo.jpg'}`, { srgb: true, tile });
  if (t.normal !== false) {
    m.normalMap = loadTexture(`${t.dir}/normal.jpg`, { tile });
    m.normalScale.set(normalScale, normalScale);
  }
  if (t.orm !== false) {
    const orm = loadTexture(`${t.dir}/orm.jpg`, { tile });
    m.roughnessMap = orm;
    m.aoMap = orm;
    m.aoMapIntensity = aoIntensity;
  }
}

function std(p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(p);
}

// board-form rows are 1/16 of the concrete tile tall, so shift by whole rows to keep them aligned
const EXTERIOR_WALL: SurfaceFx = { macroScale: 37, macroAmp: 0.09, macroAmp2: 0.06, roughAmp: 0.04, streaks: 0.3, baseGrime: 0.3, topDirt: 0.25, antiTileShift: [0.4137, 0.3125] };

function build(name: MaterialName): THREE.Material {
  let m: THREE.MeshStandardMaterial;
  switch (name) {
    case 'concrete':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'concrete' }, 1, 1);
      applySurfaceFx(m, EXTERIOR_WALL, name);
      return m;
    case 'concreteDark':
      m = std({ name, color: new THREE.Color(0.7, 0.69, 0.67), roughness: 1 });
      textured(m, { dir: 'concrete' }, 1.1, 1);
      applySurfaceFx(m, { ...EXTERIOR_WALL, macroAmp: 0.12, streaks: 0.32, baseGrime: 0.35 }, name);
      return m;
    case 'concreteSmooth':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'concreteSmooth' }, 1, 1);
      applySurfaceFx(m, { ...EXTERIOR_WALL, macroAmp: 0.07, streaks: 0.18 }, name);
      return m;
    case 'brick':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'brick' }, 1, 1);
      // shift by whole bricks / an even number of courses so the running bond stays intact
      applySurfaceFx(m, { macroScale: 31, macroAmp: 0.08, macroAmp2: 0.05, streaks: 0.15, baseGrime: 0.3, topDirt: 0.2, antiTileShift: [0.375, 0.375] }, name);
      return m;
    case 'glass': {
      const g = new THREE.MeshPhysicalMaterial({
        name, color: 0x000000, metalness: 0, roughness: 0.04, ior: 2.0,
        specularColor: new THREE.Color(0.85, 0.95, 0.95),
      });
      applySurfaceFx(g, { interior: true }, name);
      return g;
    }
    case 'glassClear': {
      const g = new THREE.MeshPhysicalMaterial({
        name, color: new THREE.Color(0.02, 0.03, 0.03), metalness: 0, roughness: 0.03, ior: 1.6,
        transparent: true, opacity: 0.16, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide,
      });
      applySurfaceFx(g, { clearGlass: true }, name);
      return g;
    }
    case 'windowFrame':
      m = std({ name, color: new THREE.Color(0.045, 0.04, 0.035), metalness: 0.85, roughness: 1 });
      m.roughnessMap = loadTexture('metal/orm.jpg', { tile: TILE.metal });
      applySurfaceFx(m, { macroAmp: 0.1, roughAmp: 0.08 }, name);
      return m;
    case 'metal':
      m = std({ name, color: new THREE.Color(0.4, 0.41, 0.42), metalness: 0.7, roughness: 1.7 }); // weathered galvanized / painted steel: ~0.65 rough
      m.roughnessMap = loadTexture('metal/orm.jpg', { tile: TILE.metal });
      applySurfaceFx(m, { macroAmp: 0.12, macroAmp2: 0.08, roughAmp: 0.1, topDirt: 0.2 }, name);
      return m;
    case 'asphalt':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'asphalt' }, 1, 1);
      applySurfaceFx(m, { macroScale: 53, macroAmp: 0.12, macroAmp2: 0.07, roughAmp: 0.06, antiTile: true }, name);
      return m;
    case 'sidewalk':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'sidewalk' }, 1, 1);
      applySurfaceFx(m, { macroScale: 29, macroAmp: 0.1, macroAmp2: 0.06, roughAmp: 0.04 }, name);
      return m;
    case 'plaza':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'plaza' }, 1, 1);
      applySurfaceFx(m, { macroScale: 33, macroAmp: 0.08, macroAmp2: 0.05, roughAmp: 0.05 }, name);
      return m;
    case 'grass':
      m = std({ name, color: new THREE.Color(1.4, 1.6, 1.3), roughness: 1 });
      textured(m, { dir: 'grass' }, 1, 1);
      applySurfaceFx(m, { macroScale: 43, macroAmp: 0.16, macroAmp2: 0.1, antiTile: true, dryTint: 0.3 }, name);
      return m;
    case 'soil':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'soil' }, 1, 1);
      applySurfaceFx(m, { macroAmp: 0.12, macroAmp2: 0.08, antiTile: true }, name);
      return m;
    case 'roof':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'roof' }, 1, 1);
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
      m.normalMap = loadTexture('asphalt/normal.jpg', { tile: TILE.asphalt });
      m.aoMap = loadTexture('asphalt/orm.jpg', { tile: TILE.asphalt });
      applySurfaceFx(m, { macroScale: 11, macroAmp: 0.18, macroAmp2: 0.12 }, name);
      return m;
    }
    case 'interiorWall':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'interiorWall' }, 1, 1);
      applySurfaceFx(m, { macroScale: 17, macroAmp: 0.025 }, name);
      return m;
    case 'interiorFloor':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'interiorFloor' }, 1, 1);
      applySurfaceFx(m, { macroScale: 13, macroAmp: 0.05, macroAmp2: 0.03 }, name);
      return m;
    case 'interiorFloorHard':
      m = std({ name, color: new THREE.Color(0.95, 0.93, 0.9), roughness: 0.55 });
      textured(m, { dir: 'concreteSmooth', orm: false }, 0.4, 1);
      applySurfaceFx(m, { macroScale: 19, macroAmp: 0.06, macroAmp2: 0.04 }, name);
      return m;
    case 'interiorCeiling':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'interiorCeiling' }, 1, 1);
      applySurfaceFx(m, { macroScale: 23, macroAmp: 0.02 }, name);
      return m;
    case 'lightFixture':
      // ~ luminance of a diffused LED troffer under interior exposure; pair with real lights
      return std({ name, color: 0xffffff, emissive: new THREE.Color(1.0, 0.97, 0.92), emissiveIntensity: 1.6, roughness: 0.4 });
    case 'wood':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'wood' }, 1, 1);
      return m;
    case 'bookshelf':
      m = std({ name, color: new THREE.Color(0.42, 0.33, 0.27), roughness: 1 });
      textured(m, { dir: 'wood' }, 1, 1);
      return m;
    case 'fabric':
      m = std({ name, color: new THREE.Color(0.2, 0.25, 0.36), roughness: 1 });
      textured(m, { dir: 'fabric' }, 1, 1);
      return m;
    case 'screen':
      return std({ name, color: 0x050607, emissive: new THREE.Color(0.55, 0.66, 0.8), emissiveIntensity: 0.55, roughness: 0.25 });
    case 'foliage':
      m = std({ name, color: new THREE.Color(0.58, 0.62, 0.42), roughness: 1, side: THREE.DoubleSide, alphaTest: 0.5 });
      textured(m, { dir: 'foliage', albedoFile: 'albedo.png' }, 1, 1);
      applySurfaceFx(m, { macroScale: 19, macroAmp: 0.15, macroAmp2: 0.1, dryTint: 0.6 }, name);
      return m;
    case 'bark':
      m = std({ name, roughness: 1 });
      textured(m, { dir: 'bark' }, 1, 1);
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
