// Foot IK on stairs + mid-flinch for character realism polish. Local Chromium + swiftshader only.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const outDir = path.resolve('docs/screenshots');
const port = Number(process.env.PLAYER_TEST_PORT ?? 5191);
const CHROME = process.env.CHROME_PATH ?? '/opt/google/chrome/chrome';
const OX = 1200;
fs.mkdirSync(outDir, { recursive: true });

const require = createRequire(path.resolve('client/package.json'));
const viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
const server = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: path.resolve('client'),
  stdio: ['ignore', 'pipe', 'pipe'],
});
const stopServer = () => { try { server.kill('SIGTERM'); } catch { /* gone */ } };
process.on('exit', stopServer);
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start\n' + serverLog)), 60000);
  server.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); resolve(); } });
  server.on('exit', (c) => reject(new Error(`vite exited ${c}\n${serverLog}`)));
});

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const logs = [];
function note(msg) { console.log(msg); logs.push(msg); }

async function shot(page, name) {
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, timeout: 120000 });
  note(`saved ${file}`);
}

async function waitSim(page, seconds) {
  const t0 = await page.evaluate(() => window.__player.getSimTime());
  await page.waitForFunction(([t, s]) => window.__player.getSimTime() - t >= s, [t0, seconds], { timeout: 180000, polling: 200 });
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    const t = m.type();
    const text = m.text();
    if (t === 'error' || /character|gltf|IK|flinch|simple figure/i.test(text)) note(`console.${t}: ${text.slice(0, 400)}`);
  });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/?playertest=1`, { timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true && !!window.__player, null, { timeout: 600000 });
  note(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  note(`avatar ${JSON.stringify(await page.evaluate(() => window.__player.getAvatar()))}`);

  await page.evaluate(() => window.__player.setCameraMode('third'));

  // Mid solid-box stair (step 6 of 12). COURSE: slabEdgeZ=-23.5, rise=0.17, run=0.28, stairX~5.
  const step = 6;
  const rise = 0.17;
  const run = 0.28;
  const slabEdgeZ = -23.5;
  const zOn = slabEdgeZ + (12 - step + 0.5) * run;
  const yOn = step * rise;
  const xOn = 5.0;

  await page.evaluate(([x, y, z]) => window.__player.teleport(x, y, z), [OX + xOn, yOn, zOn]);
  await page.evaluate(() => window.__player.setInput(null));
  // Face up the stair (toward -Z / into the room).
  await page.evaluate(() => window.__player.setView(Math.PI, 0.35));
  await waitSim(page, 0.6);
  // Side view so both feet and stair tread are visible.
  await page.evaluate(() => window.__player.setView(-Math.PI / 2, 0.28));
  await waitSim(page, 0.35);
  const stairPos = await page.evaluate(() => window.__player.getPosition());
  note(`stair feet ${JSON.stringify(stairPos)} grounded=${await page.evaluate(() => window.__player.isGrounded())}`);
  await shot(page, 'char-feet-stairs');

  // Also plant on the ramp slope for a second look (optional but useful).
  // ramp: minX -2..2, startZ 8 endZ 18, rise 1.5 → mid z=13, y≈0.75
  await page.evaluate(([x, y, z]) => window.__player.teleport(x, y, z), [OX + 0, 0.75, 13]);
  await page.evaluate(() => window.__player.setView(-Math.PI / 2, 0.25));
  await waitSim(page, 0.5);
  note(`ramp ${JSON.stringify(await page.evaluate(() => window.__player.getPosition()))}`);
  await shot(page, 'char-feet-slope');

  // Mid-flinch: open ground, side camera, trigger directional flinch, catch peak (~0.14s of 0.28).
  await page.evaluate(([x, y, z]) => window.__player.teleport(x, y, z), [OX + 0, 0, -4]);
  await page.evaluate(() => {
    window.__player.setCrouch(false);
    window.__player.setAiming(false);
    window.__player.setView(Math.PI * 0.65, 0.22);
  });
  await waitSim(page, 0.4);
  await page.evaluate(() => window.__player.flinch({ x: 1, y: 0, z: 0.2 }));
  await waitSim(page, 0.12);
  await shot(page, 'char-flinch');

  if (errors.length) note(`errors:\n${errors.slice(0, 8).join('\n')}`);
  await page.close();
} finally {
  await browser.close();
  stopServer();
  fs.writeFileSync(path.join(outDir, 'polish-log.txt'), logs.join('\n'));
}
