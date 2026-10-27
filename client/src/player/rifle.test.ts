import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HOLD_POSES, HeldRifle, blendHold, findArmBones, solveArmIk } from './rifle';

function bone(name: string, x: number, y: number, z: number, parent?: THREE.Object3D): THREE.Bone {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, z);
  parent?.add(b);
  return b;
}

/** T-pose rig: root faces -Z, shoulders at 1.4 m, 0.29 m upper arm, 0.27 m forearm. */
function makeRig() {
  const root = new THREE.Group();
  const hips = bone('mixamorig:Hips', 0, 1.0, 0, root);
  const spine = bone('mixamorig:Spine2', 0, 0.4, 0, hips);
  for (const [side, s] of [['Right', 1], ['Left', -1]] as const) {
    const arm = bone(`mixamorig:${side}Arm`, 0.15 * s, 0, 0, spine);
    const fore = bone(`mixamorig:${side}ForeArm`, 0.29 * s, 0, 0, arm);
    const hand = bone(`mixamorig:${side}Hand`, 0.27 * s, 0, 0, fore);
    bone(`mixamorig:${side}HandMiddle1`, 0.09 * s, 0, 0, hand);
  }
  root.updateMatrixWorld(true);
  return root;
}

function makeRifle() {
  const r = new THREE.Group();
  r.name = 'rifle';
  const add = (n: string, z: number, y = 0) => {
    const o = new THREE.Object3D();
    o.name = n;
    o.position.set(0, y, z);
    r.add(o);
  };
  add('Grip', 0.23);
  add('Foregrip', -0.13);
  add('Muzzle', -0.43, 0.03);
  return r;
}

describe('hold poses', () => {
  it('blends locomotion poses, and full aim gives the aim pose', () => {
    expect(blendHold({ idle: 1, walk: 0, run: 0 }, 0).pitchDeg).toBeCloseTo(HOLD_POSES.idle.pitchDeg);
    const aim = blendHold({ idle: 0, walk: 0, run: 1 }, 1);
    for (const k of Object.keys(HOLD_POSES.aim) as (keyof typeof aim)[]) expect(aim[k]).toBeCloseTo(HOLD_POSES.aim[k]);
    const half = blendHold({ idle: 0.5, walk: 0.5, run: 0 }, 0);
    expect(half.up).toBeCloseTo((HOLD_POSES.idle.up + HOLD_POSES.walk.up) / 2);
  });
});

describe('arm IK', () => {
  it('puts the hand on a reachable target', () => {
    const rig = makeRig();
    const arm = findArmBones(rig, 'Right')!;
    const target = new THREE.Vector3(0.1, 1.2, -0.3);
    const err = solveArmIk(arm, target, new THREE.Vector3(0.5, 0.8, 0));
    expect(err).toBeLessThan(0.01);
  });
});

describe('held rifle', () => {
  function setup(pose: keyof typeof HOLD_POSES) {
    const rig = makeRig();
    const held = HeldRifle.create(makeRifle(), rig)!;
    expect(held).not.toBeNull();
    held.update(1 / 60, rig, HOLD_POSES[pose], true);
    rig.updateMatrixWorld(true);
    return { rig, held };
  }

  it('is parented to the right hand and both hands reach their sockets', () => {
    const { held } = setup('idle');
    expect(held.object.parent?.name).toBe('mixamorig:RightHand');
    expect(held.reach.right).toBeLessThan(0.02);
    expect(held.reach.left).toBeLessThan(0.02);
  });

  it('aims the muzzle along body forward, and points it down at idle', () => {
    for (const [pose, check] of [
      ['aim', (d: THREE.Vector3) => expect(d.z).toBeLessThan(-0.95)],
      ['idle', (d: THREE.Vector3) => expect(d.y).toBeLessThan(-0.2)],
    ] as const) {
      const { rig, held } = setup(pose);
      const muzzle = held.getMuzzleWorld(new THREE.Vector3());
      const grip = rig.getObjectByName('held-rifle')!.getObjectByName('Grip')!.getWorldPosition(new THREE.Vector3());
      check(muzzle.sub(grip).normalize());
    }
  });
});
