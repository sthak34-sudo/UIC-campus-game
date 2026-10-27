import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CampusData } from '../../core/campusData';
import { planToWorld } from '../../core/geo';
import { MATERIAL_NAMES } from '../../render/materials';
import { meshTriangles, readGlbJson } from './glbJson';
import { BUILDING_MODELS, isReplacedByModel } from './manifest';
import { classifyNode, hasDuplicateSuffix } from './nodes';

const data = Object.values(import.meta.glob('../../../public/data/campus.json', { eager: true, import: 'default' }))[0] as CampusData;
const path = (slug: string) => fileURLToPath(new URL(`../../../public/models/buildings/${slug}.glb`, import.meta.url));

/** Budgets from the buildings integration plan. */
const MAX_BYTES = 1.5e6;
const MAX_LOD0_TRIS = 30000;
const MAX_COLLIDER_TRIS = 5000;
/** 400 wall boxes x 12 tris: the physics shape budget per building. */
const MAX_WALL_TRIS = 400 * 12;

describe('nodes.classifyNode', () => {
  it('recognizes the naming contract', () => {
    expect(classifyNode('quad-lecture-centers_LOD0')).toBe('lod');
    expect(classifyNode('student-center-east_tower_LOD1')).toBe('lod');
    expect(classifyNode('x_walls_col')).toBe('wall-col');
    expect(classifyNode('x_floor_col')).toBe('floor-col');
    expect(classifyNode('x_stair01_col')).toBe('stair-col');
    expect(classifyNode('x_stair_col.001')).toBe('other');
    expect(classifyNode('door_07')).toBe('door');
    expect(classifyNode('loot_spawn_12')).toBe('loot');
    expect(classifyNode('part_lecture_center_a')).toBe('part');
    expect(hasDuplicateSuffix('x_stair_col.001')).toBe(true);
  });
});

for (const model of BUILDING_MODELS) {
  describe(`building glb: ${model.slug}`, () => {
    const buf = readFileSync(path(model.slug));
    const j = readGlbJson(buf);
    const names = j.nodes.map((n) => n.name ?? '');
    const byKind = (k: ReturnType<typeof classifyNode>) => j.nodes.filter((n) => classifyNode(n.name ?? '') === k);

    it('fits the size budget and has no embedded textures', () => {
      expect(statSync(path(model.slug)).size).toBeLessThanOrEqual(MAX_BYTES);
      expect(j.images ?? []).toHaveLength(0);
      expect(j.extensionsRequired ?? []).toContain('EXT_meshopt_compression');
    });

    it('uses only repo material names', () => {
      for (const m of j.materials ?? []) expect(MATERIAL_NAMES).toContain(m.name);
    });

    it('has clean names (no .001 duplicates)', () => {
      expect(names.filter(hasDuplicateSuffix)).toEqual([]);
    });

    it('has LOD0 + LOD1 per group within the triangle budget', () => {
      const lods = byKind('lod');
      const groups = new Map<string, number[]>();
      for (const n of lods) {
        const e = n.extras as { lod_level: number; lod_group: string; lod1_distance_m: number };
        expect(e.lod1_distance_m).toBeGreaterThan(0);
        groups.set(e.lod_group, [...(groups.get(e.lod_group) ?? []), e.lod_level]);
        if (e.lod_level === 0) expect(meshTriangles(j, n.mesh!)).toBeLessThanOrEqual(MAX_LOD0_TRIS);
      }
      for (const levels of groups.values()) expect(levels.sort()).toEqual([0, 1]);
    });

    it('has wall and floor colliders as meshes without materials', () => {
      const cols = [...byKind('wall-col'), ...byKind('floor-col'), ...byKind('stair-col')];
      expect(byKind('wall-col')).toHaveLength(1);
      expect(byKind('floor-col')).toHaveLength(1);
      for (const c of cols) {
        expect(c.mesh).toBeDefined();
        for (const p of j.meshes[c.mesh!]!.primitives) expect(p.material).toBeUndefined();
      }
      const tris = cols.reduce((n, c) => n + meshTriangles(j, c.mesh!), 0);
      expect(tris).toBeLessThanOrEqual(MAX_COLLIDER_TRIS);
      expect(meshTriangles(j, byKind('wall-col')[0]!.mesh!)).toBeLessThanOrEqual(MAX_WALL_TRIS);
    });

    it('has door markers with sane sizes', () => {
      const doors = byKind('door');
      expect(doors.length).toBeGreaterThan(0);
      for (const d of doors) {
        const e = d.extras as { width_m: number; height_m: number; part: string };
        expect(e.width_m).toBeGreaterThanOrEqual(2.4);
        expect(e.height_m).toBeGreaterThanOrEqual(2.5);
        expect(e.part).toBeTruthy();
      }
    });

    it('is placed at planToWorld(plan) from the shared origin', () => {
      const root = j.nodes[j.scenes[0]!.nodes[0]!]!;
      const e = root.extras as { plan_x: number; plan_y: number };
      const w = planToWorld([e.plan_x, e.plan_y]);
      expect(root.translation![0]).toBeCloseTo(w[0], 1);
      expect(root.translation![2]).toBeCloseTo(w[2], 1);
    });

    it('part markers match the manifest and campus.json ids', () => {
      const ids = byKind('part').map((n) => (n.extras as { osm_id: string }).osm_id).sort();
      expect(ids).toEqual([...model.replaces].sort());
      for (const id of model.replaces) {
        const b = data.buildings.find((x) => x.id === id);
        expect(b, id).toBeDefined();
        expect(isReplacedByModel(b!)).toBe(true);
      }
    });
  });
}
