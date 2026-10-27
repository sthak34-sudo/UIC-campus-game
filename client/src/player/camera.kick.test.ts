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
