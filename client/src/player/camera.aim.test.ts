import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from './camera';
import { PLAYER_CONFIG } from './config';

describe('CameraRig aim offset', () => {
  it('pulls in over the right shoulder while aiming and eases back after', () => {
    const cam = new THREE.PerspectiveCamera();
    const rig = new CameraRig(cam, PLAYER_CONFIG, { sweepSphere: () => null });
    rig.setView(0, 0);
    const feet = new THREE.Vector3();
    for (let i = 0; i < 120; i++) rig.update(1 / 60, feet, false, false);
    const hip = cam.position.clone();
    for (let i = 0; i < 120; i++) rig.update(1 / 60, feet, false, true);
    const aim = cam.position.clone();
    // Yaw 0 looks down -Z: right is +X, behind is +Z.
    expect(aim.x).toBeGreaterThan(hip.x + 0.1);
    expect(aim.x).toBeCloseTo(PLAYER_CONFIG.camAimShoulder, 2);
    expect(aim.z).toBeLessThan(hip.z - 0.8);
    expect(rig.arm).toBeCloseTo(PLAYER_CONFIG.camAimDistance, 1);
    for (let i = 0; i < 240; i++) rig.update(1 / 60, feet, false, false);
    expect(cam.position.distanceTo(hip)).toBeLessThan(0.02);
  });

  it('never pushes the camera out past a closer player zoom', () => {
    const cam = new THREE.PerspectiveCamera();
    const rig = new CameraRig(cam, PLAYER_CONFIG, { sweepSphere: () => null });
    rig.zoom = PLAYER_CONFIG.camMinDistance;
    for (let i = 0; i < 120; i++) rig.update(1 / 60, new THREE.Vector3(), false, true);
    expect(rig.arm).toBeLessThanOrEqual(PLAYER_CONFIG.camMinDistance + 1e-6);
  });
});
