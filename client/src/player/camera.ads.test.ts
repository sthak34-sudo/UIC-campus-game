import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from './camera';
import { PLAYER_CONFIG } from './config';

const make = () => {
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  const rig = new CameraRig(cam, PLAYER_CONFIG, { sweepSphere: () => null });
  return { cam, rig };
};

describe('ADS zoom (CMB-10)', () => {
  it('zooms 60 to 48 in 0.15 s and back out', () => {
    const { cam, rig } = make();
    const feet = new THREE.Vector3();
    rig.update(1 / 60, feet, false, false);
    expect(cam.fov).toBe(60);
    for (let i = 0; i < 4; i++) rig.update(1 / 60, feet, false, true);
    expect(cam.fov).toBeLessThan(60);
    expect(cam.fov).toBeGreaterThan(48);
    for (let i = 0; i < 6; i++) rig.update(1 / 60, feet, false, true); // 10 frames = 0.167 s
    expect(cam.fov).toBeCloseTo(48, 5);
    for (let i = 0; i < 10; i++) rig.update(1 / 60, feet, false, false);
    expect(cam.fov).toBeCloseTo(60, 5);
  });
  it('turns slower while zoomed, by the FOV ratio', () => {
    const { rig } = make();
    const feet = new THREE.Vector3();
    rig.setView(0, 0);
    rig.addLook(100, 0);
    const hipTurn = -rig.yaw;
    rig.setView(0, 0);
    for (let i = 0; i < 20; i++) rig.update(1 / 60, feet, false, true);
    rig.addLook(100, 0);
    expect(-rig.yaw / hipTurn).toBeCloseTo(0.8, 5);
  });
  it('resetAim snaps back to the normal FOV (death, respawn)', () => {
    const { cam, rig } = make();
    for (let i = 0; i < 20; i++) rig.update(1 / 60, new THREE.Vector3(), false, true);
    rig.resetAim();
    expect(cam.fov).toBe(60);
    expect(rig.fovScale).toBe(1);
  });
  it('does not touch the FOV while hip firing (viewpoints can set it)', () => {
    const { cam, rig } = make();
    cam.fov = 40;
    rig.update(1 / 60, new THREE.Vector3(), false, false);
    expect(cam.fov).toBe(40);
  });
});
