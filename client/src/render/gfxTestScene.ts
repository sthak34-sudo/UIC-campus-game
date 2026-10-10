/**
 * Self-contained material & lighting test scene (only built with ?gfxtest=1).
 * A slice of "UIC-like" street: road with parkway, curb, sidewalk, granite plaza with a pool,
 * a Brutalist block with deep-set windows over a pilotis colonnade, a brick building with punched
 * windows, a dark concrete tower with ribbon windows, and a furnished interior room behind
 * clear glass. Placed far east of the campus so it never overlaps real geometry.
 * OWNER: Graphics Engineer.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { World } from '../core/world';
import { getMaterial, type MaterialName } from './materials';
import { LIGHT_UNITS } from './atmosphere';

/** World offset of the test area (east of the campus bounds). */
export const GFX_ORIGIN = new THREE.Vector3(1500, 0, 1500);

/** World-aligned UVs in meters (walls: u along the wall as seen from outside, v up; floors: x, -z). */
export function worldUV(g: THREE.BufferGeometry): void {
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    let u: number, v: number;
    if (Math.abs(ny) >= Math.max(Math.abs(nx), Math.abs(nz))) {
      u = x;
      v = -z;
    } else if (Math.abs(nx) > Math.abs(nz)) {
      u = nx > 0 ? -z : z;
      v = y;
    } else {
      u = nz > 0 ? x : -x;
      v = y;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

class Builder {
  private parts = new Map<MaterialName, THREE.BufferGeometry[]>();
  constructor(private o: THREE.Vector3) {}

  /** Axis-aligned box from (x0,y0,z0) to (x1,y1,z1) in local test coordinates. */
  box(mat: MaterialName, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    const [az, bz] = [Math.min(z0, z1), Math.max(z0, z1)];
    const g = new THREE.BoxGeometry(bx - ax, by - ay, bz - az);
    g.translate((ax + bx) / 2 + this.o.x, (ay + by) / 2 + this.o.y, (az + bz) / 2 + this.o.z);
    this.add(mat, g);
  }

  /** Vertical cylinder. */
  cyl(mat: MaterialName, x: number, z: number, r: number, y0: number, y1: number, seg = 16): void {
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg);
    g.translate(x + this.o.x, (y0 + y1) / 2 + this.o.y, z + this.o.z);
    this.add(mat, g);
  }

  /** Horizontal rectangle facing up at height y. */
  floor(mat: MaterialName, x0: number, z0: number, x1: number, z1: number, y: number): void {
    const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0));
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2 + this.o.x, y + this.o.y, (z0 + z1) / 2 + this.o.z);
    this.add(mat, g);
  }

  /** Vertical rectangle in the plane z = const, facing +z (south) or -z. */
  wallZ(mat: MaterialName, x0: number, x1: number, y0: number, y1: number, z: number, facingSouth: boolean): void {
    const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0));
    if (!facingSouth) g.rotateY(Math.PI);
    g.translate((x0 + x1) / 2 + this.o.x, (y0 + y1) / 2 + this.o.y, z + this.o.z);
    this.add(mat, g);
  }

  wallX(mat: MaterialName, z0: number, z1: number, y0: number, y1: number, x: number, facingEast: boolean): void {
    const g = new THREE.PlaneGeometry(Math.abs(z1 - z0), Math.abs(y1 - y0));
    g.rotateY(facingEast ? Math.PI / 2 : -Math.PI / 2);
    g.translate(x + this.o.x, (y0 + y1) / 2 + this.o.y, (z0 + z1) / 2 + this.o.z);
    this.add(mat, g);
  }

  private add(mat: MaterialName, g: THREE.BufferGeometry): void {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute('uv');
    worldUV(ng);
    const list = this.parts.get(mat) ?? [];
    list.push(ng);
    this.parts.set(mat, list);
  }

  build(world: World, opts: { noShadow?: MaterialName[]; colliders?: boolean } = {}): void {
    for (const [mat, list] of this.parts) {
      const g = mergeGeometries(list, false);
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, getMaterial(mat));
      mesh.name = `gfxtest.${mat}`;
      const transparent = mat === 'glassClear' || mat === 'water';
      mesh.castShadow = !transparent && !opts.noShadow?.includes(mat);
      mesh.receiveShadow = true;
      world.scene.add(mesh);
      if (opts.colliders && !transparent) world.addCollider(mesh);
    }
  }
}

export function buildGfxTestScene(world: World): void {
  const O = GFX_ORIGIN;
  const b = new Builder(O);

  // ---------------- ground: road (along x), parkways, curbs, sidewalks
  const X0 = -160, X1 = 160;
  b.floor('asphalt', X0, -6, X1, 6, 0);
  b.box('concreteSmooth', X0, 0, 6, X1, 0.15, 6.2); // curb south
  b.box('concreteSmooth', X0, 0, -6.2, X1, 0.15, -6); // curb north
  b.box('grass', X0, 0, 6.2, X1, 0.12, 8.2); // parkway (grass strip between curb and walk)
  b.box('grass', X0, 0, -8.2, X1, 0.12, -6.2);
  b.box('sidewalk', X0, 0, 8.2, X1, 0.15, 11.2);
  b.box('sidewalk', X0, 0, -11.2, X1, 0.15, -8.2);
  // lane markings: double yellow center, dashed white lanes
  b.floor('roadMarkingYellow', X0, -0.17, X1, -0.07, 0.004);
  b.floor('roadMarkingYellow', X0, 0.07, X1, 0.17, 0.004);
  for (let x = X0; x < X1; x += 12) {
    b.floor('roadMarking', x, -3.05, x + 3, -2.95, 0.004);
    b.floor('roadMarking', x, 2.95, x + 3, 3.05, 0.004);
  }
  // lawns
  b.floor('grass', X0, -200, X1, -11.2, 0.0);
  b.floor('grass', X0, 11.2, -30, 200, 0.0);
  b.floor('grass', 60, 11.2, X1, 200, 0.0);
  b.floor('grass', -30, 62, 60, 200, 0.0);
  // granite plaza in front of the Brutalist block
  b.box('plaza', -30, 0, 11.2, 60, 0.15, 62);
  // planting bed with mulch + concrete rim
  b.box('concreteSmooth', -16, 0.15, 15, -8, 0.45, 15.25);
  b.box('concreteSmooth', -16, 0.15, 19.75, -8, 0.45, 20);
  b.box('concreteSmooth', -16, 0.15, 15, -15.75, 0.45, 20);
  b.box('concreteSmooth', -8.25, 0.15, 15, -8, 0.45, 20);
  b.floor('soil', -15.75, 15.25, -8.25, 19.75, 0.38);
  // reflecting pool
  b.box('concreteSmooth', 2, 0.15, 18, 12, 0.55, 18.35);
  b.box('concreteSmooth', 2, 0.15, 24.65, 12, 0.55, 25);
  b.box('concreteSmooth', 2, 0.15, 18, 2.35, 0.55, 25);
  b.box('concreteSmooth', 11.65, 0.15, 18, 12, 0.55, 25);
  b.floor('concreteDark', 2.35, 18.35, 11.65, 24.65, 0.16);
  b.floor('water', 2.35, 18.35, 11.65, 24.65, 0.45);

  // ---------------- Brutalist block A: pilotis ground floor, deep-set windows in a concrete grid
  const AX0 = -25, AX1 = 15, AZ = 40, AZ1 = 58, TOP = 24.5;
  const floors = [4.5, 8.4, 12.3, 16.2, 20.1];
  b.box('concrete', AX0, 4.5, AZ + 0.35, AX1, TOP - 0.5, AZ1); // body behind the facade
  b.box('glass', AX0 + 0.1, 4.5, AZ + 0.34, AX1 - 0.1, TOP - 0.6, AZ + 0.35); // window plane (fake rooms)
  for (const fy of floors) {
    b.box('concrete', AX0, fy, AZ, AX1, fy + 1.25, AZ + 0.35); // spandrel band
    for (let x = AX0 + 3; x < AX1 - 0.1; x += 3) {
      // window frame: sill, head, center mullion
      b.box('windowFrame', x - 2.8, fy + 1.25, AZ + 0.27, x - 0.2, fy + 1.33, AZ + 0.35);
      b.box('windowFrame', x - 2.8, fy + 3.82, AZ + 0.27, x - 0.2, fy + 3.9, AZ + 0.35);
      b.box('windowFrame', x - 1.54, fy + 1.25, AZ + 0.29, x - 1.46, fy + 3.9, AZ + 0.35);
    }
  }
  b.box('concrete', AX0, TOP - 0.6, AZ - 0.4, AX1, TOP, AZ + 0.35); // parapet / cornice
  for (let x = AX0; x <= AX1 + 0.01; x += 3) {
    // projecting fins (piers) every 3 m
    b.box('concrete', x - 0.2, 4.5, AZ - 0.4, x + 0.2, TOP - 0.6, AZ + 0.35);
  }
  // end walls (board-formed, full height)
  b.box('concrete', AX0 - 0.6, 0, AZ - 0.4, AX0, TOP, AZ1);
  b.box('concrete', AX1, 0, AZ - 0.4, AX1 + 0.6, TOP, AZ1);
  // roof
  b.floor('roof', AX0 + 0.2, AZ + 0.6, AX1 - 0.2, AZ1 - 0.3, TOP - 0.45);
  // ground floor: colonnade, solid cores, glass storefront to the interior room
  for (let x = AX0 + 4; x < AX1; x += 6) b.box('concrete', x - 0.4, 0.15, AZ + 0.8, x + 0.4, 4.5, AZ + 1.6);
  b.box('concreteDark', AX0, 0.15, AZ + 3, -10, 4.5, AZ1); // core west
  b.box('concreteDark', 4, 0.15, AZ + 3, AX1, 4.5, AZ1); // core east
  b.box('concreteDark', -10, 0.15, 52, 4, 4.5, AZ1); // core behind room
  b.box('concreteDark', -10, 4.2, AZ + 3, 4, 4.5, 52); // slab band above storefront

  // ---------------- interior room (x -10..4, z 43..52, floor 0.15, ceiling 3.3)
  const RX0 = -10, RX1 = 4, RZ0 = 43, RZ1 = 52, RY0 = 0.15, RY1 = 3.3;
  b.floor('interiorFloor', RX0, RZ0, RX1, RZ1, RY0 + 0.005);
  b.wallX('interiorWall', RZ0, RZ1, RY0, 4.2, RX0 + 0.01, true);
  b.wallX('interiorWall', RZ0, RZ1, RY0, 4.2, RX1 - 0.01, false);
  b.wallZ('interiorWall', RX0, RX1, RY0, 4.2, RZ1 - 0.01, false);
  // storefront: clear glass + frames
  b.box('glassClear', RX0, RY0, RZ0 - 0.01, RX1, 4.2, RZ0 + 0.01);
  for (let x = RX0; x <= RX1 + 0.01; x += 2) b.box('windowFrame', x - 0.05, RY0, RZ0 - 0.08, x + 0.05, 4.2, RZ0 + 0.08);
  b.box('windowFrame', RX0, RY0, RZ0 - 0.08, RX1, RY0 + 0.12, RZ0 + 0.08);
  b.box('windowFrame', RX0, 2.95, RZ0 - 0.06, RX1, 3.05, RZ0 + 0.06);
  // furniture: desks with monitors, chairs, bookshelves
  for (const [dx, dz] of [[-7, 46.5], [-3, 46.5], [-7, 49.5], [-3, 49.5]]) {
    b.box('wood', dx - 0.8, 0.88, dz - 0.4, dx + 0.8, 0.92, dz + 0.4);
    b.box('metal', dx - 0.75, RY0, dz - 0.35, dx - 0.7, 0.88, dz + 0.35);
    b.box('metal', dx + 0.7, RY0, dz - 0.35, dx + 0.75, 0.88, dz + 0.35);
    b.box('screen', dx - 0.3, 1.0, dz + 0.15, dx + 0.3, 1.36, dz + 0.17);
    b.box('metal', dx - 0.32, 0.98, dz + 0.17, dx + 0.32, 1.38, dz + 0.2);
    b.box('metal', dx - 0.03, 0.92, dz + 0.2, dx + 0.03, 1.0, dz + 0.24);
    b.box('fabric', dx - 0.27, 0.45, dz - 0.95, dx + 0.27, 0.55, dz - 0.45);
    b.box('fabric', dx - 0.27, 0.55, dz - 1.0, dx + 0.27, 1.05, dz - 0.92);
    b.cyl('metal', dx, dz - 0.7, 0.03, RY0, 0.45, 8);
  }
  for (const z of [44.5, 47.5]) {
    b.box('bookshelf', RX1 - 0.45, RY0, z, RX1 - 0.02, 2.2, z + 2.6);
    for (let y = 0.5; y < 2.1; y += 0.42) b.box('fabric', RX1 - 0.4, y, z + 0.1, RX1 - 0.12, y + 0.3, z + 2.5);
  }
  // ceiling (faces down) + light fixtures
  const ceilMesh = new THREE.Mesh(
    (() => {
      const g = new THREE.PlaneGeometry(RX1 - RX0, RZ1 - RZ0);
      g.rotateX(Math.PI / 2);
      g.translate((RX0 + RX1) / 2 + O.x, RY1 + O.y, (RZ0 + RZ1) / 2 + O.z);
      const ng = g.toNonIndexed();
      ng.deleteAttribute('uv');
      worldUV(ng);
      return ng;
    })(),
    getMaterial('interiorCeiling'),
  );
  ceilMesh.receiveShadow = true;
  world.scene.add(ceilMesh);
  const lightSpots: [number, number][] = [[-6.5, 46], [-2.5, 46], [-6.5, 50], [-2.5, 50]];
  for (const [lx, lz] of lightSpots) b.box('lightFixture', lx - 0.6, RY1 - 0.02, lz - 0.6, lx + 0.6, RY1 - 0.005, lz + 0.6);
  // two point lights cover the four fixtures (each light = 2 fixtures' worth)
  for (const lz of [46, 50]) {
    const pl = new THREE.PointLight(0xfff1e0, LIGHT_UNITS.interiorTarget * 2.4 * 2.4 * 1.6, 12, 2);
    pl.position.set(-4.5 + O.x, RY1 - 0.3 + O.y, lz + O.z);
    pl.name = 'gfxtest.interiorLight';
    world.scene.add(pl);
  }
  world.addInterior({ id: 'gfxtest-room', name: 'GFX test room', box: new THREE.Box3(new THREE.Vector3(RX0, 0, RZ0).add(O), new THREE.Vector3(RX1, RY1, RZ1).add(O)) });

  // ---------------- brick building with punched windows (x 30..55, z 42..56)
  const BX0 = 30, BX1 = 55, BZ = 42, BZ1 = 56, BH = 13.6;
  b.box('brick', BX0, 0.15, BZ + 0.3, BX1, BH, BZ1);
  b.box('glass', BX0 + 0.2, 0.9, BZ + 0.29, BX1 - 0.2, BH - 0.8, BZ + 0.3);
  const bFloors = [0.15, 4.55, 8.95];
  const winXs: number[] = [];
  for (let x = BX0 + 2.0; x + 1.6 < BX1 - 1.0; x += 3.2) winXs.push(x);
  for (const fy of bFloors) {
    b.box('brick', BX0, fy, BZ, BX1, fy + 0.95, BZ + 0.3);
    b.box('brick', BX0, fy + 3.15, BZ, BX1, fy + 4.4, BZ + 0.3);
    let px = BX0;
    for (const wx of winXs) {
      b.box('brick', px, fy + 0.95, BZ, wx, fy + 3.15, BZ + 0.3);
      b.box('concreteSmooth', wx - 0.08, fy + 0.87, BZ - 0.06, wx + 1.68, fy + 0.95, BZ + 0.3); // stone sill
      b.box('windowFrame', wx, fy + 0.95, BZ + 0.22, wx + 1.6, fy + 1.02, BZ + 0.29);
      b.box('windowFrame', wx, fy + 3.08, BZ + 0.22, wx + 1.6, fy + 3.15, BZ + 0.29);
      b.box('windowFrame', wx, fy + 2.2, BZ + 0.22, wx + 1.6, fy + 2.26, BZ + 0.29);
      b.box('windowFrame', wx, fy + 0.95, BZ + 0.22, wx + 0.06, fy + 3.15, BZ + 0.29);
      b.box('windowFrame', wx + 1.54, fy + 0.95, BZ + 0.22, wx + 1.6, fy + 3.15, BZ + 0.29);
      px = wx + 1.6;
    }
    b.box('brick', px, fy + 0.95, BZ, BX1, fy + 3.15, BZ + 0.3);
  }
  b.box('concreteSmooth', BX0 - 0.1, BH, BZ - 0.1, BX1 + 0.1, BH + 0.25, BZ1 + 0.1); // coping
  b.floor('roof', BX0 + 0.3, BZ + 0.3, BX1 - 0.3, BZ1 - 0.3, BH + 0.26);

  // ---------------- dark concrete tower with ribbon windows (x -75..-50, z 30..55)
  const TX0 = -75, TX1 = -50, TZ = 30, TZ1 = 55, TH = 46.8;
  b.box('concreteDark', TX0, 0, TZ, TX1, TH, TZ1);
  for (let fy = 4; fy < TH - 3; fy += 3.9) {
    b.box('glass', TX0 + 0.6, fy + 1.0, TZ - 0.02, TX1 - 0.6, fy + 2.7, TZ);
    b.box('glass', TX1, fy + 1.0, TZ + 0.6, TX1 + 0.02, fy + 2.7, TZ1 - 0.6);
    for (let x = TX0 + 0.6; x <= TX1 - 0.59; x += 1.55) b.box('windowFrame', x - 0.04, fy + 1.0, TZ - 0.07, x + 0.04, fy + 2.7, TZ - 0.02);
    for (let z = TZ + 0.6; z <= TZ1 - 0.59; z += 1.55) b.box('windowFrame', TX1 + 0.02, fy + 1.0, z - 0.04, TX1 + 0.07, fy + 2.7, z + 0.04);
  }
  b.floor('roof', TX0 + 0.3, TZ + 0.3, TX1 - 0.3, TZ1 - 0.3, TH + 0.01);

  // ---------------- street furniture
  for (const x of [-40, -10, 20, 50]) {
    b.cyl('metal', x, 10.6, 0.09, 0.15, 8.5, 10);
    b.box('metal', x - 0.05, 8.3, 8.2, x + 0.05, 8.4, 10.6);
    b.box('metal', x - 0.25, 8.15, 7.9, x + 0.25, 8.3, 8.5);
  }
  for (const x of [-20, 30]) {
    b.box('wood', x - 0.9, 0.45, 13, x + 0.9, 0.5, 13.45);
    b.box('wood', x - 0.9, 0.55, 13.45, x + 0.9, 0.9, 13.5);
    b.box('metal', x - 0.8, 0.15, 13.05, x - 0.74, 0.45, 13.4);
    b.box('metal', x + 0.74, 0.15, 13.05, x + 0.8, 0.45, 13.4);
  }
  // a stand-in tree (bark trunk + foliage shell) to preview those materials
  b.cyl('bark', -22, 26, 0.22, 0.15, 4.5, 12);
  const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 3), getMaterial('foliage'));
  canopy.position.set(-22 + O.x, 7 + O.y, 26 + O.z);
  canopy.scale.set(1, 0.85, 1);
  canopy.castShadow = canopy.receiveShadow = true;
  {
    const g = canopy.geometry;
    const p = g.attributes.position as THREE.BufferAttribute;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i).normalize();
      uv[i * 2] = (Math.atan2(v.z, v.x) / (2 * Math.PI)) * 20;
      uv[i * 2 + 1] = Math.acos(v.y) * 3.2;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  world.scene.add(canopy);

  b.build(world, { colliders: true, noShadow: ['roadMarking', 'roadMarkingYellow', 'lightFixture', 'screen'] });

  // ---------------- viewpoints (world coordinates)
  const vp = (name: string, eye: [number, number, number], at: [number, number, number], fov = 60) =>
    world.addViewpoint(name, {
      position: new THREE.Vector3(...eye).add(O),
      target: new THREE.Vector3(...at).add(O),
      fov,
    });
  vp('gfx-street', [-48, 1.7, 9.5], [10, 7, 36], 62);
  vp('gfx-facade', [-6, 1.7, 22], [-4, 11, 40], 65);
  vp('gfx-closeup', [-27.6, 1.65, 44], [-25, 1.9, 45.2], 60);
  vp('gfx-brick', [36, 1.7, 33], [44, 5, 42], 60);
  vp('gfx-ground', [-8, 1.7, 4.5], [-2, 0, 12], 70);
  vp('gfx-interior', [2.6, 1.6, 51], [-6, 1.0, 44], 70);
  vp('gfx-aerial', [-95, 85, -60], [-10, 0, 35], 55);
  world.spawn.copy(new THREE.Vector3(-40, 1.0, 10).add(O));
}
