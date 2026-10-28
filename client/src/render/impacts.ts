/**
 * Bullet impacts on walls and the ground: a burst of hot sparks that bounce off the surface and
 * fall, plus a short puff of dust. Walls throw more sparks and grey dust; the ground throws more
 * dirt and fewer sparks. Fixed pools, so heavy fire never allocates.
 */
import * as THREE from 'three';

type V3 = { x: number; y: number; z: number };

export const IMPACT = {
  sparks: 256,
  puffs: 24,
  /** Surfaces whose normal points up more than this count as ground. */
  groundNormalY: 0.7,
  wall: { sparks: 9, speed: 5.5, dust: 0xb8b0a4 },
  ground: { sparks: 4, speed: 3.5, dust: 0x8a7458 },
  sparkLife: 0.35,
  puffLife: 0.5,
  gravity: 9.8,
  sparkColor: 0xffc469,
  /** Spark streak width up close (m), and the minimum on-screen width in radians (~3 px at 1080p). */
  sparkWidth: 0.022,
  sparkMinAngle: 0.003,
};

/** Spark ribbon width (m) for a point `dist` meters from the camera (same rule as the shader). */
export function sparkWidth(dist: number): number {
  return Math.max(IMPACT.sparkWidth, dist * IMPACT.sparkMinAngle);
}

const SPARK_VERT = /* glsl */ `
attribute vec3 aDir;
attribute float aSide;
attribute vec3 aCol;
uniform float uWidth;
uniform float uMinAngle;
varying vec3 vCol;
varying float vSide;
void main() {
  vec3 p = position;
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 side = cross(aDir, toCam / max(dist, 1e-4));
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(0.0, 1.0, 0.0);
  p += side * aSide * max(uWidth, dist * uMinAngle) * 0.5;
  vCol = aCol;
  vSide = aSide;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const SPARK_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vSide;
void main() {
  float core = 1.0 - vSide * vSide;
  gl_FragColor = vec4(mix(vCol, vec3(1.0) * max(vCol.r, 0.0), core * 0.5) * core, 1.0);
}`;

export type SurfaceKind = 'wall' | 'ground';
export function surfaceKind(normal: V3): SurfaceKind {
  const l = Math.hypot(normal.x, normal.y, normal.z) || 1;
  return normal.y / l > IMPACT.groundNormalY ? 'ground' : 'wall';
}

/**
 * A spark direction: mostly along the surface normal, spread by `spread` (0..1), from two random
 * numbers in 0..1. Never points into the surface.
 */
export function sparkDir(normal: V3, u: number, v: number, spread = 0.75): V3 {
  const l = Math.hypot(normal.x, normal.y, normal.z) || 1;
  const n = { x: normal.x / l, y: normal.y / l, z: normal.z / l };
  // Any two axes perpendicular to n.
  const a = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let tx = a.y * n.z - a.z * n.y, ty = a.z * n.x - a.x * n.z, tz = a.x * n.y - a.y * n.x;
  const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
  const bx = n.y * tz - n.z * ty, by = n.z * tx - n.x * tz, bz = n.x * ty - n.y * tx;
  const ang = u * Math.PI * 2, r = spread * Math.sqrt(v);
  const c = Math.cos(ang) * r, s = Math.sin(ang) * r;
  const d = { x: n.x + tx * c + bx * s, y: n.y + ty * c + by * s, z: n.z + tz * c + bz * s };
  const dl = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / dl, y: d.y / dl, z: d.z / dl };
}

export interface Impacts {
  spawn(point: V3, normal: V3): void;
  update(dt: number): void;
  readonly activeSparks: number;
  readonly activePuffs: number;
  dispose(): void;
}

function puffTexture(): THREE.Texture {
  const size = 64;
  if (typeof document === 'undefined') return new THREE.Texture();
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  if (!g) return new THREE.Texture();
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/**
 * `onSpawn` is called once per impact with the surface kind (impact sounds hook in here).
 */
export function createImpacts(
  scene: THREE.Object3D,
  rand: () => number = Math.random,
  onSpawn?: (point: V3, kind: SurfaceKind) => void,
): Impacts {
  const n = IMPACT.sparks;
  // Sparks are short streaks drawn as camera-facing ribbons: 4 corners (tail and head, each side).
  const pos = new Float32Array(n * 12);
  const col = new Float32Array(n * 12);
  const dirA = new Float32Array(n * 12);
  const sideA = new Float32Array(n * 4);
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    sideA.set([-1, 1, -1, 1], i * 4);
    const b = i * 4;
    index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  geom.setAttribute('aDir', new THREE.BufferAttribute(dirA, 3));
  geom.setAttribute('aSide', new THREE.BufferAttribute(sideA, 1));
  geom.setIndex(index);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    uniforms: { uWidth: { value: IMPACT.sparkWidth }, uMinAngle: { value: IMPACT.sparkMinAngle } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lines = new THREE.Mesh(geom, mat);
  lines.frustumCulled = false;
  lines.name = 'impact-sparks';
  scene.add(lines);
  const sparks: { p: V3; v: V3; age: number; life: number }[] = [];
  let nextSpark = 0;
  const sc = new THREE.Color(IMPACT.sparkColor);

  const tex = puffTexture();
  const puffs: { sprite: THREE.Sprite; age: number }[] = [];
  for (let i = 0; i < IMPACT.puffs; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    sprite.visible = false;
    sprite.frustumCulled = false;
    sprite.name = 'impact-dust';
    scene.add(sprite);
    puffs.push({ sprite, age: IMPACT.puffLife });
  }
  let nextPuff = 0;

  return {
    get activeSparks() { return sparks.filter((s) => s.age < s.life).length; },
    get activePuffs() { return puffs.filter((p) => p.age < IMPACT.puffLife).length; },
    spawn(point, normal) {
      const kind = surfaceKind(normal);
      const cfg = IMPACT[kind];
      const l = Math.hypot(normal.x, normal.y, normal.z) || 1;
      const off = { x: point.x + (normal.x / l) * 0.03, y: point.y + (normal.y / l) * 0.03, z: point.z + (normal.z / l) * 0.03 };
      for (let i = 0; i < cfg.sparks; i++) {
        const d = sparkDir(normal, rand(), rand());
        const sp = cfg.speed * (0.5 + rand() * 0.7);
        const s = { p: { ...off }, v: { x: d.x * sp, y: d.y * sp, z: d.z * sp }, age: 0, life: IMPACT.sparkLife * (0.6 + rand() * 0.6) };
        if (sparks.length < n) sparks.push(s);
        else sparks[nextSpark] = s;
        nextSpark = (nextSpark + 1) % n;
      }
      onSpawn?.(point, kind);
      const puff = puffs[nextPuff]!;
      nextPuff = (nextPuff + 1) % puffs.length;
      puff.age = 0;
      puff.sprite.position.set(off.x, off.y, off.z);
      (puff.sprite.material as THREE.SpriteMaterial).color.setHex(cfg.dust);
      puff.sprite.visible = true;
    },
    update(dt) {
      pos.fill(0);
      col.fill(0);
      dirA.fill(0);
      sparks.forEach((s, i) => {
        if (s.age >= s.life) return;
        s.age += dt;
        s.v.y -= IMPACT.gravity * dt;
        s.p.x += s.v.x * dt; s.p.y += s.v.y * dt; s.p.z += s.v.z * dt;
        if (s.age >= s.life) return;
        const k = 1 - s.age / s.life;
        const o = i * 12;
        const tail = 0.03; // seconds of motion the streak covers
        const sp = Math.hypot(s.v.x, s.v.y, s.v.z) || 1;
        const tx = s.p.x - s.v.x * tail, ty = s.p.y - s.v.y * tail, tz = s.p.z - s.v.z * tail;
        for (let c = 0; c < 4; c++) {
          const head = c >= 2;
          const q = o + c * 3;
          pos[q] = head ? s.p.x : tx; pos[q + 1] = head ? s.p.y : ty; pos[q + 2] = head ? s.p.z : tz;
          dirA[q] = s.v.x / sp; dirA[q + 1] = s.v.y / sp; dirA[q + 2] = s.v.z / sp;
          const b = head ? 1.3 * k : 0.3 * k;
          col[q] = sc.r * b; col[q + 1] = sc.g * b * (head ? 1 : 0.7); col[q + 2] = sc.b * b * (head ? 1 : 0.4);
        }
      });
      geom.attributes.position!.needsUpdate = true;
      geom.attributes.aCol!.needsUpdate = true;
      geom.attributes.aDir!.needsUpdate = true;
      for (const p of puffs) {
        if (p.age >= IMPACT.puffLife) continue;
        p.age += dt;
        const k = Math.min(1, p.age / IMPACT.puffLife);
        const size = 0.15 + k * 0.45;
        p.sprite.scale.set(size, size, size);
        p.sprite.position.y += dt * 0.3;
        (p.sprite.material as THREE.SpriteMaterial).opacity = 0.55 * (1 - k);
        if (p.age >= IMPACT.puffLife) p.sprite.visible = false;
      }
    },
    dispose() {
      scene.remove(lines);
      geom.dispose();
      mat.dispose();
      for (const p of puffs) { scene.remove(p.sprite); p.sprite.material.dispose(); }
      tex.dispose();
    },
  };
}
