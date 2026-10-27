/**
 * Loads the generated surface textures (client/public/textures, made by tools/textures/generate.py).
 * Each image is fetched once; every material gets its own THREE.Texture (own repeat) that shares the
 * image source, so the GPU stores each image once. Tracks loading so screenshots can wait.
 * OWNER: Graphics Engineer.
 */
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const hasDOM = typeof document !== 'undefined';
const sources = new Map<string, { source: THREE.TextureSource<unknown>; users: THREE.Texture[]; loaded: boolean }>();
let pending = 0;
let failed = 0;
let anisotropy = 8;
const waiters: (() => void)[] = [];
let ktx2Loader: KTX2Loader | null = null;

interface KtxSource {
  users: THREE.CompressedTexture[];
  loaded: THREE.CompressedTexture | null;
  srgb: boolean;
}

const ktxSources = new Map<string, KtxSource>();
const ktxWaiting: string[] = [];

/** The loader the renderer already prepared. Character glTF files reuse it for their KTX2 textures. */
export function sharedKtx2Loader(): KTX2Loader | null {
  return ktx2Loader;
}

/**
 * KTX2 must know the GPU before the first file is parsed. Call this from the renderer
 * before materials ask for textures. Software GL (SwiftShader) advertises compressed
 * formats it cannot sample, so those machines transcode to plain RGBA.
 */
export function initTextureLoader(renderer: THREE.WebGLRenderer): void {
  const loader = new KTX2Loader();
  loader.setTranscoderPath(`${base()}basis/`);
  loader.detectSupport(renderer);
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  if (/swiftshader|llvmpipe|softpipe/i.test(name)) {
    const cfg = loader as unknown as { workerConfig: Record<string, boolean> };
    cfg.workerConfig = {
      astcSupported: false,
      astcHDRSupported: false,
      etc1Supported: false,
      etc2Supported: false,
      dxtSupported: false,
      bptcSupported: false,
      pvrtcSupported: false,
    };
  }
  ktx2Loader = loader;
  for (const path of ktxWaiting.splice(0)) startKtx(path);
}

export function setTextureAnisotropy(a: number): void {
  anisotropy = a;
  for (const s of sources.values()) for (const t of s.users) t.anisotropy = a;
  for (const s of ktxSources.values()) for (const t of s.users) t.anisotropy = a;
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
  if (path.endsWith('.ktx2')) return loadKtx(path, opt);
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

function blankCompressed(opt: TexOptions): THREE.CompressedTexture {
  const tex = new THREE.CompressedTexture([], 1, 1);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  tex.colorSpace = opt.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (opt.tile) tex.repeat.set(1 / opt.tile[0], 1 / opt.tile[1]);
  return tex;
}

function applyLoaded(dst: THREE.CompressedTexture, src: THREE.CompressedTexture, srgb: boolean): void {
  dst.mipmaps = src.mipmaps;
  dst.image = src.image;
  dst.format = src.format;
  dst.type = src.type;
  dst.minFilter = src.minFilter;
  dst.magFilter = src.magFilter;
  dst.generateMipmaps = false;
  const linear = src.colorSpace === THREE.NoColorSpace || src.colorSpace === THREE.LinearSRGBColorSpace;
  dst.colorSpace = srgb ? (linear ? THREE.SRGBColorSpace : src.colorSpace) : THREE.NoColorSpace;
  dst.needsUpdate = true;
}

function startKtx(path: string): void {
  const entry = ktxSources.get(path);
  if (!entry || !ktx2Loader) return;
  ktx2Loader.load(
    `${base()}textures/${path}`,
    (loaded) => {
      entry.loaded = loaded;
      for (const user of entry.users) applyLoaded(user, loaded, entry.srgb);
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

function loadKtx(path: string, opt: TexOptions): THREE.Texture {
  if (!hasDOM) {
    const tex = new THREE.Texture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = opt.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (opt.tile) tex.repeat.set(1 / opt.tile[0], 1 / opt.tile[1]);
    return tex;
  }
  let entry = ktxSources.get(path);
  if (!entry) {
    entry = { users: [], loaded: null, srgb: !!opt.srgb };
    ktxSources.set(path, entry);
    pending++;
    if (ktx2Loader) startKtx(path);
    else ktxWaiting.push(path);
  }
  const tex = blankCompressed(opt);
  entry.users.push(tex);
  if (entry.loaded) applyLoaded(tex, entry.loaded, entry.srgb);
  return tex;
}

function done(): void {
  pending--;
  if (pending === 0) for (const w of waiters.splice(0)) w();
}
