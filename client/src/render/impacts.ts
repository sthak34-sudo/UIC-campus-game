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
};

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

export function createImpacts(scene: THREE.Object3D, rand: () => number = Math.random): Impacts {
  const n = IMPACT.sparks;
  // Sparks are short streaks: tail and head points per spark.
  const pos = new Float32Array(n * 6);
  const col = new Float32Array(n * 6);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(geom, mat);
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
      sparks.forEach((s, i) => {
        if (s.age >= s.life) return;
        s.age += dt;
        s.v.y -= IMPACT.gravity * dt;
        s.p.x += s.v.x * dt; s.p.y += s.v.y * dt; s.p.z += s.v.z * dt;
        if (s.age >= s.life) return;
        const k = 1 - s.age / s.life;
        const o = i * 6;
        const tail = 0.025; // seconds of motion the streak covers
        pos[o] = s.p.x - s.v.x * tail; pos[o + 1] = s.p.y - s.v.y * tail; pos[o + 2] = s.p.z - s.v.z * tail;
        pos[o + 3] = s.p.x; pos[o + 4] = s.p.y; pos[o + 5] = s.p.z;
        col[o] = sc.r * 0.3 * k; col[o + 1] = sc.g * 0.2 * k; col[o + 2] = sc.b * 0.1 * k;
        col[o + 3] = sc.r * k; col[o + 4] = sc.g * k; col[o + 5] = sc.b * k;
      });
      geom.attributes.position!.needsUpdate = true;
      geom.attributes.color!.needsUpdate = true;
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
