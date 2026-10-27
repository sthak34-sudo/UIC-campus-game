// Kenney Blaster Kit 2.1 blaster-f (CC0, https://kenney.nl/assets/blaster-kit) -> one self-contained
// rifle GLB with Grip/Foregrip/Muzzle sockets.
// Usage: npx -y -p @gltf-transform/core -p @gltf-transform/extensions node tools/anim-bake/rifle.mjs \
//   "<kit>/Models/GLB format/blaster-f.glb" client/public/models/weapons/rifle_cc0.glb
import {NodeIO} from '@gltf-transform/core';
import {KHRTextureTransform} from '@gltf-transform/extensions';
const io=new NodeIO().registerExtensions([KHRTextureTransform]);
const doc=await io.read(process.argv[2]);
const S=0.65, root=doc.getRoot(), scene=root.listScenes()[0];
const top=doc.createNode('rifle').setScale([S,S,S]);
for(const n of scene.listChildren()){scene.removeChild(n);top.addChild(n);}
scene.addChild(top);
// sockets in source units (gun faces -Z, origin at centre)
const sock={Grip:[0,-0.05,0.355],Foregrip:[0,-0.06,-0.2],Muzzle:[0,0.045,-0.66]};
for(const [k,v] of Object.entries(sock)) top.addChild(doc.createNode(k).setTranslation(v));
await io.write(process.argv[3],doc);
