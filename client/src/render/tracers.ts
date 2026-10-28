/**
 * Bullet tracers: bright streaks that fly from the gun barrel to where the bullet hit, then fade.
 * Each tracer is a flat ribbon that always turns to face the camera (done in the vertex shader),
 * with a minimum on-screen width so far-away shots stay visible. A fixed pool, so lots of shots
 * never allocate.
 */
import * as THREE from 'three';

type V3 = { x: number; y: number; z: number };

export const TRACER = {
  /** Seconds a tracer is visible. */
  life: 0.14,
  /** Length of the bright streak, meters. */
  streak: 7,
  pool: 64,
  color: 0xffd27a,
  /** Ribbon width up close, meters. */
  width: 0.09,
  /** Never thinner than this many radians of view (about 5 px on a 1080p screen). */
  minAngle: 0.005,
};

/** Where the streak's tail and head are at age `t` (0..life) along a shot of `length` meters. */
export function tracerSpan(length: number, t: number, life = TRACER.life, streak = TRACER.streak): { tail: number; head: number } {
  const k = Math.min(1, Math.max(0, t / life));
  const head = Math.min(length, k * (length + streak));
  const tail = Math.max(0, head - streak);
  return { tail: Math.min(tail, length), head };
}

/** Ribbon width (m) for a point `dist` meters from the camera (same rule as the shader). */
export function tracerWidth(dist: number): number {
  return Math.max(TRACER.width, dist * TRACER.minAngle);
}

export interface Tracers {
  add(from: V3, to: V3): void;
  update(dt: number): void;
  readonly active: number;
  dispose(): void;
}

const VERT = /* glsl */ `
attribute vec3 aOther;
attribute float aSide;
attribute float aGlow;
uniform float uWidth;
uniform float uMinAngle;
varying float vSide;
varying float vGlow;
void main() {
  vec3 p = position;
  vec3 dir = aOther - p;
  if (dot(dir, dir) < 1e-8) dir = vec3(0.0, 0.0, 1.0);
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 side = cross(normalize(dir), toCam / max(dist, 1e-4));
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(0.0, 1.0, 0.0);
  float w = max(uWidth, dist * uMinAngle);
  p += side * aSide * w * 0.5;
  vSide = aSide;
  vGlow = aGlow;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vSide;
varying float vGlow;
void main() {
  float core = 1.0 - vSide * vSide;
  vec3 c = mix(uColor, vec3(1.0), core * core * 0.6);
  gl_FragColor = vec4(c * vGlow * core, 1.0);
}`;

export function createTracers(scene: THREE.Object3D): Tracers {
  const n = TRACER.pool;
  // 4 corners per tracer: tail-left, tail-right, head-left, head-right.
  const pos = new Float32Array(n * 12);
  const other = new Float32Array(n * 12);
  const sideA = new Float32Array(n * 4);
  const glow = new Float32Array(n * 4);
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    sideA.set([-1, 1, -1, 1], i * 4);
    const b = i * 4;
    index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('aOther', new THREE.BufferAttribute(other, 3));
  geom.setAttribute('aSide', new THREE.BufferAttribute(sideA, 1));
  geom.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  geom.setIndex(index);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(TRACER.color) },
      uWidth: { value: TRACER.width },
      uMinAngle: { value: TRACER.minAngle },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.name = 'bullet-tracers';
  scene.add(mesh);
  const shots: { from: V3; dir: V3; len: number; age: number }[] = [];
  let next = 0;
  const put = (arr: Float32Array, v: number, x: number, y: number, z: number) => { arr[v * 3] = x; arr[v * 3 + 1] = y; arr[v * 3 + 2] = z; };
  return {
    get active() { return shots.filter((s) => s.age < TRACER.life).length; },
    add(from, to) {
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-3) return;
      const s = { from: { ...from }, dir: { x: dx / len, y: dy / len, z: dz / len }, len, age: 0 };
      if (shots.length < n) shots.push(s);
      else shots[next] = s;
      next = (next + 1) % n;
    },
    update(dt) {
      pos.fill(0);
      other.fill(0);
      glow.fill(0);
      shots.forEach((s, i) => {
        s.age += dt;
        if (s.age >= TRACER.life) return;
        const { tail, head } = tracerSpan(s.len, s.age);
        const fade = 1 - s.age / TRACER.life;
        const tx = s.from.x + s.dir.x * tail, ty = s.from.y + s.dir.y * tail, tz = s.from.z + s.dir.z * tail;
        const hx = s.from.x + s.dir.x * head, hy = s.from.y + s.dir.y * head, hz = s.from.z + s.dir.z * head;
        const v = i * 4;
        put(pos, v, tx, ty, tz); put(pos, v + 1, tx, ty, tz); put(pos, v + 2, hx, hy, hz); put(pos, v + 3, hx, hy, hz);
        // Each corner knows the other end so the shader can find the ribbon's sideways direction.
        put(other, v, hx + s.dir.x, hy + s.dir.y, hz + s.dir.z); put(other, v + 1, hx + s.dir.x, hy + s.dir.y, hz + s.dir.z);
        put(other, v + 2, hx + s.dir.x, hy + s.dir.y, hz + s.dir.z); put(other, v + 3, hx + s.dir.x, hy + s.dir.y, hz + s.dir.z);
        // Tail dim, head bright (additive, so black is invisible).
        glow[v] = glow[v + 1] = 0.25 * fade;
        glow[v + 2] = glow[v + 3] = 1.4 * fade;
      });
      geom.attributes.position!.needsUpdate = true;
      geom.attributes.aOther!.needsUpdate = true;
      geom.attributes.aGlow!.needsUpdate = true;
    },
    dispose() {
      scene.remove(mesh);
      geom.dispose();
      mat.dispose();
    },
  };
}
