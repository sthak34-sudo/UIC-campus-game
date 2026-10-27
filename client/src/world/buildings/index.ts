import * as THREE from 'three';
import type { World } from '../../core/world';
import { getMaterial, MATERIAL_NAMES, type MaterialName } from '../../render/materials';
import { landmarkFarLod } from '../landmarks/kit/lod';
import { BUILDING_MODELS, type BuildingModel } from './manifest';
import { classifyNode, isColliderKind } from './nodes';
import { buildParapets } from './parapets';

/**
 * Loads Atlas's building glbs (meshopt compressed, no textures), swaps materials by name for the
 * repo materials, builds THREE.LOD per lod_group, registers *_col meshes as invisible colliders
 * and collects door / loot / part markers. The procedural copies are skipped in world/campus via
 * manifest.isReplacedByModel().
 *
 * farOnly slugs (UH, Daley): only *_LOD1 is kept; colliders, doors, loot and LOD0 are stripped.
 * The code landmark hides past farDistance_m and this LOD1 takes over.
 */
export interface BuildingDoor { slug: string; name: string; position: THREE.Vector3; inward: THREE.Vector3; width: number; height: number; part: string }
export interface LoadedBuilding { slug: string; root: THREE.Object3D; colliders: THREE.Mesh[]; doors: BuildingDoor[]; loot: THREE.Vector3[]; farOnly: boolean }

const INVISIBLE = new THREE.MeshBasicMaterial({ visible: false });
const KNOWN = new Set<string>(MATERIAL_NAMES);

export async function buildBuildingModels(world: World): Promise<LoadedBuilding[]> {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const out: LoadedBuilding[] = [];
  for (const m of BUILDING_MODELS) {
    try {
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/buildings/${m.slug}.glb`);
      out.push(installBuilding(world, m, gltf.scene));
    } catch (err) {
      console.warn(`[buildings] ${m.slug}.glb failed to load`, err);
    }
  }
  return out;
}

export function installBuilding(world: World, model: BuildingModel | string, scene: THREE.Object3D): LoadedBuilding {
  const m: BuildingModel = typeof model === 'string'
    ? { slug: model, replaces: [] }
    : model;
  const slug = m.slug;
  const farOnly = !!m.farOnly;
  scene.name = `building:${slug}`;
  world.scene.add(scene);
  scene.updateMatrixWorld(true);
  const res: LoadedBuilding = { slug, root: scene, colliders: [], doors: [], loot: [], farOnly };
  const lodGroups = new Map<string, { levels: THREE.Mesh[]; dist: number }>();
  const nodes: THREE.Object3D[] = [];
  scene.traverse((o) => nodes.push(o));
  const toRemove: THREE.Object3D[] = [];

  for (const o of nodes) {
    const kind = classifyNode(o.name);
    const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
    if (farOnly) {
      if (mesh && isColliderKind(kind)) {
        toRemove.push(o);
        continue;
      }
      if (kind === 'door' || kind === 'loot') {
        toRemove.push(o);
        continue;
      }
      if (kind === 'lod') {
        const e = o.userData as { lod_level?: number; lod_group?: string; lod1_distance_m?: number };
        if ((e.lod_level ?? 0) === 0) {
          toRemove.push(o);
          continue;
        }
        swapMaterials(o);
        o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        // Keep LOD1 in place (no THREE.LOD wrapper); landmarkFarLod toggles the whole root.
        continue;
      }
      continue;
    }

    if (mesh && isColliderKind(kind)) {
      mesh.visible = false;
      mesh.material = INVISIBLE;
      mesh.userData.colliderTag = kind;
      world.addCollider(mesh);
      res.colliders.push(mesh);
    } else if (kind === 'door') {
      const e = o.userData as { width_m?: number; height_m?: number; part?: string };
      const q = o.getWorldQuaternion(new THREE.Quaternion());
      res.doors.push({
        slug, name: o.name, position: o.getWorldPosition(new THREE.Vector3()),
        inward: new THREE.Vector3(1, 0, 0).applyQuaternion(q), width: e.width_m ?? 2.4, height: e.height_m ?? 2.6, part: e.part ?? '',
      });
    } else if (kind === 'loot') {
      res.loot.push(o.getWorldPosition(new THREE.Vector3()));
    } else if (kind === 'lod') {
      // glTF meshes with several materials become a Group of Meshes; handle both.
      const e = o.userData as { lod_level?: number; lod_group?: string; lod1_distance_m?: number };
      swapMaterials(o);
      const g = lodGroups.get(e.lod_group ?? 'main') ?? { levels: [], dist: e.lod1_distance_m ?? 120 };
      g.levels[e.lod_level ?? 0] = o as THREE.Mesh;
      lodGroups.set(e.lod_group ?? 'main', g);
      o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    }
  }

  for (const o of toRemove) o.parent?.remove(o);

  if (!farOnly) {
    for (const [group, g] of lodGroups) {
      const lod = new THREE.LOD();
      lod.name = `${slug}:${group}`;
      // The LOD goes where the levels were: glbs keep every node under a placed root
      // (e.g. "douglass-hall" at x=114). Adding it to `scene` dropped that transform and drew the
      // building ~100 m away from its colliders, doors and loot.
      const home = g.levels.find((l) => !!l)?.parent ?? scene;
      g.levels.forEach((lvl, i) => {
        if (!lvl) return;
        if (lvl.parent !== home) home.attach(lvl); // keep its world transform
        home.remove(lvl);
        lod.addLevel(lvl, i === 0 ? 0 : g.dist);
      });
      home.add(lod);
    }
  }

  scene.updateMatrixWorld(true);

  if (!farOnly) {
    const roofs = res.colliders.filter((c) => c.userData.colliderTag === 'roof-col');
    const others = res.colliders.filter((c) => c.userData.colliderTag === 'stair-col' || c.userData.colliderTag === 'floor-col');
    for (const p of buildParapets(roofs, others)) {
      scene.attach(p); // keep the world transform buildParapets computed
      p.updateMatrixWorld(true);
      world.addCollider(p);
      res.colliders.push(p);
    }
  }

  if (farOnly && m.landmarkName) {
    const landmark = world.scene.getObjectByName(m.landmarkName);
    if (landmark) {
      landmarkFarLod(world, landmark, scene, m.farDistance_m ?? 120);
    } else {
      // Landmark not built yet (unit tests): keep the far shell hidden so it does not double-draw.
      scene.visible = false;
    }
  }

  return res;
}

function swapMaterials(o: THREE.Object3D): void {
  o.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (mat: THREE.Material) => (KNOWN.has(mat.name) ? getMaterial(mat.name as MaterialName) : mat);
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}
