import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CampusData } from '../../core/campusData';
import { World } from '../../core/world';
import { LIB } from './daleyLibrary';
import { buildLandmarks } from './index';

const data = Object.values(import.meta.glob('../../../public/data/campus.json', { eager: true, import: 'default' }))[0] as CampusData;

async function build() {
  const world = new World();
  const res = await buildLandmarks(world, data);
  world.scene.updateMatrixWorld(true);
  return { world, res };
}

/**
 * Walk test: probe a path with rays against the colliders the way a 0.35 m capsule with 0.22 m
 * autostep would experience it: there must always be ground underneath, never a step up > 0.22 m,
 * and nothing solid at knee/chest/head height between consecutive points.
 */
function walk(world: World, pts: THREE.Vector3[], step = 0.2) {
  const ray = new THREE.Raycaster();
  const cols = world.colliders;
  const down = new THREE.Vector3(0, -1, 0);
  const groundAt = (p: THREE.Vector3, fromY: number) => {
    ray.set(new THREE.Vector3(p.x, fromY, p.z), down);
    ray.far = 3;
    const hit = ray.intersectObjects(cols, false)[0];
    return hit ? hit.point.y : null;
  };
  let y = groundAt(pts[0], pts[0].y + 1.0);
  if (y === null) throw new Error('no ground at start');
  const problems: string[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let j = 1; j <= n; j++) {
      const p = a.clone().lerp(b, j / n);
      const prev = a.clone().lerp(b, (j - 1) / n);
      const dir = new THREE.Vector3(p.x - prev.x, 0, p.z - prev.z);
      const len = dir.length();
      dir.normalize();
      for (const h of [0.45, 1.0, 1.6]) {
        ray.set(new THREE.Vector3(prev.x, y + h, prev.z), dir);
        ray.far = len + 0.3;
        const hit = ray.intersectObjects(cols, false)[0];
        if (hit && hit.object.userData.collider.tag !== 'stair-ramp')
          problems.push(`blocked by ${hit.object.userData.collider.tag} at seg ${i} (${p.x.toFixed(1)}, ${(y + h).toFixed(2)}, ${p.z.toFixed(1)})`);
      }
      const g = groundAt(p, y + 0.23);
      if (g === null) problems.push(`no ground at seg ${i} (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
      else y = g;
      if (problems.length > 5) return { problems, y };
    }
  }
  return { problems, y };
}

describe('walkability (ray probes against colliders)', () => {
  it('spawn -> main doors -> lobby -> stairs -> 2nd, 3rd and 4th floor', async () => {
    const { world, res } = await build();
    const { ctx, toWorld } = res.library!;
    const S = LIB.stair;
    const st = ctx.stairs[0];
    const xa = (st.flightA[0] + st.flightA[1]) / 2;
    const xb = (st.flightB[0] + st.flightB[1]) / 2;
    const zLand = S.zEnd - 0.9;
    const path = [world.spawn.clone(), toWorld(ctx.hx + 1, 0, 0), toWorld(10, 0, 0.5), toWorld(xa, 0, 2.5)];
    const F = LIB.floorY;
    for (let i = 0; i < F.length - 1; i++)
      path.push(toWorld(xa, 0, S.z0 - 0.6), toWorld(xa, 0, zLand), toWorld(xb, 0, zLand), toWorld(xb, 0, S.z0 - 0.8), toWorld(xa, 0, S.z0 - 0.8));
    const r = walk(world, path);
    expect(r.problems).toEqual([]);
    expect(r.y).toBeCloseTo(F[F.length - 1], 1);
  });

  it('enters through the IDEA Commons and West doors', async () => {
    const { world, res } = await build();
    const { ctx, toWorld } = res.library!;
    const zi = (ctx.zk(LIB.ideaDoorBay) + ctx.zk(LIB.ideaDoorBay + 1)) / 2;
    const zw = (ctx.zk(LIB.westDoorBay) + ctx.zk(LIB.westDoorBay + 1)) / 2;
    expect(walk(world, [toWorld(ctx.hx + 5, 0.3, zi), toWorld(ctx.hx - 3, 0.3, zi)]).problems).toEqual([]);
    expect(walk(world, [toWorld(-ctx.hx - 2, 0.3, zw), toWorld(-ctx.hx + 3, 0.3, zw)]).problems).toEqual([]);
  });

  it('University Hall lobby is reachable through the east doors', async () => {
    const { world, res } = await build();
    const uh = res.universityHall!;
    const f = uh.frame;
    const L = (x: number, z: number) => {
      const c = Math.cos(f.rotY);
      const s = Math.sin(f.rotY);
      return new THREE.Vector3(f.origin.x + x * c + z * s, 0.3, f.origin.z - x * s + z * c);
    };
    const dz = (uh.tierHalfZ[0] * 2) / 12;
    const r = walk(world, [L(uh.halfX + 6, dz), L(uh.halfX - 4, dz), L(5.5, 10)]);
    expect(r.problems).toEqual([]);
  });
});
