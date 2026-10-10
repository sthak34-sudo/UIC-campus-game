// Player walk test: starts the game in headless Chromium (software WebGL, no GPU needed), drives the
// character through the player test course (?playertest=1) with window.__player, checks the results,
// saves screenshots to screenshots/player/ and measures physics cost with campus colliders.
//
//   node tools/player-test/walk.mjs            (from the repo root)
//   options: --out=screenshots/player  --size=960x540  --no-shots  --no-perf
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('=');
  return [k, v ?? true];
}));
const outDir = path.resolve(opt.out ?? 'screenshots/player');
const [W, H] = String(opt.size ?? '960x540').split('x').map(Number);
const port = Number(process.env.PLAYER_TEST_PORT ?? 5187);
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';
const O = { x: 1200, y: 0, z: 0 }; // COURSE_ORIGIN in client/src/player/testCourse.ts
const WALK = 1.4;

fs.mkdirSync(outDir, { recursive: true });
// Run vite's JS entry with this node directly (not via npx) so killing it really stops the server.
const require = createRequire(path.resolve('client/package.json'));
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
const server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: path.resolve('client'), stdio: ['ignore', 'pipe', 'pipe'],
});
const stopServer = () => { try { server.kill('SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stopServer);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 60000);
  server.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); resolve(); } });
  server.on('exit', (c) => reject(new Error(`vite exited ${c}`)));
});

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, ...detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`);
};
const r2 = (v) => Math.round(v * 100) / 100;

async function openGame(query) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/favicon/.test(m.location()?.url ?? '')) return; // browsers ask for /favicon.ico; not ours
    errors.push(`${m.text()} ${m.location()?.url ?? ''}`);
  });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/${query}`);
  await page.waitForFunction(() => window.__ready === true && !!window.__player, null, { timeout: 600000 });
  return { page, errors, loadMs: Date.now() - t0 };
}

/** Let the render loop draw a couple of frames (camera follows, model poses). */
const frames = (page, n = 3) => page.evaluate((n) => new Promise((res) => {
  let i = 0;
  const f = () => (++i >= n ? res() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);

let failed = 0;
try {
  // ---------------------------------------------------------------- test course
  const { page, errors, loadMs } = await openGame('?playertest=1');
  console.log(`loaded test course in ${(loadMs / 1000).toFixed(1)} s`);
  const P = {
    pos: () => page.evaluate(() => window.__player.getPosition()),
    rel: async () => {
      const p = await page.evaluate(() => window.__player.getPosition());
      return { x: r2(p.x - O.x), y: r2(p.y - O.y), z: r2(p.z - O.z) };
    },
    tp: (x, y, z) => page.evaluate(([x, y, z]) => window.__player.teleport(x, y, z), [O.x + x, O.y + y, O.z + z]),
    input: (i) => page.evaluate((i) => window.__player.setInput(i), i),
    advance: (s) => page.evaluate((s) => window.__player.advance(s), s),
    view: (yaw, pitch = 0.2) => page.evaluate(([y, p]) => window.__player.setView(y, p), [yaw, pitch]),
    grounded: () => page.evaluate(() => window.__player.isGrounded()),
    cam: () => page.evaluate(() => window.__player.getCamera()),
    mode: (m) => page.evaluate((m) => window.__player.setCameraMode(m), m),
  };
  const NORTH = 0, EAST = -Math.PI / 2, WEST = Math.PI / 2, SOUTH = Math.PI;
  const stop = () => P.input({ forward: 0, right: 0, run: false });

  // 1. spawn grounded
  await P.advance(0.5);
  {
    const p = await P.rel();
    check('spawns grounded', (await P.grounded()) && Math.abs(p.y) < 0.1, { pos: p });
  }

  // 2. walk forward 5 s on open ground (east)
  await P.tp(0, 0, 4); await P.view(EAST); await P.advance(0.3);
  {
    const a = await P.pos();
    await P.input({ forward: 1 }); await P.advance(5); await stop();
    const b = await P.pos();
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    check('walk 5 s covers ~7 m', Math.abs(d - WALK * 5) < 0.35, { distance: r2(d), expected: WALK * 5 });
  }
  // 2b. same, driven by the real render loop (wall clock), speed measured against simulated time
  await P.tp(0, 0, 4); await P.view(EAST); await P.advance(0.3);
  {
    const a = await P.pos();
    const s0 = await page.evaluate(() => window.__player.getSimTime());
    const w0 = Date.now();
    await P.input({ forward: 1 });
    await page.waitForTimeout(3000);
    await stop();
    const b = await P.pos();
    const s1 = await page.evaluate(() => window.__player.getSimTime());
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const fps = (await page.evaluate(() => window.__player.getStats())).fps;
    check('real-time loop speed ~1.4 m/s', d / (s1 - s0) > 1.2 && d / (s1 - s0) < 1.45, {
      distance: r2(d), simSeconds: r2(s1 - s0), wallSeconds: r2((Date.now() - w0) / 1000), speed: r2(d / (s1 - s0)), fps: r2(fps),
    });
  }

  // 3. walk into a wall (west wall at x = -12, 0.3 thick) -> stops at -12 + 0.15 + 0.35
  await P.tp(-6, 0, 0); await P.view(WEST); await P.advance(0.3);
  {
    await P.input({ forward: 1, run: true }); await P.advance(4); await stop();
    const p = await P.rel();
    check('wall stops the player', p.x > -11.6 && p.x < -11.35, { x: p.x, wallFace: -11.85 });
  }

  // 4. jump and land
  await P.tp(0, 0, 4); await P.advance(0.5);
  {
    const y0 = (await P.pos()).y;
    await P.input({ jump: true });
    let maxY = y0; let airborne = false;
    for (let i = 0; i < 40; i++) {
      await P.advance(1 / 30);
      const y = (await P.pos()).y;
      maxY = Math.max(maxY, y);
      if (!(await P.grounded())) airborne = true;
    }
    const y1 = (await P.pos()).y;
    const log = await page.evaluate(() => window.__player.eventLog.slice(-5));
    check('jump goes up and lands', airborne && maxY - y0 > 0.4 && Math.abs(y1 - y0) < 0.03 && (await P.grounded()), {
      jumpHeight: r2(maxY - y0), landedDy: r2(y1 - y0), events: log,
    });
  }

  // 5. full indoor route: spawn -> through the 1.4 m doorway -> stairs -> 2nd floor
  await P.tp(0, 0, -4); await P.view(NORTH); await P.advance(0.3);
  {
    await P.input({ forward: 1 }); await P.advance(9.5); await stop();
    const inRoom = await P.rel();
    const inside = await page.evaluate(() => window.__player.getPosition()).then((p) => p.z - O.z < -14.5);
    check('walks through the doorway', inside && Math.abs(inRoom.x) < 0.3, { pos: inRoom });
    // turn right (east) to line up with the stair, then go up
    await P.view(EAST); await P.input({ forward: 1 }); await P.advance(3.55); await stop();
    const atStairX = await P.rel();
    await P.view(NORTH);
    const t0 = await page.evaluate(() => window.__player.getSimTime());
    await P.input({ forward: 1 });
    let tTop = null;
    for (let i = 0; i < 100 && tTop === null; i++) {
      await P.advance(0.1);
      const p = await P.rel();
      if (p.y > 2.0 && (await P.grounded())) tTop = (await page.evaluate(() => window.__player.getSimTime())) - t0;
    }
    await P.advance(1); await stop();
    const top = await P.rel();
    check('climbs 12 stairs to the 2nd floor', top.y > 1.99 && top.y < 2.1 && top.z < -24, {
      startX: atStairX.x, pos: top, secondsFromStairFoot: tTop && r2(tTop),
    });
  }
  // 5b. running up the stairs
  await P.tp(5, 0, -17.5); await P.view(NORTH); await P.advance(0.3);
  {
    await P.input({ forward: 1, run: true }); await P.advance(2.5); await stop();
    const p = await P.rel();
    check('runs up the stairs', p.y > 1.99, { pos: p });
  }
  // 5c. back down the stairs
  await P.tp(5, 2.1, -26); await P.view(SOUTH); await P.advance(0.3);
  {
    await P.input({ forward: 1 }); await P.advance(7); await stop();
    const p = await P.rel();
    check('walks down the stairs', p.y < 0.05 && p.z > -19, { pos: p, grounded: await P.grounded() });
  }

  // 6. curb (0.15 m)
  await P.tp(5, 0, 0); await P.view(EAST); await P.advance(0.3);
  {
    await P.input({ forward: 1 }); await P.advance(3); await stop();
    const p = await P.rel();
    check('steps up the 0.15 m curb', p.y > 0.12 && p.x > 8.5, { pos: p });
  }
  // 7. ramp (to 1.5 m)
  await P.tp(0, 0, 5); await P.view(SOUTH); await P.advance(0.3);
  {
    await P.input({ forward: 1 }); await P.advance(11); await stop();
    const p = await P.rel();
    check('walks up the ramp', p.y > 1.45, { pos: p });
  }
  // 8. stair built as one merged triangle mesh
  await P.tp(-12, 0, 13); await P.view(WEST); await P.advance(0.3);
  {
    await P.input({ forward: 1 }); await P.advance(6); await stop();
    const p = await P.rel();
    check('climbs the trimesh stair', p.y > 1.99, { pos: p });
  }

  // 9. camera never inside walls: standing just inside the door facing in, arm points out through the wall
  await P.tp(0, 0, -16); await P.view(NORTH, 0.25); await P.advance(0.5); await frames(page, 2);
  {
    const c = await P.cam();
    check('camera stays inside the room (wall behind)', c.z - O.z < -14.3 - 0.05 && c.arm < 2, { camZ: r2(c.z - O.z), arm: r2(c.arm), wallInnerFace: -14.3 });
  }
  // under the thin 2nd-floor slab, camera pitched up high: must stay below the slab underside (1.89 m)
  await P.tp(0, 0, -27); await P.view(SOUTH, 1.1); await P.advance(0.5);
  {
    const c = await P.cam();
    check('camera stays under the 2nd-floor slab', c.y - O.y < 1.89, { camY: r2(c.y - O.y), arm: r2(c.arm) });
  }

  // 10. keys: E -> interact event, V -> first person
  await page.mouse.click(W / 2, H / 2); // focus (pointer lock may be refused headless; fine)
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyV');
  {
    const log = await page.evaluate(() => window.__player.eventLog.slice(-3));
    const c = await P.cam();
    check('E fires interact, V toggles first person', log.includes('interact') && c.mode === 'first', { events: log, mode: c.mode });
    await page.keyboard.press('KeyV');
  }
  // 11. mouse look by dragging (pointer lock is not available headless; drag-to-look is the fallback)
  {
    const before = await page.evaluate(() => window.__player.getView());
    await page.mouse.move(W / 2, H / 2);
    await page.mouse.down();
    await page.mouse.move(W / 2 + 100, H / 2 + 20, { steps: 5 });
    await page.mouse.up();
    await frames(page, 2);
    const after = await page.evaluate(() => window.__player.getView());
    check('mouse drag turns the camera', after.yaw < before.yaw - 0.1, { yawBefore: r2(before.yaw), yawAfter: r2(after.yaw) });
  }

  // ---------------------------------------------------------------- screenshots
  if (!opt['no-shots']) {
    const shot = async (name) => {
      await frames(page, 3);
      const file = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: file });
      console.log(`saved ${file}`);
    };
    await P.mode('third');
    // outdoor, third person, mid-stride toward the room
    await P.tp(-1.5, 0, -2); await P.view(NORTH - 0.35, 0.18); await P.input({ forward: 1, right: -0.6 }); await P.advance(1.3);
    await page.evaluate(() => window.__player.setView(0.35, 0.12)); // look from the side: mid-stride
    await shot('player-tp-outdoor');
    await stop();
    // outdoor, first person (looking at the doorway)
    await P.mode('first'); await P.tp(0, 0, -6); await P.view(NORTH, 0.05); await P.advance(0.3);
    await shot('player-fp-outdoor');
    // indoor third person on the stairs, camera squeezed by walls
    await P.mode('third'); await P.tp(5, 0, -18.5); await P.view(NORTH, 0.3); await P.input({ forward: 1 }); await P.advance(2.6);
    await P.input({ forward: 0 }); await P.view(NORTH - 0.55, 0.38); await P.advance(0.05);
    await shot('player-tp-indoor-stairs');
    // indoor, third person on the 2nd floor
    await P.tp(-2, 2.1, -27); await P.view(SOUTH + 0.4, 0.35); await P.advance(0.5);
    await shot('player-tp-indoor-floor2');
    // indoor, first person from the 2nd floor looking over the railing
    await P.mode('first'); await P.tp(1, 2.1, -24.3); await P.view(SOUTH + 0.3, 0.75); await P.advance(0.4);
    await shot('player-fp-indoor-floor2');
    // course overview (debug line visible)
    await P.mode('third'); await P.tp(6, 0, 2); await P.view(NORTH + 0.75, 0.42); await P.input({ forward: 1, run: true });
    await P.advance(0.6); await P.view(NORTH + 2.2, 0.3);
    await shot('player-tp-course-running');
    await stop();
  }

  const stats = await page.evaluate(() => window.__player.getStats());
  console.log(`test course colliders: ${stats.cuboids} boxes, ${stats.trimeshes} trimeshes, ${stats.triangles} triangles, build ${r2(stats.buildMs)} ms, step ${r2(stats.stepMs)} ms`);
  if (errors.length) console.log(`page errors:\n - ${errors.join('\n - ')}`);
  check('no page errors (test course)', errors.length === 0, { errors: errors.slice(0, 5) });
  await page.close();

  // ---------------------------------------------------------------- perf with campus colliders
  if (!opt['no-perf']) {
    for (const q of ['?', '?playertest=perf']) {
      const g = await openGame(q);
      const perf = await g.page.evaluate(async () => {
        const pl = window.__player;
        const p0 = pl.getPosition();
        // walk a square around the spawn, bumping into whatever is there
        const t = performance.now();
        const steps = [];
        for (const [yaw, secs] of [[0, 5], [-Math.PI / 2, 5], [Math.PI, 5], [Math.PI / 2, 5]]) {
          pl.setView(yaw, 0.2);
          pl.setInput({ forward: 1, run: true });
          for (let i = 0; i < secs * 10; i++) {
            const a = performance.now();
            pl.advance(0.1);
            steps.push((performance.now() - a) / 6);
          }
        }
        pl.setInput(null);
        const end = pl.getPosition();
        const wall = performance.now() - t;
        steps.sort((a, b) => a - b);
        const s = pl.getStats();
        return {
          spawn: p0, stepAvgMs: steps.reduce((a, b) => a + b, 0) / steps.length, stepP95Ms: steps[Math.floor(steps.length * 0.95)],
          stepMaxMs: steps[steps.length - 1], simWallMs: wall, end, endGrounded: pl.isGrounded(), ...s, ...(pl.perf ?? {}),
        };
      });
      console.log(`PERF ${q}: ${JSON.stringify(Object.fromEntries(Object.entries(perf).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v])))}`);
      results.push({ name: `perf ${q}`, ok: true, ...perf });
      if (g.errors.length) console.log(`page errors (${q}):\n - ${g.errors.join('\n - ')}`);
      check(`no page errors (${q})`, g.errors.length === 0, { errors: g.errors.slice(0, 5) });
      await g.page.close();
    }
  }
} catch (e) {
  console.error(e);
  failed++;
} finally {
  await browser.close();
  stopServer();
}
failed += results.filter((r) => !r.ok).length;
fs.writeFileSync(path.join(outDir, 'walk-results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.filter((r) => r.ok).length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
