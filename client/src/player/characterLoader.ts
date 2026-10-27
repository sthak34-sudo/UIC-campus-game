/**
 * Realistic player body, when the files are on disk.
 *
 *   client/public/models/characters/player_base.glb   CC0 MakeHuman body (committed)
 *   client/public/models/characters/player_anims_cc0.glb  CC0 Quaternius clips baked to this skeleton (committed)
 *   client/public/models/private/anims.glb            Mixamo clips (NEVER commit; folder is gitignored).
 *                                                     Used instead of the CC0 clips when present.
 *
 * The body is 1.75 m, Y-up, facing +Z, with a mixamorig skeleton plus a `root` bone at the feet.
 * Meshes are player_LOD0..LOD3. Hair, brows and lashes are transparent cards; on load they use
 * alphaTest so the hair does not sort wrong. There is no "hit" clip: damage plays a short flinch.
 * The death clip sinks the hips about 8 cm into the floor while lying, so the hips are lifted
 * back up as that clip plays.
 *
 * If the body or both clip files are missing, this returns null and the player keeps the procedural figure.
 */
import * as THREE from 'three';
import { sharedKtx2Loader } from '../render/textures';
import { damp, turnToward } from './math';
import { applyFootIk, findLegBones, type GroundProbe, type LegBones } from './footIk';
export type { GroundProbe } from './footIk';

export const PLAYER_BODY_URL = 'models/characters/player_base.glb';
declare const __HAS_PRIVATE_ANIMS__: boolean | undefined;
export const PLAYER_ANIMS_URL = 'models/private/anims.glb';
/** CC0 clips (Quaternius Universal Animation Library) baked onto the player_base skeleton. Committed. */
export const PLAYER_PUBLIC_ANIMS_URL = 'models/characters/player_anims_cc0.glb';

/** Which clip file the loaded character uses: private Mixamo or the public CC0 set. */
export let animSource: 'mixamo' | 'cc0' | 'none' = 'none';

async function fetchGlb(path: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(publicUrl(path));
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return isGlb(buf) ? buf : null;
  } catch {
    return null;
  }
}

/** Authored clips. There is no hit clip; see `CharacterVisual.flinch`. */
export const CLIP_NAMES = [
  'idle', 'walk', 'run', 'crouch_idle', 'crouch_walk', 'aim_idle', 'fire', 'reload', 'jump', 'death',
] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

const LOCO_NAMES = ['idle', 'walk', 'run', 'crouch_idle', 'crouch_walk'] as const;
type LocoName = (typeof LOCO_NAMES)[number];
const UPPER_SPECIAL = ['aim_idle', 'fire', 'reload'] as const;
type UpperSpecial = (typeof UPPER_SPECIAL)[number];
const FULL_BODY = ['jump', 'death'] as const;
type FullBody = (typeof FULL_BODY)[number];

/** Metres the lying death pose is pushed back up. The clip itself sinks about this far. */
export const DEATH_SINK_M = 0.08;

/**
 * LOD cuts in metres (camera to character). The third-person camera never goes past 7 m,
 * so the player you control stays on the detailed mesh. Dummies farther away drop detail.
 */
export const LOD_CUTS_M = [9, 18, 40] as const;

export interface AnimFlags {
  crouch?: boolean;
  aiming?: boolean;
  jumping?: boolean;
  dead?: boolean;
}

export interface HitDir {
  x: number;
  y: number;
  z: number;
}

export interface CharacterVisual {
  readonly root: THREE.Object3D;
  yaw: number;
  readonly kind: 'gltf' | 'procedural';
  readonly lod: number;
  /** Animation tracks whose bones were not on the body. Zero means a direct bind. */
  readonly missingTracks: number;
  update(dt: number, speed: number, grounded: boolean, moveYaw: number | null, viewDistance?: number): void;
  setFlags(flags: AnimFlags): void;
  /** Optional Rapier (or other) ground height probe for foot IK. Null disables planting. */
  setGroundProbe(probe: GroundProbe | null): void;
  /**
   * No hit clip ships with the animation file. A short spine twitch stands in for it.
   * `hitDir` is world-space direction from attacker toward the victim (impulse direction).
   */
  flinch(hitDir?: HitDir): void;
  playFire(): void;
  /** `seconds` is how long the gameplay reload lasts, so the clip finishes with it. */
  playReload(seconds: number): void;
  dispose(): void;
}

export function lodIndexForDistance(distance: number, cuts: readonly number[] = LOD_CUTS_M): 0 | 1 | 2 | 3 {
  if (distance < cuts[0]!) return 0;
  if (distance < cuts[1]!) return 1;
  if (distance < cuts[2]!) return 2;
  return 3;
}

/**
 * How much idle, walk and run to blend for a horizontal speed.
 * `walkAt` / `runAt` are the speeds those clips were authored for (m/s).
 */
export function locomotionWeights(speed: number, walkAt = 1.4, runAt = 4.5): { idle: number; walk: number; run: number } {
  const s = Math.max(0, speed);
  const idleEnd = Math.min(0.25, walkAt * 0.5);
  if (s <= idleEnd || walkAt <= idleEnd) return { idle: 1, walk: 0, run: 0 };
  if (s < walkAt) {
    const t = (s - idleEnd) / (walkAt - idleEnd);
    return { idle: 1 - t, walk: t, run: 0 };
  }
  if (s < runAt && runAt > walkAt) {
    const t = (s - walkAt) / (runAt - walkAt);
    return { idle: 0, walk: 1 - t, run: t };
  }
  return { idle: 0, walk: 0, run: 1 };
}

export function crouchWeights(speed: number, crouchAt = 1.15): { crouch_idle: number; crouch_walk: number } {
  const s = Math.max(0, speed);
  const start = 0.2;
  if (s <= start || crouchAt <= start) return { crouch_idle: 1, crouch_walk: 0 };
  if (s >= crouchAt) return { crouch_idle: 0, crouch_walk: 1 };
  const t = (s - start) / (crouchAt - start);
  return { crouch_idle: 1 - t, crouch_walk: t };
}

export interface StanceWeights {
  idle: number;
  walk: number;
  run: number;
  crouch_idle: number;
  crouch_walk: number;
}

/** `crouchAmount` is 0 standing .. 1 fully crouched. The five weights sum to 1. */
export function stanceMix(
  stand: { idle: number; walk: number; run: number },
  crouch: { crouch_idle: number; crouch_walk: number },
  crouchAmount: number,
): StanceWeights {
  const c = Math.min(1, Math.max(0, crouchAmount));
  const s = 1 - c;
  return {
    idle: stand.idle * s,
    walk: stand.walk * s,
    run: stand.run * s,
    crouch_idle: crouch.crouch_idle * c,
    crouch_walk: crouch.crouch_walk * c,
  };
}

/**
 * Lift applied on top of the death clip so the body does not rest inside the floor.
 * Zero at the start of the fall, full `DEATH_SINK_M` once the character is lying down
 * (about 60% through this clip).
 */
export function deathLiftMeters(time: number, duration: number): number {
  if (!(duration > 0)) return DEATH_SINK_M;
  const u = Math.min(1, Math.max(0, time / duration));
  const t = Math.min(1, Math.max(0, (u - 0.4) / 0.2));
  const smooth = t * t * (3 - 2 * t);
  return DEATH_SINK_M * smooth;
}

/**
 * Drops scale tracks and position tracks other than the hips.
 * In-place clips still carry per-bone translation from the Mixamo export; leaving those
 * on makes the mesh drift away from the capsule. Hip position stays so crouches,
 * jumps and the death lie keep their height.
 */
export function stripInPlace(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) => keepTrack(track.name));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export function keepTrack(trackName: string): boolean {
  const dot = trackName.lastIndexOf('.');
  const prop = dot >= 0 ? trackName.slice(dot + 1) : trackName;
  if (prop.startsWith('scale')) return false;
  if (prop.startsWith('position')) {
    const bone = dot >= 0 ? trackName.slice(0, dot) : trackName;
    return /hips$/i.test(bone);
  }
  return prop.startsWith('quaternion') || prop.startsWith('rotation');
}

/** Bones from `mixamorig:Spine` upward, using whatever name the glTF loader left on the object. */
export function collectUpperBodyNames(root: THREE.Object3D): Set<string> {
  const names = new Set<string>();
  const spine = findNamed(root, 'mixamorig:Spine', 'mixamorigSpine');
  // Everything at the spine and above is the upper body. The loader strips ":" from bone names,
  // so this collects whatever the objects are actually called after the file is parsed.
  spine?.traverse((o) => names.add(o.name));
  return names;
}

function findNamed(root: THREE.Object3D, ...names: string[]): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && names.includes(o.name)) found = o;
  });
  return found;
}

function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${path}`.replace(/([^:]\/)\/+/g, '$1');
}

function isGlb(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const m = new Uint8Array(buf, 0, 4);
  return m[0] === 0x67 && m[1] === 0x6c && m[2] === 0x54 && m[3] === 0x46;
}

function normalizeClipName(name: string): string {
  return name.toLowerCase().replace(/^.*\|/, '').replace(/\s+/g, '_');
}

function findClip(clips: THREE.AnimationClip[], name: ClipName): THREE.AnimationClip | undefined {
  const exact = clips.find((c) => normalizeClipName(c.name) === name);
  if (exact) return exact;
  return clips.find((c) => normalizeClipName(c.name).includes(name));
}

function trackBone(trackName: string): string {
  const dot = trackName.indexOf('.');
  return dot >= 0 ? trackName.slice(0, dot) : trackName;
}

function countMissing(clips: THREE.AnimationClip[], root: THREE.Object3D): { missing: number; total: number } {
  const names = new Set<string>();
  root.traverse((o) => {
    if (o.name) names.add(o.name);
  });
  let missing = 0;
  let total = 0;
  for (const clip of clips) {
    for (const track of clip.tracks) {
      total++;
      if (!names.has(trackBone(track.name))) missing++;
    }
  }
  return { missing, total };
}

function splitClip(clip: THREE.AnimationClip, upper: Set<string>, suffix: string): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => {
    const bone = trackBone(t.name);
    return suffix === 'upper' ? upper.has(bone) : !upper.has(bone);
  });
  return new THREE.AnimationClip(`${clip.name}@${suffix}`, clip.duration, tracks);
}

/** Hair, brows and lashes are exported as BLEND. Cut them out instead of sorting transparent layers. */
export function tuneHairMaterials(root: THREE.Object3D, msaa: boolean): void {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      const std = mat as THREE.MeshStandardMaterial;
      const card = /hair|brow|lash/i.test(`${mat.name} ${mesh.name}`);
      if (!std.transparent && !card) continue;
      std.transparent = false;
      std.alphaTest = 0.5;
      std.depthWrite = true;
      std.side = THREE.DoubleSide;
      std.alphaToCoverage = msaa;
      std.needsUpdate = true;
    }
  });
}

function rendererUsesMsaa(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.querySelector('canvas');
  if (!canvas) return false;
  const gl = canvas.getContext('webgl2');
  if (!gl) return false;
  const samples = gl.getParameter(gl.SAMPLES);
  return typeof samples === 'number' && samples > 1;
}

interface PreparedClips {
  lower: Map<LocoName, THREE.AnimationClip>;
  upperLoco: Map<LocoName, THREE.AnimationClip>;
  upperSpecial: Map<UpperSpecial, THREE.AnimationClip>;
  full: Map<FullBody, THREE.AnimationClip>;
}

interface CharacterAssets {
  template: THREE.Object3D;
  prepared: PreparedClips;
  upper: Set<string>;
  missingTracks: number;
  clone: (source: THREE.Object3D) => THREE.Object3D;
}

let loading: Promise<CharacterAssets | null> | null = null;
let loaded: CharacterAssets | null = null;

/** The assets from the last successful load, or null if they are not ready or not on disk. */
export function peekCharacterAssets(): CharacterAssets | null {
  return loaded;
}

/**
 * Loads the body and the animation file once. Returns null when either is absent,
 * which is the normal case for CI and for a fresh checkout of the public repository.
 */
export async function loadCharacterAssets(): Promise<CharacterAssets | null> {
  loading ??= fetchAssets().then((assets) => {
    loaded = assets;
    return assets;
  });
  return loading;
}

export async function tryLoadAnimatedCharacter(): Promise<CharacterVisual | null> {
  const assets = await loadCharacterAssets();
  return assets ? createAvatar(assets) : null;
}

/** One skinned character sharing the loaded geometry. The player casts a shadow; distant dummies can opt out. */
export function createAvatar(assets: CharacterAssets, shadow = true): CharacterVisual {
  return new AnimatedCharacter(assets, shadow);
}

/**
 * Picks the clip file: private Mixamo clips when present (local dev), else the committed CC0 set.
 * `load` is injectable for tests.
 */
export async function fetchAnimClips(
  load: (path: string) => Promise<ArrayBuffer | null> = fetchGlb,
  tryPrivate: boolean = typeof __HAS_PRIVATE_ANIMS__ === 'undefined' || __HAS_PRIVATE_ANIMS__,
): Promise<{ buf: ArrayBuffer | null; source: 'mixamo' | 'cc0' | 'none' }> {
  const priv = tryPrivate ? await load(PLAYER_ANIMS_URL) : null;
  if (priv) return { buf: priv, source: 'mixamo' };
  const pub = await load(PLAYER_PUBLIC_ANIMS_URL);
  return pub ? { buf: pub, source: 'cc0' } : { buf: null, source: 'none' };
}

async function fetchAssets(): Promise<CharacterAssets | null> {
  let bodyBuf: ArrayBuffer;
  let animBuf: ArrayBuffer | null;
  try {
    // Private Mixamo clips win when they are on disk (local dev only). The public build ships
    // the CC0 Quaternius clips baked onto the same skeleton, so GitHub Pages gets the real body too.
    const picked = await fetchAnimClips();
    animBuf = picked.buf;
    animSource = picked.source;
    if (!animBuf) {
      console.info('Character animation files not found. Using the simple figure.');
      return null;
    }
    const bodyRes = await fetch(publicUrl(PLAYER_BODY_URL));
    if (!bodyRes.ok) {
      console.info(
        'Character body missing. Using the simple figure. ' +
          'Expected models/characters/player_base.glb next to the animation file.',
      );
      return null;
    }
    bodyBuf = await bodyRes.arrayBuffer();
  } catch (err) {
    console.info('Character files could not be loaded. Using the simple figure.', err);
    return null;
  }
  if (!isGlb(bodyBuf)) {
    console.info('Character body was not a glTF binary. Using the simple figure.');
    return null;
  }

  try {
    const [{ GLTFLoader }, { clone }] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/utils/SkeletonUtils.js'),
    ]);
    const bodyLoader = new GLTFLoader();
    const ktx2 = sharedKtx2Loader();
    if (ktx2) bodyLoader.setKTX2Loader(ktx2);
    const bodyGltf = await bodyLoader.parseAsync(bodyBuf, '');
    const animGltf = await new GLTFLoader().parseAsync(animBuf, '');
    const model = bodyGltf.scene;
    fitModel(model);
    tuneHairMaterials(model, rendererUsesMsaa());
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    });
    for (let i = 1; i <= 3; i++) {
      const lod = model.getObjectByName(`player_LOD${i}`);
      if (lod) lod.visible = false;
    }

    let clips = animGltf.animations.map((clip) => stripInPlace(clip));
    let { missing, total } = countMissing(clips, model);
    if (total > 0 && missing / total > 0.5) {
      const retargeted = await tryRetarget(model, animGltf.scene, clips);
      if (retargeted) {
        clips = retargeted.map((clip) => stripInPlace(clip));
        ({ missing, total } = countMissing(clips, model));
      }
    }
    if (total > 0 && missing / total > 0.5) {
      console.warn(`Character clips did not match the body (${missing}/${total} tracks). Using the simple figure.`);
      return null;
    }
    if (missing > 0) console.warn(`Character clips left ${missing} tracks unbound.`);

    const upper = collectUpperBodyNames(model);
    const prepared = prepareClips(clips, upper);
    const loadedNames = [
      ...prepared.lower.keys(),
      ...prepared.upperSpecial.keys(),
      ...prepared.full.keys(),
    ];
    console.info(`Realistic character loaded from ${animSource} clips (${loadedNames.join(', ')}). ${missing} unbound tracks.`);
    return { template: model, prepared, upper, missingTracks: missing, clone };
  } catch (err) {
    console.warn('Character glTF failed to parse. Using the simple figure.', err);
    return null;
  }
}

/** Puts the feet on y = 0 and scales only when the file is not already a 1.75 m person. */
function fitModel(model: THREE.Object3D): void {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y;
  if (height > 0.2 && Math.abs(height - 1.75) > 0.08) model.scale.multiplyScalar(1.75 / height);
  model.updateMatrixWorld(true);
  const grounded = new THREE.Box3().setFromObject(model);
  if (Math.abs(grounded.min.y) > 0.02) model.position.y -= grounded.min.y;
}

async function tryRetarget(
  body: THREE.Object3D,
  animRoot: THREE.Object3D,
  clips: THREE.AnimationClip[],
): Promise<THREE.AnimationClip[] | null> {
  const target = findSkinned(body);
  const source = findSkinned(animRoot);
  if (!target || !source) return null;
  try {
    const { retargetClip } = await import('three/addons/utils/SkeletonUtils.js');
    return clips.map((clip) => retargetClip(target, source, clip));
  } catch (err) {
    console.warn('Could not retarget character clips.', err);
    return null;
  }
}

function findSkinned(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    const s = o as THREE.SkinnedMesh;
    if (!found && s.isSkinnedMesh) found = s;
  });
  return found;
}

function prepareClips(clips: THREE.AnimationClip[], upper: Set<string>): PreparedClips {
  const lower = new Map<LocoName, THREE.AnimationClip>();
  const upperLoco = new Map<LocoName, THREE.AnimationClip>();
  const upperSpecial = new Map<UpperSpecial, THREE.AnimationClip>();
  const full = new Map<FullBody, THREE.AnimationClip>();
  for (const name of LOCO_NAMES) {
    const clip = findClip(clips, name);
    if (!clip || clip.tracks.length === 0) continue;
    const lo = splitClip(clip, upper, 'lower');
    const up = splitClip(clip, upper, 'upper');
    if (lo.tracks.length) lower.set(name, lo);
    if (up.tracks.length) upperLoco.set(name, up);
  }
  for (const name of UPPER_SPECIAL) {
    const clip = findClip(clips, name);
    if (!clip) continue;
    const up = splitClip(clip, upper, 'upper');
    if (up.tracks.length) upperSpecial.set(name, up);
  }
  for (const name of FULL_BODY) {
    const clip = findClip(clips, name);
    if (clip && clip.tracks.length) full.set(name, clip);
  }
  return { lower, upperLoco, upperSpecial, full };
}

const MOVING: LocoName[] = ['walk', 'run', 'crouch_walk'];

class AnimatedCharacter implements CharacterVisual {
  readonly root = new THREE.Group();
  readonly kind = 'gltf' as const;
  readonly missingTracks: number;
  lod = 0;
  yaw = 0;
  private flags: AnimFlags = {};
  private readonly mixer: THREE.AnimationMixer;
  private readonly lower = new Map<LocoName, THREE.AnimationAction>();
  private readonly upperLoco = new Map<LocoName, THREE.AnimationAction>();
  private readonly upperSpecial = new Map<UpperSpecial, THREE.AnimationAction>();
  private readonly full = new Map<FullBody, THREE.AnimationAction>();
  private readonly lodNodes: THREE.Object3D[] = [];
  private readonly hips: THREE.Object3D | null;
  private readonly spine: THREE.Object3D | null;
  private readonly spine1: THREE.Object3D | null;
  private readonly shadow: boolean;
  private crouchBlend = 0;
  private aimBlend = 0;
  private jumpBlend = 0;
  private firing = false;
  private reloading = false;
  private wasAir = false;
  private wasDead = false;
  private flinchT = 0;
  private flinchCooldown = 0;
  private hipLift = 0;
  private deadTip = 0;
  private readonly flinchQ = new THREE.Quaternion();
  private readonly flinchAxis = new THREE.Vector3(1, 0, 0);
  private readonly flinchDir = new THREE.Vector3(0, 0, 1);
  private groundProbe: GroundProbe | null = null;
  private leftLeg: LegBones | null = null;
  private rightLeg: LegBones | null = null;
  private readonly pelvisIk = { y: 0 };

  constructor(assets: CharacterAssets, shadow: boolean) {
    this.shadow = shadow;
    this.missingTracks = assets.missingTracks;
    // The exported body faces +Z. The game's yaw 0 faces -Z (north), so turn the mesh around.
    const facing = new THREE.Group();
    facing.name = 'character-facing';
    facing.rotation.y = Math.PI;
    const rig = assets.clone(assets.template);
    facing.add(rig);
    this.root.name = 'player-character';
    this.root.add(facing);

    this.mixer = new THREE.AnimationMixer(rig);
    this.mixer.addEventListener('finished', (event) => {
      const action = (event as { action?: THREE.AnimationAction }).action;
      if (!action) return;
      if (action === this.upperSpecial.get('fire')) this.firing = false;
      if (action === this.upperSpecial.get('reload')) this.reloading = false;
    });
    for (const [name, clip] of assets.prepared.lower) this.lower.set(name, this.makeAction(clip, true));
    for (const [name, clip] of assets.prepared.upperLoco) this.upperLoco.set(name, this.makeAction(clip, true));
    for (const [name, clip] of assets.prepared.upperSpecial) {
      this.upperSpecial.set(name, this.makeAction(clip, name === 'aim_idle'));
    }
    for (const [name, clip] of assets.prepared.full) {
      const action = this.makeAction(clip, false);
      action.clampWhenFinished = true;
      this.full.set(name, action);
    }
    for (let i = 0; i < 4; i++) {
      const node = rig.getObjectByName(`player_LOD${i}`);
      if (node) this.lodNodes.push(node);
    }
    this.hips = findNamed(rig, 'mixamorig:Hips', 'mixamorigHips');
    this.spine = findNamed(rig, 'mixamorig:Spine', 'mixamorigSpine');
    this.spine1 = findNamed(rig, 'mixamorig:Spine1', 'mixamorigSpine1');
    this.leftLeg = findLegBones(rig, 'Left');
    this.rightLeg = findLegBones(rig, 'Right');
    this.applyWeights({ idle: 1, walk: 0, run: 0, crouch_idle: 0, crouch_walk: 0 }, 0, 0, 0);
    this.mixer.update(0);
    this.setLod(0);
  }

  setFlags(flags: AnimFlags): void {
    this.flags = flags;
  }

  setGroundProbe(probe: GroundProbe | null): void {
    this.groundProbe = probe;
  }

  flinch(hitDir?: HitDir): void {
    if (this.flags.dead || this.flinchCooldown > 0) return;
    this.flinchT = 0.28;
    this.flinchCooldown = 0.45;
    if (hitDir && (hitDir.x || hitDir.y || hitDir.z)) {
      this.flinchDir.set(hitDir.x, hitDir.y, hitDir.z);
      if (this.flinchDir.lengthSq() > 1e-8) this.flinchDir.normalize();
      else this.flinchDir.set(0, 0, 1);
    } else {
      this.flinchDir.set(0, 0, 1);
    }
    // Axis = hitDir × up, so the spine bends away from the hit.
    this.flinchAxis.set(-this.flinchDir.z, 0, this.flinchDir.x);
    if (this.flinchAxis.lengthSq() < 1e-6) this.flinchAxis.set(1, 0, 0);
    else this.flinchAxis.normalize();
  }

  playFire(): void {
    if (this.flags.dead || this.reloading) return;
    const action = this.upperSpecial.get('fire');
    if (!action) return;
    action.reset().play();
    this.firing = true;
  }

  playReload(seconds: number): void {
    if (this.flags.dead) return;
    const action = this.upperSpecial.get('reload');
    if (!action) return;
    const dur = action.getClip().duration;
    action.timeScale = dur / Math.max(0.2, seconds);
    action.reset().play();
    this.reloading = true;
    this.firing = false;
  }

  update(dt: number, speed: number, grounded: boolean, moveYaw: number | null, viewDistance = 2): void {
    if (!this.flags.dead && moveYaw !== null && (this.flags.aiming || speed > 0.15)) {
      this.yaw = turnToward(this.yaw, moveYaw, 12 * dt);
    }
    this.root.rotation.y = this.yaw;
    if (!this.full.has('death')) {
      // No death clip: tip the whole figure over, same idea as the old dummy.
      this.deadTip = this.flags.dead ? Math.min(1, this.deadTip + dt / 0.7) : 0;
      this.root.rotation.x = -this.deadTip * (Math.PI / 2);
    } else {
      this.deadTip = 0;
      this.root.rotation.x = 0;
    }

    this.crouchBlend = this.crouchBlend + ((this.flags.crouch ? 1 : 0) - this.crouchBlend) * damp(8, dt);
    const aimTarget = this.flags.aiming && !this.flags.dead && !this.flags.jumping ? 1 : 0;
    this.aimBlend = this.aimBlend + (aimTarget - this.aimBlend) * damp(12, dt);
    if (this.flags.dead) {
      this.jumpBlend = 0;
      this.firing = false;
      this.reloading = false;
    } else {
      const wantJump = !!this.flags.jumping && this.full.has('jump');
      if (wantJump && !this.wasAir) this.full.get('jump')!.reset().play();
      this.wasAir = wantJump;
      const jumpTarget = wantJump ? 1 : 0;
      this.jumpBlend = this.jumpBlend + (jumpTarget - this.jumpBlend) * damp(10, dt);
      if (this.jumpBlend < 0.001) this.jumpBlend = 0;
    }
    if (this.flags.dead && !this.wasDead) this.full.get('death')?.reset().play();
    this.wasDead = !!this.flags.dead;

    const stand = locomotionWeights(speed);
    const crouch = crouchWeights(speed);
    const loco = stanceMix(stand, crouch, this.crouchBlend);
    const deathW = this.flags.dead && this.full.has('death') ? 1 : 0;
    const jumpW = deathW > 0 ? 0 : this.jumpBlend;
    const body = Math.max(0, 1 - deathW - jumpW);
    const special = this.reloading ? 1 : this.firing ? 1 : 0;
    this.syncMovingClips();
    this.applyWeights(loco, body, jumpW, deathW === 0 ? special : 0);
    this.flinchCooldown = Math.max(0, this.flinchCooldown - dt);
    this.flinchT = Math.max(0, this.flinchT - dt);
    if (this.hipLift && this.hips) this.hips.position.y -= this.hipLift;
    this.hipLift = 0;
    this.mixer.update(dt);
    if (deathW > 0 && this.hips) {
      const action = this.full.get('death')!;
      this.hipLift = deathLiftMeters(action.time, action.getClip().duration);
      this.hips.position.y += this.hipLift;
    }
    if (this.flinchT > 0 && this.spine && deathW === 0) {
      const u = 1 - this.flinchT / 0.28;
      const amp = Math.sin(Math.min(1, Math.max(0, u)) * Math.PI) * 0.55;
      this.flinchQ.setFromAxisAngle(this.flinchAxis, amp);
      this.spine.quaternion.multiply(this.flinchQ);
      // Slight additive on Spine1 if present (upper-chest kick).
      if (this.spine1) {
        this.flinchQ.setFromAxisAngle(this.flinchAxis, amp * 0.35);
        this.spine1.quaternion.multiply(this.flinchQ);
      }
    }
    // Foot IK after animation + death lift so plants sit on the final pose.
    if (
      this.groundProbe &&
      this.hips &&
      this.leftLeg &&
      this.rightLeg &&
      deathW === 0 &&
      !this.flags.jumping
    ) {
      // Mixer just wrote hips; applyFootIk adds a smoothed pelvis offset on top.
      applyFootIk({
        hips: this.hips,
        left: this.leftLeg,
        right: this.rightLeg,
        probe: this.groundProbe,
        grounded,
        pelvisState: this.pelvisIk,
        dt,
        yaw: this.yaw,
      });
    } else if (this.hips) {
      this.pelvisIk.y += (0 - this.pelvisIk.y) * Math.min(1, dt * 8);
      this.hips.position.y += this.pelvisIk.y;
    }
    this.setLod(lodIndexForDistance(viewDistance));
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
  }

  private makeAction(clip: THREE.AnimationClip, loop: boolean): THREE.AnimationAction {
    const action = this.mixer.clipAction(clip);
    if (!loop) action.setLoop(THREE.LoopOnce, 1);
    action.enabled = false;
    action.setEffectiveWeight(0);
    return action;
  }

  /** Keeps walk, run and crouch-walk on the same step so the blend does not skate. */
  private syncMovingClips(): void {
    let leader: THREE.AnimationAction | null = null;
    let best = 0;
    for (const name of MOVING) {
      const action = this.lower.get(name);
      if (!action) continue;
      const w = action.getEffectiveWeight();
      if (w > best) {
        best = w;
        leader = action;
      }
    }
    if (!leader || best < 0.05) return;
    const dur = leader.getClip().duration || 1;
    const u = (leader.time % dur) / dur;
    for (const name of MOVING) {
      for (const map of [this.lower, this.upperLoco]) {
        const action = map.get(name);
        if (!action || action === leader) continue;
        action.time = u * (action.getClip().duration || 1);
      }
    }
    for (const [name, lower] of this.lower) {
      const upper = this.upperLoco.get(name);
      if (upper) upper.time = lower.time;
    }
  }

  private applyWeights(loco: StanceWeights, body: number, jumpW: number, special: number): void {
    const aimW = special > 0 ? 0 : this.aimBlend * body;
    const armScale = body * (1 - Math.max(special, this.aimBlend));
    for (const name of LOCO_NAMES) {
      setWeight(this.lower.get(name), loco[name] * body);
      setWeight(this.upperLoco.get(name), loco[name] * armScale);
    }
    setWeight(this.upperSpecial.get('aim_idle'), aimW);
    setWeight(this.upperSpecial.get('fire'), special > 0 && this.firing ? body : 0);
    setWeight(this.upperSpecial.get('reload'), special > 0 && this.reloading ? body : 0);
    setWeight(this.full.get('jump'), jumpW);
    setWeight(this.full.get('death'), this.flags.dead && this.full.has('death') ? 1 : 0);
  }

  private setLod(index: 0 | 1 | 2 | 3): void {
    this.lod = this.lodNodes.length ? Math.min(index, this.lodNodes.length - 1) : 0;
    this.lodNodes.forEach((node, i) => {
      const on = i === this.lod;
      node.visible = on;
      node.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.castShadow = on && this.shadow && this.lod === 0;
      });
    });
  }
}

function setWeight(action: THREE.AnimationAction | undefined, weight: number): void {
  if (!action) return;
  const on = weight > 0.001;
  action.enabled = on;
  action.setEffectiveWeight(on ? weight : 0);
  if (!on) return;
  const clip = action.getClip();
  const finished = action.loop === THREE.LoopOnce && action.time >= clip.duration - 1e-4;
  if (!finished && !action.isRunning()) action.play();
}
