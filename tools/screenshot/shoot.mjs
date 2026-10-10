// Screenshot robot: starts the game in a headless browser (software rendering, no GPU needed)
// and saves PNGs of named viewpoints.
//
//   npm run screenshot                  -> every registered viewpoint
//   npm run screenshot -- quad-ground   -> only the named viewpoints
//   options: --query=gfxtest=1&quality=medium  --out=screenshots  --hour=14  --size=1600x900  --port=5199 (or SHOT_PORT)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
let names = args.filter((a) => !a.startsWith('--'));
const outDir = path.resolve(opt.out ?? 'screenshots');
const [w, h] = (opt.size ?? '1600x900').split('x').map(Number);
const port = Number(opt.port ?? process.env.SHOT_PORT ?? 5199);
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';

fs.mkdirSync(outDir, { recursive: true });
const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: path.resolve('client'), stdio: ['ignore', 'pipe', 'pipe'], detached: true,
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 60000);
  server.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); resolve(); } });
  server.on('exit', (c) => reject(new Error(`vite exited ${c}`)));
});

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let failed = 0;
try {
  const base = `http://127.0.0.1:${port}/`;
  if (names.length === 0) {
    const p = await browser.newPage({ viewport: { width: 320, height: 200 } });
    await p.goto(`${base}?view=__list__${opt.query ? `&${opt.query}` : ''}`, { timeout: 300000 });
    await p.waitForFunction(() => Array.isArray(window.__viewpoints), null, { timeout: 600000 });
    names = await p.evaluate(() => window.__viewpoints);
    await p.close();
  }
  for (const name of names) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const t0 = Date.now();
    await page.goto(`${base}?view=${encodeURIComponent(name)}${opt.hour ? `&hour=${opt.hour}` : ''}${opt.query ? `&${opt.query}` : ''}`, { timeout: 300000 });
    try {
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
      const file = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: file, timeout: 300000 });
      console.log(`saved ${file} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      failed++;
      console.log(`FAILED ${name}: ${e.message}`);
    }
    if (errors.length) console.log(`  page errors for ${name}:\n   - ${errors.join('\n   - ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); }
}
process.exit(failed ? 1 : 0);
