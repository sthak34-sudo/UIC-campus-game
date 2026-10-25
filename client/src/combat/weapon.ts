/**
 * Hitscan against the Rapier world, plus the muzzle flash and bullet decals.
 * This file asks "what did the shot touch?" Damage is applied by health.ts,
 * so a future server can answer the same question and be the authority.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { COMBAT } from './balance';

export interface ShotHit {
  distance: number;
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  colliderHandle: number;
}

export function castHitscan(
  world: RAPIER.World,
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  maxDistance: number = COMBAT.maxRange,
  exclude?: RAPIER.Collider | null,
): ShotHit | null {
  const len = Math.hypot(direction.x, direction.y, direction.z);
  if (len < 1e-8 || maxDistance <= 0) return null;
  const dir = { x: direction.x / len, y: direction.y / len, z: direction.z / len };
  const hit = world.castRayAndGetNormal(
    new RAPIER.Ray(origin, dir),
    maxDistance,
    true,
    undefined,
    undefined,
    exclude ?? undefined,
  );
  if (!hit) return null;
  const nLen = Math.hypot(hit.normal.x, hit.normal.y, hit.normal.z) || 1;
  const toi = hit.timeOfImpact;
  return {
    distance: toi,
    point: { x: origin.x + dir.x * toi, y: origin.y + dir.y * toi, z: origin.z + dir.z * toi },
    normal: { x: hit.normal.x / nLen, y: hit.normal.y / nLen, z: hit.normal.z / nLen },
    colliderHandle: hit.collider.handle,
  };
}

/**
 * Short-lived muzzle flash and a small pool of bullet marks.
 * Materials here are effects, not campus surfaces, so they don't go through the material library.
 */
export class WeaponFx {
  private readonly flash: THREE.PointLight;
  private readonly flashSprite: THREE.Sprite;
  private readonly decals: { mesh: THREE.Mesh; life: number }[] = [];
  private nextDecal = 0;
  private flashLife = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.flash = new THREE.PointLight(0xffc080, 0, 7, 2);
    this.flash.name = 'combat-muzzle-light';
    this.flash.castShadow = false;
    this.scene.add(this.flash);

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const g = canvas.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,244,210,1)');
    grad.addColorStop(0.35, 'rgba(255,170,60,0.85)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    }));
    this.flashSprite.scale.set(0.45, 0.45, 0.45);
    this.flashSprite.visible = false;
    this.flashSprite.frustumCulled = false;
    this.scene.add(this.flashSprite);

    const mat = new THREE.MeshBasicMaterial({
      color: 0x161616,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const geom = new THREE.CircleGeometry(0.045, 12);
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      mesh.renderOrder = 2;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.scene.add(mesh);
      this.decals.push({ mesh, life: 0 });
    }
  }

  muzzle(at: { x: number; y: number; z: number }): void {
    this.flash.position.set(at.x, at.y, at.z);
    this.flashSprite.position.set(at.x, at.y, at.z);
    this.flash.intensity = 14;
    this.flashSprite.visible = true;
    (this.flashSprite.material as THREE.SpriteMaterial).opacity = 1;
    this.flashLife = 0.07;
  }

  decal(point: { x: number; y: number; z: number }, normal: { x: number; y: number; z: number }): void {
    const slot = this.decals[this.nextDecal]!;
    this.nextDecal = (this.nextDecal + 1) % this.decals.length;
    const n = new THREE.Vector3(normal.x, normal.y, normal.z);
    if (n.lengthSq() < 1e-8) n.set(0, 1, 0);
    n.normalize();
    slot.mesh.position.set(point.x, point.y, point.z).addScaledVector(n, 0.02);
    slot.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    slot.mesh.visible = true;
    (slot.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
    slot.life = 12;
  }

  update(dt: number): void {
    if (this.flashLife > 0) {
      this.flashLife = Math.max(0, this.flashLife - dt);
      const k = this.flashLife / 0.07;
      this.flash.intensity = 14 * k;
      (this.flashSprite.material as THREE.SpriteMaterial).opacity = k;
      this.flashSprite.visible = this.flashLife > 0;
    }
    for (const d of this.decals) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.mesh.visible = false;
        continue;
      }
      if (d.life < 1.5) (d.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (d.life / 1.5);
    }
  }

  dispose(): void {
    this.scene.remove(this.flash);
    this.scene.remove(this.flashSprite);
    this.flash.dispose();
    const spriteMat = this.flashSprite.material as THREE.SpriteMaterial;
    spriteMat.map?.dispose();
    spriteMat.dispose();
    for (const d of this.decals) {
      this.scene.remove(d.mesh);
      d.mesh.geometry.dispose();
    }
    const shared = this.decals[0]?.mesh.material as THREE.Material | undefined;
    shared?.dispose();
  }
}
