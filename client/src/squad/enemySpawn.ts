/**
 * Where enemy bot squads start: far from the player (>= ENEMY_SPAWN.minDistM), out of the
 * player's line of sight, on walkable ground (not a roof or inside a wall), inside the safe zone,
 * and spread apart from each other. Engine-free: ground and sight checks are passed in.
 */

export const ENEMY_SPAWN = {
  /** Closest an enemy squad may start to the player (m). */
  minDistM: 150,
  /** Farthest ring we try (m); clipped by the zone. */
  maxDistM: 420,
  /** Rings between min and max, and bearings per ring. */
  rings: 6,
  bearings: 24,
  /** Enemy squads keep at least this far apart at the start (m). */
  squadSpacingM: 60,
  /** Stay this far inside the zone edge (m). */
  zoneMarginM: 15,
  /** Ground under a spot must be within this height of the player's feet (rejects roofs, pits). */
  maxStepM: 4,
  /** Members of a squad stand in a small cluster around the squad spot (m). */
  memberSpreadM: 2.5,
} as const;

/** Seconds at match start when nobody can be hurt (bot rifles and the zone hold off). */
export const SPAWN_GRACE_S = 5;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SpawnCircle {
  x: number;
  z: number;
  radius: number;
}

export interface EnemySpawnEnv {
  /** Feet height of the first walkable surface straight down from high above (x, z), or null. */
  groundAt(x: number, z: number): number | null;
  /** True when a straight line from a to b is blocked by walls / buildings / terrain. */
  blocked(a: Vec3, b: Vec3): boolean;
  zone?: SpawnCircle | null;
}

const EYE = 1.6;

/** Candidate spots, nearest ring first, at evenly spread bearings (deterministic). */
export function spawnCandidates(origin: { x: number; z: number }, zone?: SpawnCircle | null): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const { minDistM, maxDistM, rings, bearings } = ENEMY_SPAWN;
  for (let r = 0; r < rings; r++) {
    const radius = minDistM + 10 + ((maxDistM - minDistM - 10) * r) / Math.max(1, rings - 1);
    for (let b = 0; b < bearings; b++) {
      // Offset each ring by half a step so rings do not line up.
      const a = ((b + (r % 2) * 0.5) / bearings) * Math.PI * 2;
      const p = { x: origin.x + Math.cos(a) * radius, z: origin.z + Math.sin(a) * radius };
      if (zone && Math.hypot(p.x - zone.x, p.z - zone.z) > zone.radius - ENEMY_SPAWN.zoneMarginM) continue;
      out.push(p);
    }
  }
  return out;
}

/** Is a spot a valid enemy start for a player at `player`? */
export function validEnemySpot(player: Vec3, p: { x: number; z: number }, env: EnemySpawnEnv): Vec3 | null {
  if (Math.hypot(p.x - player.x, p.z - player.z) < ENEMY_SPAWN.minDistM) return null;
  const zone = env.zone;
  if (zone && Math.hypot(p.x - zone.x, p.z - zone.z) > zone.radius - ENEMY_SPAWN.zoneMarginM) return null;
  const y = env.groundAt(p.x, p.z);
  if (y === null || Math.abs(y - player.y) > ENEMY_SPAWN.maxStepM) return null;
  const spot = { x: p.x, y, z: p.z };
  const eye = { x: player.x, y: player.y + EYE, z: player.z };
  // Out of sight: both their head and chest must be hidden from the player's eye.
  if (!env.blocked(eye, { x: spot.x, y: spot.y + EYE, z: spot.z })) return null;
  if (!env.blocked(eye, { x: spot.x, y: spot.y + 1.0, z: spot.z })) return null;
  return spot;
}

/**
 * One start spot per enemy squad. Prefers spots spaced apart; if the map cannot fit all with
 * spacing, relaxes spacing (never distance, ground or sight). Returns fewer than `count` only
 * when no valid spot exists at all; callers then fall back to the farthest valid ground.
 */
export function pickEnemySquadSpots(player: Vec3, count: number, env: EnemySpawnEnv): Vec3[] {
  const valid: Vec3[] = [];
  for (const c of spawnCandidates(player, env.zone)) {
    const v = validEnemySpot(player, c, env);
    if (v) valid.push(v);
  }
  const picked: Vec3[] = [];
  for (const spacing of [ENEMY_SPAWN.squadSpacingM, ENEMY_SPAWN.squadSpacingM / 2, 0]) {
    for (const v of valid) {
      if (picked.length >= count) break;
      if (picked.includes(v)) continue;
      if (picked.every((q) => Math.hypot(q.x - v.x, q.z - v.z) >= spacing)) picked.push(v);
    }
    if (picked.length >= count) break;
  }
  return picked;
}

/** Small offset for squad member `slot` around its squad's spot. */
export function memberOffset(slot: number): { x: number; z: number } {
  if (slot === 0) return { x: 0, z: 0 };
  const a = (slot / 4) * Math.PI * 2;
  return { x: Math.cos(a) * ENEMY_SPAWN.memberSpreadM, z: Math.sin(a) * ENEMY_SPAWN.memberSpreadM };
}

/** True while the spawn grace period is running. */
export function inSpawnGrace(elapsedS: number): boolean {
  return elapsedS < SPAWN_GRACE_S;
}
