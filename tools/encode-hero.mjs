/* ============================================================
   ヒーロー背景用のクリップを、現場の飛行映像から切り出す。
   ヘッドレスEdgeで再生しながらcanvasに描き、MediaRecorder(H.264)で録る。
   前後を白にディゾルブしているので、loop再生しても継ぎ目が出ない。

   使い方: node tools/encode-hero.mjs [開始秒] [長さ] [幅] [高さ] [kbps] [出力mp4] [出力jpg]
   ============================================================ */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { createReadStream, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const START = Number(process.argv[2] || 35.5);
const LEN = Number(process.argv[3] || 8.5);
const W = Number(process.argv[4] || 1280);
const H = Number(process.argv[5] || 720);
const KBPS = Number(process.argv[6] || 900);
const OUT = process.argv[7] || 'video/hero-flight.mp4';
const POSTER = process.argv[8] || 'images/hero-flight-poster.jpg';
const SRC = 'video/transport-flight.mp4';

const TYPES = { html: 'text/html', mp4: 'video/mp4', jpg: 'image/jpeg', png: 'image/png' };
const srv = createServer((req, res) => {
  const f = resolve(ROOT, decodeURIComponent(req.url.split('?')[0]).slice(1));
  try { statSync(f); } catch { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream' });
  createReadStream(f).pipe(res);
}).listen(0);
await new Promise((r) => srv.on('listening', r));
const PORT = srv.address().port;

const browser = await chromium.launch({ channel: 'msedge', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 480, height: 320 }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('[page]', m.text()));

writeFileSync(`${ROOT}/_encode.html`, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<video id="v" src="/${SRC}" muted playsinline style="width:320px"></video>
<canvas id="c" width="${W}" height="${H}" style="width:320px"></canvas>`);
await page.goto(`http://127.0.0.1:${PORT}/_encode.html`);
await page.waitForFunction(() => document.getElementById('v').readyState >= 2, null, { timeout: 60000 });

const b64 = await page.evaluate(async ({ start, len, w, h, kbps }) => {
  const v = document.getElementById('v');
  const c = document.getElementById('c');
  const g = c.getContext('2d');

  /* 被写体は画面の左寄りを飛ぶ。見出しは左に置くので、左右を反転して右側に置く。
     あわせて少しだけ寄せ、上下は機体の降下に合わせて切る */
  const ZOOM = 1.45, CY = 0.70;
  const outA = w / h;
  let sw = v.videoWidth / ZOOM;
  let sh = sw / outA;
  if (sh > v.videoHeight / ZOOM) { sh = v.videoHeight / ZOOM; sw = sh * outA; }
  const sx = (v.videoWidth - sw) / 2;
  const sy = Math.max(0, Math.min(v.videoHeight - sh, v.videoHeight * CY - sh / 2));
  /* 逆光の空に対して機体と荷が薄く沈むため、コントラストと彩度を上げて濃くする。
     コントラストは暗部をより暗くするので、空を飛ばさずに機体だけが締まる */
  const GRADE = 'contrast(1.3) saturate(1.3) brightness(0.99)';
  const draw = () => {
    g.save();
    g.filter = GRADE;
    g.translate(w, 0);
    g.scale(-1, 1);
    g.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
    g.restore();
    g.filter = 'none';
  };

  /* seek するとレンダラが落ちるため、早送りで頭出しする */
  v.playbackRate = 8;
  await v.play();
  await new Promise((r) => {
    const w8 = () => (v.currentTime >= start - 1.2 ? r() : setTimeout(w8, 20));
    w8();
  });
  v.playbackRate = 1;
  await new Promise((r) => {
    const w8 = () => (v.currentTime >= start ? r() : setTimeout(w8, 8));
    w8();
  });

  const FADE = 0.8;
  const stream = c.captureStream(60);
  const rec = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.42E01E', videoBitsPerSecond: kbps * 1000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((res) => { rec.onstop = res; });
  const t0 = v.currentTime;
  let posterData = null;
  rec.start();
  await new Promise((finish) => {
    const frame = () => {
      const el = v.currentTime - t0;
      draw();
      if (!posterData && el > len * 0.45) posterData = c.toDataURL('image/jpeg', 0.82);
      const a = Math.max(
        Math.min(1, Math.max(0, 1 - el / FADE)),
        Math.min(1, Math.max(0, (el - (len - FADE)) / FADE))
      );
      if (a > 0) { g.globalAlpha = a; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
      if (el >= len) { finish(); return; }
      v.requestVideoFrameCallback(frame);
    };
    v.requestVideoFrameCallback(frame);
  });
  rec.stop();
  await done;
  v.pause();

  /* 静止画はクリップの中ほどのコマ（白板をかける前に控えてある） */
  const poster = posterData || c.toDataURL('image/jpeg', 0.82);

  const buf = await new Blob(chunks, { type: 'video/mp4' }).arrayBuffer();
  let s = '';
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return { video: btoa(s), poster };
}, { start: START, len: LEN, w: W, h: H, kbps: KBPS });

writeFileSync(`${ROOT}/${OUT}`, Buffer.from(b64.video, 'base64'));
writeFileSync(`${ROOT}/${POSTER}`, Buffer.from(b64.poster.split(',')[1], 'base64'));
const mb = (Buffer.from(b64.video, 'base64').length / 1048576).toFixed(2);
console.log(`書き出し: ${OUT} ${mb}MB / ${POSTER}`);
await browser.close();
srv.close();
