import { describe, expect, it } from 'vitest';
import {
  advancePhase, approach, clamp, damp, jumpSpeed, moveDirection, springArm, strideLength, turnToward, walkPose,
  wrapAngle, yawFromDirection,
} from './math';

const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('moveDirection (input -> world XZ, relative to camera yaw)', () => {
  it('forward at yaw 0 is north (-Z)', () => {
    const d = moveDirection(1, 0, 0);
    close(d.x, 0);
    close(d.z, -1);
  });
  it('right at yaw 0 is east (+X)', () => {
    const d = moveDirection(0, 1, 0);
    close(d.x, 1);
    close(d.z, 0);
  });
  it('rotates with the camera: yaw +90deg (turned left) makes forward = west', () => {
    const d = moveDirection(1, 0, Math.PI / 2);
    close(d.x, -1);
    close(d.z, 0);
  });
  it('normalises diagonals but keeps analog magnitude below 1', () => {
    const d = moveDirection(1, 1, 0.3);
    close(Math.hypot(d.x, d.z), 1);
    const h = moveDirection(0.5, 0, 1.2);
    close(Math.hypot(h.x, h.z), 0.5);
  });
  it('no input gives zero', () => {
    const d = moveDirection(0, 0, 2);
    close(d.x, 0);
    close(d.z, 0);
  });
  it('yawFromDirection is the inverse of the forward vector', () => {
    for (const yaw of [-2.5, -1, 0, 0.4, 1.7, 3]) {
      const f = moveDirection(1, 0, yaw);
      close(wrapAngle(yawFromDirection(f.x, f.z) - yaw), 0, 1e-9);
    }
  });
});

describe('angles and smoothing', () => {
  it('wrapAngle stays in [-PI, PI)', () => {
    close(Math.abs(wrapAngle(3 * Math.PI)), Math.PI, 1e-9);
    close(wrapAngle(0.5 + 6 * Math.PI), 0.5, 1e-9);
    close(wrapAngle(-Math.PI / 2 - 4 * Math.PI), -Math.PI / 2, 1e-9);
  });
  it('turnToward takes the short way and never overshoots', () => {
    close(turnToward(3, -3, 0.1), wrapAngle(3.1), 1e-9); // across the +-PI seam
    close(turnToward(0, 0.05, 0.1), 0.05);
  });
  it('damp is frame-rate independent', () => {
    const once = damp(5, 0.1);
    const twice = 1 - (1 - damp(5, 0.05)) ** 2;
    close(once, twice, 1e-12);
  });
  it('approach / clamp', () => {
    expect(approach(0, 1, 0.3)).toBe(0.3);
    expect(approach(1, 0, 2)).toBe(0);
    expect(clamp(5, 0, 1)).toBe(1);
  });
  it('jumpSpeed reaches the requested height', () => {
    const v = jumpSpeed(0.5, 9.81);
    close((v * v) / (2 * 9.81), 0.5, 1e-12);
  });
});

describe('springArm (camera collision clamp)', () => {
  const opts = { hardMin: 0.25, returnRate: 4, margin: 0.05 };
  it('uses the full length when nothing is hit', () => {
    expect(springArm(3, null, 3, 1 / 60, opts)).toBe(3);
  });
  it('snaps in immediately when a wall is closer than the current arm', () => {
    expect(springArm(3, 1.2, 3, 1 / 60, opts)).toBeCloseTo(1.15, 10);
  });
  it('never goes below the hard minimum', () => {
    expect(springArm(3, 0.0, 3, 1 / 60, opts)).toBe(0.25);
  });
  it('eases back out (does not jump) after the obstacle is gone, never past the limit', () => {
    let arm = 1;
    arm = springArm(3, null, arm, 1 / 60, opts);
    expect(arm).toBeGreaterThan(1);
    expect(arm).toBeLessThan(1.2);
    for (let i = 0; i < 600; i++) arm = springArm(3, null, arm, 1 / 60, opts);
    expect(arm).toBeLessThanOrEqual(3);
    expect(arm).toBeGreaterThan(2.99);
    // easing out stops at a new obstacle
    expect(springArm(3, 2, 1.5, 1, opts)).toBeLessThanOrEqual(1.95);
  });
});

describe('walk-cycle animation', () => {
  it('phase advances with distance and wraps to [0, 1)', () => {
    let p = 0;
    const speed = 1.4;
    for (let i = 0; i < 600; i++) {
      p = advancePhase(p, speed, 1 / 60);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
    // 10 s at 1.4 m/s = 14 m = 14 / stride cycles
    const cycles = 14 / strideLength(speed);
    close(p, cycles - Math.floor(cycles), 1e-6);
    expect(advancePhase(0.3, 0, 1)).toBe(0.3);
  });
  it('standing pose is neutral', () => {
    const s = walkPose(0.37, 0);
    expect(Math.abs(s.leftHip)).toBeLessThan(1e-9);
    expect(Math.abs(s.rightShoulder)).toBeLessThan(1e-9);
    expect(s.bob).toBe(0);
  });
  it('arms and legs swing in opposition, more when running', () => {
    const walk = walkPose(0.25, 1.4);
    expect(walk.leftHip).toBeGreaterThan(0.2);
    expect(walk.rightHip).toBeCloseTo(-walk.leftHip, 10);
    expect(Math.sign(walk.leftShoulder)).toBe(-Math.sign(walk.leftHip));
    const run = walkPose(0.25, 4.5);
    expect(run.leftHip).toBeGreaterThan(walk.leftHip);
    expect(run.lean).toBeGreaterThan(walk.lean);
    for (const ph of [0, 0.1, 0.5, 0.8]) {
      const p = walkPose(ph, 3);
      expect(p.leftKnee).toBeGreaterThanOrEqual(0);
      expect(p.rightKnee).toBeGreaterThanOrEqual(0);
    }
  });
  it('half a cycle later the legs have swapped', () => {
    const a = walkPose(0.2, 2);
    const b = walkPose(0.7, 2);
    expect(b.leftHip).toBeCloseTo(a.rightHip, 10);
  });
});
