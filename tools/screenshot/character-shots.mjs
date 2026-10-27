// Headless character check. Saves PNGs under screenshots/character (gitignored).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const outDir = path.resolve('docs/screenshots');
const port = Number(process.env.PLAYER_TEST_PORT ?? 5188);
const CHROME = process.env.CHROME_PATH ?? '/opt/google/chrome/chrome';
const O = { x: 1200, y: 0, z: 0 };
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
    if (t === 'error' || t === 'warning' || /character|Character|gltf|GLTF|KTX|simple figure|unbound/i.test(text)) {
      note(`console.${t}: ${text.slice(0, 500)}`);
    }
    if (t === 'error' && !/favicon/.test(m.location()?.url ?? '')) errors.push(text);
  });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/?playertest=1`, { timeout: 300000 });
  await page.waitForFunction(() => window.__ready === true && !!window.__player, null, { timeout: 600000 });
  note(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const avatar = await page.evaluate(() => window.__player.getAvatar());
  note(`avatar ${JSON.stringify(avatar)}`);
  if (avatar.kind !== 'gltf' || avatar.missingTracks !== 0) {
    throw new Error(`expected gltf with 0 unbound tracks, got ${JSON.stringify(avatar)}`);
  }

  const tp = (x, y, z) => page.evaluate(([x, y, z]) => window.__player.teleport(x, y, z), [O.x + x, O.y + y, O.z + z]);
  const view = (yaw, pitch) => page.evaluate(([y, p]) => window.__player.setView(y, p), [yaw, pitch]);
  const input = (i) => page.evaluate((i) => window.__player.setInput(i), i);
  const settle = async () => { await waitSim(page, 0.35); };

  await page.evaluate(() => window.__player.setCameraMode('third'));
  await tp(0, 0, 4);
  await view(Math.PI, 0.28);
  await input(null);
  await page.evaluate(() => { window.__player.setCrouch(false); window.__player.setAiming(false); });
  await settle();
  await shot(page, 'idle-front');

  await view(0, 0.32);
  await settle();
  await shot(page, 'idle-back');

  await view(-Math.PI / 2, 0.22);
  await input({ forward: 1, run: false });
  await waitSim(page, 0.55);
  await view(0.15, 0.28);
  await shot(page, 'walk');

  await input({ forward: 1, run: true });
  await view(-Math.PI / 2, 0.2);
  await waitSim(page, 0.45);
  await view(0.2, 0.25);
  await shot(page, 'run');
  await input(null);

  await page.evaluate(() => window.__player.setCrouch(true));
  await view(Math.PI, 0.35);
  await waitSim(page, 0.6);
  const crouched = await page.evaluate(() => window.__player.getAvatar());
  note(`crouch ${JSON.stringify(crouched)}`);
  await shot(page, 'crouch-idle');

  await input({ forward: 1, run: false });
  await view(-Math.PI / 2, 0.3);
  await waitSim(page, 0.5);
  await view(0.2, 0.32);
  await shot(page, 'crouch-walk');
  await input(null);
  await page.evaluate(() => window.__player.setCrouch(false));
  await waitSim(page, 0.45);

  await page.evaluate(() => window.__player.setAiming(true));
  await view(Math.PI * 0.85, 0.22);
  await waitSim(page, 0.45);
  note(`aim ${JSON.stringify(await page.evaluate(() => window.__player.getAvatar()))}`);
  await shot(page, 'aim-idle');

  await input({ forward: 1, run: false });
  await waitSim(page, 0.45);
  await shot(page, 'aim-walk');
  await input(null);

  await page.keyboard.press('KeyR');
  await waitSim(page, 0.55);
  await shot(page, 'reload');
  await page.evaluate(() => window.__player.setAiming(false));
  await waitSim(page, 1.4);

  await view(Math.PI, 0.25);
  await page.mouse.click(640, 360);
  await waitSim(page, 0.08);
  await shot(page, 'fire');

  await input({ jump: true });
  await page.waitForFunction(() => !window.__player.isGrounded(), null, { timeout: 30000 }).catch(() => {});
  await waitSim(page, 0.18);
  await shot(page, 'jump');
  await input(null);
  await waitSim(page, 0.8);

  for (let i = 0; i < 4; i++) await page.keyboard.press('KeyH');
  await waitSim(page, 2.6);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('div')) {
      if (el.textContent && el.textContent.includes('You are down')) el.style.display = 'none';
    }
  });
  await view(Math.PI * 0.75, 0.55);
  note(`death ${JSON.stringify(await page.evaluate(() => window.__player.getAvatar()))}`);
  await shot(page, 'death');
  if (errors.length) note(`errors:\n${errors.slice(0, 8).join('\n')}`);
  await page.close();

  const viewPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const vErrors = [];
  viewPage.on('pageerror', (e) => vErrors.push(e.message));
  viewPage.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error' || /character|Character|simple figure|unbound/i.test(text)) note(`view.${m.type()}: ${text.slice(0, 400)}`);
  });
  const t1 = Date.now();
  await viewPage.goto(`http://127.0.0.1:${port}/?view=combat-range`, { timeout: 300000 });
  await viewPage.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  note(`combat-range ready in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  await shot(viewPage, 'dummies');
  if (vErrors.length) note(`view errors:\n${vErrors.slice(0, 8).join('\n')}`);
  await viewPage.close();
} finally {
  await browser.close();
  stopServer();
  fs.writeFileSync(path.join(outDir, 'log.txt'), logs.join('\n'));
}
