import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from './camera';
import { PLAYER_CONFIG } from './config';

describe('CameraRig.kick', () => {
  it('adds a view kick that eases out without permanently drifting yaw/pitch', () => {
    const cam = new THREE.PerspectiveCamera();
    const phys = { sweepSphere: () => null };
    const rig = new CameraRig(cam, PLAYER_CONFIG, phys);
    rig.setView(0.5, 0.1);
    const baseYaw = rig.yaw;
    const basePitch = rig.pitch;
    rig.kick({ x: 1, y: 0, z: 0 }, 1);
    const feet = new THREE.Vector3(0, 0, 0);
    rig.update(1 / 60, feet, false);
    expect(rig.yaw).toBeCloseTo(baseYaw, 5);
    expect(rig.pitch).toBeCloseTo(basePitch, 5);
    const kicked = cam.quaternion.clone();
    const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(-basePitch, baseYaw, 0, 'YXZ'));
    expect(kicked.angleTo(expected)).toBeGreaterThan(0.001);
    for (let i = 0; i < 120; i++) rig.update(1 / 60, feet, false);
    expect(cam.quaternion.angleTo(expected)).toBeLessThan(0.02);
  });
});

describe('CameraRig recoil', () => {
  it('climbs the view while firing, eases back to the aim point, and a pull-down uses it up', () => {
    const cam = new THREE.PerspectiveCamera();
    const rig = new CameraRig(cam, PLAYER_CONFIG, { sweepSphere: () => null });
    rig.setView(0, 0.1);
    const feet = new THREE.Vector3();
    rig.update(1 / 60, feet);
    const before = new THREE.Vector3();
    cam.getWorldDirection(before);
    for (let i = 0; i < 5; i++) {
      rig.addRecoil(0.01, 0);
      rig.update(1 / 60, feet);
    }
    const climbed = new THREE.Vector3();
    cam.getWorldDirection(climbed);
    expect(climbed.y).toBeGreaterThan(before.y);
    expect(rig.pitch).toBeCloseTo(0.1, 9);
    for (let i = 0; i < 120; i++) rig.update(1 / 60, feet);
    expect(rig.recoil.pitch).toBe(0);
    rig.addRecoil(0.05, 0);
    rig.addLook(0, 0.02 / PLAYER_CONFIG.mouseSensitivity);
    expect(rig.recoil.pitch).toBeCloseTo(0.03, 6);
    expect(rig.pitch).toBeCloseTo(0.1, 6);
    rig.clearRecoil();
    expect(rig.recoil.pitch).toBe(0);
  });
});
