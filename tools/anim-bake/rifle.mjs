// 3DModelsCC0 "M4A1" from the Free CC0 Guns & Explosives Pack (CC0,
// https://3dmodelscc0.itch.io/free-cc0-guns-explosives-pack; GLB export:
// https://github.com/BoQsc/cc0-guns-explosives-pack-glb/releases/tag/0) -> one self-contained rifle GLB
// with Grip/Foregrip/Muzzle sockets and 1024px WebP PBR textures.
// Usage (from a scratch dir with @gltf-transform/core, /extensions, /functions and sharp installed):
//   node tools/anim-bake/rifle.mjs "<pack>/M4A1/M4A1.glb" client/public/models/weapons/rifle_m4_cc0.glb
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {flatten, prune, dedup, textureCompress} from '@gltf-transform/functions';
import sharp from 'sharp';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(process.argv[2]);
const root=doc.getRoot(), scene=root.listScenes()[0];
await doc.transform(flatten(),dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:85}));
const top=doc.createNode('rifle');
for(const n of scene.listChildren()){scene.removeChild(n);top.addChild(n);}
scene.addChild(top);
// Sockets in metres, gun faces -Z, origin at the receiver (source already in metres after its 0.01 scale).
const sock={Grip:[0,-0.075,0.065],Foregrip:[0,-0.02,-0.22],Muzzle:[0,0.022,-0.54]};
for(const [k,v] of Object.entries(sock)) top.addChild(doc.createNode(k).setTranslation(v));
await io.write(process.argv[3],doc);
