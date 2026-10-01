/* ============================================================
   ヒーローの3Dシーン（tools/hero-scene/scene.js）を MP4 に焼き出す。
   GPUを使うヘッドレスEdgeで実時間レンダリングし、MediaRecorder(H.264)で録る。
   クリップの前後は白にディゾルブするので、loop再生しても継ぎ目が出ない。

   使い方:
     node tools/record-hero.mjs                     （PC用：15秒 1280x720）
     node tools/record-hero.mjs 13 780 820 480000 video/hero-scene-sp.mp4 images/hero-scene-poster-sp.jpg
   引数: 秒数 幅 高さ ビットレート 出力mp4 出力jpg
   ============================================================ */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SEC = Number(process.argv[2] || 15);
const W = Number(process.argv[3] || 1280);
const H = Number(process.argv[4] || 720);
const BITS = Number(process.argv[5] || 700_000);
const OUT = process.argv[6] || 'video/hero-scene.mp4';
const POSTER = process.argv[7] || 'images/hero-scene-poster.jpg';

/* 1) シーンを単体のページとして組む（本体のLPからは3Dを外したため） */
await esbuild.build({
  entryPoints: [resolve(HERE, 'hero-scene/scene.js')],
  outfile: resolve(HERE, 'hero-scene/_scene.js'),
  bundle: true, format: 'iife', minify: true, target: ['chrome120'], legalComments: 'none',
});
writeFileSync(resolve(HERE, 'hero-scene/_record.html'), `<!doctype html><meta charset="utf-8"><title>hero record</title>
<style>
  html,body{margin:0;background:#fff;overflow:hidden}
  [data-hero-stage]{position:relative;width:${W}px;height:${H}px;overflow:hidden}
  [data-hero-canvas]{position:absolute;inset:0;width:100%;height:100%;display:block}
</style>
<section data-section="01-hero"><div data-hero-stage><canvas data-hero-canvas></canvas></div></section>
<script src="_scene.js"></script>
`);

const browser = await chromium.launch({
  channel: 'msedge',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
const pageUrl = pathToFileURL(resolve(HERE, 'hero-scene/_record.html')).href;
await page.goto(`${pageUrl}?record&sec=${SEC}`);
await page.waitForFunction(() => !!window.__hero, null, { timeout: 60000 });
const size = await page.evaluate(() => { const c = document.querySelector('[data-hero-canvas]'); return [c.width, c.height]; });
console.log(`canvas ${size.join('x')} / ${SEC}秒 / ${(BITS / 1000) | 0}kbps`);

/* 2) 録画 */
const b64 = await page.evaluate(async ({ sec, bits }) => {
  const canvas = document.querySelector('[data-hero-canvas]');
  const stream = canvas.captureStream(60);
  const rec = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.42E01E', videoBitsPerSecond: bits });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((res) => { rec.onstop = res; });
  rec.start();
  window.__hero.run(performance.now());
  await new Promise((r) => setTimeout(r, sec * 1000));
  rec.stop();
  await done;
  const buf = await new Blob(chunks, { type: 'video/mp4' }).arrayBuffer();
  let s = '';
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}, { sec: SEC, bits: BITS });

/* 3) 静止画（動画を読み込めない環境で出る1枚） */
await page.evaluate((sec) => window.__hero.poster(sec), SEC * 0.42);
await page.locator('[data-hero-canvas]').screenshot({ path: `${ROOT}/${POSTER}`, type: 'jpeg', quality: 80 });
console.log('静止画:', POSTER);

const buf = Buffer.from(b64, 'base64');
writeFileSync(`${ROOT}/${OUT}`, buf);
console.log(`書き出し: ${OUT}  ${(buf.length / 1048576).toFixed(2)}MB`);
await browser.close();
