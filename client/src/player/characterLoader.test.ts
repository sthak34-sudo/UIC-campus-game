import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  CLIP_NAMES,
  DEATH_SINK_M,
  collectUpperBodyNames,
  crouchWeights,
  deathLiftMeters,
  keepTrack,
  lodIndexForDistance,
  locomotionWeights,
  stanceMix,
  stripInPlace,
  tuneHairMaterials,
} from './characterLoader';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(clientRoot, '..');

describe('locomotion blending', () => {
  it('names the clips that ship in the private animation file', () => {
    expect([...CLIP_NAMES]).toEqual([
      'idle', 'walk', 'run', 'crouch_idle', 'crouch_walk', 'aim_idle', 'fire', 'reload', 'jump', 'death',
    ]);
  });

  it('blends idle, walk and run from speed', () => {
    expect(locomotionWeights(0)).toEqual({ idle: 1, walk: 0, run: 0 });
    const walk = locomotionWeights(1.4);
    expect(walk.walk).toBeCloseTo(1);
    expect(walk.idle).toBe(0);
    expect(walk.run).toBe(0);
    expect(locomotionWeights(4.5).run).toBeCloseTo(1);
    const mid = locomotionWeights(0.8);
    expect(mid.idle).toBeGreaterThan(0);
    expect(mid.walk).toBeGreaterThan(0);
    expect(mid.idle + mid.walk + mid.run).toBeCloseTo(1);
    const jog = locomotionWeights(3);
    expect(jog.walk).toBeGreaterThan(0);
    expect(jog.run).toBeGreaterThan(0);
  });

  it('blends a crouch on top of the standing cycle', () => {
    expect(crouchWeights(0)).toEqual({ crouch_idle: 1, crouch_walk: 0 });
    expect(crouchWeights(1.15).crouch_walk).toBeCloseTo(1);
    const mixed = stanceMix(locomotionWeights(4.5), crouchWeights(0), 1);
    expect(mixed.run).toBe(0);
    expect(mixed.crouch_idle).toBeCloseTo(1);
    const half = stanceMix(locomotionWeights(0), crouchWeights(1.15), 0.5);
    expect(half.idle + half.walk + half.run + half.crouch_idle + half.crouch_walk).toBeCloseTo(1);
  });
});

describe('death lift and level of detail', () => {
  it('lifts the lying pose by 8 cm and leaves the start of the fall alone', () => {
    expect(deathLiftMeters(0, 4.4)).toBe(0);
    expect(deathLiftMeters(4.4 * 0.4, 4.4)).toBe(0);
    expect(deathLiftMeters(4.4, 4.4)).toBeCloseTo(DEATH_SINK_M);
    expect(deathLiftMeters(4.4 * 0.6, 4.4)).toBeCloseTo(DEATH_SINK_M);
  });

  it('picks a coarser mesh as the camera moves away', () => {
    expect(lodIndexForDistance(2)).toBe(0);
    expect(lodIndexForDistance(7)).toBe(0);
    expect(lodIndexForDistance(12)).toBe(1);
    expect(lodIndexForDistance(25)).toBe(2);
    expect(lodIndexForDistance(80)).toBe(3);
  });
});

describe('clip cleanup', () => {
  it('keeps hip position and rotations, and drops scale and other translation', () => {
    expect(keepTrack('mixamorigHips.position')).toBe(true);
    expect(keepTrack('mixamorig:Hips.position')).toBe(true);
    expect(keepTrack('mixamorigHips.quaternion')).toBe(true);
    expect(keepTrack('mixamorigSpine.position')).toBe(false);
    expect(keepTrack('root.position')).toBe(false);
    expect(keepTrack('mixamorigHips.scale')).toBe(false);

    const clip = new THREE.AnimationClip('walk', 1, [
      new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 1, 0, 0, 1, 0]),
      new THREE.VectorKeyframeTrack('mixamorigHips.scale', [0, 1], [1, 1, 1, 1, 1, 1]),
      new THREE.VectorKeyframeTrack('mixamorigSpine.position', [0, 1], [0, 0, 0, 1, 0, 0]),
      new THREE.QuaternionKeyframeTrack('mixamorigSpine.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
      new THREE.VectorKeyframeTrack('root.position', [0], [0, 0, 0]),
    ]);
    const names = stripInPlace(clip).tracks.map((t) => t.name);
    expect(names).toEqual(['mixamorigHips.position', 'mixamorigSpine.quaternion']);
  });

  it('treats the spine and everything above it as the upper body', () => {
    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'mixamorigHips';
    const spine = new THREE.Bone();
    spine.name = 'mixamorigSpine';
    const head = new THREE.Bone();
    head.name = 'mixamorigHead';
    spine.add(head);
    hips.add(spine);
    root.add(hips);
    const upper = collectUpperBodyNames(root);
    expect([...upper].sort()).toEqual(['mixamorigHead', 'mixamorigSpine']);
  });
});

describe('hair cards', () => {
  it('cuts hair, brows and lashes with alphaTest instead of blending', () => {
    const lashes = new THREE.MeshStandardMaterial({ name: 'eyelashes', transparent: true });
    const skin = new THREE.MeshStandardMaterial({ name: 'skin' });
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(new THREE.BufferGeometry(), lashes));
    mesh.add(new THREE.Mesh(new THREE.BufferGeometry(), skin));
    tuneHairMaterials(mesh, true);
    expect(lashes.transparent).toBe(false);
    expect(lashes.alphaTest).toBe(0.5);
    expect(lashes.alphaToCoverage).toBe(true);
    expect(lashes.depthWrite).toBe(true);
    expect(skin.transparent).toBe(false);
    expect(skin.alphaTest).toBe(0);
    tuneHairMaterials(mesh, false);
    expect(lashes.alphaToCoverage).toBe(false);
  });
});

describe('committed assets stay public-safe', () => {
  it('commits the CC0 body and never tracks the private Mixamo folder', () => {
    const body = path.join(clientRoot, 'public/models/characters/player_base.glb');
    expect(fs.existsSync(body)).toBe(true);
    const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/client\/public\/models\/private\//);
  });
});
