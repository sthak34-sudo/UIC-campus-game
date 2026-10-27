/**
 * Practice dummies. Each one has a body collider and a smaller head collider in the
 * Rapier world, a health bar, and a fall-then-respawn cycle (5 seconds).
 */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { COMBAT } from './balance';
import { createCombatant, dummyShouldRespawn, isDown, takeHit, type Combatant } from './health';
import type { HitZone } from './damage';
import type { Vec3 } from './range';
import type { CharacterVisual, GroundProbe } from '../player/characterLoader';

/**
 * Foot-IK ground probe on the Rapier world. Rays skip colliders in `skip` (the dummies' own
 * body/head capsules), so a foot never plants on its own hitbox.
 */
export function rapierGroundProbe(world: RAPIER.World, skip: (handle: number) => boolean): GroundProbe {
  return {
    sample(x, yFrom, z, maxDrop) {
      const hit = world.castRay(
        new RAPIER.Ray({ x, y: yFrom, z }, { x: 0, y: -1, z: 0 }),
        maxDrop, true, undefined, undefined, undefined, undefined,
        (c: RAPIER.Collider) => !skip(c.handle),
      );
      return hit ? yFrom - hit.timeOfImpact : null;
    },
  };
}

const BODY_CENTER_Y = 0.86;
const BODY_HALF = 0.32;
const BODY_RADIUS = 0.26;
const HEAD_Y = 1.66;
const HEAD_RADIUS = 0.18;

interface DummyRig {
  root: THREE.Group;
  vitals: Combatant;
  bodyHandle: number;
  headHandle: number;
  downFor: number;
  falling: number;
  bar: THREE.Mesh;
  barTex: THREE.CanvasTexture;
  barCtx: CanvasRenderingContext2D;
  avatar: CharacterVisual | null;
}

export interface DummyHit {
  index: number;
  zone: HitZone;
  died: boolean;
  headshot: boolean;
  health: number;
}

export class PracticeDummies {
  private readonly rigs: DummyRig[] = [];
  private readonly byHandle = new Map<number, { index: number; zone: HitZone }>();
  private readonly up = new THREE.Vector3();
  private readonly barNormal = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    spots: readonly Vec3[],
    faceYaw: number,
    physics: RAPIER.World | null,
    /** When the realistic body loaded, each dummy is a clone of it. Otherwise the capsule figure. */
    visuals: (() => CharacterVisual) | null = null,
  ) {
    const skin = visuals ? null : new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 0.72, metalness: 0 });
    const suit = visuals ? null : new THREE.MeshStandardMaterial({ color: 0x8d3b2e, roughness: 0.88, metalness: 0 });
    const bodyGeom = visuals ? null : new THREE.CapsuleGeometry(BODY_RADIUS, BODY_HALF * 2, 4, 10);
    const headGeom = visuals ? null : new THREE.SphereGeometry(HEAD_RADIUS, 16, 12);
    const barGeom = new THREE.PlaneGeometry(0.7, 0.09);

    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i]!;
      const root = new THREE.Group();
      root.name = `combat-dummy-${i}`;
      root.position.set(spot.x, spot.y, spot.z);
      root.rotation.y = faceYaw;

      let avatar: CharacterVisual | null = null;
      if (visuals) {
        avatar = visuals();
        root.add(avatar.root);
      } else {
        const body = new THREE.Mesh(bodyGeom!, suit!);
        body.position.y = BODY_CENTER_Y;
        body.castShadow = true;
        body.receiveShadow = true;
        const head = new THREE.Mesh(headGeom!, skin!);
        head.position.y = HEAD_Y;
        head.castShadow = true;
        root.add(body, head);
      }

      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 16;
      const ctx = canvas.getContext('2d')!;
      const barTex = new THREE.CanvasTexture(canvas);
      barTex.colorSpace = THREE.SRGBColorSpace;
      const bar = new THREE.Mesh(barGeom, new THREE.MeshBasicMaterial({ map: barTex, transparent: true, depthWrite: false }));
      bar.position.y = 2.05;
      bar.castShadow = false;
      bar.renderOrder = 3;
      root.add(bar);

      let bodyHandle = -1;
      let headHandle = -1;
      if (physics) {
        const bodyCol = physics.createCollider(
          RAPIER.ColliderDesc.capsule(BODY_HALF, BODY_RADIUS).setTranslation(spot.x, spot.y + BODY_CENTER_Y, spot.z),
        );
        const headCol = physics.createCollider(
          RAPIER.ColliderDesc.ball(HEAD_RADIUS).setTranslation(spot.x, spot.y + HEAD_Y, spot.z),
        );
        bodyHandle = bodyCol.handle;
        headHandle = headCol.handle;
        this.byHandle.set(bodyHandle, { index: i, zone: 'body' });
        this.byHandle.set(headHandle, { index: i, zone: 'head' });
      }

      if (physics && avatar) avatar.setGroundProbe(rapierGroundProbe(physics, (h) => this.byHandle.has(h)));
      scene.add(root);
      const rig: DummyRig = {
        root, vitals: createCombatant(COMBAT.dummyHealth), bodyHandle, headHandle,
        downFor: 0, falling: 0, bar, barTex, barCtx: ctx, avatar,
      };
      this.paint(rig);
      this.rigs.push(rig);
    }
  }

  lookup(handle: number): { index: number; zone: HitZone } | undefined {
    return this.byHandle.get(handle);
  }

  damage(index: number, zone: HitZone, distance: number, physics: RAPIER.World | null, hitDir?: { x: number; y: number; z: number }): DummyHit | null {
    const rig = this.rigs[index];
    if (!rig || isDown(rig.vitals)) return null;
    const outcome = takeHit(rig.vitals, zone, distance);
    rig.vitals = outcome.combatant;
    this.paint(rig);
    if (outcome.died) {
      rig.falling = 0;
      rig.avatar?.setFlags({ dead: true });
      this.setColliders(rig, physics, false);
    } else {
      rig.avatar?.flinch(hitDir);
    }
    return { index, zone, died: outcome.died, headshot: outcome.headshot, health: rig.vitals.health };
  }

  update(dt: number, camera: THREE.Camera, physics: RAPIER.World | null): void {
    for (const rig of this.rigs) {
      this.barNormal.copy(camera.position).sub(rig.bar.getWorldPosition(this.up));
      if (this.barNormal.lengthSq() > 1e-6) rig.bar.lookAt(camera.position);
      const down = isDown(rig.vitals);
      if (rig.avatar) {
        rig.avatar.setFlags({ dead: down });
        const viewDistance = camera.position.distanceTo(rig.root.position);
        rig.avatar.update(dt, 0, true, null, viewDistance);
      }
      if (!down) continue;
      rig.downFor += dt;
      if (!rig.avatar) {
        rig.falling = Math.min(1, rig.falling + dt / 0.45);
        const k = 1 - Math.pow(1 - rig.falling, 3);
        rig.root.rotation.x = -k * (Math.PI / 2);
      }
      if (dummyShouldRespawn(rig.downFor)) this.respawn(rig, physics);
    }
  }

  private respawn(rig: DummyRig, physics: RAPIER.World | null): void {
    rig.vitals = createCombatant(COMBAT.dummyHealth);
    rig.downFor = 0;
    rig.falling = 0;
    rig.root.rotation.x = 0;
    rig.avatar?.setFlags({ dead: false });
    this.paint(rig);
    this.setColliders(rig, physics, true);
  }

  private setColliders(rig: DummyRig, physics: RAPIER.World | null, enabled: boolean): void {
    if (!physics) return;
    for (const handle of [rig.bodyHandle, rig.headHandle]) {
      if (handle < 0) continue;
      physics.getCollider(handle).setEnabled(enabled);
    }
  }

  private paint(rig: DummyRig): void {
    const ratio = Math.max(0, rig.vitals.health / rig.vitals.maxHealth);
    const g = rig.barCtx;
    g.clearRect(0, 0, 128, 16);
    g.fillStyle = '#1b1b1b';
    g.fillRect(0, 0, 128, 16);
    g.fillStyle = ratio > 0.35 ? '#d24b4b' : '#e0a030';
    g.fillRect(1, 1, Math.max(0, 126 * ratio), 14);
    rig.barTex.needsUpdate = true;
  }

  dispose(scene: THREE.Scene, physics: RAPIER.World | null): void {
    for (const rig of this.rigs) {
      scene.remove(rig.root);
      rig.avatar?.dispose();
      rig.bar.geometry.dispose();
      (rig.bar.material as THREE.Material).dispose();
      rig.barTex.dispose();
      if (physics) {
        for (const handle of [rig.bodyHandle, rig.headHandle]) {
          if (handle >= 0) physics.removeCollider(physics.getCollider(handle), false);
        }
      }
    }
  }
}
