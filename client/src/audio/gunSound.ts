/**
 * Gunshot sound (CC0, see CREDITS.md) played with Web Audio: quieter with distance and panned
 * left/right by where the shot came from. Loads lazily; silent until the browser allows audio.
 */
type V3 = { x: number; y: number; z: number };

export const GUN_SOUND = {
  url: 'audio/gunshot_cc0.ogg',
  /** Full volume inside this range (m). */
  near: 4,
  /** Silent beyond this range (m). */
  far: 120,
  volume: 0.5,
  /** At most this many shots start per second (a squad firing at once stays readable). */
  maxPerSecond: 20,
};

/** Volume 0..1 for a shot `d` meters away. */
export function shotVolume(d: number): number {
  const { near, far, volume } = GUN_SOUND;
  if (d <= near) return volume;
  if (d >= far) return 0;
  return volume * (near / d) * (1 - (d - near) / (far - near));
}

/** Pan -1 (left) .. 1 (right) for a shot at `p`, heard at `ear` facing yaw (rotation.y, +z forward at 0). */
export function shotPan(p: V3, ear: V3, earYaw: number): number {
  const dx = p.x - ear.x, dz = p.z - ear.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return 0;
  // Camera right at yaw is (cos yaw, 0, -sin yaw) for a three.js camera looking down -z.
  const rx = Math.cos(earYaw), rz = -Math.sin(earYaw);
  return Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d));
}

export interface GunSound {
  play(at: V3, ear: V3, earYaw: number): void;
}

export function createGunSound(baseUrl: string): GunSound {
  let ctx: AudioContext | null = null;
  let buf: AudioBuffer | null = null;
  let loading = false;
  let windowStart = 0;
  let count = 0;
  const load = () => {
    if (loading || typeof AudioContext === 'undefined') return;
    loading = true;
    ctx = new AudioContext();
    fetch(baseUrl + GUN_SOUND.url)
      .then((r) => r.arrayBuffer())
      .then((a) => ctx!.decodeAudioData(a))
      .then((b) => { buf = b; })
      .catch(() => { /* no sound file: stay silent */ });
  };
  return {
    play(at, ear, earYaw) {
      load();
      if (!ctx || !buf || ctx.state !== 'running') { void ctx?.resume().catch(() => {}); return; }
      const now = ctx.currentTime;
      if (now - windowStart > 1) { windowStart = now; count = 0; }
      if (++count > GUN_SOUND.maxPerSecond) return;
      const vol = shotVolume(Math.hypot(at.x - ear.x, at.y - ear.y, at.z - ear.z));
      if (vol <= 0.001) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.94 + Math.random() * 0.12;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      const pan = ctx.createStereoPanner();
      pan.pan.value = shotPan(at, ear, earYaw) * 0.8;
      src.connect(gain).connect(pan).connect(ctx.destination);
      src.start();
    },
  };
}
