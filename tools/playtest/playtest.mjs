import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2]; const out = process.argv[3] || '/workspace/forge/playtest/result.json';
const b = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', args: ['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 320, height: 180 } });
p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 200)); });
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
const tBoot = Date.now();
await p.goto(url);
// Live builds expose only the read-only `__uicReady` / `__uicStatus`; `?test` builds add `__player`.
await p.waitForFunction(() => window.__uicReady === true || window.__ready === true, null, { timeout: 600000, polling: 1000 });
if (!(await p.evaluate(() => !!window.__player))) {
  const status = await p.evaluate(() => window.__uicStatus ?? null);
  const smoke = { mode: 'live-smoke', url, readyAtMs: Date.now() - tBoot, status, errors };
  fs.writeFileSync(out, JSON.stringify(smoke, null, 1));
  await p.screenshot({ path: out.replace(/\.json$/, '') + '.png', timeout: 120000 });
  console.log(JSON.stringify(smoke));
  console.log('No window.__player (live build): ran smoke checks only. Use ?test locally for physics probes.');
  await b.close(); process.exit(errors.length ? 1 : 0);
}
const t0 = Date.now(); const log = (s) => console.log(((Date.now() - t0) / 1000).toFixed(0) + 's ' + s);
const res = await p.evaluate(() => {
  const P = window.__player; const R = { falls: [], slides: [], jitter: null, stuck: [], bullets: [], ghost: [] };
  const s0 = P.getPosition();
  const pts = [];
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) pts.push([s0.x + i * 40, s0.z + j * 40]);
  for (const [x, z] of pts) {
    const top = P.meshRay([x, 300, z], [0, -1, 0], 400);
    const phy = P.physicsRay([x, 300, z], [0, -1, 0], 400);
    if (!top || /trees/.test(top.name)) continue;
    const ty = 300 - top.d;
    if (phy === null || Math.abs((300 - phy) - ty) > 1.5) R.ghost.push({ x, z, meshTop: +ty.toFixed(2), physTop: phy === null ? null : +(300 - phy).toFixed(2), name: top.name });
    const standY = Math.max(ty, phy === null ? ty : 300 - phy); P.setInput({ forward: 0, right: 0 }); P.teleport(x, standY + 0.3, z); P.advance(2);
    const a = P.getPosition();
    if (a.y < standY - 0.5) R.falls.push({ x, z, top: +ty.toFixed(2), y: +a.y.toFixed(2), name: top.name });
    P.advance(2); const c = P.getPosition();
    const drift = Math.hypot(c.x - a.x, c.z - a.z);
    if (drift > 0.03 || Math.abs(c.y - a.y) > 0.03) R.slides.push({ x, z, drift: +drift.toFixed(3), dy: +(c.y - a.y).toFixed(3), grounded: P.isGrounded(), name: top.name });
    // walk 4 directions
    for (let k = 0; k < 4; k++) {
      const yaw = k * Math.PI / 2; P.teleport(c.x, c.y + 0.05, c.z); P.setView(yaw, 0.2); P.setInput({ forward: 1, right: 0 }); P.advance(0.5);
      const w0 = P.getPosition(); P.advance(1.5); const w1 = P.getPosition(); P.setInput({ forward: 0, right: 0 });
      const moved = Math.hypot(w1.x - w0.x, w1.z - w0.z);
      if (moved < 1.0) {
        const dir = [-Math.sin(yaw), 0, -Math.cos(yaw)];
        const ahead = P.meshRay([w1.x, w1.y + 0.5, w1.z], dir, 1.2);
        const aheadHi = P.meshRay([w1.x, w1.y + 1.5, w1.z], dir, 1.2);
        R.stuck.push({ x: +w1.x.toFixed(1), y: +w1.y.toFixed(2), z: +w1.z.toFixed(1), yaw: k, moved: +moved.toFixed(2), wallLow: ahead?.name ?? null, wallHigh: aheadHi?.name ?? null });
      }
    }
    // bullets: 8 horizontal rays at chest height
    for (let k = 0; k < 8; k++) {
      const ang = k * Math.PI / 4; const d = [Math.sin(ang), 0, Math.cos(ang)]; const o = [c.x, c.y + 1.4, c.z];
      const m = P.meshRay(o, d, 120); const ph = P.physicsRay(o, d, 120);
      if (m && (ph === null || ph > m.d + 1.5)) R.bullets.push({ o: o.map((v) => +v.toFixed(1)), dir: k, mesh: +m.d.toFixed(2), phys: ph === null ? null : +ph.toFixed(2), name: m.name, isCollider: m.collider });
      if (ph !== null && (!m || m.d > ph + 1.5)) R.ghost.push({ o: o.map((v) => +v.toFixed(1)), dir: k, mesh: m ? +m.d.toFixed(2) : null, phys: +ph.toFixed(2), kind: 'invisible-wall' });
    }
  }
  // jitter at spawn
  P.teleport(s0.x, s0.y + 0.1, s0.z); P.setInput({ forward: 0, right: 0 }); P.advance(1); const ys = [];
  for (let i = 0; i < 60; i++) { P.advance(1 / 60); ys.push(P.getPosition().y); }
  R.jitter = { range: Math.max(...ys) - Math.min(...ys) };
  R.points = pts.length; R.stats = P.getStats(); R.spawn = s0;
  return R;
});
fs.writeFileSync(out, JSON.stringify(res, null, 1));
log(`points ${res.points} falls ${res.falls.length} slides ${res.slides.length} stuck ${res.stuck.length} bullets ${res.bullets.length} ghost ${res.ghost.length} jitter ${res.jitter.range.toFixed(4)}`);
await b.close();
