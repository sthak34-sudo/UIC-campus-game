/**
 * HDR post-processing (pmndrs/postprocessing + N8AO):
 *   scene (RenderPass, half float)
 *   → N8AO ambient occlusion
 *   → light bloom
 *   → exposure
 *   → AgX tone mapping
 *   → vignette
 *   → SMAA
 *   → sRGB output (the renderer's output color space)
 * Low quality does not construct this pipeline.
 * OWNER: Graphics Engineer.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import {
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { QualitySettings } from './quality';

export interface GradeParams {
  exposure: number;
  /** 0..1 how strongly the AO darkens the image. */
  aoAmount: number;
  saturation: number;
  contrast: number;
  vignette: number;
  /** Warm/cool split toning strength. Kept so callers can still pass the old grade. */
  splitTone: number;
  /** Bloom strength. */
  bloom: number;
}

export const DEFAULT_GRADE: GradeParams = {
  exposure: 1.05,
  aoAmount: 0.85,
  saturation: 1.04,
  contrast: 0.12,
  vignette: 0.22,
  splitTone: 1,
  bloom: 0.14,
};

const EXPOSURE_FRAG = /* glsl */ `
uniform float exposure;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(inputColor.rgb * exposure, inputColor.a);
}
`;

class ExposureEffect extends Effect {
  constructor() {
    super('Exposure', EXPOSURE_FRAG, {
      uniforms: new Map([['exposure', new THREE.Uniform(1)]]),
    });
  }

  set exposure(value: number) {
    const u = this.uniforms.get('exposure');
    if (u) u.value = value;
  }
}

const METER_W = 32;
const METER_H = 18;
const meterShader = {
  uniforms: { tScene: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tScene;
    varying vec2 vUv;
    void main() {
      float acc = 0.0;
      for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) {
        vec2 o = (vec2(float(i), float(j)) - 1.5) / vec2(${METER_W * 4}.0, ${METER_H * 4}.0);
        vec3 c = texture2D(tScene, vUv + o).rgb;
        acc += log(clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4, 64.0));
      }
      gl_FragColor = vec4(acc / 16.0, 0.0, 0.0, 1.0);
    }
  `,
};

export class PostPipeline {
  private readonly composer: EffectComposer;
  private readonly n8ao: N8AOPostPass | null;
  private readonly bloom: BloomEffect | null;
  private readonly exposureFx: ExposureEffect;
  private readonly meterRT: THREE.WebGLRenderTarget;
  private readonly meterQuad: FullScreenQuad;
  private readonly meterBuf = new Float32Array(METER_W * METER_H * 4);
  /** Set true to measure scene brightness on the next render (interior auto-exposure). */
  meterNext = false;
  /** Log-average scene luminance (before exposure) from the last metering, or null. */
  measuredLum: number | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    q: QualitySettings,
  ) {
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,
    });

    // N8AOPostPass reads the previous pass. It does not draw the scene itself.
    this.composer.addPass(new RenderPass(scene, camera));

    let n8ao: N8AOPostPass | null = null;
    if (q.ao > 0) {
      n8ao = new N8AOPostPass(scene, camera, 1, 1);
      const full = q.ao >= 1;
      n8ao.autosetGamma = false;
      n8ao.configuration.gammaCorrection = false;
      n8ao.configuration.transparencyAware = false;
      n8ao.autoDetectTransparency = false;
      n8ao.configuration.halfRes = !full;
      n8ao.configuration.aoSamples = full ? 16 : 8;
      n8ao.configuration.denoiseSamples = full ? 8 : 4;
      n8ao.configuration.denoiseIterations = full ? 2 : 1;
      n8ao.configuration.aoRadius = 2.2;
      n8ao.configuration.screenSpaceRadius = false;
      n8ao.configuration.intensity = 2.4;
      n8ao.configuration.colorMultiply = true;
      this.composer.addPass(n8ao);
    }
    this.n8ao = n8ao;

    this.exposureFx = new ExposureEffect();
    const effects: Effect[] = [];
    if (q.bloom) {
      this.bloom = new BloomEffect({
        intensity: 0.35,
        luminanceThreshold: 1.15,
        luminanceSmoothing: 0.25,
        mipmapBlur: true,
        radius: 0.45,
        levels: 6,
      });
      effects.push(this.bloom);
    } else {
      this.bloom = null;
    }
    effects.push(this.exposureFx);
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
    effects.push(new VignetteEffect({ darkness: 0.5, offset: 0.35 }));
    if (q.smaa) {
      effects.push(new SMAAEffect({ preset: fullResSmaa(q) }));
    }
    this.composer.addPass(new EffectPass(camera, ...effects));

    this.meterRT = new THREE.WebGLRenderTarget(METER_W, METER_H, { type: THREE.FloatType, depthBuffer: false });
    this.meterQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      ...meterShader,
      uniforms: THREE.UniformsUtils.clone(meterShader.uniforms),
      depthTest: false,
      depthWrite: false,
    }));
  }

  /** Returns the latest metering result once (null if none since the last call). */
  takeMeasurement(): number | null {
    const v = this.measuredLum;
    this.measuredLum = null;
    return v;
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  render(camera: THREE.Camera, grade: GradeParams): void {
    if (this.n8ao) {
      this.n8ao.camera = camera;
      this.n8ao.configuration.intensity = 1.5 + grade.aoAmount * 1.4;
    }
    if (this.bloom) {
      this.bloom.luminanceMaterial.threshold = 1.35 / Math.max(grade.exposure, 0.25);
      this.bloom.intensity = grade.bloom * 2.4;
    }
    this.exposureFx.exposure = grade.exposure;
    this.composer.render();
    if (this.meterNext) {
      this.meterNext = false;
      this.meter();
    }
  }

  /** Geometric-mean luminance of the HDR beauty image, center-weighted. */
  private meter(): void {
    // After the effect pass swaps, outputBuffer still holds the HDR image (before AgX).
    const src = this.composer.outputBuffer?.texture;
    if (!src) return;
    const r = this.renderer;
    const mat = this.meterQuad.material as THREE.ShaderMaterial;
    mat.uniforms.tScene!.value = src;
    r.setRenderTarget(this.meterRT);
    this.meterQuad.render(r);
    try {
      r.readRenderTargetPixels(this.meterRT, 0, 0, METER_W, METER_H, this.meterBuf);
    } catch {
      this.measuredLum = null;
      return;
    }
    let sum = 0;
    let wsum = 0;
    for (let y = 0; y < METER_H; y++) {
      for (let x = 0; x < METER_W; x++) {
        const v = this.meterBuf[(y * METER_W + x) * 4]!;
        if (!Number.isFinite(v)) continue;
        const dx = (x + 0.5) / METER_W - 0.5;
        const dy = (y + 0.5) / METER_H - 0.5;
        const w = 1.0 - Math.min(0.7, Math.hypot(dx, dy) * 1.2);
        sum += v * w;
        wsum += w;
      }
    }
    this.measuredLum = wsum > 0 ? Math.exp(sum / wsum) : null;
  }
}

function fullResSmaa(q: QualitySettings): SMAAPreset {
  return q.ao >= 1 ? SMAAPreset.HIGH : SMAAPreset.MEDIUM;
}
