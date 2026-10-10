/**
 * HDR post-processing pipeline (custom, lighter than EffectComposer):
 *   scene → HDR target (half float + depth texture)
 *   → GTAO (reads the scene's depth texture; no second geometry pass)
 *   → bloom (UnrealBloomPass, threshold tied to exposure, added into the HDR target)
 *   → composite: AO, exposure, ACES filmic tone mapping, sRGB, color grade, vignette, dither
 *   → SMAA → screen
 * OWNER: Graphics Engineer.
 */
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { QualitySettings } from './quality';

export interface GradeParams {
  exposure: number;
  /** 0..1 how strongly the AO darkens the image. */
  aoAmount: number;
  saturation: number;
  contrast: number;
  vignette: number;
  /** Warm/cool split toning strength. */
  splitTone: number;
  /** Bloom strength. */
  bloom: number;
}

export const DEFAULT_GRADE: GradeParams = { exposure: 1.6, aoAmount: 0.85, saturation: 1.04, contrast: 0.12, vignette: 0.22, splitTone: 1, bloom: 0.14 };

const compositeShader = {
  uniforms: {
    tScene: { value: null as THREE.Texture | null },
    tAO: { value: null as THREE.Texture | null },
    aoAmount: { value: 0.85 },
    exposure: { value: 1.6 },
    saturation: { value: 1.0 },
    contrast: { value: 0.1 },
    vignette: { value: 0.2 },
    splitTone: { value: 1.0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    frame: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tScene;
    uniform sampler2D tAO;
    uniform float aoAmount, exposure, saturation, contrast, vignette, splitTone, frame;
    uniform vec2 resolution;
    varying vec2 vUv;

    // ACES filmic (same fit three.js uses)
    vec3 RRTAndODTFit( vec3 v ) {
      vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
      vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
      return a / b;
    }
    vec3 aces( vec3 color ) {
      const mat3 ACESInputMat = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
      const mat3 ACESOutputMat = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
      color /= 0.6;
      color = ACESInputMat * color;
      color = RRTAndODTFit( color );
      color = ACESOutputMat * color;
      return clamp( color, 0.0, 1.0 );
    }
    vec3 toSRGB( vec3 c ) {
      return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
    }
    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }

    void main() {
      vec3 c = texture2D( tScene, vUv ).rgb;
      float ao = texture2D( tAO, vUv ).r;
      c *= mix( 1.0, ao, aoAmount );
      c *= vec3( 1.02, 1.0, 0.965 ); // daylight white balance (slightly warm, like a camera's 'daylight' preset)
      c = aces( c * exposure );
      c = toSRGB( c );
      float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
      // gentle S-curve around mid gray
      c = mix( c, c * c * ( 3.0 - 2.0 * c ), contrast );
      c = mix( vec3( l ), c, saturation );
      // split toning: cool shadows, warm highlights (like a daylight photo)
      c += splitTone * ( vec3( 0.012, 0.004, -0.012 ) * smoothstep( 0.45, 1.0, l ) + vec3( -0.008, 0.0, 0.012 ) * ( 1.0 - smoothstep( 0.0, 0.4, l ) ) );
      // vignette
      vec2 q = vUv - 0.5;
      q.x *= resolution.x / resolution.y;
      c *= 1.0 - vignette * pow( clamp( length( q ) * 1.15, 0.0, 1.0 ), 2.6 );
      // dither (hides banding in the sky)
      c += ( hash( vUv * resolution + frame * 0.618 ) - 0.5 ) / 255.0;
      gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 );
    }
  `,
};

const METER_W = 32;
const METER_H = 18;
const meterShader = {
  vertexShader: compositeShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tScene;
    varying vec2 vUv;
    void main() {
      float acc = 0.0;
      for ( int i = 0; i < 4; i ++ ) for ( int j = 0; j < 4; j ++ ) {
        vec2 o = ( vec2( float( i ), float( j ) ) - 1.5 ) / vec2( ${METER_W * 4}.0, ${METER_H * 4}.0 );
        vec3 c = texture2D( tScene, vUv + o ).rgb;
        acc += log( clamp( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4, 64.0 ) );
      }
      gl_FragColor = vec4( acc / 16.0, 0.0, 0.0, 1.0 );
    }
  `,
};

export class PostPipeline {
  readonly sceneRT: THREE.WebGLRenderTarget;
  private ldrRT: THREE.WebGLRenderTarget | null = null;
  private gtao: GTAOPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  private smaa: SMAAPass | null = null;
  private composite: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  private white: THREE.DataTexture;
  private frame = 0;
  /** Set true to measure scene brightness on the next render (interior auto-exposure). */
  meterNext = false;
  /** Log-average scene luminance (before exposure) from the last metering, or null. */
  measuredLum: number | null = null;
  private meterRT: THREE.WebGLRenderTarget;
  private meterQuad: FullScreenQuad;
  private meterBuf = new Float32Array(METER_W * METER_H * 4);

  /** Returns the latest metering result once (null if none since the last call). */
  takeMeasurement(): number | null {
    const v = this.measuredLum;
    this.measuredLum = null;
    return v;
  }

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    camera: THREE.Camera,
    private q: QualitySettings,
  ) {
    const depth = new THREE.DepthTexture(1, 1, THREE.FloatType);
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: depth, depthBuffer: true });
    this.sceneRT.texture.name = 'gfx.scene';
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.white.needsUpdate = true;
    if (q.ao > 0) {
      const g = new GTAOPass(scene, camera, 1, 1);
      // Use the main pass's depth instead of re-rendering the scene for normals/depth.
      g.setGBuffer(depth);
      const internal = g as unknown as { normalRenderTarget?: THREE.WebGLRenderTarget };
      internal.normalRenderTarget?.dispose();
      const dummy = new THREE.WebGLRenderTarget(1, 1);
      dummy.setSize = () => {}; // never allocate the unused full-size normal buffer
      internal.normalRenderTarget = dummy;
      g.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 2.5, scale: 1.0, samples: q.ao >= 1 ? 16 : 12, distanceFallOff: 1 });
      g.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: q.ao >= 1 ? 12 : 8 });
      g.output = GTAOPass.OUTPUT.Off;
      this.gtao = g;
    }
    if (q.bloom) this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.14, 0.55, 1.0);
    if (q.smaa) {
      this.smaa = new SMAAPass();
      this.smaa.renderToScreen = true;
      this.ldrRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
    }
    this.composite = new THREE.ShaderMaterial({ ...compositeShader, uniforms: THREE.UniformsUtils.clone(compositeShader.uniforms), depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.composite);
    this.meterRT = new THREE.WebGLRenderTarget(METER_W, METER_H, { type: THREE.FloatType, depthBuffer: false });
    this.meterQuad = new FullScreenQuad(new THREE.ShaderMaterial({ ...meterShader, uniforms: { tScene: { value: null } }, depthTest: false, depthWrite: false }));
  }

  /** Geometric-mean luminance of the HDR scene, center-weighted (16 taps per cell, 32x18 cells). */
  private meter(): void {
    const r = this.renderer;
    (this.meterQuad as unknown as { material: THREE.ShaderMaterial }).material.uniforms.tScene.value = this.sceneRT.texture;
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
        const v = this.meterBuf[(y * METER_W + x) * 4];
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

  setSize(w: number, h: number): void {
    this.sceneRT.setSize(w, h);
    this.gtao?.setSize(Math.max(1, Math.round(w * this.q.ao)), Math.max(1, Math.round(h * this.q.ao)));
    this.bloom?.setSize(w, h);
    this.smaa?.setSize(w, h);
    this.ldrRT?.setSize(w, h);
    this.composite.uniforms.resolution.value.set(w, h);
  }

  render(camera: THREE.Camera, grade: GradeParams): void {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(this.scene, camera);
    if (this.meterNext) {
      this.meterNext = false;
      this.meter();
    }
    let ao: THREE.Texture = this.white;
    if (this.gtao && grade.aoAmount > 0) {
      this.gtao.camera = camera;
      this.gtao.render(r, this.sceneRT, this.sceneRT, 0, false);
      ao = this.gtao.gtaoMap;
    }
    if (this.bloom) {
      // only genuinely bright things (sun, specular glints, light panels) bloom; screens and white walls don't
      this.bloom.threshold = 2.2 / Math.max(grade.exposure, 1e-3);
      this.bloom.strength = grade.bloom;
      this.bloom.render(r, this.sceneRT, this.sceneRT, 0, false);
    }
    const u = this.composite.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.tAO.value = ao;
    u.aoAmount.value = grade.aoAmount;
    u.exposure.value = grade.exposure;
    u.saturation.value = grade.saturation;
    u.contrast.value = grade.contrast;
    u.vignette.value = grade.vignette;
    u.splitTone.value = grade.splitTone;
    u.frame.value = this.frame++ % 64;
    if (this.smaa && this.ldrRT) {
      r.setRenderTarget(this.ldrRT);
      this.quad.render(r);
      this.smaa.render(r, null as unknown as THREE.WebGLRenderTarget, this.ldrRT, 0, false);
    } else {
      r.setRenderTarget(null);
      this.quad.render(r);
    }
  }
}
