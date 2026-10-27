import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CampusData } from '../../core/campusData';
import { World } from '../../core/world';
import { PLAYER_CONFIG } from '../../player/config';
import { initRapier, PlayerPhysics } from '../../player/physics';
import { LIB } from './daleyLibrary';
import { buildLandmarks } from './index';

const data = Object.values(import.meta.glob('../../../public/data/campus.json', { eager: true, import: 'default' }))[0] as CampusData;

describe("Daley Library's code-built roof", () => {
  let world: World;
  let toWorld: (x: number, y: number, z: number) => THREE.Vector3;
  let hx = 0, hz = 0;
  beforeAll(async () => {
    await initRapier();
    world = new World();
    const res = await buildLandmarks(world, data);
    world.scene.updateMatrixWorld(true);
    ({ toWorld } = res.library!);
    hx = res.library!.ctx.hx; hz = res.library!.ctx.hz;
  }, 120000);

  const settle = (phys: PlayerPhysics, n = 120) => { for (let i = 0; i < n; i++) phys.step(0, 0, 0, false); };

  it('holds a player dropped onto it', () => {
    const top = toWorld(0, LIB.roofY, 0);
    const phys = new PlayerPhysics(top.clone().setY(top.y + 1));
    phys.syncColliders(world.colliders);
    settle(phys);
    expect(phys.feet.y).toBeGreaterThan(top.y - 0.3);
  });

  it('the invisible lip stops a player walking off every edge', () => {
    const top = toWorld(0, LIB.roofY, 0);
    const fell: string[] = [];
    // start ~3 m in from each edge mid-point and walk outward for 3 s
    const starts: [number, number][] = [[hx - 3, 0], [-hx + 3, 0], [0, hz - 3], [0, -hz + 3]];
    for (const [lx, lz] of starts) {
      const p = toWorld(lx, LIB.roofY + 0.2, lz);
      const out = toWorld(lx * 2, LIB.roofY, lz * 2).sub(toWorld(lx, LIB.roofY, lz)).setY(0).normalize();
      const phys = new PlayerPhysics(p);
      phys.syncColliders(world.colliders);
      settle(phys, 30);
      for (let i = 0; i < 180; i++) phys.step(out.x, out.z, PLAYER_CONFIG.walkSpeed * 1.6, false);
      settle(phys, 60);
      if (phys.feet.y < top.y - 0.5) fell.push(`${lx.toFixed(0)},${lz.toFixed(0)} -> feet ${phys.feet.y.toFixed(1)}`);
    }
    expect(fell).toEqual([]);
  });
});
