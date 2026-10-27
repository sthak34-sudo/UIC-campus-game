/**
 * Two-bone leg IK so animated feet plant on stairs and slopes.
 * Pure math + Object3D writes; the caller supplies a ground height probe (Rapier ray).
 */
import * as THREE from 'three';

export interface GroundProbe {
  /** World Y of the first hit under (x, yFrom, z), or null when nothing within maxDrop. */
  sample(x: number, yFrom: number, z: number, maxDrop: number): number | null;
}

export interface LegBones {
  upper: THREE.Object3D;
  mid: THREE.Object3D;
  end: THREE.Object3D;
}

export interface FootIkConfig {
  maxPlantM: number;
  rayLiftM: number;
  rayDropM: number;
  pelvisGain: number;
  maxPelvisM: number;
}

export const DEFAULT_FOOT_IK: FootIkConfig = {
  maxPlantM: 0.35,
  rayLiftM: 0.4,
  rayDropM: 0.6,
  pelvisGain: 0.5,
  maxPelvisM: 0.16,
};

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Positive when the ground is above the animated foot (need to lift / straighten less). */
export function footPlantDelta(footY: number, groundY: number, maxPlantM: number): number {
  return clamp(groundY - footY, -maxPlantM, maxPlantM);
}

export function pelvisOffsetFromFeet(
  leftDelta: number,
  rightDelta: number,
  gain: number,
  maxPelvisM: number,
): number {
  return clamp(((leftDelta + rightDelta) * 0.5) * gain, -maxPelvisM, maxPelvisM);
}

const _hip = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _ankle = new THREE.Vector3();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Aim `bone` so the rest offset toward `child` lines up with `worldDir`.
 * Mixamo (and our synthetic test bones) store limb length in the child translation.
 */
export function aimBoneAlong(bone: THREE.Object3D, child: THREE.Object3D, worldDir: THREE.Vector3): void {
  const parent = bone.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  const localAxis = child.position.clone();
  if (localAxis.lengthSq() < 1e-10) return;
  localAxis.normalize();
  const parentInv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const wantLocal = worldDir.clone().normalize().transformDirection(parentInv).normalize();
  if (localAxis.dot(wantLocal) < -0.999) {
    // 180 flip: pick a stable perpendicular axis
    const axis = Math.abs(localAxis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    axis.cross(localAxis).normalize();
    bone.quaternion.setFromAxisAngle(axis, Math.PI);
    return;
  }
  bone.quaternion.setFromUnitVectors(localAxis, wantLocal);
}

/** @deprecated alias kept for older call sites / tests */
export function aimBoneY(bone: THREE.Object3D, worldDir: THREE.Vector3): void {
  // Fallback when no child is passed: aim local +Y (procedural limbs).
  const parent = bone.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  const localAxis = new THREE.Vector3(0, 1, 0);
  const parentInv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const wantLocal = worldDir.clone().normalize().transformDirection(parentInv).normalize();
  bone.quaternion.setFromUnitVectors(localAxis, wantLocal);
}

/**
 * Analytic two-bone IK. Places the knee on the plane of (hip, target, pole), then aims bones.
 * Returns distance from the foot to the target after the solve.
 */
export function solveTwoBoneIk(
  upper: THREE.Object3D,
  mid: THREE.Object3D,
  end: THREE.Object3D,
  target: THREE.Vector3,
  poleWorld: THREE.Vector3,
): number {
  upper.updateWorldMatrix(true, false);
  mid.updateWorldMatrix(true, false);
  end.updateWorldMatrix(true, false);
  upper.getWorldPosition(_hip);
  mid.getWorldPosition(_knee);
  end.getWorldPosition(_ankle);

  const lenUpper = Math.max(1e-4, mid.position.length());
  const lenLower = Math.max(1e-4, end.position.length());

  const toTarget = _dir.copy(target).sub(_hip);
  const dist = clamp(toTarget.length(), 0.02, lenUpper + lenLower - 0.02);
  toTarget.normalize();

  const cosHip = clamp(
    (lenUpper * lenUpper + dist * dist - lenLower * lenLower) / (2 * lenUpper * dist),
    -1,
    1,
  );
  const hipOffset = Math.acos(cosHip);

  _pole.copy(poleWorld).sub(_hip);
  _normal.crossVectors(toTarget, _pole);
  if (_normal.lengthSq() < 1e-10) {
    _normal.set(1, 0, 0).cross(toTarget);
  }
  if (_normal.lengthSq() < 1e-10) return end.getWorldPosition(_ankle).distanceTo(target);
  _normal.normalize();

  const midDirA = new THREE.Vector3().copy(toTarget).applyQuaternion(_q.setFromAxisAngle(_normal, hipOffset));
  const midDirB = new THREE.Vector3().copy(toTarget).applyQuaternion(_q.setFromAxisAngle(_normal, -hipOffset));
  const midA = new THREE.Vector3().copy(_hip).addScaledVector(midDirA, lenUpper);
  const midB = new THREE.Vector3().copy(_hip).addScaledVector(midDirB, lenUpper);
  const useA = midA.distanceToSquared(poleWorld) <= midB.distanceToSquared(poleWorld);
  const midDir = useA ? midDirA : midDirB;

  aimBoneAlong(upper, mid, midDir);
  upper.updateWorldMatrix(true, false);
  mid.updateWorldMatrix(true, false);
  mid.getWorldPosition(_knee);
  _dir.copy(target).sub(_knee);
  if (_dir.lengthSq() > 1e-10) aimBoneAlong(mid, end, _dir);

  end.updateWorldMatrix(true, false);
  end.getWorldPosition(_ankle);
  return _ankle.distanceTo(target);
}

export interface FootIkResult {
  leftDelta: number;
  rightDelta: number;
  pelvis: number;
}

/**
 * Raycast each foot, ease a pelvis offset, then IK both legs onto the ground.
 * Skips the plant when airborne; pelvis ease back to 0.
 */
export function applyFootIk(opts: {
  hips: THREE.Object3D;
  left: LegBones;
  right: LegBones;
  probe: GroundProbe;
  grounded: boolean;
  cfg?: Partial<FootIkConfig>;
  pelvisState: { y: number };
  dt: number;
  /** Character facing yaw (radians, game space: 0 = -Z). Used as the knee pole hint. */
  yaw: number;
}): FootIkResult | null {
  const cfg = { ...DEFAULT_FOOT_IK, ...opts.cfg };
  const ease = Math.min(1, opts.dt * 10);

  if (!opts.grounded) {
    opts.pelvisState.y += (0 - opts.pelvisState.y) * Math.min(1, opts.dt * 8);
    opts.hips.position.y += opts.pelvisState.y;
    return null;
  }

  const sampleFoot = (foot: THREE.Object3D) => {
    foot.updateWorldMatrix(true, false);
    const p = new THREE.Vector3();
    foot.getWorldPosition(p);
    const hit = opts.probe.sample(p.x, p.y + cfg.rayLiftM, p.z, cfg.rayLiftM + cfg.rayDropM);
    const delta = hit === null ? 0 : footPlantDelta(p.y, hit, cfg.maxPlantM);
    return { p, delta };
  };

  const L = sampleFoot(opts.left.end);
  const R = sampleFoot(opts.right.end);
  const want = pelvisOffsetFromFeet(L.delta, R.delta, cfg.pelvisGain, cfg.maxPelvisM);
  opts.pelvisState.y += (want - opts.pelvisState.y) * ease;
  opts.hips.position.y += opts.pelvisState.y;

  // After pelvis shift, re-read feet and plant.
  opts.hips.updateWorldMatrix(true, true);
  const plant = (leg: LegBones, sideSign: number) => {
    leg.end.updateWorldMatrix(true, false);
    const foot = new THREE.Vector3();
    leg.end.getWorldPosition(foot);
    const hit = opts.probe.sample(foot.x, foot.y + cfg.rayLiftM, foot.z, cfg.rayLiftM + cfg.rayDropM);
    if (hit === null) return;
    _target.copy(foot);
    _target.y = hit;
    // Soft clamp so we never yank more than maxPlantM after pelvis move.
    _target.y = foot.y + footPlantDelta(foot.y, hit, cfg.maxPlantM);
    opts.hips.getWorldPosition(_hip);
    const fx = -Math.sin(opts.yaw);
    const fz = -Math.cos(opts.yaw);
    // Pole: a bit forward and to the outside of the leg so knees bend naturally.
    _pole.set(_hip.x + fx * 0.6 + (-fz) * sideSign * 0.25, _hip.y, _hip.z + fz * 0.6 + fx * sideSign * 0.25);
    solveTwoBoneIk(leg.upper, leg.mid, leg.end, _target, _pole);
  };
  plant(opts.left, 1);
  plant(opts.right, -1);
  return { leftDelta: L.delta, rightDelta: R.delta, pelvis: opts.pelvisState.y };
}

export function findLegBones(root: THREE.Object3D, side: 'Left' | 'Right'): LegBones | null {
  const upper = findBone(root, `mixamorig:${side}UpLeg`, `mixamorig${side}UpLeg`);
  const mid = findBone(root, `mixamorig:${side}Leg`, `mixamorig${side}Leg`);
  const end = findBone(root, `mixamorig:${side}Foot`, `mixamorig${side}Foot`);
  if (!upper || !mid || !end) return null;
  return { upper, mid, end };
}

function findBone(root: THREE.Object3D, ...names: string[]): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && names.includes(o.name)) found = o;
  });
  return found;
}
