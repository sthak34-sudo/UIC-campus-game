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
const FOG_DENSITY = 0.00032;
/** Target log-average scene luminance × exposure indoors (a bright but unclipped interior photo). */
const INTERIOR_KEY = 0.2;

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

/** A plain office/library room: off-white ceiling with light panels, pale walls, darker floor. */
function makeRoomEnvScene(): THREE.Scene {
  const sc = new THREE.Scene();
  const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation, pos: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
    m.position.set(...pos);
    sc.add(m);
  };
  box(24, 4, 24, new THREE.Color(0.75, 0.73, 0.68), [0, 1.0, 0]); // walls + ceiling
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.31, 0.3) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.99;
  sc.add(floor);
  for (let x = -9; x <= 9; x += 3) {
    for (let z = -9; z <= 9; z += 3) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.9, 4.6) }));
      p.rotation.x = Math.PI / 2;
      p.position.set(x, 2.98, z);
      sc.add(p);
    }
  }
  // a couple of darker window/door openings so reflections aren't uniform
  for (const [x, z, ry] of [[0, -11.9, 0], [11.9, 3, Math.PI / 2]] as const) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.95, 1.0) }));
    w.position.set(x, 0.6, z);
    w.rotation.y = ry;
    sc.add(w);
  }
  return sc;
}

/** Procedural skyline strip (buildings of varied height/material with window grids) for the env map. */
function makeSkylineTexture(): THREE.Texture {
  const W = 1024;
  const H = 128;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pal = ['#a8a59e', '#8f8c86', '#b8b2a6', '#7a4a3c', '#6e3f34', '#5d6670', '#9a958c', '#c2bdb2'];
  let x = 0;
  while (x < W) {
    const w = 18 + rnd() * 70;
    const h = H * (0.25 + rnd() * 0.75) * (rnd() < 0.15 ? 1 : 0.7);
    const col = pal[Math.floor(rnd() * pal.length)];
    g.fillStyle = col;
    g.fillRect(x, H - h, w, h);
    // window grid
    const dark = rnd() < 0.5;
    g.fillStyle = dark ? 'rgba(25,30,38,0.75)' : 'rgba(60,70,80,0.55)';
    const fh = 5 + rnd() * 3;
    const ww = 3 + rnd() * 4;
    for (let yy = H - h + 4; yy < H - 6; yy += fh) {
      if (rnd() < 0.3) g.fillRect(x + 2, yy, w - 4, fh * 0.5);
      else for (let xx = x + 3; xx < x + w - ww; xx += ww * 1.8) g.fillRect(xx, yy, ww, fh * 0.55);
    }
    // sunlit / shaded side
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,240,220,0.12)';
    g.fillRect(x, H - h, w * (0.3 + rnd() * 0.4), h);
    x += w + (rnd() < 0.25 ? 6 + rnd() * 25 : 0);
  }
  // street-level band: trees and parked cars as a dark, varied strip
  for (let i = 0; i < 160; i++) {
    g.fillStyle = rnd() < 0.6 ? `rgba(40,${60 + rnd() * 30},35,0.9)` : `rgba(${60 + rnd() * 80},${60 + rnd() * 60},${60 + rnd() * 60},0.9)`;
    const cx = rnd() * W;
    const r = 4 + rnd() * 10;
    g.beginPath();
    g.ellipse(cx, H - r * 0.6, r * 1.3, r, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
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
  // a ring of city buildings around the horizon so glass at eye level reflects a street, not a void
  const bandH = 7.9 * Math.tan((13 * Math.PI) / 180);
  const bandMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, map: makeSkylineTexture(), alphaTest: 0.5 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(7.9, 7.9, bandH, 64, 1, true), bandMat);
  band.position.y = bandH / 2 - 0.01;
  envScene.add(band);
  const pmrem = new THREE.PMREMGenerator(renderer);
  // Generic lit-room environment used indoors (reflections in screens/floors show a room, not the sky).
  // Its average radiance is ~1, so environmentIntensity = metered scene luminance keeps it consistent.
  const roomEnv = pmrem.fromScene(makeRoomEnvScene(), 0, 0.1, 100, { size: 128 }).texture;
  let envRT: THREE.WebGLRenderTarget | null = null;
  let skyEnv: THREE.Texture | null = null;

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
    // facades: ~0.3 albedo, about half in sun, seen through some haze
    const facade = (0.3 * (0.55 * lighting.totalHorizontal + 0.12 * lighting.sunIntensity)) / Math.PI / 0.45;
    bandMat.color.setRGB(facade * 0.75 + h[0] * 0.25, facade * 0.75 + h[1] * 0.25, facade * 0.75 + h[2] * 0.25);
    const old = envRT;
    envRT = pmrem.fromScene(envScene, 0, 0.1, 100, { size: q.envSize });
    skyEnv = envRT.texture;
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
  let isReady = false;
  let frameNo = 0;
  /** Interior exposure from metering the rendered image (null = not measured yet). */
  let interiorExp: number | null = null;
  let roomFill = 0.2;
  let meterCount = 0;
  let settled = false;
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

    // Exposure: outdoors it follows the sun/sky model. Indoors the image is metered (like an eye adapting)
    // and a generic "room" environment supplies the soft bounce light real rooms have; its strength is
    // adjusted until the room's average brightness reaches a photographic target. That keeps interiors
    // right whatever lights a building has, instead of a few hot spots in a dark room.
    const outdoorExp = lighting.exposure;
    const indoors = insideTarget > 0 || insideAmt > 0;
    const inBase = outdoorExp * INTERIOR_EXPOSURE_BOOST;
    const T = INTERIOR_KEY / inBase;
    if (!indoors) {
      interiorExp = null;
      roomFill = T / 0.4;
      meterCount = 0;
      settled = false;
    } else {
      const L = post?.takeMeasurement() ?? null;
      if (L != null) {
        meterCount++;
        const ratio = T / L;
        roomFill = Math.min((3 * T) / 0.4, Math.max(0, roomFill * Math.min(2, Math.max(0.5, Math.pow(ratio, 0.8)))));
        const target = Math.min(inBase * 1.3, Math.max(inBase * 0.5, INTERIOR_KEY / L));
        interiorExp = interiorExp === null || !isReady ? target : interiorExp + (target - interiorExp) * (1 - Math.exp(-dt * 1.5));
        settled = settled || Math.abs(Math.log(ratio)) < 0.15 || meterCount >= 8;
      }
    }
    if (insideAmt > 0.5 && indoors) {
      scene.environment = roomEnv;
      scene.environmentIntensity = roomFill;
      fill.intensity = 0;
    } else {
      scene.environment = skyEnv;
      scene.environmentIntensity = 1 - 0.75 * insideAmt;
      fill.intensity = 0.25 * insideAmt * Math.min(1, lighting.totalHorizontal + 0.3);
    }
    const inExp = interiorExp ?? inBase;
    grade.exposure = outdoorExp + (inExp - outdoorExp) * insideAmt;
    grade.bloom = DEFAULT_GRADE.bloom * (1 - 0.4 * insideAmt);
    if (post) post.meterNext = indoors && (!isReady || frameNo % 6 === 0);
    frameNo++;
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

    const interiorReady = !(insideTarget > 0 || insideAmt > 0) || !q.post || settled;
    if (pendingTextures() === 0 && interiorReady) {
      if (++readyFrames === 3) {
        isReady = true;
        resolveReady();
      }
    }
  }

  function resize(w: number, h: number): void {
    size = new THREE.Vector2(w, h);
    renderer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    post?.setSize(Math.round(w * pr), Math.round(h * pr));
  }

  if (params.get('gfxtest') === '1') buildGfxTestScene(world);

  const api: GameRenderer = { renderer, render, resize, setFocus, setTimeOfDay, ready, quality: q };
  (window as unknown as { __gfx?: unknown }).__gfx = { ...api, scene, getLighting: () => lighting, grade, getRoomFill: () => roomFill };
  return api;
}

