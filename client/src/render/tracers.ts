/**
 * Bullet tracers: short bright streaks that fly from the gun barrel to where the bullet hit,
 * then fade. A fixed pool of line segments, so lots of shots never allocate.
 */
import * as THREE from 'three';

type V3 = { x: number; y: number; z: number };

export const TRACER = {
  /** Seconds a tracer is visible. */
  life: 0.12,
  /** Length of the bright streak, meters. */
  streak: 6,
  pool: 48,
  color: 0xffd27a,
};

/** Where the streak's tail and head are at age `t` (0..life) along a shot of `length` meters. */
export function tracerSpan(length: number, t: number, life = TRACER.life, streak = TRACER.streak): { tail: number; head: number } {
  const k = Math.min(1, Math.max(0, t / life));
  const head = Math.min(length, k * (length + streak));
  const tail = Math.max(0, head - streak);
  return { tail: Math.min(tail, length), head };
}

export interface Tracers {
  add(from: V3, to: V3): void;
  update(dt: number): void;
  readonly active: number;
  dispose(): void;
}

export function createTracers(scene: THREE.Object3D): Tracers {
  const n = TRACER.pool;
  const pos = new Float32Array(n * 6);
  const colors = new Float32Array(n * 6);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(geom, mat);
  lines.frustumCulled = false;
  lines.name = 'bullet-tracers';
  scene.add(lines);
  const shots: { from: V3; dir: V3; len: number; age: number }[] = [];
  const c = new THREE.Color(TRACER.color);
  let next = 0;
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
      colors.fill(0);
      shots.forEach((s, i) => {
        s.age += dt;
        if (s.age >= TRACER.life) return;
        const { tail, head } = tracerSpan(s.len, s.age);
        const fade = 1 - s.age / TRACER.life;
        const o = i * 6;
        pos[o] = s.from.x + s.dir.x * tail; pos[o + 1] = s.from.y + s.dir.y * tail; pos[o + 2] = s.from.z + s.dir.z * tail;
        pos[o + 3] = s.from.x + s.dir.x * head; pos[o + 4] = s.from.y + s.dir.y * head; pos[o + 5] = s.from.z + s.dir.z * head;
        // Tail dim, head bright (additive, so black is invisible).
        colors[o] = c.r * 0.2 * fade; colors[o + 1] = c.g * 0.2 * fade; colors[o + 2] = c.b * 0.2 * fade;
        colors[o + 3] = c.r * fade; colors[o + 4] = c.g * fade; colors[o + 5] = c.b * fade;
      });
      geom.attributes.position!.needsUpdate = true;
      geom.attributes.color!.needsUpdate = true;
    },
    dispose() {
      scene.remove(lines);
      geom.dispose();
      mat.dispose();
    },
  };
}
