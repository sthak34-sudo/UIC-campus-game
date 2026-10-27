import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIP_NAMES, PLAYER_ANIMS_URL, PLAYER_PUBLIC_ANIMS_URL, fetchAnimClips } from './characterLoader';

const pub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

function glbJson(file: string): { nodes?: { name?: string }[]; animations?: { name?: string; channels: { target: { node: number } }[] }[] } {
  const buf = new Uint8Array(fs.readFileSync(file));
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67); // 'glTF'
  const len = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + len)));
}

describe('CC0 character clips (live build has no Mixamo file)', () => {
  it('ships every clip the controller needs, bound to player_base bone names', () => {
    const clips = glbJson(path.join(pub, PLAYER_PUBLIC_ANIMS_URL));
    const body = glbJson(path.join(pub, 'models/characters/player_base.glb'));
    const names = (clips.animations ?? []).map((a) => a.name);
    for (const n of CLIP_NAMES) expect(names).toContain(n);
    const bodyNodes = new Set((body.nodes ?? []).map((n) => n.name));
    for (const anim of clips.animations ?? []) {
      for (const ch of anim.channels) expect(bodyNodes.has(clips.nodes![ch.target.node].name)).toBe(true);
    }
  });

  it('is small and the private Mixamo file is not committed', () => {
    expect(fs.statSync(path.join(pub, PLAYER_PUBLIC_ANIMS_URL)).size).toBeLessThan(2_000_000);
    expect(fs.existsSync(path.join(pub, PLAYER_ANIMS_URL))).toBe(false);
  });

  it('prefers private clips, falls back to CC0, else none', async () => {
    const a = new ArrayBuffer(1);
    const b = new ArrayBuffer(2);
    expect((await fetchAnimClips(async (p) => (p === PLAYER_ANIMS_URL ? a : b))).source).toBe('mixamo');
    const live = await fetchAnimClips(async (p) => (p === PLAYER_PUBLIC_ANIMS_URL ? b : null));
    expect(live.source).toBe('cc0');
    expect(live.buf).toBe(b);
    expect((await fetchAnimClips(async () => null)).source).toBe('none');
  });
});
