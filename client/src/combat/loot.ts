/**
 * Loot crates on the practice range. Pickup is the existing interact (E) event:
 * walk close and press E. Crates come back after a short wait so you can try each one again.
 */
import * as THREE from 'three';
import { COMBAT } from './balance';
import { canReachPickup, type LootKind } from './inventory';
import type { LootSpot, Vec3 } from './range';

interface Crate {
  kind: LootKind;
  /** Guns lie still on the floor; other pickups bob and spin. */
  still: boolean;
  position: Vec3;
  group: THREE.Group;
  hiddenUntil: number;
}

const COLORS: Record<LootKind, number> = {
  gun: 0x2c3138,
  ammo: 0xb08a45,
  medkit: 0xf4f1ea,
  armor: 0x3c5d86,
};

function labelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.fillStyle = 'rgba(8,10,14,0.72)';
  g.fillRect(8, 8, 240, 48);
  g.fillStyle = color;
  g.font = 'bold 28px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.15, 0.29, 1);
  sprite.position.y = 0.72;
  return sprite;
}

function medkitMark(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#f4f1ea';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#c43838';
  g.fillRect(26, 8, 12, 48);
  g.fillRect(8, 26, 48, 12);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildMesh(kind: LootKind): THREE.Object3D {
  const mat = new THREE.MeshStandardMaterial({ color: COLORS[kind], roughness: 0.62, metalness: kind === 'gun' ? 0.35 : 0.04 });
  const group = new THREE.Group();
  if (kind === 'gun') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), mat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.28), mat);
    barrel.position.set(0, 0.04, -0.38);
    group.add(body, barrel);
  } else if (kind === 'armor') {
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.16), mat);
    vest.position.y = 0.16;
    group.add(vest);
  } else if (kind === 'medkit') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.26), new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.7, map: medkitMark(),
    }));
    box.position.y = 0.11;
    group.add(box);
  } else {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.18), mat);
    box.position.y = 0.08;
    group.add(box);
  }
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = true;
    }
  });
  return group;
}

/**
 * A real rifle lying on its side on the floor: a clone of the held-rifle model (shared geometry
 * and materials, so dispose skips it), centred and resting on the ground.
 */
export function buildGroundGun(template: THREE.Object3D, yaw: number): THREE.Object3D {
  const gun = template.clone(true);
  gun.traverse((o) => { o.userData.sharedAsset = true; });
  const holder = new THREE.Group();
  holder.name = 'ground-gun';
  gun.rotation.set(0, 0, Math.PI / 2);
  holder.add(gun);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gun);
  gun.position.set(-(box.min.x + box.max.x) / 2, -box.min.y + 0.003, -(box.min.z + box.max.z) / 2);
  holder.rotation.y = yaw;
  holder.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return holder;
}

const NAMES: Record<LootKind, string> = {
  gun: 'Rifle',
  ammo: 'Ammo',
  medkit: 'Med kit',
  armor: 'Armor',
};

export class LootField {
  private readonly crates: Crate[] = [];
  private readonly baseY: number[] = [];

  /** `gunModel`: the held-rifle model; when given, gun pickups show it lying on the ground. */
  constructor(scene: THREE.Scene, spots: readonly LootSpot[], gunModel: THREE.Object3D | null = null) {
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i]!;
      const group = new THREE.Group();
      group.name = `combat-loot-${spot.kind}`;
      group.position.set(spot.position.x, spot.position.y, spot.position.z);
      const still = spot.kind === 'gun' && gunModel !== null;
      if (still) {
        group.add(buildGroundGun(gunModel!, 0.6 + i * 1.3));
        const tag = labelSprite(NAMES[spot.kind], '#f2f5f8');
        tag.position.y = 0.45;
        group.add(tag);
      } else {
        group.add(buildMesh(spot.kind));
        group.add(labelSprite(NAMES[spot.kind], '#f2f5f8'));
      }
      scene.add(group);
      this.crates.push({ kind: spot.kind, still, position: spot.position, group, hiddenUntil: 0 });
      this.baseY.push(spot.position.y);
    }
  }

  /** Nearest crate within reach, or null. `now` is seconds. */
  nearest(feet: Vec3, now: number): { index: number; kind: LootKind } | null {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.crates.length; i++) {
      const c = this.crates[i]!;
      if (c.hiddenUntil > now) continue;
      if (!canReachPickup(feet, c.position)) continue;
      const d = (feet.x - c.position.x) ** 2 + (feet.z - c.position.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return null;
    return { index: best, kind: this.crates[best]!.kind };
  }

  take(index: number, now: number): LootKind | null {
    const c = this.crates[index];
    if (!c || c.hiddenUntil > now) return null;
    c.hiddenUntil = now + COMBAT.lootRespawn;
    c.group.visible = false;
    return c.kind;
  }

  update(now: number): void {
    for (let i = 0; i < this.crates.length; i++) {
      const c = this.crates[i]!;
      if (c.hiddenUntil > now) {
        c.group.visible = false;
        continue;
      }
      c.group.visible = true;
      c.hiddenUntil = 0;
      if (c.still) continue;
      const bob = Math.sin(now * 1.6 + i) * 0.05;
      c.group.position.y = this.baseY[i]! + bob;
      c.group.rotation.y = now * 0.4 + i;
    }
  }

  dispose(scene: THREE.Scene): void {
    for (const c of this.crates) {
      scene.remove(c.group);
      c.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !m.userData.sharedAsset) {
          m.geometry.dispose();
          const mat = m.material as THREE.MeshStandardMaterial;
          mat.map?.dispose();
          mat.dispose();
        }
        const s = o as THREE.Sprite;
        if (s.isSprite) {
          const mat = s.material;
          mat.map?.dispose();
          mat.dispose();
        }
      });
    }
  }
}
