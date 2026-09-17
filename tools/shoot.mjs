// Usage:
//   node tools/shoot.mjs --page index.html --out review/round-1
//   node tools/shoot.mjs --page preview-05-cargo.html --out preview/shots/05-cargo
// Writes <id>-desktop.png / <id>-mobile.png per [data-section], fold-*.png, and _report.txt
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const page = arg('--page', 'index.html');
const out = resolve(ROOT, arg('--out', 'review/latest'));
const onlyViewport = arg('--viewport', 'both');
mkdirSync(out, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.json': 'application/json', '.woff2': 'font/woff2' };

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = normalize(join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  const size = statSync(file).size;
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;
  if (range) {
    const [s, e] = range.replace('bytes=', '').split('-');
    const start = Number(s), end = e ? Number(e) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return res.end(readFileSync(file).subarray(start, end + 1));
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/${page}?shot`;

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});

const report = [];
const viewports = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
].filter((v) => onlyViewport === 'both' || v.name === onlyViewport);

for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  const p = await ctx.newPage();
  let bytes = 0, requests = 0;
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) report.push(`[${vp.name}] console.${m.type()}: ${m.text()}`); });
  p.on('pageerror', (e) => report.push(`[${vp.name}] PAGE ERROR: ${e.message}`));
  p.on('requestfailed', (r) => report.push(`[${vp.name}] REQUEST FAILED: ${r.url()} ${r.failure()?.errorText}`));
  p.on('response', async (r) => { requests++; const l = Number(r.headers()['content-length'] || 0); bytes += l; if (r.status() >= 400) report.push(`[${vp.name}] HTTP ${r.status()}: ${r.url()}`); });

  await p.goto(base, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: join(out, `fold-${vp.name}.png`) });

  const total = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += 600) { await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(60); }
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.evaluate(() => document.documentElement.classList.add('is-shot-sections'));
  await p.waitForTimeout(300);

  const ids = await p.$$eval('[data-section]', (els) => els.map((e) => e.getAttribute('data-section')));
  for (const id of ids) {
    const el = p.locator(`[data-section="${id}"]`).first();
    const box = await el.boundingBox();
    if (!box || box.height < 2) { report.push(`[${vp.name}] section ${id}: not visible (height ${box?.height})`); continue; }
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(id.includes('hero') ? 1500 : 250);
    await el.screenshot({ path: join(out, `${id}-${vp.name}.png`) });
    report.push(`[${vp.name}] section ${id}: ${Math.round(box.width)}x${Math.round(box.height)}`);
  }
  const overflow = await p.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const clipped = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p);
        if (o.overflowX !== 'visible' || o.overflow === 'clip') return true;
      }
      return false;
    };
    return [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > w + 1 && getComputedStyle(e).position !== 'fixed' && !clipped(e))
      .slice(0, 8).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} right=${Math.round(e.getBoundingClientRect().right)}`);
  });
  if (overflow.length) report.push(`[${vp.name}] HORIZONTAL OVERFLOW: ${overflow.join(' | ')}`);
  report.push(`[${vp.name}] page height ${total}px, requests ${requests}, transferred ~${(bytes / 1024 / 1024).toFixed(2)}MB`);
  await ctx.close();
}

await browser.close();
server.close();
writeFileSync(join(out, '_report.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
console.log(`shots -> ${out}`);
