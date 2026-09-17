import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'C:\\Users\\moegi\\AppData\\Local\\Temp\\claude\\c--Users-moegi-OneDrive--------ASOLAB----test-sales-dashboard\\3890d272-92d0-47e2-926b-1dad5cf9becc\\scratchpad';

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.json': 'application/json', '.woff2': 'font/woff2' };

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = normalize(join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  const size = statSync(file).size;
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/preview-06-aircraft.html?shot`;

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 6 });
const p = await ctx.newPage();
await p.goto(base, { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(1000);
await p.evaluate(() => document.documentElement.classList.add('is-shot-sections'));

const icons = p.locator('.s-aircraft__safety-icon');
const count = await icons.count();
for (let i = 0; i < count; i++) {
  const el = icons.nth(i);
  await el.scrollIntoViewIfNeeded();
  await el.screenshot({ path: join(OUT, `icon-${i}.png`) });
}

await browser.close();
server.close();
console.log('done', count);
