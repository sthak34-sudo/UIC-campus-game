/**
 * Photographed skies (CC0, Poly Haven) used as image-based light.
 * OWNER: Graphics Engineer.
 *
 * Default is an overcast noon (`kloofendal`). `?sky=bridges` is a late-afternoon
 * alternative. `?sky=procedural` keeps the analytic Preetham sky and a moving sun.
 * The directional light points at the photographed sun so shadows match the picture.
 */
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export interface HdriPreset {
  id: 'kloofendal' | 'bridges';
  /** File under client/public/hdri/. */
  file: string;
  name: string;
  author: string;
  url: string;
  /** Unit-ish vector pointing toward the sun: x east, y up, z south. */
  sunDir: readonly [number, number, number];
  sunColor: readonly [number, number, number];
  sunIntensity: number;
  /** AgX exposure for this photograph. */
  exposure: number;
  envIntensity: number;
}

export const HDRI_PRESETS = {
  kloofendal: {
    id: 'kloofendal',
    file: 'kloofendal_overcast_puresky_2k.hdr',
    name: 'Kloofendal Overcast (Pure Sky)',
    author: 'Greg Zaal',
    url: 'https://polyhaven.com/a/kloofendal_overcast_puresky',
    sunDir: [0.80, 0.39, 0.45],
    sunColor: [1.0, 0.98, 0.95],
    sunIntensity: 2.15,
    exposure: 1.05,
    envIntensity: 0.85,
  },
  bridges: {
    id: 'bridges',
    file: 'between_bridges_2k.hdr',
    name: 'Between Bridges',
    author: 'Greg Zaal',
    url: 'https://polyhaven.com/a/between_bridges',
    sunDir: [0.73, 0.24, 0.63],
    sunColor: [1.0, 0.74, 0.48],
    sunIntensity: 3.1,
    exposure: 0.92,
    envIntensity: 0.9,
  },
} as const satisfies Record<string, HdriPreset>;

export type HdriId = keyof typeof HDRI_PRESETS;
export type SkyMode = HdriId | 'procedural';

export function parseSky(search: string): SkyMode {
  const s = new URLSearchParams(search).get('sky');
  if (s === 'bridges' || s === 'between_bridges' || s === 'between-bridges') return 'bridges';
  if (s === 'procedural' || s === 'analytic') return 'procedural';
  return 'kloofendal';
}

export function presetSunDirection(preset: HdriPreset): THREE.Vector3 {
  return new THREE.Vector3(preset.sunDir[0], preset.sunDir[1], preset.sunDir[2]).normalize();
}

function base(): string {
  try {
    return import.meta.env?.BASE_URL ?? '/';
  } catch {
    return '/';
  }
}

/** Inverse of three's equirectUv. v is the texture v before any flip. */
function directionFromEquirectUv(u: number, v: number): THREE.Vector3 {
  const phi = (u - 0.5) * Math.PI * 2;
  const theta = (v - 0.5) * Math.PI;
  const c = Math.cos(theta);
  return new THREE.Vector3(Math.cos(phi) * c, Math.sin(theta), Math.sin(phi) * c);
}

function texelLuma(data: ArrayLike<number>, index: number, half: boolean): number {
  const r = half ? THREE.DataUtils.fromHalfFloat(data[index]!) : data[index]!;
  const g = half ? THREE.DataUtils.fromHalfFloat(data[index + 1]!) : data[index + 1]!;
  const b = half ? THREE.DataUtils.fromHalfFloat(data[index + 2]!) : data[index + 2]!;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Brightest pixel in the photograph, as a direction. The published sun vector is
 * the fallback when the disc is too soft to find (overcast) or the mapping is off.
 */
export function detectSunDirection(texture: THREE.DataTexture, fallback: THREE.Vector3): { sun: THREE.Vector3; horizon: THREE.Color } {
  const image = texture.image as { data?: ArrayLike<number>; width: number; height: number };
  const data = image.data;
  const fallbackN = fallback.clone().normalize();
  if (!data) return { sun: fallbackN, horizon: new THREE.Color(0.62, 0.68, 0.74) };
  const { width, height } = image;
  const half = texture.type === THREE.HalfFloatType;
  let best = -1;
  let bu = 0.5;
  let bv = 0.5;
  const step = Math.max(2, Math.floor(width / 256));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const l = texelLuma(data, (y * width + x) * 4, half);
      if (l > best) {
        best = l;
        bu = (x + 0.5) / width;
        bv = (y + 0.5) / height;
      }
    }
  }
  const a = directionFromEquirectUv(bu, bv).normalize();
  const b = directionFromEquirectUv(bu, 1 - bv).normalize();
  const chosen = a.dot(fallbackN) >= b.dot(fallbackN) ? a : b;
  const sun = chosen.y > 0.05 && chosen.dot(fallbackN) > 0.45 ? chosen : fallbackN;

  // Horizon band: directions whose world y is near 0, averaged for fog.
  let hr = 0, hg = 0, hb = 0, hn = 0;
  const y0 = Math.floor(height * 0.45);
  const y1 = Math.floor(height * 0.55);
  const stride = Math.max(4, Math.floor(width / 128));
  for (let y = y0; y < y1; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      hr += half ? THREE.DataUtils.fromHalfFloat(data[i]!) : data[i]!;
      hg += half ? THREE.DataUtils.fromHalfFloat(data[i + 1]!) : data[i + 1]!;
      hb += half ? THREE.DataUtils.fromHalfFloat(data[i + 2]!) : data[i + 2]!;
      hn++;
    }
  }
  const horizon = hn > 0
    ? new THREE.Color(hr / hn, hg / hn, hb / hn)
    : new THREE.Color(0.62, 0.68, 0.74);
  // The band is HDR; fog wants a display-ish color, so compress it.
  const peak = Math.max(horizon.r, horizon.g, horizon.b, 1e-4);
  horizon.multiplyScalar(Math.min(1.2, 0.85 / peak));
  return { sun, horizon };
}

export interface LoadedHdri {
  environment: THREE.Texture;
  background: THREE.Texture;
  sunDir: THREE.Vector3;
  horizon: THREE.Color;
}

export function loadHdriEnvironment(renderer: THREE.WebGLRenderer, preset: HdriPreset): Promise<LoadedHdri> {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const loader = new HDRLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      `${base()}hdri/${preset.file}`,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        const environment = pmrem.fromEquirectangular(texture).texture;
        pmrem.dispose();
        const detected = detectSunDirection(texture, presetSunDirection(preset));
        resolve({ environment, background: texture, sunDir: detected.sun, horizon: detected.horizon });
      },
      undefined,
      (err) => {
        pmrem.dispose();
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
