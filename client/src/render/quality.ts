/**
 * Graphics quality presets. Chosen with `?quality=low|medium|high` (default: auto).
 * OWNER: Graphics Engineer.
 *
 * Rough cost on a 2020 integrated GPU (Intel Iris Xe / UHD 620 class) at 1080p:
 *   low     no post, MSAA, 2×512 cascaded shadows          -> ~60 fps class
 *   medium  half-res N8AO, bloom, SMAA, 2×1024 cascades to 160 m, solid tree shadows -> ~40-60 fps class
 *   high    full-res N8AO, bloom, SMAA, 3×2048 cascades    -> ~30-45 fps class
 *
 * Default is medium. Software GL / weak GPUs auto-pick low so the first playable
 * frame is not buried under ReadPixels + N8AO stalls.
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
  /**
   * Leaf-card tree foliage (alpha-tested, ~1M instanced tris) casts shadows. Off: only the solid
   * crown core and trunks cast, which keeps tree shadows but skips the expensive card depth passes.
   */
  detailCasters: boolean;
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
  /**
   * Indoor auto-exposure may read pixels back from the GPU. Off on low / software GL
   * (those readbacks cause the "GPU stall due to ReadPixels" warning and freeze frames).
   */
  allowMetering: boolean;
}

export const QUALITY_PRESETS: Record<Quality, QualitySettings> = {
  low: {
    name: 'low', maxPixelRatio: 1, shadowMapSize: 512, cascades: 2, shadowFar: 140, shadowRadius: 1, detailCasters: false,
    post: false, ao: 0, bloom: false, smaa: false, anisotropy: 4, envSize: 128, allowMetering: false,
  },
  medium: {
    name: 'medium', maxPixelRatio: 1, shadowMapSize: 1024, cascades: 2, shadowFar: 160, shadowRadius: 2, detailCasters: false,
    post: true, ao: 0.5, bloom: true, smaa: true, anisotropy: 8, envSize: 256, allowMetering: true,
  },
  high: {
    name: 'high', maxPixelRatio: 1.5, shadowMapSize: 2048, cascades: 3, shadowFar: 320, shadowRadius: 2.5, detailCasters: true,
    post: true, ao: 1, bloom: true, smaa: true, anisotropy: 16, envSize: 256, allowMetering: true,
  },
};

/** Default when the URL does not force a preset. Medium is playable on typical laptops. */
export const DEFAULT_QUALITY: Quality = 'medium';

const WEAK_RENDERER =
  /swiftshader|llvmpipe|softpipe|microsoft basic render|gdi generic|mesa offscreen/i;

/**
 * Probe WebGL once. Software renderers and tiny GPUs get `low` so first load stays usable.
 * Safe to call from Node tests: returns null when there is no document/canvas.
 */
export function detectPreferredQuality(): Quality | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ||
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (!gl) {
      // Major-performance caveat (or no WebGL): try without the flag to read the renderer string.
      const soft =
        canvas.getContext('webgl2') ||
        canvas.getContext('webgl');
      if (!soft) return 'low';
      const dbg = soft.getExtension('WEBGL_debug_renderer_info');
      const renderer = dbg
        ? String(soft.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '')
        : '';
      soft.getExtension('WEBGL_lose_context')?.loseContext();
      if (WEAK_RENDERER.test(renderer)) return 'low';
      return 'low';
    }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '')
      : '';
    const maxTex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 0);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (WEAK_RENDERER.test(renderer)) return 'low';
    if (maxTex > 0 && maxTex < 4096) return 'low';
    return null;
  } catch {
    return 'low';
  }
}

export function parseQuality(search: string): QualitySettings {
  const q = new URLSearchParams(search).get('quality');
  let name: Quality;
  if (q === 'low' || q === 'medium' || q === 'high') {
    name = q;
  } else {
    name = detectPreferredQuality() ?? DEFAULT_QUALITY;
  }
  const preset = { ...QUALITY_PRESETS[name] };
  // Even on medium/high, never meter on software GL (ReadPixels freezes the tab).
  if (name !== 'low') {
    const weak = detectPreferredQuality() === 'low';
    if (weak) preset.allowMetering = false;
  }
  return preset;
}
