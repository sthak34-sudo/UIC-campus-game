import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CampusData } from '../../core/campusData';
import { World } from '../../core/world';
import { buildLandmarks } from './index';
import { LIB } from './daleyLibrary';
import { UH } from './universityHall';

// Vite's JSON import (no Node types needed in the client tsconfig)
const data = Object.values(import.meta.glob('../../../public/data/campus.json', { eager: true, import: 'default' }))[0] as CampusData;

async function build() {
  const world = new World();
  const res = await buildLandmarks(world, data);
  world.scene.updateMatrixWorld(true);
  return { world, res };
}

function stats(world: World) {
  let tris = 0;
  let meshes = 0;
  let books = 0;
  world.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible || o.name.startsWith('collider')) return;
    const idx = m.geometry.index;
    const t = (idx ? idx.count : m.geometry.getAttribute('position').count) / 3;
    if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) {
      books += (m as unknown as THREE.InstancedMesh).count;
      tris += t * (m as unknown as THREE.InstancedMesh).count;
    } else tris += t;
    meshes++;
  });
  return { tris, meshes, books };
}

describe('landmarks', () => {
  it('builds both landmarks with viewpoints, interiors and a spawn in front of the library', async () => {
    const { world, res } = await build();
    expect(res.universityHall).toBeDefined();
    expect(res.library).toBeDefined();
    for (const v of ['uh-from-quad', 'uh-base', 'library-exterior', 'library-entrance', 'library-commons', 'library-stairs', 'library-stacks'])
      expect(world.viewpoints.has(v), v).toBe(true);
    expect(world.interiors.filter((z) => z.id === 'daley-library').length).toBeGreaterThan(3);
    // spawn is outside the library but within ~10 m of the main doors
    const lib = res.library!;
    expect(world.interiorAt(world.spawn)).toBeUndefined();
    expect(world.spawn.distanceTo(lib.mainDoor)).toBeLessThan(10);
    // the library-commons viewpoint is inside the library
    expect(world.interiorAt(world.viewpoints.get('library-commons')!.position)?.id).toBe('daley-library');
    expect(world.interiorAt(world.viewpoints.get('library-stacks')!.position)?.id).toBe('daley-library');
    const s = stats(world);
    console.log('landmark stats', s, 'colliders', world.colliders.length);
    expect(s.books).toBeGreaterThan(20000);
    expect(s.books).toBeLessThan(120000);
  });

  it('places University Hall on its footprint with the real tier widths and height', async () => {
    const { res } = await build();
    const uh = res.universityHall!;
    expect(uh.tierHalfZ.map((h) => (h * 2) / 0.3048)).toEqual([150, 160, 170].map((v) => expect.closeTo(v, 1)));
    expect(uh.roofY).toBeGreaterThan(101);
    expect(uh.topY).toBeGreaterThan(103);
    expect(uh.topY).toBeLessThan(105);
    expect(uh.halfX * 2).toBeGreaterThan(20);
    expect(uh.halfX * 2).toBeLessThan(24);
    expect(Math.abs(uh.frame.rotY)).toBeLessThan(THREE.MathUtils.degToRad(3));
    expect(UH.floors).toBe(28);
  });

  it('University Hall has 3 stepped tiers, projecting fins, and a tight exterior draw-call budget', async () => {
    const { res } = await build();
    const uh = res.universityHall!;
    expect(UH.tierBays).toEqual([30, 32, 34]);
    expect(UH.tierTopFloor).toEqual([8, 16, 28]);
    expect(uh.tierHalfZ[2]).toBeGreaterThan(uh.tierHalfZ[1]!);
    expect(uh.tierHalfZ[1]).toBeGreaterThan(uh.tierHalfZ[0]!);
    expect(UH.finOut).toBeGreaterThan(0.4);
    expect(UH.finW).toBeLessThan(UH.pierW);
    expect(uh.finCount).toBeGreaterThan(500);
    // Exterior is one mesh per material; fins reuse concrete so draw calls stay flat (±3).
    expect(uh.exteriorDrawCalls).toBeGreaterThan(0);
    expect(uh.exteriorDrawCalls).toBeLessThanOrEqual(12);
  });

  it('library main block matches the footprint (≈40 x 132 m) and the LiDAR roof', async () => {
    const { res } = await build();
    const { ctx } = res.library!;
    expect(ctx.hx * 2).toBeGreaterThan(38);
    expect(ctx.hx * 2).toBeLessThan(42);
    expect(ctx.hz * 2).toBeGreaterThan(128);
    expect(ctx.hz * 2).toBeLessThan(136);
    expect(LIB.parapetY).toBeGreaterThan(17.5);
    expect(LIB.parapetY).toBeLessThan(19.5);
  });

  it('every library stair has comfortable steps, enough width, and reaches the next floor', async () => {
    const { res } = await build();
    const { ctx } = res.library!;
    expect(ctx.stairs.length).toBe(LIB.floorY.length - 1);
    ctx.stairs.forEach((s, i) => {
      expect(s.rise).toBeLessThanOrEqual(0.18);
      expect(s.rise).toBeGreaterThan(0.15);
      expect(s.run).toBeCloseTo(0.28);
      expect(s.risers * s.rise).toBeCloseTo(LIB.floorY[i + 1] - LIB.floorY[i], 5);
      expect(s.flightA[1] - s.flightA[0]).toBeGreaterThanOrEqual(1.5);
      expect(s.flightB[1] - s.flightB[0]).toBeGreaterThanOrEqual(1.5);
    });
  });

  it('stair ramps are walkable slopes and doorways are wide/tall enough', async () => {
    const { world } = await build();
    const ramps = world.colliders.filter((c) => c.userData.collider?.tag === 'stair-ramp');
    expect(ramps.length).toBe((LIB.floorY.length - 1) * 2);
    for (const r of ramps) {
      const pitch = Math.abs(r.rotation.x);
      expect(THREE.MathUtils.radToDeg(pitch)).toBeLessThan(35);
      expect(THREE.MathUtils.radToDeg(pitch)).toBeGreaterThan(25);
    }
    expect(LIB.doorW).toBeGreaterThanOrEqual(1.2);
    expect(LIB.doorH).toBeGreaterThanOrEqual(2.3);
    expect(UH.doorWidth).toBeGreaterThanOrEqual(1.2);
    expect(UH.doorHeight).toBeGreaterThanOrEqual(2.3);
  });

  it('all colliders are invisible unscaled BoxGeometry meshes', async () => {
    const { world } = await build();
    expect(world.colliders.length).toBeGreaterThan(500);
    for (const c of world.colliders) {
      expect(c.geometry).toBeInstanceOf(THREE.BoxGeometry);
      expect(c.visible).toBe(false);
      expect(c.scale.x).toBe(1);
    }
  });
});
