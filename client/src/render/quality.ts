/**
 * Graphics quality presets. Chosen with `?quality=low|medium|high` (default below).
 * OWNER: Graphics Engineer.
 *
 * Rough cost on a 2020 integrated GPU (Intel Iris Xe / UHD 620 class) at 1080p:
 *   low     no post, MSAA, 2×512 cascaded shadows          -> ~60 fps class
 *   medium  half-res N8AO, bloom, SMAA, 3×2048 cascades    -> ~40-60 fps class
 *   high    full-res N8AO, bloom, SMAA, 3×2048 cascades    -> ~30-45 fps class
 */
export type Quality = 'low' | 'medium' | 'high';

export interface QualitySettings {
  name: Quality;
  /** Cap on devicePixelRatio. */
  maxPixelRatio: number;
  /** Shadow map resolution of each cascade. */
  shadowMapSize: number;
  /** How many cascaded shadow maps the sun uses. */
  cascades: number;
  /** How far from the camera (m) the cascades cover at street level. */
  shadowFar: number;
  /** PCF softening radius in texels. */
  shadowRadius: number;
  /** Use the HDR post pipeline (N8AO, bloom, AgX, SMAA). Off = direct render with MSAA. */
  post: boolean;
  /** Ambient occlusion resolution: 0 = off, 0.5 = half, 1 = full. */
  ao: number;
  bloom: boolean;
  smaa: boolean;
  anisotropy: number;
  /** PMREM environment cube size (procedural sky mode). */
  envSize: number;
}

export const QUALITY_PRESETS: Record<Quality, QualitySettings> = {
  low: {
    name: 'low', maxPixelRatio: 1, shadowMapSize: 512, cascades: 2, shadowFar: 140, shadowRadius: 1,
    post: false, ao: 0, bloom: false, smaa: false, anisotropy: 4, envSize: 128,
  },
  medium: {
    name: 'medium', maxPixelRatio: 1, shadowMapSize: 2048, cascades: 3, shadowFar: 240, shadowRadius: 2,
    post: true, ao: 0.5, bloom: true, smaa: true, anisotropy: 8, envSize: 256,
  },
  high: {
    name: 'high', maxPixelRatio: 1.5, shadowMapSize: 2048, cascades: 3, shadowFar: 320, shadowRadius: 2.5,
    post: true, ao: 1, bloom: true, smaa: true, anisotropy: 16, envSize: 256,
  },
};

export const DEFAULT_QUALITY: Quality = 'high';

export function parseQuality(search: string): QualitySettings {
  const q = new URLSearchParams(search).get('quality');
  const name: Quality = q === 'low' || q === 'medium' || q === 'high' ? q : DEFAULT_QUALITY;
  return QUALITY_PRESETS[name];
}
