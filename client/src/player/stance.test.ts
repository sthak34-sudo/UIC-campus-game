import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLAYER_PUBLIC_ANIMS_URL } from './characterLoader';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

async function posed(clipName: string, t = 0.3) {
  const buf = fs.readFileSync(path.join(pub, PLAYER_PUBLIC_ANIMS_URL));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(ab, '');
  const clip = gltf.animations.find((a) => a.name === clipName)!;
  expect(clip).toBeTruthy();
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(clip).play();
  mixer.setTime(t * clip.duration);
  gltf.scene.updateMatrixWorld(true);
  const bone = (n: string) => {
    let o: THREE.Object3D | undefined;
    gltf.scene.traverse((x) => { if (!o && x.name.replace(':', '') === `mixamorig${n}`) o = x; });
    expect(o, n).toBeTruthy();
    return new THREE.Vector3().setFromMatrixPosition(o!.matrixWorld);
  };
  const deg = THREE.MathUtils.radToDeg;
  const armFromDown = (s: string) => deg(Math.acos(-bone(`${s}ForeArm`).sub(bone(`${s}Arm`)).normalize().y));
  const footPitch = (s: string) => deg(Math.asin(-bone(`${s}ToeBase`).sub(bone(`${s}Foot`)).normalize().y));
  return {
    feetX: Math.abs(bone('LeftFoot').x - bone('RightFoot').x),
    feetZ: Math.abs(bone('LeftFoot').z - bone('RightFoot').z),
    shoulders: bone('LeftArm').distanceTo(bone('RightArm')),
    armL: armFromDown('Left'),
    armR: armFromDown('Right'),
    pitchL: footPitch('Left'),
    pitchR: footPitch('Right'),
  };
}

// Ranges guard the retarget (rest-pose match + stance tidy in tools/anim-bake/bake.mjs). The old bake
// had ankles 1.5x the shoulder joints apart (wide straddle) and arms ~25 deg out from the body.
describe('CC0 clip stance', () => {
  for (const t of [0, 0.3, 0.7]) {
    it(`idle (t=${t}): feet about shoulder width, arms relaxed, feet flat`, async () => {
      const s = await posed('idle', t);
      expect(s.feetX / s.shoulders).toBeGreaterThan(0.7);
      expect(s.feetX / s.shoulders).toBeLessThan(1.15);
      expect(s.feetZ).toBeLessThan(0.3);
      for (const a of [s.armL, s.armR]) { expect(a).toBeGreaterThan(5); expect(a).toBeLessThan(22); }
      // Ankle->ball axis of the MakeHuman rest is ~17 deg; a flat planted foot stays near it.
      for (const p of [s.pitchL, s.pitchR]) { expect(p).toBeGreaterThan(8); expect(p).toBeLessThan(26); }
    });
  }
  it('aim/fire/reload keep a planted, not straddled, base', async () => {
    for (const n of ['aim_idle', 'fire', 'reload']) {
      const s = await posed(n);
      expect(s.feetX / s.shoulders, n).toBeGreaterThan(0.7);
      expect(s.feetX / s.shoulders, n).toBeLessThan(1.2);
      for (const p of [s.pitchL, s.pitchR]) expect(Math.abs(p - 17), n).toBeLessThan(9);
    }
  });
});
