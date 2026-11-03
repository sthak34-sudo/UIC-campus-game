import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '../player/camera';
import { PLAYER_CONFIG } from '../player/config';
import { damageReaction, zonePulseStep, ZONE_PULSE_EVERY, type DamageSource } from './damageRules';
import { startHeal, stepHeal, type HealChannel } from './heal';

describe('zone damage (CMB-01)', () => {
  it('does not flinch or cancel heals; bullets still do', () => {
    expect(damageReaction('zone')).toEqual({ flinch: false, cancelHeal: false });
    expect(damageReaction('bullet')).toEqual({ flinch: true, cancelHeal: true });
    expect(damageReaction('debug')).toEqual({ flinch: true, cancelHeal: true });
  });

  it('120 zone ticks leave the camera kick at 0 and the bandage channel running', () => {
    const cam = new THREE.PerspectiveCamera();
    const rig = new CameraRig(cam, PLAYER_CONFIG, { sweepSphere: () => null });
    const feet = new THREE.Vector3();
    let heal: HealChannel | null = startHeal('bandage');
    const hit = (source: DamageSource) => {
      const r = damageReaction(source);
      if (r.cancelHeal) heal = null;
      if (r.flinch) rig.kick(undefined, 1);
    };
    for (let i = 0; i < 120; i++) {
      hit('zone');
      heal = heal ? stepHeal(heal, 1 / 60).channel : null;
      rig.update(1 / 60, feet);
    }
    expect(rig.kickOffset.pitch).toBe(0);
    expect(rig.kickOffset.yaw).toBe(0);
    expect(heal).not.toBeNull();
    // For contrast: a bullet hit does kick and cancel.
    hit('bullet');
    expect(rig.kickOffset.pitch).toBeGreaterThan(0);
    expect(heal).toBeNull();
  });

  it('pulses the red edge once per second while the zone keeps ticking', () => {
    let cd = 0;
    let pulses = 0;
    for (let i = 0; i < 180; i++) {
      const r = zonePulseStep(cd, 1 / 60, true);
      cd = r.cooldown;
      if (r.pulse) pulses++;
    }
    expect(pulses).toBe(Math.ceil(3 / ZONE_PULSE_EVERY));
    expect(zonePulseStep(0, 1 / 60, false).pulse).toBe(false);
  });
});
