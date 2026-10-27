import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  aimBoneAlong,
  applyFootIk,
  clamp,
  findLegBones,
  footPlantDelta,
  pelvisOffsetFromFeet,
  solveTwoBoneIk,
} from './footIk';

describe('foot plant math', () => {
  it('clamps plant deltas so feet never teleport', () => {
    expect(footPlantDelta(1, 1.1, 0.35)).toBeCloseTo(0.1);
    expect(footPlantDelta(1, 2, 0.35)).toBeCloseTo(0.35);
    expect(footPlantDelta(1, 0.5, 0.35)).toBeCloseTo(-0.35);
    expect(clamp(5, 0, 1)).toBe(1);
  });

  it('averages left/right for a soft pelvis lift', () => {
    expect(pelvisOffsetFromFeet(0.2, 0.2, 0.5, 0.16)).toBeCloseTo(0.1);
    expect(pelvisOffsetFromFeet(0.4, 0.4, 1, 0.16)).toBeCloseTo(0.16);
    expect(pelvisOffsetFromFeet(-0.2, 0.2, 0.5, 0.16)).toBeCloseTo(0);
  });
});

describe('two-bone IK', () => {
  function makeLeg(): { root: THREE.Group; upper: THREE.Bone; mid: THREE.Bone; end: THREE.Bone } {
    const root = new THREE.Group();
    const upper = new THREE.Bone();
    upper.name = 'mixamorigLeftUpLeg';
    upper.position.set(0.1, 1.0, 0);
    const mid = new THREE.Bone();
    mid.name = 'mixamorigLeftLeg';
    mid.position.set(0, -0.45, 0);
    const end = new THREE.Bone();
    end.name = 'mixamorigLeftFoot';
    end.position.set(0, -0.45, 0);
    upper.add(mid);
    mid.add(end);
    root.add(upper);
    root.updateMatrixWorld(true);
    return { root, upper, mid, end };
  }

  it('aims a bone so the child offset follows the world direction', () => {
    const { upper, mid } = makeLeg();
    aimBoneAlong(upper, mid, new THREE.Vector3(0, -1, 0));
    upper.updateWorldMatrix(true, false);
    mid.updateWorldMatrix(true, false);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    upper.getWorldPosition(a);
    mid.getWorldPosition(b);
    const dir = b.sub(a).normalize();
    expect(dir.y).toBeLessThan(-0.9);
  });

  it('reaches a raised target by bending the knee', () => {
    const { upper, mid, end } = makeLeg();
    end.updateWorldMatrix(true, false);
    const ankle = new THREE.Vector3();
    end.getWorldPosition(ankle);
    // Ground above the sole: bend the knee (cannot reach below a straight leg without dropping the hip).
    const target = ankle.clone();
    target.y += 0.12;
    const pole = ankle.clone().add(new THREE.Vector3(0, 0, -1));
    const err = solveTwoBoneIk(upper, mid, end, target, pole);
    expect(err).toBeLessThan(0.03);
    const knee = new THREE.Vector3();
    mid.getWorldPosition(knee);
    // Knee should have moved forward toward the pole (bent).
    expect(knee.z).toBeLessThan(ankle.z);
  });

  it('finds Mixamo legs with colon or stripped names', () => {
    const root = new THREE.Group();
    const u = new THREE.Bone();
    u.name = 'mixamorig:RightUpLeg';
    const m = new THREE.Bone();
    m.name = 'mixamorig:RightLeg';
    const e = new THREE.Bone();
    e.name = 'mixamorig:RightFoot';
    u.add(m);
    m.add(e);
    root.add(u);
    expect(findLegBones(root, 'Right')?.end.name).toBe('mixamorig:RightFoot');
  });
});

describe('applyFootIk', () => {
  it('lifts the pelvis toward uneven ground and skips when airborne', () => {
    const hips = new THREE.Bone();
    hips.name = 'mixamorigHips';
    hips.position.set(0, 1, 0);
    const leftU = new THREE.Bone();
    leftU.name = 'mixamorigLeftUpLeg';
    leftU.position.set(0.1, 0, 0);
    const leftM = new THREE.Bone();
    leftM.name = 'mixamorigLeftLeg';
    leftM.position.set(0, -0.45, 0);
    const leftE = new THREE.Bone();
    leftE.name = 'mixamorigLeftFoot';
    leftE.position.set(0, -0.45, 0);
    const rightU = new THREE.Bone();
    rightU.name = 'mixamorigRightUpLeg';
    rightU.position.set(-0.1, 0, 0);
    const rightM = new THREE.Bone();
    rightM.name = 'mixamorigRightLeg';
    rightM.position.set(0, -0.45, 0);
    const rightE = new THREE.Bone();
    rightE.name = 'mixamorigRightFoot';
    rightE.position.set(0, -0.45, 0);
    leftU.add(leftM);
    leftM.add(leftE);
    rightU.add(rightM);
    rightM.add(rightE);
    hips.add(leftU);
    hips.add(rightU);
    const root = new THREE.Group();
    root.add(hips);
    root.updateMatrixWorld(true);

    const groundY = 0.12; // above the animated sole (~0)
    const probe = {
      sample: (_x: number, yFrom: number, _z: number, maxDrop: number) => {
        if (groundY <= yFrom && groundY >= yFrom - maxDrop) return groundY;
        return null;
      },
    };
    const pelvisState = { y: 0 };
    const left = { upper: leftU, mid: leftM, end: leftE };
    const right = { upper: rightU, mid: rightM, end: rightE };

    expect(applyFootIk({ hips, left, right, probe, grounded: false, pelvisState, dt: 0.1, yaw: 0 })).toBeNull();

    const r = applyFootIk({ hips, left, right, probe, grounded: true, pelvisState, dt: 1, yaw: 0 });
    expect(r).not.toBeNull();
    expect(r!.pelvis).toBeGreaterThan(0);
    expect(r!.leftDelta).toBeGreaterThan(0);
  });
});
