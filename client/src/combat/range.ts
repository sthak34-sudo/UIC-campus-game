/**
 * Where the practice dummies and loot crates stand, relative to the player spawn.
 * The library apron only extends a couple of meters behind the spawn, so the
 * range runs along the facade, to the player's right as they face the doors.
 */
import type { LootKind } from './inventory';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface LootSpot {
  kind: LootKind;
  position: Vec3;
  /** Taken for good (match loot) instead of respawning (practice range). */
  once?: boolean;
}

export interface PracticeLayout {
  dummies: Vec3[];
  loot: LootSpot[];
  /** A camera for the `combat-range` screenshot. */
  camera: Vec3;
  lookAt: Vec3;
}

function add(spawn: Vec3, back: Vec3, right: Vec3, backM: number, sideM: number, yLift = 0): Vec3 {
  return {
    x: spawn.x + back.x * backM + right.x * sideM,
    y: spawn.y + yLift,
    z: spawn.z + back.z * backM + right.z * sideM,
  };
}

export function practiceLayout(spawn: Vec3, yaw: number): PracticeLayout {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const back = { x: -fx, y: 0, z: -fz };
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  const at = (backM: number, sideM: number, yLift = 0) => add(spawn, back, right, backM, sideM, yLift);
  return {
    // About a meter off the doors, still on the entrance apron, spaced along the walk.
    dummies: [at(1.1, 8), at(1.1, 11), at(1.1, 14)],
    loot: [
      { kind: 'gun', position: at(1.35, 3.4) },
      { kind: 'ammo', position: at(1.35, 4.6) },
      { kind: 'medkit', position: at(1.35, 5.8) },
      { kind: 'armor', position: at(1.35, 7.0) },
    ],
    // From the open side of the walk, so the dummies read against the library wall.
    camera: at(4.2, 5.2, 1.55),
    lookAt: at(1.15, 11.5, 1.2),
  };
}

/** Starter rifle: this far ahead of the player's feet (m), and a little to the right, so it is on screen at load. */
export const STARTER_RIFLE = { ahead: 1.8, right: 0.6 };

/**
 * Where the starter rifle lies: just in front of where the player actually stands, facing `yaw`
 * (the same facing as the spawn camera), at the player's floor height.
 */
export function starterRifleSpot(feet: Vec3, yaw: number): Vec3 {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  return {
    x: feet.x + fx * STARTER_RIFLE.ahead + rx * STARTER_RIFLE.right,
    y: feet.y,
    z: feet.z + fz * STARTER_RIFLE.ahead + rz * STARTER_RIFLE.right,
  };
}
