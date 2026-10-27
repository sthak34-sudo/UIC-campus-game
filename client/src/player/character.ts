import * as THREE from 'three';
import type { AnimFlags, CharacterVisual, HitDir } from './characterLoader';
import type { GroundProbe } from './footIk';
import { advancePhase, damp, turnToward, walkPose, type LimbPose } from './math';

/**
 * Procedural human figure (~1.75 m) built from simple meshes, with a speed-driven walk cycle.
 * No downloaded assets. Neutral clothing, no logos. Faces -Z (three.js forward) at yaw 0.
 * OWNER: Player Engineer.
 */

const COLORS = {
  skin: 0xb98a6a,
  hair: 0x2e231c,
  top: 0x5b6573, // grey-blue sweatshirt
  pants: 0x2f3947, // dark denim
  shoes: 0x2a2a2a,
  sole: 0xd8d4cc,
  backpack: 0x3f4a3c,
};

/** Joint heights / sizes (m) for a 1.75 m adult. */
const BODY = {
  hipY: 0.93,
  hipHalfWidth: 0.095,
  thigh: 0.44,
  shin: 0.42,
  shoulderY: 1.43,
  shoulderHalfWidth: 0.2,
  upperArm: 0.29,
  forearm: 0.25,
  neckY: 1.5,
  headCenterY: 1.635,
};

function mat(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

/** A capsule hanging down from its top end (pivot at y = 0, extends to y = -length). */
function limb(radiusTop: number, radiusBottom: number, length: number, material: THREE.Material): THREE.Mesh {
  const r = Math.max(radiusTop, radiusBottom);
  const geom = new THREE.CapsuleGeometry(r, Math.max(0.01, length - 2 * r), 4, 10);
  // taper: scale vertices by height
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const half = length / 2;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp((y + half) / length, 0, 1); // 0 bottom .. 1 top
    const s = (radiusBottom + (radiusTop - radiusBottom) * t) / r;
    pos.setX(i, pos.getX(i) * s);
    pos.setZ(i, pos.getZ(i) * s);
  }
  geom.translate(0, -half, 0);
  geom.computeVertexNormals();
  const m = new THREE.Mesh(geom, material);
  m.castShadow = true;
  return m;
}

export class CharacterModel implements CharacterVisual {
  readonly root = new THREE.Group();
  readonly kind = 'procedural' as const;
  readonly lod = 0;
  readonly missingTracks = 0;
  /** Moves up/down with the walk bob and leans forward when running. */
  private readonly body = new THREE.Group();
  private readonly hipL = new THREE.Group();
  private readonly hipR = new THREE.Group();
  private readonly kneeL = new THREE.Group();
  private readonly kneeR = new THREE.Group();
  private readonly shoulderL = new THREE.Group();
  private readonly shoulderR = new THREE.Group();
  private readonly elbowL = new THREE.Group();
  private readonly elbowR = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private phase = 0;
  private pose: LimbPose = walkPose(0, 0);
  private airBlend = 0;
  private idleT = 0;
  private flags: AnimFlags = {};
  private crouchBlend = 0;
  private aimBlend = 0;
  private fireT = 0;
  private reloadT = 0;
  private flinchT = 0;
  private flinchCooldown = 0;
  private flinchSide = 0;
  private deadTip = 0;
  /** Current facing (three.js yaw). */
  yaw = 0;

  constructor() {
    this.root.name = 'player-character';
    const skin = mat(COLORS.skin, 0.7);
    const top = mat(COLORS.top, 0.95);
    const pants = mat(COLORS.pants, 0.9);
    const shoes = mat(COLORS.shoes, 0.6);
    const sole = mat(COLORS.sole, 0.8);
    const hair = mat(COLORS.hair, 0.9);
    const pack = mat(COLORS.backpack, 0.9);

    this.root.add(this.body);

    // Pelvis
    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.145, 0.2, 14), pants);
    pelvis.scale.set(1, 1, 0.68);
    pelvis.position.y = BODY.hipY + 0.04;
    pelvis.castShadow = true;
    this.body.add(pelvis);

    // Torso (pivot at the waist so it can lean)
    this.torso.position.y = BODY.hipY + 0.12;
    this.body.add(this.torso);
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.155, 0.42, 16), top);
    chest.scale.set(1, 1, 0.62);
    chest.position.y = 0.19;
    chest.castShadow = true;
    this.torso.add(chest);
    const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.27, 4, 10), top);
    shoulders.rotation.z = Math.PI / 2;
    shoulders.scale.set(1, 1, 1.15);
    shoulders.position.y = BODY.shoulderY - this.torso.position.y - 0.02;
    shoulders.castShadow = true;
    this.torso.add(shoulders);
    // Backpack
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.14), pack);
    bag.position.set(0, 0.2, 0.17);
    bag.castShadow = true;
    this.torso.add(bag);
    for (const sx of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.25), pack);
      strap.position.set(sx * 0.1, 0.24, 0.02);
      this.torso.add(strap);
    }

    // Neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.12, 10), skin);
    neck.position.y = BODY.neckY - this.torso.position.y;
    this.torso.add(neck);
    this.head.position.y = BODY.headCenterY - this.torso.position.y;
    this.torso.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), skin);
    skull.scale.set(0.88, 1.15, 1.0);
    skull.castShadow = true;
    this.head.add(skull);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.106, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairCap.scale.set(0.9, 1.12, 1.04);
    hairCap.position.set(0, 0.012, 0.01);
    hairCap.rotation.x = -0.25;
    this.head.add(hairCap);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.04, 6), skin);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, -0.005, -0.105);
    this.head.add(nose);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(sx * 0.088, 0, 0.005);
      this.head.add(ear);
    }

    // Arms
    const arm = (shoulder: THREE.Group, elbow: THREE.Group, side: number) => {
      shoulder.position.set(side * BODY.shoulderHalfWidth, BODY.shoulderY - this.torso.position.y - 0.03, 0);
      shoulder.rotation.z = side * 0.06;
      this.torso.add(shoulder);
      shoulder.add(limb(0.058, 0.046, BODY.upperArm, top));
      elbow.position.y = -BODY.upperArm + 0.02;
      shoulder.add(elbow);
      elbow.add(limb(0.044, 0.036, BODY.forearm, skin));
      const sleeve = limb(0.05, 0.048, 0.08, top);
      elbow.add(sleeve);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin);
      hand.scale.set(0.7, 1.15, 0.95);
      hand.position.y = -BODY.forearm - 0.03;
      hand.castShadow = true;
      elbow.add(hand);
    };
    arm(this.shoulderL, this.elbowL, -1);
    arm(this.shoulderR, this.elbowR, 1);

    // Legs
    const leg = (hip: THREE.Group, knee: THREE.Group, side: number) => {
      hip.position.set(side * BODY.hipHalfWidth, BODY.hipY, 0);
      this.body.add(hip);
      hip.add(limb(0.085, 0.064, BODY.thigh, pants));
      knee.position.y = -BODY.thigh + 0.02;
      hip.add(knee);
      knee.add(limb(0.062, 0.048, BODY.shin, pants));
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.26), shoes);
      shoe.position.set(0, -BODY.shin - 0.035 + 0.02, -0.05);
      shoe.castShadow = true;
      knee.add(shoe);
      const soleM = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.022, 0.264), sole);
      soleM.position.set(0, -BODY.shin - 0.08 + 0.02, -0.05);
      knee.add(soleM);
    };
    leg(this.hipL, this.kneeL, -1);
    leg(this.hipR, this.kneeR, 1);

    this.applyPose(this.pose);
  }

  setFlags(flags: AnimFlags): void {
    this.flags = flags;
  }

  /** Procedural figure has no feet to plant; probe is accepted and ignored. */
  setGroundProbe(_probe: GroundProbe | null): void {}

  /** Short chest twitch. The realistic body has no hit clip, and neither does this fallback. */
  flinch(hitDir?: HitDir): void {
    if (this.flags.dead || this.flinchCooldown > 0) return;
    this.flinchT = 0.28;
    this.flinchCooldown = 0.45;
    if (hitDir) {
      // Store yaw-relative lean: bend torso away from the hit in XZ.
      const len = Math.hypot(hitDir.x, hitDir.z);
      this.flinchSide = len > 1e-6 ? Math.atan2(hitDir.x, hitDir.z) : 0;
    } else {
      this.flinchSide = 0;
    }
  }

  getMuzzleWorld(_out: THREE.Vector3): THREE.Vector3 | null {
    return null;
  }

  playFire(): void {
    if (!this.flags.dead) this.fireT = 0.25;
  }

  playReload(seconds: number): void {
    if (!this.flags.dead) this.reloadT = Math.max(0.2, seconds);
  }

  /**
   * Per-frame animation.
   * @param speed actual horizontal speed (m/s)
   * @param moveYaw yaw of the movement direction (used when speed > ~0.2)
   */
  update(dt: number, speed: number, grounded: boolean, moveYaw: number | null, viewDistance = 0): void {
    void viewDistance;
    if (!this.flags.dead && moveYaw !== null && (this.flags.aiming || speed > 0.15)) {
      this.yaw = turnToward(this.yaw, moveYaw, 10 * dt);
    }
    this.root.rotation.y = this.yaw;
    this.deadTip = this.flags.dead ? Math.min(1, this.deadTip + dt / 0.7) : 0;
    this.root.rotation.x = -this.deadTip * (Math.PI / 2);
    if (this.flags.dead) return;
    this.crouchBlend += ((this.flags.crouch ? 1 : 0) - this.crouchBlend) * damp(8, dt);
    this.aimBlend += ((this.flags.aiming ? 1 : 0) - this.aimBlend) * damp(12, dt);
    this.fireT = Math.max(0, this.fireT - dt);
    this.reloadT = Math.max(0, this.reloadT - dt);
    this.flinchT = Math.max(0, this.flinchT - dt);
    this.flinchCooldown = Math.max(0, this.flinchCooldown - dt);
    this.airBlend += ((grounded ? 0 : 1) - this.airBlend) * damp(10, dt);
    this.phase = advancePhase(this.phase, speed, dt);
    this.idleT += dt;
    const target = walkPose(this.phase, speed);
    const air = walkPose(0, 0, true);
    const k = damp(20, dt);
    const p = this.pose;
    const keys = Object.keys(p) as (keyof LimbPose)[];
    for (const key of keys) {
      const want = target[key] + (air[key] - target[key]) * this.airBlend;
      p[key] += (want - p[key]) * k;
    }
    this.applyPose(p);
    // breathing when idle
    const still = Math.max(0, 1 - speed / 0.3);
    this.torso.scale.setScalar(1 + Math.sin(this.idleT * 1.6) * 0.006 * still);
  }

  private applyPose(p: LimbPose): void {
    const c = this.crouchBlend;
    const aim = Math.max(this.aimBlend, this.fireT > 0 ? 1 : 0, this.reloadT > 0 ? 0.85 : 0);
    this.hipL.rotation.x = p.leftHip + c * 0.85;
    this.hipR.rotation.x = p.rightHip + c * 0.85;
    this.kneeL.rotation.x = -p.leftKnee - c * 1.15;
    this.kneeR.rotation.x = -p.rightKnee - c * 1.15;
    const aimArm = -1.15 * aim;
    this.shoulderL.rotation.x = p.leftShoulder * (1 - aim) + aimArm;
    this.shoulderR.rotation.x = p.rightShoulder * (1 - aim) + aimArm;
    this.elbowL.rotation.x = p.leftElbow + aim * 0.7;
    this.elbowR.rotation.x = p.rightElbow + aim * 0.9 + (this.reloadT > 0 ? 0.4 : 0);
    this.body.position.y = p.bob - 0.02 - c * 0.48;
    const flinch = this.flinchT > 0 ? Math.sin((1 - this.flinchT / 0.28) * Math.PI) * 0.55 : 0;
    this.torso.rotation.x = -p.lean + c * 0.35 + flinch * Math.cos(this.flinchSide - this.yaw);
    this.torso.rotation.z = flinch * 0.6 * Math.sin(this.flinchSide - this.yaw);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}
