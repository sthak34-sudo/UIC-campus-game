/**
 * Realistic player body, when the files are on disk.
 *
 *   client/public/models/characters/player_base.glb   CC0 MakeHuman body on a mixamorig skeleton (may be committed)
 *   client/public/models/private/anims.glb            Mixamo clips (NEVER commit; folder is gitignored)
 *
 * Expected clip names: idle, walk, run, crouch_idle, crouch_walk, aim_idle, fire, hit, death.
 * If a clip's skeleton does not match the body, it is retargeted with SkeletonUtils.retargetClip.
 *
 * Milestone 3 will split the mixer at the bone `mixamorig:Spine`: legs keep locomotion while the
 * upper body plays aim and fire. This loader plays one full-body clip at a time.
 *
 * If either file is missing or is not a glTF binary, this returns null and the player keeps
 * the procedural character in character.ts.
 */
import * as THREE from 'three';
import { turnToward } from './math';

export const PLAYER_BODY_URL = 'models/characters/player_base.glb';
export const PLAYER_ANIMS_URL = 'models/private/anims.glb';

export const CLIP_NAMES = [
  'idle', 'walk', 'run', 'crouch_idle', 'crouch_walk', 'aim_idle', 'fire', 'hit', 'death',
] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

export interface AnimFlags {
  crouch?: boolean;
  aiming?: boolean;
  firing?: boolean;
  hit?: boolean;
  dead?: boolean;
}

/** Which full-body clip to play. The Spine split in Milestone 3 will replace the firing/aim cases. */
export function selectClipName(speed: number, flags: AnimFlags = {}): ClipName {
  if (flags.dead) return 'death';
  if (flags.hit) return 'hit';
  if (flags.firing) return 'fire';
  if (flags.crouch) return speed > 0.2 ? 'crouch_walk' : 'crouch_idle';
  if (flags.aiming && speed <= 0.2) return 'aim_idle';
  if (speed > 3.2) return 'run';
  if (speed > 0.2) return 'walk';
  return 'idle';
}

const ONE_SHOT = new Set<ClipName>(['fire', 'hit', 'death']);

function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${path}`.replace(/([^:]\/)\/+/g, '$1');
}

function isGlb(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const m = new Uint8Array(buf, 0, 4);
  return m[0] === 0x67 && m[1] === 0x6c && m[2] === 0x54 && m[3] === 0x46;
}

function findSkinned(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    const s = o as THREE.SkinnedMesh;
    if (!found && s.isSkinnedMesh) found = s;
  });
  return found;
}

function clipBoneName(trackName: string): string {
  return trackName.split('.')[0] ?? trackName;
}

function tracksMatch(clip: THREE.AnimationClip, skeleton: THREE.Skeleton): boolean {
  const names = new Set(skeleton.bones.map((b) => b.name));
  let tracks = 0;
  let hits = 0;
  for (const t of clip.tracks) {
    tracks++;
    if (names.has(clipBoneName(t.name))) hits++;
  }
  return tracks > 0 && hits / tracks >= 0.5;
}

function normalizeClipName(name: string): string {
  return name.toLowerCase().replace(/^.*\|/, '').replace(/\s+/g, '_');
}

function findClip(clips: THREE.AnimationClip[], name: ClipName): THREE.AnimationClip | undefined {
  const exact = clips.find((c) => normalizeClipName(c.name) === name);
  if (exact) return exact;
  return clips.find((c) => normalizeClipName(c.name).includes(name));
}

export class AnimatedCharacter {
  readonly root: THREE.Group;
  yaw = 0;
  private flags: AnimFlags = {};
  private current: ClipName | null = null;
  private readonly actions = new Map<ClipName, THREE.AnimationAction>();

  constructor(
    model: THREE.Object3D,
    private readonly mixer: THREE.AnimationMixer,
    actions: Map<ClipName, THREE.AnimationAction>,
  ) {
    this.root = new THREE.Group();
    this.root.name = 'player-character';
    this.root.add(model);
    for (const [name, action] of actions) this.actions.set(name, action);
  }

  /** Crouch, aim, hit, and death. Locomotion still comes from speed in `update`. */
  setFlags(flags: AnimFlags): void {
    this.flags = flags;
  }

  update(dt: number, speed: number, grounded: boolean, moveYaw: number | null): void {
    if (moveYaw !== null && speed > 0.15 && !this.flags.dead) {
      this.yaw = turnToward(this.yaw, moveYaw, 10 * dt);
    }
    this.root.rotation.y = this.yaw;
    const name = selectClipName(grounded ? speed : 0, this.flags);
    this.play(name);
    this.mixer.update(dt);
  }

  private play(name: ClipName): void {
    const next = this.actions.get(name);
    if (!next) return;
    if (this.current === name) {
      if (ONE_SHOT.has(name) && this.flags.firing) next.reset().play();
      return;
    }
    next.reset().fadeIn(0.12).play();
    const prev = this.current ? this.actions.get(this.current) : undefined;
    prev?.fadeOut(0.12);
    this.current = name;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat.dispose();
      }
    });
  }
}

/**
 * Loads the body and the animation file. Returns null when either is absent,
 * which is the normal case for a fresh checkout of the public repository.
 */
export async function tryLoadAnimatedCharacter(): Promise<AnimatedCharacter | null> {
  let bodyBuf: ArrayBuffer;
  let animBuf: ArrayBuffer;
  try {
    const [bodyRes, animRes] = await Promise.all([
      fetch(publicUrl(PLAYER_BODY_URL)),
      fetch(publicUrl(PLAYER_ANIMS_URL)),
    ]);
    if (!bodyRes.ok || !animRes.ok) {
      console.info('Character files not found. Using the procedural character.');
      return null;
    }
    bodyBuf = await bodyRes.arrayBuffer();
    animBuf = await animRes.arrayBuffer();
  } catch (err) {
    console.info('Character files could not be loaded. Using the procedural character.', err);
    return null;
  }
  if (!isGlb(bodyBuf) || !isGlb(animBuf)) {
    console.info('Character files were not glTF binaries. Using the procedural character.');
    return null;
  }

  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { retargetClip } = await import('three/addons/utils/SkeletonUtils.js');
    const loader = new GLTFLoader();
    const bodyGltf = await loader.parseAsync(bodyBuf, '');
    const animGltf = await loader.parseAsync(animBuf, '');
    const model = bodyGltf.scene;
    const skinned = findSkinned(model);

    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y;
    const scale = height > 0.05 ? 1.75 / height : 1;
    model.scale.multiplyScalar(scale);
    model.position.y -= box.min.y * scale;
    model.position.x -= ((box.min.x + box.max.x) / 2) * scale;
    model.position.z -= ((box.min.z + box.max.z) / 2) * scale;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });

    const clips = animGltf.animations.map((clip) => {
      if (!skinned || tracksMatch(clip, skinned.skeleton)) return clip;
      const source = findSkinned(animGltf.scene);
      if (!source) return clip;
      try {
        // Mixamo clips on a different rest pose need retargeting onto the body skeleton.
        return retargetClip(skinned, source, clip);
      } catch (err) {
        console.warn(`Could not retarget clip "${clip.name}".`, err);
        return clip;
      }
    });

    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map<ClipName, THREE.AnimationAction>();
    for (const name of CLIP_NAMES) {
      const clip = findClip(clips, name);
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      if (ONE_SHOT.has(name)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions.set(name, action);
    }
    return new AnimatedCharacter(model, mixer, actions);
  } catch (err) {
    console.warn('Character glTF failed to parse. Using the procedural character.', err);
    return null;
  }
}
