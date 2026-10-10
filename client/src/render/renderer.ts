import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { World } from '../core/world';
import { campusSunAngles, sunDirectionWorld } from './solar';
import { computeLighting, ENV_SKY_SATURATION, INTERIOR_EXPOSURE_BOOST, NIGHT_FLOOR, SKY_SATURATION, SKY_SCALE, type Lighting, type RGB } from './atmosphere';
import { installHeightFog, fogExtra } from './fog';
import { parseQuality, type QualitySettings } from './quality';
import { PostPipeline, DEFAULT_GRADE, type GradeParams } from './post';
import { setTextureAnisotropy, pendingTextures } from './textures';
import { setInteriorLighting, updateMaterials } from './materials';
import { ShadowFollower } from './shadows';
import { buildGfxTestScene } from './gfxTestScene';

/**
 * Renderer, sky, sun, shadows, post-processing. OWNER: Graphics Engineer.
 *
 * - Physical sky (Preetham, three's Sky addon) with the real sun position for Chicago, mid-October.
 * - Sun: one DirectionalLight with soft PCF shadows; the shadow box follows the camera (sharp near
 *   the player, ~200 m wide; grows automatically for aerial views).
 * - Image-based lighting: the sky (+ ground bounce + a dark "city skyline" band) is captured into a
 *   PMREM environment map, used for ambient light and reflections. Re-captured when the time changes.
 * - Height fog matched to the sky's horizon color (aerial perspective).
 * - HDR post: GTAO ambient occlusion, bloom, ACES tone mapping, grading, vignette, SMAA (quality-dependent).
 * - Interiors: setFocus(p, true) smoothly raises exposure and lowers the sky's contribution.
 *
 * URL options: ?quality=low|medium|high, ?gfxtest=1 (material test scene + gfx-* viewpoints).
 */
export interface GameRenderer {
  renderer: THREE.WebGLRenderer;
  render(camera: THREE.PerspectiveCamera): void;
  resize(w: number, h: number): void;
  /** Called every frame with the player/camera position so lighting can follow (shadows, interiors). */
  setFocus(p: THREE.Vector3, inside: boolean): void;
  /** Hour of day 0-24 (sun position). */
  setTimeOfDay(hour: number): void;
  /** Resolves once textures are loaded and a few frames have rendered (for screenshots). */
  ready: Promise<void>;
  quality: QualitySettings;
}

/** Ground-level haze extinction per meter (≈ 15 km visibility; hazy autumn afternoon). */
const FOG_DENSITY = 0.00026;

function patchSky(sky: Sky, saturation: number): void {
  const m = sky.material as THREE.ShaderMaterial;
  m.uniforms.skyScale = { value: SKY_SCALE };
  m.uniforms.skySat = { value: saturation };
  m.uniforms.skyFloor = { value: new THREE.Vector3(...NIGHT_FLOOR) };
  m.fragmentShader = m.fragmentShader
    .replace('uniform float time;', 'uniform float time;\nuniform float skyScale;\nuniform float skySat;\nuniform vec3 skyFloor;')
    .replace(
      'gl_FragColor = vec4( texColor, 1.0 );',
      `texColor *= skyScale;
      texColor += skyFloor * ( 0.5 + 0.9 * pow( 1.0 - max( direction.y, 0.0 ), 3.0 ) ); // city glow
      float skyL = dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) );
      texColor = vec3( skyL ) + ( texColor - vec3( skyL ) ) * skySat;
      gl_FragColor = vec4( texColor, 1.0 );`,
    );
  const u = m.uniforms;
  u.turbidity.value = 4.2;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.0045;
  u.mieDirectionalG.value = 0.82;
  if (u.cloudCoverage) {
    u.cloudCoverage.value = 0.32;
    u.cloudDensity.value = 0.45;
    u.cloudElevation.value = 0.55;
  }
}

const rgb = (c: RGB) => new THREE.Color(c[0], c[1], c[2]);

export function createRenderer(container: HTMLElement, world: World): GameRenderer {
  const params = new URLSearchParams(location.search);
  const frozenClouds = params.has('view');
  const q = parseQuality(location.search);
  installHeightFog();

  const renderer = new THREE.WebGLRenderer({ antialias: !q.post, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.maxPixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = q.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);
  setTextureAnisotropy(Math.min(q.anisotropy, renderer.capabilities.getMaxAnisotropy()));

  const scene = world.scene;

  // --- sky
  const sky = new Sky();
  patchSky(sky, SKY_SATURATION);
  sky.scale.setScalar(4000);
  sky.frustumCulled = false;
  sky.name = 'gfx.sky';
  scene.add(sky);
  const skyU = (sky.material as THREE.ShaderMaterial).uniforms;

  // --- sun + shadows
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = 'gfx.sun';
  sun.castShadow = true;
  scene.add(sun, sun.target);
  const shadows = new ShadowFollower(sun, q);

  // fill light used only indoors (keeps corners from going pitch black when interior lights are sparse)
  const fill = new THREE.HemisphereLight(0xfff2e0, 0x8a7f70, 0);
  fill.name = 'gfx.interiorFill';
  scene.add(fill);

  // --- environment (IBL) scene: sky without sun disc + ground bounce + skyline band
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  patchSky(envSky, ENV_SKY_SATURATION);
  envSky.scale.setScalar(20);
  const envSkyU = (envSky.material as THREE.ShaderMaterial).uniforms;
  envSkyU.showSunDisc.value = 0;
  envScene.add(envSky);
  const groundMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(8, 32, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), groundMat));
  const bandH = 8 * Math.tan((4.5 * Math.PI) / 180);
  const bandMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(7.9, 7.9, bandH, 48, 1, true), bandMat);
  band.position.y = bandH / 2 - 0.01;
  envScene.add(band);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT: THREE.WebGLRenderTarget | null = null;

  scene.fog = new THREE.FogExp2(0xbfc8d0, FOG_DENSITY);

  let lighting: Lighting = computeLighting([0, 1, 0]);
  let currentHour = -1;

  function setTimeOfDay(hour: number): void {
    if (Math.abs(hour - currentHour) < 1 / 120) return;
    currentHour = hour;
    const angles = campusSunAngles(hour);
    const d = sunDirectionWorld(angles);
    lighting = computeLighting(d);
    const sunPos = new THREE.Vector3(d[0], d[1], d[2]);
    skyU.sunPosition.value.copy(sunPos);
    envSkyU.sunPosition.value.copy(sunPos);
    // sun light
    sun.color.copy(rgb(lighting.sunColor));
    sun.intensity = lighting.sunIntensity;
    sun.visible = lighting.sunIntensity > 1e-4;
    const key = lighting.sunDir;
    shadows.setSunDirection(new THREE.Vector3(key[0], key[1], key[2]));
    // environment
    groundMat.color.copy(rgb(lighting.groundRadiance));
    const h = lighting.horizonColor;
    const g = lighting.groundRadiance;
    bandMat.color.setRGB(g[0] * 1.3 * 0.6 + h[0] * 0.4, g[1] * 1.3 * 0.6 + h[1] * 0.4, g[2] * 1.3 * 0.6 + h[2] * 0.4);
    const old = envRT;
    envRT = pmrem.fromScene(envScene, 0, 0.1, 100, { size: q.envSize });
    scene.environment = envRT.texture;
    old?.dispose();
    // haze
    const fog = scene.fog as THREE.FogExp2;
    fog.color.copy(rgb(lighting.horizonColor));
    const hs = lighting.horizonSunColor;
    fogExtra.fogSunColor.value = { x: hs[0], y: hs[1], z: hs[2] };
    fogExtra.fogSunDir.value = { x: d[0], y: d[1], z: d[2] };
    // rooms behind opaque windows: dim daylight + electric lights
    setInteriorLighting(0.022 * lighting.totalHorizontal, 0.02);
  }

  // --- interior adaptation
  const focus = new THREE.Vector3();
  let insideTarget = 0;
  let insideAmt = 0;
  let firstFocus = true;
  function setFocus(p: THREE.Vector3, inside: boolean): void {
    focus.copy(p);
    insideTarget = inside ? 1 : 0;
    if (firstFocus) {
      insideAmt = insideTarget;
      firstFocus = false;
    }
  }

  // --- render
  let post: PostPipeline | null = null;
  let size = new THREE.Vector2(container.clientWidth, container.clientHeight);
  const grade: GradeParams = { ...DEFAULT_GRADE };
  const timer = new THREE.Timer();
  let readyFrames = 0;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => (resolveReady = r));

  function render(camera: THREE.PerspectiveCamera): void {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    const elapsed = timer.getElapsed();
    if (currentHour < 0) setTimeOfDay(14);
    insideAmt += (insideTarget - insideAmt) * (1 - Math.exp(-dt * 2.5));
    if (Math.abs(insideTarget - insideAmt) < 1e-3) insideAmt = insideTarget;

    sky.position.copy(camera.position);
    // drifting clouds (frozen for fixed viewpoints so screenshots are repeatable)
    skyU.time.value = frozenClouds ? 0 : elapsed;
    shadows.update(camera, firstFocus ? undefined : focus);
    updateMaterials(elapsed);

    scene.environmentIntensity = 1 - 0.75 * insideAmt;
    fill.intensity = 0.25 * insideAmt * Math.min(1, lighting.totalHorizontal + 0.3);
    grade.exposure = lighting.exposure * (1 + (INTERIOR_EXPOSURE_BOOST - 1) * insideAmt);
    grade.aoAmount = DEFAULT_GRADE.aoAmount;

    if (q.post) {
      if (!post) {
        post = new PostPipeline(renderer, scene, camera, q);
        const pr = renderer.getPixelRatio();
        post.setSize(Math.round(size.x * pr), Math.round(size.y * pr));
      }
      post.render(camera, grade);
    } else {
      renderer.toneMappingExposure = grade.exposure;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }

    if (pendingTextures() === 0) {
      if (++readyFrames === 3) resolveReady();
    }
  }

  function resize(w: number, h: number): void {
    size = new THREE.Vector2(w, h);
    renderer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    post?.setSize(Math.round(w * pr), Math.round(h * pr));
  }

  if (params.get('gfxtest') === '1') buildGfxTestScene(world);
  installReadyGate(ready);

  const api: GameRenderer = { renderer, render, resize, setFocus, setTimeOfDay, ready, quality: q };
  (window as unknown as { __gfx?: unknown }).__gfx = { ...api, scene, getLighting: () => lighting, grade };
  return api;
}

/**
 * Screenshots wait for `window.__ready` (set by main.ts after 3 frames). Textures load
 * asynchronously, so until main.ts awaits `gfx.ready` itself, hold `__ready` back until they're in.
 */
function installReadyGate(ready: Promise<void>): void {
  let gfxReady = false;
  void ready.then(() => (gfxReady = true));
  const w = window as unknown as Record<string, unknown>;
  let value = w.__ready;
  try {
    Object.defineProperty(window, '__ready', {
      configurable: true,
      get: () => (value === true ? gfxReady : value),
      set: (v) => (value = v),
    });
  } catch {
    // not fatal: screenshots may just catch textures mid-load
  }
}
