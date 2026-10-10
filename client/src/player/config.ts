/**
 * Tunable player constants. OWNER: Player Engineer.
 * Everything is in meters, seconds and radians unless the name says otherwise.
 *
 * Other modules (e.g. missions) may change `speedScale` at runtime (the plan uses ~2x real speed
 * for timed missions): `player.setSpeedScale(2)`.
 */
export const PLAYER_CONFIG = {
  // --- movement -----------------------------------------------------------------------------
  /** Real human walking pace. */
  walkSpeed: 1.4,
  /** Jog / run (Shift). */
  runSpeed: 4.5,
  /** Multiplies walk and run speed (missions may use 2). */
  speedScale: 1,
  /** How fast horizontal speed approaches the target on the ground (m/s^2). */
  groundAccel: 14,
  /** Same, in the air (little air control). */
  airAccel: 3,
  gravity: 9.81,
  maxFallSpeed: 40,
  /** Peak height of a jump (feet clear the ground by this much). */
  jumpHeight: 0.5,
  /** Grace period after walking off a ledge in which a jump still works. */
  coyoteTime: 0.12,
  /** A jump pressed slightly before landing still triggers. */
  jumpBuffer: 0.12,

  // --- body (kinematic capsule) -------------------------------------------------------------
  radius: 0.35,
  /** Total capsule height (feet to top of head). */
  height: 1.75,
  /** Small gap Rapier keeps between the capsule and the world. */
  skin: 0.02,
  /** Max stair riser / curb the character steps up automatically. */
  stepHeight: 0.22,
  /** Free space needed on top of a step (stair tread is usually 0.28). */
  stepMinWidth: 0.12,
  /** Keeps the character glued to the ground going down stairs / ramps. */
  snapDistance: 0.3,
  /** Steepest slope the character can walk up. */
  maxSlope: (45 * Math.PI) / 180,
  /** Slopes steeper than this make the character slide down. */
  slideSlope: (50 * Math.PI) / 180,
  /** If the character falls below this height it is put back at the spawn point. */
  killY: -60,

  // --- camera --------------------------------------------------------------------------------
  eyeHeight: 1.62,
  /** Third-person camera arm length (scroll wheel changes it within min/max). */
  camDistance: 3.4,
  camMinDistance: 1.4,
  camMaxDistance: 7,
  /** Over-the-shoulder offset to the right of the character. */
  camShoulder: 0.42,
  /** Height of the third-person pivot above the feet. */
  camPivotHeight: 1.6,
  /** Pitch is the camera's angle ABOVE the horizontal (positive = looking down at the player). */
  camPitchMin: (-40 * Math.PI) / 180,
  camPitchMax: (70 * Math.PI) / 180,
  fpPitchMin: (-85 * Math.PI) / 180,
  fpPitchMax: (85 * Math.PI) / 180,
  /** Radius of the sphere swept along the camera arm (keeps the near plane out of walls). */
  camProbeRadius: 0.22,
  /** How close the camera may get to the pivot when a wall is in the way. */
  camHardMin: 0.25,
  /** Rate the arm grows back after an obstacle is gone (1/s, exponential). Pull-in is instant. */
  camReturnRate: 4,
  /** Follow smoothing of the pivot (1/s, exponential). */
  camFollowRate: 18,
  mouseSensitivity: 0.0022,

  // --- simulation ----------------------------------------------------------------------------
  fixedDt: 1 / 60,
  /** Enough to fully simulate the largest frame dt main.ts allows (0.1 s). */
  maxSubsteps: 8,
  /** Triangles are bucketed into square cells of this size (m) to keep each trimesh compact. */
  colliderCell: 48,
};

export type PlayerConfig = typeof PLAYER_CONFIG;
