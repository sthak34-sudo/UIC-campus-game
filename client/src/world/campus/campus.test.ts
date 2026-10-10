import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CampusData } from '../../core/campusData';
import { World } from '../../core/world';
import { buildCampus, campusBuildings } from './index';

const raw = import.meta.glob('../../../public/data/campus.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const data = JSON.parse(Object.values(raw)[0]!) as CampusData;

function stats(root: THREE.Object3D) {
  let calls = 0, tris = 0, shadowTris = 0;
  const by: Record<string, number> = {};
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    const g = m.geometry;
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    const t = ((g.index ? g.index.count : g.getAttribute('position').count) / 3) * inst;
    calls += Math.max(1, g.groups.length);
    tris += t;
    if (m.castShadow) shadowTris += t;
    const k = m.name.replace(/-[-\d,]+$/, '').replace(/-(honeylocust|maple|linden|elm)-\d+/, '');
    by[k] = (by[k] ?? 0) + t;
  });
  return { calls, tris, shadowTris, by };
}

describe('campus build (full campus.json)', () => {
  it('builds every generic building within the performance budget', async () => {
    const world = new World();
    await buildCampus(world, data);
    const root = world.scene.getObjectByName('campus')!;
    const s = stats(root);
    console.info(`draw calls ${s.calls}, triangles ${(s.tris / 1e6).toFixed(2)}M (shadow casters ${(s.shadowTris / 1e6).toFixed(2)}M)`,
      Object.fromEntries(Object.entries(s.by).map(([k, v]) => [k, `${(v / 1e3).toFixed(0)}k`])));
    const generic = new Set(data.buildings.filter((b) => !b.landmark).map((b) => (b as { buildingId?: string }).buildingId ?? b.id));
    expect(campusBuildings.size).toBe(generic.size);
    for (const b of data.buildings.filter((b) => b.landmark)) expect(campusBuildings.has((b as { buildingId?: string }).buildingId ?? b.id)).toBe(false);
    expect(s.calls).toBeLessThan(300);
    expect(s.tris).toBeLessThan(3.5e6);
    for (const name of ['map-aerial', 'map-quad-ground', 'map-halsted', 'map-harrison', 'map-taylor-street']) expect(world.viewpoints.has(name)).toBe(true);
    // geometry sanity: no NaN positions
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const p = m.geometry.getAttribute('position').array as Float32Array;
      for (let i = 0; i < p.length; i += 97) expect(Number.isFinite(p[i]!)).toBe(true);
    });
    expect(world.colliders.length).toBeGreaterThan(1000);
  }, 120_000);
});
