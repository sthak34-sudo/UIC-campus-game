/**
 * Bullet impact sounds (CC0, see CREDITS.md): a sharp crack on walls, a dull thud on the ground.
 * Quieter with distance than gunshots (you hear impacts only fairly close) and panned by side.
 * Loads lazily; silent until the browser allows audio.
 */
import { shotPan } from './gunSound';

type V3 = { x: number; y: number; z: number };
export type ImpactKind = 'wall' | 'ground';

export const IMPACT_SOUND = {
  urls: { wall: 'audio/impact_wall_cc0.ogg', ground: 'audio/impact_ground_cc0.ogg' } as Record<ImpactKind, string>,
  /** Full volume inside this range (m). */
  near: 3,
  /** Silent beyond this range (m). */
  far: 45,
  volume: { wall: 0.35, ground: 0.3 } as Record<ImpactKind, number>,
  /** At most this many impacts start per second. */
  maxPerSecond: 16,
};

/** Volume 0..1 for an impact of `kind` heard `d` meters away. */
export function impactVolume(kind: ImpactKind, d: number): number {
  const { near, far } = IMPACT_SOUND;
  const v = IMPACT_SOUND.volume[kind];
  if (d <= near) return v;
  if (d >= far) return 0;
  return v * (near / d) * (1 - (d - near) / (far - near));
}

export interface ImpactSound {
  play(at: V3, kind: ImpactKind, ear: V3, earYaw: number): void;
}

export function createImpactSound(baseUrl: string): ImpactSound {
  let ctx: AudioContext | null = null;
  const bufs: Partial<Record<ImpactKind, AudioBuffer>> = {};
  let loading = false;
  let windowStart = 0;
  let count = 0;
  const load = () => {
    if (loading || typeof AudioContext === 'undefined') return;
    loading = true;
    ctx = new AudioContext();
    for (const kind of ['wall', 'ground'] as const) {
      fetch(baseUrl + IMPACT_SOUND.urls[kind])
        .then((r) => r.arrayBuffer())
        .then((a) => ctx!.decodeAudioData(a))
        .then((b) => { bufs[kind] = b; })
        .catch(() => { /* missing file: stay silent */ });
    }
  };
  return {
    play(at, kind, ear, earYaw) {
      load();
      const buf = bufs[kind];
      if (!ctx || !buf || ctx.state !== 'running') { void ctx?.resume().catch(() => {}); return; }
      const now = ctx.currentTime;
      if (now - windowStart > 1) { windowStart = now; count = 0; }
      if (++count > IMPACT_SOUND.maxPerSecond) return;
      const vol = impactVolume(kind, Math.hypot(at.x - ear.x, at.y - ear.y, at.z - ear.z));
      if (vol <= 0.001) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.9 + Math.random() * 0.25;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      const pan = ctx.createStereoPanner();
      pan.pan.value = shotPan(at, ear, earYaw) * 0.8;
      src.connect(gain).connect(pan).connect(ctx.destination);
      src.start();
    },
  };
}
