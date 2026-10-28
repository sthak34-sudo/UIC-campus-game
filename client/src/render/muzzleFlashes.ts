/**
 * Short muzzle flashes for bot rifles: a soft star-shaped glow that faces the camera plus a brief
 * orange light on nearby surfaces. Pooled; nothing is allocated per shot.
 */
import * as THREE from 'three';

type V3 = { x: number; y: number; z: number };

export const MUZZLE = {
  /** Seconds a flash stays visible. */
  life: 0.06,
  /** Glow size (m) at the start of the flash. */
  size: 0.55,
  pool: 16,
  /** Point lights shared by all flashes (kept in the scene at zero so shaders never recompile). */
  lights: 2,
  lightIntensity: 14,
  lightRange: 7,
  /** Push the flash this far along the shot so it sits at the barrel tip, not inside it (m). */
  forward: 0.12,
};

/** Brightness 0..1 for a flash `age` seconds old. */
export function flashFade(age: number): number {
  if (age < 0 || age >= MUZZLE.life) return 0;
  const t = age / MUZZLE.life;
  return (1 - t) * (1 - t);
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */ `
uniform float uFade; uniform float uRot;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x) + uRot;
  float star = pow(abs(cos(a * 2.5)), 6.0) * 0.6;
  float glow = max(0.0, 1.0 - r / (0.45 + star * 0.55));
  glow = glow * glow;
  float core = smoothstep(0.25, 0.0, r);
  vec3 col = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.95, 0.8), core);
  gl_FragColor = vec4(col * (glow + core) * uFade * 2.0, 1.0);
}`;

export interface MuzzleFlashes {
  /** Start a flash at `from`, optionally nudged toward `to` (the shot direction). */
  spawn(from: V3, to?: V3): void;
  update(dt: number, camera: THREE.Camera): void;
  readonly active: number;
  dispose(): void;
}

export function createMuzzleFlashes(scene: THREE.Scene, rand: () => number = Math.random): MuzzleFlashes {
  const geo = new THREE.PlaneGeometry(1, 1);
  const group = new THREE.Group();
  group.name = 'botMuzzleFlashes';
  scene.add(group);
  const slots = Array.from({ length: MUZZLE.pool }, () => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uFade: { value: 0 }, uRot: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    return { mesh, mat, age: Infinity };
  });
  const lights = Array.from({ length: MUZZLE.lights }, () => {
    const l = new THREE.PointLight(0xffa040, 0, MUZZLE.lightRange, 2);
    group.add(l);
    return { l, age: Infinity };
  });
  let next = 0;
  let nextLight = 0;
  return {
    spawn(from, to) {
      const s = slots[next];
      next = (next + 1) % slots.length;
      s.mesh.position.set(from.x, from.y, from.z);
      if (to) {
        const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > 1e-6) s.mesh.position.add(new THREE.Vector3(dx, dy, dz).multiplyScalar(MUZZLE.forward / d));
      }
      s.age = 0;
      s.mat.uniforms.uRot.value = rand() * Math.PI * 2;
      s.mesh.visible = true;
      const L = lights[nextLight];
      nextLight = (nextLight + 1) % lights.length;
      L.l.position.copy(s.mesh.position);
      L.age = 0;
    },
    update(dt, camera) {
      for (const s of slots) {
        if (!s.mesh.visible) continue;
        s.age += dt;
        const f = flashFade(s.age);
        if (f <= 0) { s.mesh.visible = false; continue; }
        s.mat.uniforms.uFade.value = f;
        s.mesh.quaternion.copy(camera.quaternion);
        s.mesh.scale.setScalar(MUZZLE.size * (0.7 + 0.3 * f));
      }
      for (const L of lights) {
        L.age += dt;
        L.l.intensity = MUZZLE.lightIntensity * flashFade(L.age);
      }
    },
    get active() { return slots.filter((s) => s.mesh.visible).length; },
    dispose() {
      scene.remove(group);
      geo.dispose();
      for (const s of slots) s.mat.dispose();
      for (const L of lights) L.l.dispose();
    },
  };
}
