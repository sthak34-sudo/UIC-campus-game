import * as THREE from 'three';
import type { CampusData } from '../core/campusData';
import type { World } from '../core/world';

/**
 * PERFORMANCE PROBE ONLY (`?playertest=perf`): registers plain extruded boxes for every campus.json
 * building as invisible colliders, so collider-build and physics-step cost can be measured before
 * the Map Engineer's real buildings land. Not used in normal play.
 */
export async function addPerfCampusColliders(world: World): Promise<{ buildings: number }> {
  const data: CampusData = await (await fetch(`${import.meta.env.BASE_URL}data/campus.json`)).json();
  let n = 0;
  for (const b of data.buildings) {
    const outer = b.footprint.outer;
    if (outer.length < 3) continue;
    const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of b.footprint.holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const depth = Math.max(0.5, b.height - b.minHeight);
    const geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geom.rotateX(-Math.PI / 2); // shape (x, y) -> world (x, -z); extrusion -> up
    geom.translate(0, b.minHeight, 0);
    const mesh = new THREE.Mesh(geom);
    mesh.visible = false;
    world.addCollider(mesh);
    n++;
  }
  return { buildings: n };
}
