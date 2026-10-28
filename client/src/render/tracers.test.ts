import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createTracers, TRACER, tracerSpan, tracerWidth } from './tracers';
import { shotPan, shotVolume, GUN_SOUND } from '../audio/gunSound';

describe('tracers', () => {
  it('streak runs from the barrel to the hit and never past it', () => {
    expect(tracerSpan(30, 0)).toEqual({ tail: 0, head: 0 });
    const mid = tracerSpan(30, TRACER.life / 2);
    expect(mid.head).toBeGreaterThan(0); expect(mid.head - mid.tail).toBeLessThanOrEqual(TRACER.streak);
    expect(tracerSpan(30, TRACER.life).head).toBe(30);
    expect(tracerSpan(2, TRACER.life * 0.9).head).toBeLessThanOrEqual(2);
  });
  it('stays at least a few pixels wide far away', () => {
    expect(tracerWidth(1)).toBe(TRACER.width);
    expect(tracerWidth(100)).toBeCloseTo(100 * TRACER.minAngle);
    expect(tracerWidth(100)).toBeGreaterThan(TRACER.width);
  });
  it('pools and fades out', () => {
    const scene = new THREE.Scene();
    const t = createTracers(scene);
    for (let i = 0; i < TRACER.pool + 10; i++) t.add({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 20 });
    t.update(0.01);
    expect(t.active).toBe(TRACER.pool);
    t.update(TRACER.life);
    expect(t.active).toBe(0);
    t.dispose();
    expect(scene.children.length).toBe(0);
  });
});

describe('gun sound mixing', () => {
  it('gets quieter with distance', () => {
    expect(shotVolume(1)).toBe(GUN_SOUND.volume);
    expect(shotVolume(20)).toBeLessThan(shotVolume(10));
    expect(shotVolume(500)).toBe(0);
  });
  it('pans toward the side the shot came from', () => {
    const ear = { x: 0, y: 0, z: 0 };
    expect(shotPan({ x: 10, y: 0, z: 0 }, ear, 0)).toBeCloseTo(1);
    expect(shotPan({ x: -10, y: 0, z: 0 }, ear, 0)).toBeCloseTo(-1);
    expect(shotPan({ x: 0, y: 0, z: -10 }, ear, 0)).toBeCloseTo(0);
  });
});
