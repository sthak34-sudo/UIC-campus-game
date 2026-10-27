/**
 * Held rifle: the CC0 3DModelsCC0 M4A1 model on the right-hand bone, both hands placed by two-bone IK.
 *
 * Each frame the rifle gets a target pose in the character's body frame (anchored at the right
 * shoulder, so crouching and leaning carry it along). The pose blends between low-ready (idle),
 * walk, port-arms (run) and shouldered (aim). Then:
 *   1. the right arm reaches the pistol grip (two-bone IK),
 *   2. the rifle is parented to the right-hand bone at that pose (so it rides the hand),
 *   3. the left arm reaches the foregrip.
 * Bone lengths are measured in world space, so the scaled body solves correctly.
 *
 * Asset: client/public/models/weapons/rifle_m4_cc0.glb. "M4A1" from the 3DModelsCC0 Free CC0 Guns & Explosives
 * Pack, CC0 (https://3dmodelscc0.itch.io/free-cc0-guns-explosives-pack), baked by tools/anim-bake/rifle.mjs with Grip / Foregrip / Muzzle nodes.
 */
import * as THREE from 'three';

export const RIFLE_URL = 'models/weapons/rifle_m4_cc0.glb';

/** Rifle hold relative to the right shoulder, in the body frame (right, up, forward), metres and degrees. */
export interface HoldPose {
  right: number;
  up: number;
  fwd: number;
  /** Muzzle pitch, negative points it down. */
  pitchDeg: number;
  /** Muzzle yaw toward the body's left (across the chest). */
  yawInDeg: number;
  /** Roll of the rifle about its barrel (positive cants the top to the left). */
  rollDeg: number;
}

export const HOLD_POSES: Record<'idle' | 'walk' | 'run' | 'aim', HoldPose> = {
  idle: { right: -0.16, up: -0.24, fwd: 0.18, pitchDeg: -20, yawInDeg: 36, rollDeg: 8 },
  walk: { right: -0.17, up: -0.22, fwd: 0.18, pitchDeg: -17, yawInDeg: 36, rollDeg: 8 },
  run: { right: -0.26, up: -0.14, fwd: 0.12, pitchDeg: -6, yawInDeg: 46, rollDeg: 14 },
  aim: { right: -0.06, up: -0.04, fwd: 0.24, pitchDeg: 0, yawInDeg: 5, rollDeg: 0 },
};

/** Blend the hold for locomotion weights (idle/walk/run summing to 1) and an aim blend in [0, 1]. */
export function blendHold(loco: { idle: number; walk: number; run: number }, aim: number): HoldPose {
  const keys: (keyof HoldPose)[] = ['right', 'up', 'fwd', 'pitchDeg', 'yawInDeg', 'rollDeg'];
  const sum = loco.idle + loco.walk + loco.run || 1;
  const a = Math.min(1, Math.max(0, aim));
  const out = {} as HoldPose;
  for (const k of keys) {
    const moving = (HOLD_POSES.idle[k] * loco.idle + HOLD_POSES.walk[k] * loco.walk + HOLD_POSES.run[k] * loco.run) / sum;
    out[k] = moving + (HOLD_POSES.aim[k] - moving) * a;
  }
  return out;
}

let template: Promise<THREE.Object3D | null> | null = null;
let ready: THREE.Object3D | null = null;

export function peekRifleTemplate(): THREE.Object3D | null {
  return ready;
}

/** Loads the rifle once. Null when the file is missing (the character then stays unarmed). */
export function loadRifleTemplate(url: string): Promise<THREE.Object3D | null> {
  template ??= (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().parseAsync(buf, '');
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      ready = gltf.scene;
      return ready;
    } catch (err) {
      console.info('Rifle model could not be loaded; characters stay unarmed.', err);
      return null;
    }
  })();
  return template;
}

export interface ArmBones {
  upper: THREE.Object3D;
  mid: THREE.Object3D;
  end: THREE.Object3D;
  /** First finger bone, used for the hand's pointing axis. */
  finger: THREE.Object3D | null;
  /** Clavicle above the upper arm; leans in when the target is out of reach. */
  clavicle?: THREE.Object3D | null;
}

export function findArmBones(root: THREE.Object3D, side: 'Left' | 'Right'): ArmBones | null {
  const get = (n: string) => findAny(root, `mixamorig:${side}${n}`, `mixamorig${side}${n}`);
  const upper = get('Arm');
  const mid = get('ForeArm');
  const end = get('Hand');
  if (!upper || !mid || !end) return null;
  return { upper, mid, end, finger: get('HandMiddle1'), clavicle: get('Shoulder') };
}

function findAny(root: THREE.Object3D, ...names: string[]): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && names.includes(o.name)) found = o;
  });
  return found;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _wq = new THREE.Quaternion();

/** Rotate `bone` (swing only, keeping its twist) so the direction from it to `toward` becomes `want`. */
export function swingBone(bone: THREE.Object3D, toward: THREE.Vector3, want: THREE.Vector3): void {
  bone.updateWorldMatrix(true, false);
  const origin = bone.getWorldPosition(_a);
  const cur = _b.copy(toward).sub(origin);
  if (cur.lengthSq() < 1e-10 || want.lengthSq() < 1e-10) return;
  cur.normalize();
  _q.setFromUnitVectors(cur, _c.copy(want).normalize());
  bone.getWorldQuaternion(_wq).premultiply(_q);
  if (bone.parent) bone.parent.getWorldQuaternion(_pq);
  else _pq.identity();
  bone.quaternion.copy(_pq.invert().multiply(_wq));
  bone.updateWorldMatrix(false, true);
}

/**
 * Two-bone IK with world-space lengths. Puts `end` on `target`, bending the middle joint toward `pole`.
 * Returns the remaining distance from the end joint to the target (0 when reachable).
 */
export function solveArmIk(arm: ArmBones, target: THREE.Vector3, pole: THREE.Vector3): number {
  const { upper, mid, end } = arm;
  if (arm.clavicle) reachWithClavicle(arm, target);
  upper.updateWorldMatrix(true, true);
  const s = upper.getWorldPosition(new THREE.Vector3());
  const m = mid.getWorldPosition(new THREE.Vector3());
  const e = end.getWorldPosition(new THREE.Vector3());
  const l1 = Math.max(1e-4, s.distanceTo(m));
  const l2 = Math.max(1e-4, m.distanceTo(e));
  const toT = _d.copy(target).sub(s);
  const dist = Math.min(Math.max(toT.length(), Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-4);
  toT.normalize();
  // Bend plane: contains the shoulder->target line and the pole.
  _n.copy(pole).sub(s);
  const poleDir = _n.addScaledVector(toT, -_n.dot(toT));
  if (poleDir.lengthSq() < 1e-10) poleDir.set(0, -1, 0).addScaledVector(toT, -toT.y);
  poleDir.normalize();
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const elbow = new THREE.Vector3().copy(s).addScaledVector(toT, l1 * cosA).addScaledVector(poleDir, l1 * sinA);
  swingBone(upper, m, elbow.clone().sub(s));
  mid.getWorldPosition(m);
  end.getWorldPosition(e);
  swingBone(mid, e, _c.copy(target).sub(m));
  end.getWorldPosition(e);
  return e.distanceTo(target);
}

const MAX_CLAVICLE_RAD = 0.8;

/** Lean the clavicle toward a target the straight arm cannot reach (at most MAX_CLAVICLE_RAD). */
function reachWithClavicle(arm: ArmBones, target: THREE.Vector3): void {
  const cl = arm.clavicle!;
  cl.updateWorldMatrix(true, true);
  const c = cl.getWorldPosition(new THREE.Vector3());
  const s = arm.upper.getWorldPosition(new THREE.Vector3());
  const m = arm.mid.getWorldPosition(new THREE.Vector3());
  const e = arm.end.getWorldPosition(new THREE.Vector3());
  const span = (s.distanceTo(m) + m.distanceTo(e)) * 0.97;
  const short = s.distanceTo(target) - span;
  if (short <= 0) return;
  const lc = Math.max(1e-4, c.distanceTo(s));
  const from = s.clone().sub(c).normalize();
  const to = target.clone().sub(c).normalize();
  const full = from.angleTo(to);
  if (full < 1e-5) return;
  const t = Math.min(1, Math.min(MAX_CLAVICLE_RAD, short / lc) / full);
  const want = from.clone().lerp(to, t).normalize();
  swingBone(cl, s, want);
}

/** Per-character rifle: holds the instance, its sockets and the arm bones. */
export class HeldRifle {
  readonly object: THREE.Object3D;
  private readonly grip: THREE.Object3D;
  private readonly fore: THREE.Object3D;
  private readonly muzzle: THREE.Object3D;
  private readonly flash: THREE.Mesh;
  private flashT = 0;
  private readonly bodyQ = new THREE.Quaternion();
  private readonly rifleQ = new THREE.Quaternion();
  private readonly gripLocalInv = new THREE.Matrix4();
  private readonly desired = new THREE.Matrix4();
  private readonly tmpM = new THREE.Matrix4();
  /** Last solve error in metres for each hand (tests and debugging). */
  readonly reach = { right: 0, left: 0 };

  constructor(
    tmpl: THREE.Object3D,
    private readonly right: ArmBones,
    private readonly left: ArmBones,
  ) {
    this.object = tmpl.clone(true);
    this.object.name = 'held-rifle';
    this.grip = this.object.getObjectByName('Grip')!;
    this.fore = this.object.getObjectByName('Foregrip')!;
    this.muzzle = this.object.getObjectByName('Muzzle')!;
    this.object.updateMatrixWorld(true);
    // Rifle-root -> grip, inverted: lets us place the rifle so its grip lands on a world point.
    this.gripLocalInv.copy(this.grip.matrixWorld).invert();
    this.flash = makeFlash();
    this.muzzle.add(this.flash);
    this.right.end.add(this.object);
  }

  static create(tmpl: THREE.Object3D | null, rig: THREE.Object3D): HeldRifle | null {
    if (!tmpl || !tmpl.getObjectByName('Grip') || !tmpl.getObjectByName('Foregrip') || !tmpl.getObjectByName('Muzzle')) return null;
    const r = findArmBones(rig, 'Right');
    const l = findArmBones(rig, 'Left');
    if (!r || !l) return null;
    return new HeldRifle(tmpl, r, l);
  }

  set visible(v: boolean) {
    this.object.visible = v;
  }

  fire(): void {
    this.flashT = 0.06;
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI;
  }

  getMuzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    this.muzzle.updateWorldMatrix(true, false);
    return this.muzzle.getWorldPosition(out);
  }

  /**
   * Places the rifle and both hands. `bodyRoot` is the character root (yaw only, faces -Z).
   * `leftHand` false leaves the left arm to the animation (reload).
   */
  update(dt: number, bodyRoot: THREE.Object3D, pose: HoldPose, leftHand: boolean): void {
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.visible = this.flashT > 0;
    if (!this.object.visible) return;
    bodyRoot.updateWorldMatrix(true, true);
    bodyRoot.getWorldQuaternion(this.bodyQ);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.bodyQ);
    const up = new THREE.Vector3(0, 1, 0);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.bodyQ);
    const shoulder = this.right.upper.getWorldPosition(new THREE.Vector3());
    const gripW = shoulder.clone()
      .addScaledVector(right, pose.right)
      .addScaledVector(up, pose.up)
      .addScaledVector(fwd, pose.fwd);
    // Rifle orientation: body yaw, then yaw in (about up), pitch (about the rifle's right), roll (about barrel).
    const d2r = Math.PI / 180;
    this.rifleQ.copy(this.bodyQ)
      .multiply(_q.setFromAxisAngle(_a.set(0, 1, 0), pose.yawInDeg * d2r))
      .multiply(_q.setFromAxisAngle(_a.set(1, 0, 0), pose.pitchDeg * d2r))
      .multiply(_q.setFromAxisAngle(_a.set(0, 0, 1), -pose.rollDeg * d2r));
    // Rifle root world matrix so that its Grip node sits on gripW.
    this.desired.compose(new THREE.Vector3(), this.rifleQ, new THREE.Vector3(1, 1, 1));
    const gripOffset = new THREE.Vector3().setFromMatrixPosition(this.gripLocalInv).applyQuaternion(this.rifleQ);
    this.desired.setPosition(gripW.clone().add(gripOffset));
    const rUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.rifleQ);
    const rFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.rifleQ);
    const rRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.rifleQ);

    // 1. Right wrist sits just above and behind the grip; elbow down and out.
    const rWrist = gripW.clone().addScaledVector(rUp, 0.05).addScaledVector(rFwd, -0.045).addScaledVector(rRight, 0.025);
    const rPole = shoulder.clone().addScaledVector(up, -0.4).addScaledVector(right, 0.35).addScaledVector(fwd, -0.1);
    this.reach.right = solveArmIk(this.right, rWrist, rPole);
    if (this.right.finger) {
      swingBone(this.right.end, this.right.finger.getWorldPosition(_d), _c.copy(rFwd).multiplyScalar(0.55).addScaledVector(rUp, -0.7).addScaledVector(rRight, -0.3));
    }

    // 2. Parent at the desired pose: local = handWorld^-1 * desired.
    this.right.end.updateWorldMatrix(true, false);
    this.tmpM.copy(this.right.end.matrixWorld).invert().multiply(this.desired);
    this.tmpM.decompose(this.object.position, this.object.quaternion, this.object.scale);
    this.object.updateMatrixWorld(true);

    // 3. Left hand under the foregrip.
    if (leftHand) {
      const foreW = this.fore.getWorldPosition(new THREE.Vector3());
      const lWrist = foreW.addScaledVector(rUp, -0.045).addScaledVector(rRight, -0.035).addScaledVector(rFwd, -0.04);
      const lShoulder = this.left.upper.getWorldPosition(new THREE.Vector3());
      const lPole = lShoulder.addScaledVector(up, -0.45).addScaledVector(right, -0.2).addScaledVector(fwd, 0.05);
      this.reach.left = solveArmIk(this.left, lWrist, lPole);
      if (this.left.finger) {
        swingBone(this.left.end, this.left.finger.getWorldPosition(_d), _c.copy(rFwd).multiplyScalar(0.6).addScaledVector(rUp, 0.45).addScaledVector(rRight, 0.6));
      }
    } else {
      this.reach.left = 0;
    }
  }

  dispose(): void {
    this.object.removeFromParent();
  }
}

let flashTex: THREE.Texture | null = null;
function makeFlash(): THREE.Mesh {
  if (!flashTex && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(32, 32, 1, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255,250,220,1)');
      grad.addColorStop(0.3, 'rgba(255,190,80,0.9)');
      grad.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    flashTex = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: flashTex, color: 0xffd090, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  // Two crossed quads along the barrel plus one facing forward: reads from the side and from behind.
  const g = new THREE.PlaneGeometry(0.12, 0.22);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mat);
  for (const rz of [0, Math.PI / 2]) {
    const q = new THREE.Mesh(g, mat);
    q.rotation.set(Math.PI / 2, 0, rz);
    q.position.z = -0.09;
    mesh.add(q);
  }
  mesh.name = 'rifle-muzzle-flash';
  mesh.visible = false;
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  mesh.traverse((o) => (o.frustumCulled = false));
  return mesh;
}
