import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Document, NodeIO } from '@gltf-transform/core';

const BODY = process.env.BODY ?? new URL('../../client/public/models/characters/player_base.glb', import.meta.url).pathname;
const SRC = process.env.SRC ?? 'UAL1_Standard.glb';
const OUT = process.argv[2] ?? new URL('../../client/public/models/characters/player_anims_cc0.glb', import.meta.url).pathname;

function stripBasisu(buf) {
  const jsonLen = buf.readUInt32LE(12);
  const j = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
  delete j.extensionsRequired; delete j.extensionsUsed; delete j.textures; delete j.images; delete j.samplers;
  for (const m of j.materials ?? []) {
    delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture;
    if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; }
    delete m.extensions;
  }
  let js = Buffer.from(JSON.stringify(j)); const pad = (4 - (js.length % 4)) % 4; js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
  const rest = buf.slice(20 + jsonLen);
  const head = Buffer.alloc(20); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + js.length + rest.length, 8);
  head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, js, rest]);
}
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const loader = new GLTFLoader();
const body = await loader.parseAsync(ab(stripBasisu(fs.readFileSync(BODY))), '');
const src = await loader.parseAsync(ab(fs.readFileSync(SRC)), '');

// target (sanitized mixamo name, no prefix) <- source UE name
const side = (s) => (s === 'l' ? 'Left' : 'Right');
const MAP = { Hips: 'pelvis', Spine: 'spine_01', Spine1: 'spine_02', Spine2: 'spine_03', Neck: 'neck_01', Head: 'Head' };
for (const s of ['l', 'r']) {
  const S = side(s);
  Object.assign(MAP, {
    [`${S}Shoulder`]: `clavicle_${s}`, [`${S}Arm`]: `upperarm_${s}`, [`${S}ForeArm`]: `lowerarm_${s}`, [`${S}Hand`]: `hand_${s}`,
    [`${S}UpLeg`]: `thigh_${s}`, [`${S}Leg`]: `calf_${s}`, [`${S}Foot`]: `foot_${s}`, [`${S}ToeBase`]: `ball_${s}`,
  });
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'])
    for (let i = 1; i <= 3; i++) MAP[`${S}Hand${f}${i}`] = `${f.toLowerCase()}_0${i}_${s}`;
}
const tBones = {}; body.scene.traverse((o) => { if (o.isBone) tBones[o.name] = o; });
const sBones = {}; src.scene.traverse((o) => { if (o.isBone) sBones[o.name] = o; });
const tName = (k) => `mixamorig${k}`;
for (const k of Object.keys(MAP)) if (!tBones[tName(k)] || !sBones[MAP[k]]) { console.log('unmapped', k, MAP[k]); delete MAP[k]; }

const wq = (o) => { o.updateWorldMatrix(true, false); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(o.matrixWorld)); };
const wp = (o) => { o.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); };

// Source rest pose: frame 0 of A_TPose if target rest arms are horizontal, else the bind pose.
const armDir = (bones, a, b) => wp(bones[b]).sub(wp(bones[a])).normalize();
body.scene.updateMatrixWorld(true);
const tArm = armDir(tBones, 'mixamorigLeftArm', 'mixamorigLeftForeArm');
const sMixer = new THREE.AnimationMixer(src.scene);
const clipBy = (n) => src.animations.find((c) => c.name === n);
const bindArm = (src.scene.updateMatrixWorld(true), armDir(sBones, 'upperarm_l', 'lowerarm_l'));
console.log('target arm dir', tArm.toArray().map((v) => v.toFixed(2)), 'source bind arm', bindArm.toArray().map((v) => v.toFixed(2)));
let restAction = null;
if (Math.abs(tArm.y) < 0.35) { restAction = sMixer.clipAction(clipBy('A_TPose')); restAction.play(); sMixer.setTime(0); src.scene.updateMatrixWorld(true); }
console.log('source rest arm', armDir(sBones, 'upperarm_l', 'lowerarm_l').toArray().map((v) => v.toFixed(2)));
const Rs = {}, Rt = {};
for (const k in MAP) { Rs[k] = wq(sBones[MAP[k]]); Rt[k] = wq(tBones[tName(k)]); }
// Rest-pose match. The world-delta transfer below is only exact when both rests have the same limb
// directions. They don't: the MakeHuman rest has legs splayed ~6 deg out, flatter feet (ankle ~13 deg
// off) and sloped clavicles, so every clip inherited those offsets (wide straddle, stiff flat feet).
// Fix: swing each source rest rotation so its bone axis (joint -> mapped child joint) points along the
// target's rest axis. Roll is irrelevant to the world-delta method, so a swing is enough.
const childOf = {};
for (const k in MAP) {
  const kids = Object.keys(MAP).filter((c) => tBones[tName(c)].parent === tBones[tName(k)]);
  const pick = kids.find((c) => /Hand(Middle)?1?$|ForeArm$|Arm$|Leg$|Foot$|ToeBase$|Spine\d?$|Neck$|Head$|Middle1$/.test(c) && !/Thumb|Index|Ring|Pinky/.test(c)) ?? kids[0];
  if (pick && k !== 'Hips') childOf[k] = pick;
}
// Feet keep their own rest: both rests stand flat-footed, and the bone axis (ankle -> ball) differs only
// because the foot meshes differ. Aligning it would pitch the toes into the floor.
const ALIGN = process.env.NOALIGN ? [] : Object.keys(childOf).filter((k) => !/Foot$|ToeBase$/.test(k));
for (const k of ALIGN) {
  const c = childOf[k];
  const dS = wp(sBones[MAP[c]]).sub(wp(sBones[MAP[k]])).normalize();
  const dT = wp(tBones[tName(c)]).sub(wp(tBones[tName(k)])).normalize();
  const swing = new THREE.Quaternion().setFromUnitVectors(dS, dT);
  Rs[k] = swing.multiply(Rs[k]);
}
console.log('aligned', ALIGN.length, 'bones', ALIGN.slice(0, 12).join(','));
const sHip0 = wp(sBones.pelvis), tHip0 = wp(tBones.mixamorigHips);
const tHipLocal0 = tBones.mixamorigHips.position.clone();
const ratio = tHip0.y / sHip0.y;
console.log('hip heights', tHip0.y.toFixed(3), sHip0.y.toFixed(3), 'ratio', ratio.toFixed(3));
if (restAction) { restAction.stop(); sMixer.uncacheAction(restAction.getClip()); }

// Order target bones parent-first.
const order = []; body.scene.traverse((o) => { if (o.isBone) order.push(o.name); });
const keys = order.map((n) => Object.keys(MAP).find((k) => tName(k) === n)).filter(Boolean);
const tRestLocal = {}; for (const n of order) tRestLocal[n] = tBones[n].quaternion.clone();

const WANT = {
  idle: ['Idle_Loop'], walk: ['Walk_Loop'], run: ['Jog_Fwd_Loop'], crouch_idle: ['Crouch_Idle_Loop'], crouch_walk: ['Crouch_Fwd_Loop'],
  aim_idle: ['Pistol_Aim_Neutral'], fire: ['Pistol_Shoot'], reload: ['Pistol_Reload'], jump: ['Jump_Loop'], death: ['Death01'],
  // No-weapon set, used while the player has nothing in hand: relaxed idle, walk, a full arm-pumping
  // sprint for run, and the jump-start pose (arms thrown up) for the air.
  unarmed_idle: ['Idle_Loop'], unarmed_walk: ['Walk_Loop'], unarmed_run: ['Sprint_Loop'], unarmed_jump: ['Jump_Start'],
  // Air loop after the take-off clip ends, and a one-shot landing for long falls.
  fall: ['Jump_Loop'], land: ['Jump_Land'],
};
const FPS = 30;
// Stance tidy for the standing clips. The Quaternius idle is a wide game stance (ankles 1.4x shoulder
// width) and the MakeHuman pelvis is 20% wider, so it read as a straddle. Pivot each whole leg in about
// the hip (thigh + shin together, foot left world-flat) and drop relaxed arms a little toward the body.
const deg = THREE.MathUtils.degToRad;
const rotZ = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
const rotX = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
// a: degrees inward (narrower), b: degrees closing the fore/aft stagger (source idle has left foot 0.42 m ahead).
const legsIn = (a, b = 0) => {
  const L = rotZ(-deg(a)).multiply(rotX(deg(b))), R = rotZ(deg(a)).multiply(rotX(-deg(b)));
  return { LeftUpLeg: L, LeftLeg: L, RightUpLeg: R, RightLeg: R };
};
// The source idle swings the right upper arm ~25 deg behind the body; bring it back under the shoulder.
const armsIn = (a, back = 0) => ({ LeftArm: rotZ(-deg(a)), LeftForeArm: rotZ(-deg(a)), RightArm: rotZ(deg(a)).multiply(rotX(-deg(back))), RightForeArm: rotZ(deg(a)) });
const LEG_IN = Number(process.env.LEG_IN ?? 3), LEG_FB = Number(process.env.LEG_FB ?? 7), ARM_IN = Number(process.env.ARM_IN ?? 10);
const STANCE = {
  idle: { ...legsIn(LEG_IN, LEG_FB), ...armsIn(ARM_IN, 14) },
  unarmed_idle: legsIn(LEG_IN, LEG_FB),
  aim_idle: legsIn(LEG_IN, LEG_FB / 2), fire: legsIn(LEG_IN, LEG_FB / 2), reload: legsIn(LEG_IN, LEG_FB / 2), crouch_idle: legsIn(LEG_IN),
};
const baked = [];
for (const [name, [srcName]] of Object.entries(WANT)) {
  const clip = clipBy(srcName);
  if (!clip) { console.log('missing source clip', srcName); continue; }
  sMixer.stopAllAction();
  const act = sMixer.clipAction(clip); act.play();
  const frames = Math.max(2, Math.round(clip.duration * FPS) + 1);
  const times = new Float32Array(frames);
  const rot = Object.fromEntries(keys.map((k) => [k, new Float32Array(frames * 4)]));
  const hip = new Float32Array(frames * 3);
  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / FPS); times[f] = t;
    sMixer.setTime(t); src.scene.updateMatrixWorld(true);
    for (const n of order) tBones[n].quaternion.copy(tRestLocal[n]);
    for (const k of keys) {
      const bone = tBones[tName(k)];
      const delta = wq(sBones[MAP[k]]).multiply(Rs[k].clone().invert());
      const want = delta.multiply(Rt[k]);
      const fix = STANCE[name]?.[k];
      if (fix) want.premultiply(fix);
      const parentW = wq(bone.parent);
      bone.quaternion.copy(parentW.invert().multiply(want));
      bone.updateMatrixWorld(true);
      bone.quaternion.toArray(rot[k], f * 4);
    }
    const d = wp(sBones.pelvis).sub(sHip0).multiplyScalar(ratio);
    // world delta -> hips parent local (parent is root bone; assume no scale/rotation difference beyond its world rot)
    const parent = tBones.mixamorigHips.parent; parent.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    const p = tHip0.clone().add(d).applyMatrix4(inv);
    p.toArray(hip, f * 3);
  }
  baked.push({ name, times, rot, hip });
  console.log('baked', name, frames, 'frames', clip.duration.toFixed(2) + 's');
}

// Write a skeleton-only glb whose node names match player_base.glb.
const doc = new Document(); const buffer = doc.createBuffer();
const scene = doc.createScene('anims');
const nodes = {};
const raw = (o) => o.userData?.name ?? o.name;
const build = (o, parent) => {
  if (!o.isBone) { o.children.forEach((c) => build(c, parent)); return; }
  const original = o.name.replace(/^mixamorig/, 'mixamorig:');
  const n = doc.createNode(original === 'root' ? 'root' : original).setTranslation(o.position.toArray()).setRotation(o.quaternion.toArray()).setScale(o.scale.toArray());
  nodes[o.name] = n; parent ? parent.addChild(n) : scene.addChild(n);
  o.children.forEach((c) => build(c, n));
};
for (const n of order) tBones[n].quaternion.copy(tRestLocal[n]);
tBones.mixamorigHips.position.copy(tHipLocal0);
build(body.scene, null);
for (const b of baked) {
  const anim = doc.createAnimation(b.name);
  const input = doc.createAccessor().setType('SCALAR').setArray(b.times).setBuffer(buffer);
  for (const k of keys) {
    const out = doc.createAccessor().setType('VEC4').setArray(b.rot[k]).setBuffer(buffer);
    const s = doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nodes[tName(k)]).setTargetPath('rotation').setSampler(s));
  }
  const ho = doc.createAccessor().setType('VEC3').setArray(b.hip).setBuffer(buffer);
  const hs = doc.createAnimationSampler().setInput(input).setOutput(ho).setInterpolation('LINEAR');
  anim.addSampler(hs).addChannel(doc.createAnimationChannel().setTargetNode(nodes.mixamorigHips).setTargetPath('translation').setSampler(hs));
}
await new NodeIO().write(OUT, doc);
console.log('wrote', OUT, (fs.statSync(OUT).size / 1e6).toFixed(2), 'MB');
