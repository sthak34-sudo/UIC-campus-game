/**
 * Loads the generated surface textures (client/public/textures, made by tools/textures/generate.py).
 * Each image is fetched once; every material gets its own THREE.Texture (own repeat) that shares the
 * image source, so the GPU stores each image once. Tracks loading so screenshots can wait.
 * OWNER: Graphics Engineer.
 */
import * as THREE from 'three';

const hasDOM = typeof document !== 'undefined';
const sources = new Map<string, { source: THREE.TextureSource<unknown>; users: THREE.Texture[]; loaded: boolean }>();
let pending = 0;
let failed = 0;
let anisotropy = 8;
const waiters: (() => void)[] = [];

export function setTextureAnisotropy(a: number): void {
  anisotropy = a;
  for (const s of sources.values()) for (const t of s.users) t.anisotropy = a;
}

/** Number of texture images still downloading. */
export function pendingTextures(): number {
  return pending;
}

export function failedTextures(): number {
  return failed;
}

/** Resolves when every texture requested so far has finished loading (or failed). */
export function whenTexturesLoaded(): Promise<void> {
  if (pending === 0) return Promise.resolve();
  return new Promise((r) => waiters.push(r));
}

function base(): string {
  try {
    return import.meta.env?.BASE_URL ?? '/';
  } catch {
    return '/';
  }
}

export interface TexOptions {
  srgb?: boolean;
  /** Meters covered by one copy of the texture (UVs are in meters). */
  tile?: [number, number];
}

/** Returns a texture for `textures/<path>`; the image arrives asynchronously. */
export function loadTexture(path: string, opt: TexOptions = {}): THREE.Texture {
  let entry = sources.get(path);
  if (!entry) {
    entry = { source: new THREE.TextureSource(null), users: [], loaded: false };
    sources.set(path, entry);
    if (hasDOM) {
      pending++;
      const e = entry;
      new THREE.ImageLoader().load(
        `${base()}textures/${path}`,
        (img) => {
          e.source.data = img;
          e.loaded = true;
          for (const t of e.users) t.needsUpdate = true;
          done();
        },
        undefined,
        () => {
          failed++;
          console.error(`texture failed to load: textures/${path}`);
          done();
        },
      );
    }
  }
  const tex = new THREE.Texture();
  tex.source = entry.source;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = opt.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  if (opt.tile) tex.repeat.set(1 / opt.tile[0], 1 / opt.tile[1]);
  if (entry.loaded) tex.needsUpdate = true;
  entry.users.push(tex);
  return tex;
}

function done(): void {
  pending--;
  if (pending === 0) for (const w of waiters.splice(0)) w();
}
