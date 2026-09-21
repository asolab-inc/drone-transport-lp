/* ============================================================
   01-hero — real-time WebGL flight scene (three.js)
   山の稜線を越えて荷物を吊り下げ輸送するイメージ（3DCG）
   ============================================================ */
import {
  ACESFilmicToneMapping, AdditiveBlending, BackSide, BoxGeometry, BufferAttribute,
  BufferGeometry, CanvasTexture, CatmullRomCurve3, CircleGeometry, Color, CylinderGeometry,
  DirectionalLight, DoubleSide, Euler, Fog, Group, HemisphereLight, LatheGeometry, MathUtils,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, PerspectiveCamera,
  PlaneGeometry, Quaternion, RepeatWrapping, RingGeometry, Scene, SphereGeometry, SRGBColorSpace,
  TorusGeometry, Vector3, WebGLRenderer,
} from 'three';

const clamp = MathUtils.clamp;
const sstep = MathUtils.smoothstep;

function hash2(ix, iz) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  const t = a + (b - a) * u;
  return t + ((c + (d - c) * u) - t) * v;
}
/* smooth pseudo-random 1D signal, for wind gusts */
function wind1(t) {
  return 0.55 * Math.sin(t * 0.83 + 1.7) + 0.28 * Math.sin(t * 1.91 + 0.4) + 0.17 * Math.sin(t * 3.67 + 2.9);
}

/* ---------------- terrain field ---------------- */
const LOAD = { x: -128, z: 176 };
const DROP = { x: 176, z: -142 };
const RD = (() => {
  const dx = DROP.x - LOAD.x, dz = DROP.z - LOAD.z;
  const l = Math.hypot(dx, dz);
  return { x: dx / l, z: dz / l, len: l };
})();

function baseH(x, z) {
  const s = 1 / 520;
  let a = 1, f = 1, sum = 0, nrm = 0;
  for (let i = 0; i < 5; i++) { sum += a * vnoise(x * s * f + 13.7, z * s * f + 5.3); nrm += a; a *= 0.5; f *= 2.03; }
  const fbm = sum / nrm;
  a = 1; f = 1; let r = 0, rn = 0;
  for (let i = 0; i < 5; i++) {
    const n = vnoise(x * s * f * 0.78 + 61.1, z * s * f * 0.78 + 23.9);
    r += a * (1 - Math.abs(n * 2 - 1)); rn += a; a *= 0.5; f *= 2.11;
  }
  const ridge = Math.pow(r / rn, 2.15);
  let h = (fbm * 0.42 + ridge * 0.9) * 340 - 52;
  const dRidge = Math.abs(x * RD.x + z * RD.z);
  h += 132 * Math.exp(-Math.pow(dRidge / 104, 2));
  h -= 110 * Math.exp(-Math.pow(Math.hypot(x - LOAD.x, z - LOAD.z) / 172, 2));
  h += 62 * Math.exp(-Math.pow(Math.hypot(x - DROP.x, z - DROP.z) / 150, 2));
  return h;
}
const H_LOAD = baseH(LOAD.x, LOAD.z);
const H_DROP = baseH(DROP.x, DROP.z);
function padMask(x, z) {
  return Math.max(
    1 - sstep(Math.hypot(x - LOAD.x, z - LOAD.z), 15, 52),
    1 - sstep(Math.hypot(x - DROP.x, z - DROP.z), 13, 46)
  );
}
function terrainH(x, z) {
  const a = 1 - sstep(Math.hypot(x - LOAD.x, z - LOAD.z), 16, 56);
  const b = 1 - sstep(Math.hypot(x - DROP.x, z - DROP.z), 14, 50);
  return baseH(x, z) * (1 - a - b) + H_LOAD * a + H_DROP * b;
}

/* ---------------- procedural textures ---------------- */
function rotorTexture() {
  const s = 256, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const c = s / 2;
  const rg = g.createRadialGradient(c, c, s * 0.05, c, c, c);
  rg.addColorStop(0, 'rgba(214,228,246,.55)');
  rg.addColorStop(0.32, 'rgba(190,210,235,.14)');
  rg.addColorStop(0.8, 'rgba(200,220,245,.30)');
  rg.addColorStop(0.96, 'rgba(214,232,255,.10)');
  rg.addColorStop(1, 'rgba(214,232,255,0)');
  g.fillStyle = rg;
  g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const a0 = (i / 26) * Math.PI * 2 + hash2(i, 3) * 0.3;
    const sw = 0.16 + hash2(i, 9) * 0.5;
    g.strokeStyle = `rgba(228,240,255,${(0.03 + hash2(i, 17) * 0.07).toFixed(3)})`;
    g.lineWidth = 1 + hash2(i, 23) * 6;
    g.beginPath(); g.arc(c, c, c * (0.24 + hash2(i, 31) * 0.72), a0, a0 + sw); g.stroke();
  }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}
function glowTexture() {
  const s = 128, cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.2, 'rgba(255,255,255,.5)');
  rg.addColorStop(0.5, 'rgba(255,255,255,.1)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, s, s);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}
/* フレコンバッグの布：織り目・汚れ・縫い目をプロシージャルに生成 */
function fabricTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c9a468';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 3) {
    g.fillStyle = y % 6 === 0 ? 'rgba(255,255,255,.10)' : 'rgba(90,60,25,.10)';
    g.fillRect(0, y, 256, 1.5);
  }
  for (let x = 0; x < 256; x += 3) {
    g.fillStyle = x % 6 === 0 ? 'rgba(255,255,255,.07)' : 'rgba(90,60,25,.08)';
    g.fillRect(x, 0, 1.5, 256);
  }
  for (let i = 0; i < 220; i++) {
    const r = 6 + Math.random() * 26;
    const rr = 120 + (Math.random() * 60 | 0);
    const gg = 88 + (Math.random() * 40 | 0);
    g.fillStyle = 'rgba(' + rr + ',' + gg + ',40,' + (0.02 + Math.random() * 0.05).toFixed(3) + ')';
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(70,48,20,.3)';
  g.lineWidth = 2;
  g.setLineDash([5, 4]);
  for (const x of [40, 216]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(2.4, 1.6);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function dashTexture() {
  const w = 64, h = 8, cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(4, 0, 34, h);
  const t = new CanvasTexture(cv);
  t.wrapS = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/* ============================================================ */
const section = document.querySelector('[data-section="01-hero"]');
if (section) boot(section);

function boot(root) {
  const stage = root.querySelector('[data-hero-stage]');
  const canvas = root.querySelector('[data-hero-canvas]');
  const hud = root.querySelector('[data-hero-hud]');
  const inset = root.querySelector('[data-hero-inset]');
  if (!stage || !canvas) return;

  const shot = !!(window.ASO && window.ASO.isShot);
  const reduced = !!(window.ASO && window.ASO.reducedMotion);
  const still = shot || reduced;

  const fallbackToPhoto = () => {
    stage.classList.add('is-photo');
    canvas.remove();
    if (inset) inset.hidden = true;
    if (hud) hud.hidden = true;
  };

  let renderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: !shot && (window.devicePixelRatio || 1) < 1.6,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: shot,
    });
  } catch (err) { renderer = null; }
  if (!renderer || !renderer.getContext()) { fallbackToPhoto(); return; }

  /* ---------- quality budget ---------- */
  const narrow = window.matchMedia('(max-width: 767px)').matches;
  const lowSpec = (navigator.hardwareConcurrency || 4) <= 4;
  let dprCap = shot ? 1 : (narrow ? 1.5 : 1.75);
  const SEG = shot ? 184 : (lowSpec || narrow ? 144 : 232);
  const SIZE = 4600;
  const HALF = SIZE / 2;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.30;

  /* ---------- scene ---------- */
  const HORIZON = 0x5e89b0;
  const scene = new Scene();
  scene.fog = new Fog(HORIZON, 480, 1960);
  const camera = new PerspectiveCamera(42, 16 / 9, 1, 6400);
  const sunDir = new Vector3(-0.54, 0.3, -0.79).normalize();

  /* sky dome — vertex coloured, no custom shader */
  const skyGeo = new SphereGeometry(4200, 44, 30);
  {
    const p = skyGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    const cTop = new Color(0x050d1a), cMid = new Color(0x17457a);
    const cHor = new Color(HORIZON), cWarm = new Color(0xecb886), cLow = new Color(0x16314e);
    const c = new Color(), d = new Vector3();
    for (let i = 0; i < p.count; i++) {
      d.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      const t = d.y;
      c.copy(cHor).lerp(cMid, sstep(t, 0.0, 0.3));
      c.lerp(cTop, sstep(t, 0.24, 0.82));
      if (t < 0.03) c.lerp(cLow, sstep(-t, -0.03, 0.18));
      const warm = Math.pow(Math.max(d.dot(sunDir), 0), 3.4) * 0.62 * (1 - sstep(t, 0.08, 0.5));
      c.lerp(cWarm, clamp(warm, 0, 0.72));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    skyGeo.setAttribute('color', new BufferAttribute(col, 3));
  }
  const sky = new Mesh(skyGeo, new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  scene.add(sky);

  /* light — low morning sun + sky bounce */
  const sun = new DirectionalLight(0xffe3c0, 3.0);
  sun.position.copy(sunDir).multiplyScalar(1600);
  scene.add(sun);
  const bounce = new DirectionalLight(0x8ab8ff, 0.5);
  bounce.position.set(0.6, 0.3, 0.74).multiplyScalar(900);
  scene.add(bounce);
  scene.add(new HemisphereLight(0xc7e2ff, 0x2c4529, 1.75));

  /* ---------- terrain ---------- */
  const terrGeo = new PlaneGeometry(SIZE, SIZE, SEG, SEG);
  terrGeo.rotateX(-Math.PI / 2);
  {
    const p = terrGeo.attributes.position;
    /* concentrate vertices near the flight area, coarse toward the horizon */
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / HALF, v = p.getZ(i) / HALF;
      const wx = Math.sign(u) * Math.pow(Math.abs(u), 1.7) * HALF;
      const wz = Math.sign(v) * Math.pow(Math.abs(v), 1.7) * HALF;
      p.setXYZ(i, wx, terrainH(wx, wz), wz);
    }
    p.needsUpdate = true;
    terrGeo.computeVertexNormals();
    const n = terrGeo.attributes.normal;
    const col = new Float32Array(p.count * 3);
    const cedarA = new Color(0x21401f), cedarB = new Color(0x35592e), broad = new Color(0x5c8046);
    const soil = new Color(0x7e6b4e), rock = new Color(0x908a7c), dry = new Color(0xa49b74);
    const c = new Color(), tmp = new Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const slope = clamp(1 - n.getY(i), 0, 1);
      const h01 = clamp((y + 60) / 400, 0, 1);
      const v1 = vnoise(x * 0.0055 + 3.1, z * 0.0055 + 7.7);
      const v2 = vnoise(x * 0.019 + 21.5, z * 0.019 + 9.2);
      c.copy(cedarA).lerp(cedarB, clamp(v1 * 1.35, 0, 1));
      c.lerp(broad, sstep(v2, 0.56, 0.92) * 0.5);
      c.lerp(soil, sstep(slope, 0.3, 0.58) * 0.8);
      c.lerp(rock, sstep(slope, 0.52, 0.78));
      c.lerp(dry, sstep(h01, 0.72, 0.99) * 0.5);
      const pm = padMask(x, z);
      if (pm > 0.002) c.lerp(tmp.copy(soil).lerp(dry, 0.5), pm * 0.85);
      const sh = 0.88 + v2 * 0.24;
      col[i * 3] = c.r * sh; col[i * 3 + 1] = c.g * sh; col[i * 3 + 2] = c.b * sh;
    }
    terrGeo.setAttribute('color', new BufferAttribute(col, 3));
  }
  const terrMat = new MeshLambertMaterial({ vertexColors: true, fog: true });
  terrMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;'
    );
    sh.fragmentShader = 'varying vec3 vWP;\n' + sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float camD = length(vWP - cameraPosition);
      float nearK = 1.0 - smoothstep(90.0, 1000.0, camD);
      /* 面法線から斜度を求める（急斜面は岩肌、緩斜面は杉林） */
      vec3 fn = normalize(cross(dFdx(vWP), dFdy(vWP)));
      float slope = 1.0 - clamp(abs(fn.y), 0.0, 1.0);
      float forest = 1.0 - smoothstep(0.40, 0.70, slope);
      /* 樹冠のざらつき：複数周波数を重ねて針葉樹林の粒状感を出す */
      float c1 = sin(vWP.x * 1.90) * sin(vWP.z * 2.10);
      float c2 = sin(vWP.x * 4.70 + 1.3) * sin(vWP.z * 4.10 - 0.7);
      float c3 = sin(vWP.x * 9.30 - 2.1) * sin(vWP.z * 8.70 + 0.5);
      float canopy = c1 * 0.55 + c2 * 0.30 + c3 * 0.15;
      diffuseColor.rgb *= 1.0 + canopy * 0.20 * nearK * forest;
      /* 林床の色ムラ */
      diffuseColor.rgb *= 1.0 + sin(vWP.x * 0.21 + 2.0) * sin(vWP.z * 0.18) * 0.06;
      /* 露出した岩肌・土 */
      vec3 rock = vec3(0.35, 0.31, 0.27);
      diffuseColor.rgb = mix(diffuseColor.rgb, rock, smoothstep(0.46, 0.86, slope) * 0.62 * (0.35 + 0.65 * nearK));
      /* 等高線（測量会社らしさ） */
      float cf = vWP.y / 24.0;
      float cg = abs(fract(cf - 0.5) - 0.5) / max(fwidth(cf), 1e-5);
      float cline = (1.0 - clamp(cg, 0.0, 1.0)) * (1.0 - smoothstep(280.0, 1500.0, camD));
      diffuseColor.rgb += cline * 0.075 * vec3(0.42, 0.66, 1.0);`
    );
  };
  terrMat.customProgramCacheKey = () => 'aso-hero-terrain';
  scene.add(new Mesh(terrGeo, terrMat));

  /* ---------- flight route ---------- */
  const midX = (LOAD.x + DROP.x) * 0.5, midZ = (LOAD.z + DROP.z) * 0.5;
  const hRidge = terrainH(midX, midZ);
  const side = { x: -RD.z, z: RD.x };
  const wp = [
    new Vector3(LOAD.x, H_LOAD + 21, LOAD.z),
    new Vector3(LOAD.x + RD.x * 88 + side.x * 8, H_LOAD + 74, LOAD.z + RD.z * 88 + side.z * 8),
    new Vector3(midX - RD.x * 14, hRidge + 46, midZ - RD.z * 14),
    new Vector3(DROP.x - RD.x * 84 + side.x * 6, H_DROP + 78, DROP.z - RD.z * 84 + side.z * 6),
    new Vector3(DROP.x, H_DROP + 20, DROP.z),
    new Vector3(DROP.x - RD.x * 62 - side.x * 168, H_DROP + 124, DROP.z - RD.z * 62 - side.z * 168),
    new Vector3(midX - side.x * 258, hRidge + 104, midZ - side.z * 258),
    new Vector3(LOAD.x + RD.x * 62 - side.x * 176, H_LOAD + 138, LOAD.z + RD.z * 62 - side.z * 176),
  ];
  const curve = new CatmullRomCurve3(wp, true, 'centripetal', 0.5);
  curve.arcLengthDivisions = 700;
  const CURVE_LEN = curve.getLength();
  const uOf = (target) => {
    let best = 0, bd = Infinity;
    const t = new Vector3();
    for (let i = 0; i <= 600; i++) {
      const u = i / 600;
      curve.getPointAt(u, t);
      const d = t.distanceToSquared(target);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  };
  const U_LOAD = uOf(wp[0]);
  const U_DROP = uOf(wp[4]);
  const wrap1 = (a) => ((a % 1) + 1.5) % 1 - 0.5;
  const bump = (u, c, w) => Math.exp(-Math.pow(wrap1(u - c) / w, 2));
  const speedAt = (u) => {
    const s = Math.max(bump(u, U_LOAD, 0.05), bump(u, U_DROP, 0.05));
    return 3.4 + 16.4 * (1 - s);
  };

  /* dashed ground track between the two pads */
  {
    const N = 200, halfW = 1.05;
    const pts = [], verts = [], uvs = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const p = curve.getPointAt((i / N) * U_DROP);
      pts.push(new Vector3(p.x, terrainH(p.x, p.z) + 3.4, p.z));
    }
    let run = 0;
    for (let i = 0; i <= N; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      if (i > 0) run += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      const nx = -dz / l, nz = dx / l, uu = run / 5.5;
      verts.push(p.x + nx * halfW, p.y, p.z + nz * halfW, p.x - nx * halfW, p.y, p.z - nz * halfW);
      uvs.push(uu, 1, uu, 0);
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    g.setIndex(idx);
    scene.add(new Mesh(g, new MeshBasicMaterial({
      map: dashTexture(), color: 0xbcdcff, transparent: true, opacity: 0.26,
      depthWrite: false, side: DoubleSide, fog: true,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    })));
  }

  /* landing / loading pads */
  const pulses = [];
  function makePad(px, pz, hue) {
    const g = new Group();
    g.position.set(px, terrainH(px, pz) + 1.8, pz);
    g.scale.setScalar(0.62);
    const add = (geo, opacity, blend) => {
      const par = { color: hue, transparent: true, opacity, side: DoubleSide, depthWrite: false, fog: true };
      if (blend) par.blending = blend;
      const m = new Mesh(geo, new MeshBasicMaterial(par));
      m.rotation.x = -Math.PI / 2;
      g.add(m);
      return m;
    };
    add(new RingGeometry(10.6, 12.1, 72), 0.42);
    add(new CircleGeometry(10.3, 48), 0.08);
    add(new RingGeometry(3.0, 3.9, 40), 0.28);
    for (let i = 0; i < 2; i++) {
      const m = add(new RingGeometry(11.5, 12.7, 64), 0.22, AdditiveBlending);
      m.position.y = 0.7;
      pulses.push({ m, off: i * 0.5 });
    }
    scene.add(g);
  }
  makePad(LOAD.x, LOAD.z, 0x8fd0ff);
  makePad(DROP.x, DROP.z, 0x7cc4ff);

  /* ---------- aircraft (DJI FlyCart 30 silhouette) ---------- */
  const craft = new Group();
  scene.add(craft);
  const shell = new MeshStandardMaterial({ color: 0x4b545f, metalness: 0.4, roughness: 0.48 });
  const dark = new MeshStandardMaterial({ color: 0x272d37, metalness: 0.5, roughness: 0.45 });
  const pale = new MeshStandardMaterial({ color: 0x8a939f, metalness: 0.35, roughness: 0.55 });

  const body = new Mesh(new BoxGeometry(1.06, 0.5, 1.52), shell);
  body.position.y = 0.04;
  craft.add(body);
  const deck = new Mesh(new BoxGeometry(0.84, 0.26, 1.04), dark);
  deck.position.y = 0.36;
  craft.add(deck);
  const nose = new Mesh(new BoxGeometry(0.64, 0.3, 0.44), dark);
  nose.position.set(0, -0.05, 0.84);
  craft.add(nose);
  const winch = new Mesh(new CylinderGeometry(0.17, 0.2, 0.26, 16), dark);
  winch.position.y = -0.3;
  craft.add(winch);

  const rotors = [];
  const rotorTex = rotorTexture();
  const glowTex = glowTexture();
  const diskGeo = new CircleGeometry(0.88, 36);
  diskGeo.rotateX(-Math.PI / 2);
  const armGeo = new CylinderGeometry(0.078, 0.062, 1.3, 10);
  armGeo.rotateZ(Math.PI / 2);
  armGeo.translate(0.66, 0, 0);
  const hubGeo = new CylinderGeometry(0.07, 0.07, 0.1, 10);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const tipX = Math.cos(a) * 1.28, tipZ = Math.sin(a) * 1.28;
    const arm = new Mesh(armGeo, shell);
    arm.rotation.y = -a;
    arm.position.y = 0.02;
    craft.add(arm);
    const motor = new Mesh(new CylinderGeometry(0.15, 0.13, 0.52, 14), dark);
    motor.position.set(tipX, 0.12, tipZ);
    craft.add(motor);
    const mast = new Mesh(new CylinderGeometry(0.035, 0.035, 0.34, 8), pale);
    mast.position.set(tipX, 0.44, tipZ);
    craft.add(mast);
    for (let k = 0; k < 2; k++) {
      const disk = new Mesh(diskGeo, new MeshBasicMaterial({
        map: rotorTex, color: 0xdceaf8, transparent: true, opacity: k ? 0.42 : 0.5,
        depthWrite: false, side: DoubleSide, fog: true,
      }));
      disk.position.set(tipX, k ? 0.62 : -0.1, tipZ);
      craft.add(disk);
      rotors.push({ m: disk, sp: (k ? -1 : 1) * (33 + i * 2.7) });
      const hub = new Mesh(hubGeo, dark);
      hub.position.copy(disk.position);
      craft.add(hub);
    }
  }
  for (const sx of [-1, 1]) {
    const skid = new Mesh(new BoxGeometry(0.1, 0.09, 1.44), pale);
    skid.position.set(sx * 0.53, -0.78, 0.02);
    craft.add(skid);
    for (const sz of [-0.46, 0.46]) {
      const leg = new Mesh(new CylinderGeometry(0.045, 0.045, 0.64, 8), pale);
      leg.position.set(sx * 0.47, -0.47, sz);
      leg.rotation.z = sx * 0.12;
      craft.add(leg);
    }
  }
  const glowGeo = new PlaneGeometry(1, 1);
  function navLight(x, y, z, color, scale) {
    const grp = new Group();
    const bulb = new Mesh(new SphereGeometry(0.07, 10, 8), new MeshBasicMaterial({ color, fog: true }));
    grp.add(bulb);
    const halo = new Mesh(glowGeo, new MeshBasicMaterial({
      map: glowTex, color, transparent: true, opacity: 0.9,
      blending: AdditiveBlending, depthWrite: false, fog: false,
    }));
    halo.scale.setScalar(scale);
    grp.add(halo);
    grp.position.set(x, y, z);
    craft.add(grp);
    return { halo, bulb };
  }
  const navR = navLight(-1.14, 0.12, 1.1, 0xff3b30, 1.6);   /* port  */
  const navG = navLight(1.14, 0.12, 1.1, 0x3ddc84, 1.6);    /* stbd  */
  const strobe = navLight(0, -0.24, -0.86, 0xffffff, 2.2);

  /* ---------- sling + payload (verlet) ---------- */
  const CABLE = narrow ? 5.4 : 6.4;
  const NP = 13;
  const segLen = CABLE / (NP - 1);
  const FIXED = 1 / 120;
  const pPos = [], pOld = [];
  for (let i = 0; i < NP; i++) { pPos.push(new Vector3(0, -i * segLen, 0)); pOld.push(new Vector3(0, -i * segLen, 0)); }
  const segGeo = new CylinderGeometry(0.045, 0.045, 1, 6, 1);
  segGeo.translate(0, 0.5, 0);
  const cableMat = new MeshStandardMaterial({ color: 0x8ac7d8, roughness: 0.75, metalness: 0.05 });
  const segs = [];
  for (let i = 0; i < NP - 1; i++) { const m = new Mesh(segGeo, cableMat); scene.add(m); segs.push(m); }

  /* フレコンバッグ：実機（FlyCart 30）に対して過大にならない寸法にする */
  const BAG = 1.02;
  const bagGeo = new LatheGeometry([
    [0.10, -1.00], [0.42, -0.97], [0.66, -0.86], [0.80, -0.62], [0.86, -0.28],
    [0.87, 0.06], [0.84, 0.34], [0.74, 0.56], [0.56, 0.72], [0.34, 0.82], [0.17, 0.90], [0.0, 0.94],
  ].map(([x, y]) => new Vector3(x * BAG * 1.18, y * BAG * 2.05, 0)), 28);
  {
    const p = bagGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r > 0.02) {
        const ang = Math.atan2(z, x);
        /* 詰め物のふくらみと布のたるみ */
        const ty = (y + 0.86 * BAG * 2.05) / (1.9 * BAG * 2.05);
        const taper = 0.80 + 0.20 * Math.min(1, Math.max(0, ty * 1.45));
        const f = taper
          + 0.045 * Math.sin(ang * 4 + y * 1.6)
          + 0.022 * Math.sin(ang * 9 - y * 2.4)
          + 0.014 * Math.sin(ang * 15 + y * 3.1);
        p.setX(i, x * f); p.setZ(i, z * f);
      }
    }
    bagGeo.computeVertexNormals();
    bagGeo.translate(0, -0.86 * BAG * 2.05, 0);
  }
  const bagTex = fabricTexture();
  {
    /* 布のたるみに沿った陰影を頂点カラーに焼き込む（均一発光の風船に見せない） */
    const pos = bagGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const span = Math.max(1e-4, maxY - minY);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = (y - minY) / span;                 /* 0=底 1=上 */
      const ang = Math.atan2(z, x);
      let k = 0.52 + 0.48 * Math.pow(t, 0.72);     /* 底ほど暗い */
      k *= 1 - 0.20 * Math.pow(Math.max(0, t - 0.62) / 0.38, 1.4); /* 絞り口の影 */
      k *= 1 + 0.07 * Math.sin(ang * 4 + 0.8);     /* ベルト位置に沿った明暗 */
      k *= 0.94 + 0.06 * Math.sin(ang * 11 + y * 2.0); /* 布のしわ */
      k = Math.max(0.3, Math.min(1.12, k));
      col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k;
    }
    bagGeo.setAttribute('color', new BufferAttribute(col, 3));
  }
  const bag = new Mesh(bagGeo, new MeshStandardMaterial({
    map: bagTex, bumpMap: bagTex, bumpScale: 0.6,
    color: 0xcda368, roughness: 1, metalness: 0, vertexColors: true, flatShading: false,
  }));
  scene.add(bag);

  /* 吊り上げベルト：バッグ上部からフックへ4本 */
  {
    const strapMat = new MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.8, metalness: 0.02, side: DoubleSide });
    const topY = 0.1 * BAG * 1.5;
    const hookY = topY + 0.92;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const rx = Math.cos(a) * 0.62 * BAG * 1.35, rz = Math.sin(a) * 0.62 * BAG * 1.35;
      const from = new Vector3(rx, topY - 0.34, rz);
      const to = new Vector3(0, hookY, 0);
      const len = from.distanceTo(to);
      const strap = new Mesh(new PlaneGeometry(0.1, len), strapMat);
      strap.position.copy(from).lerp(to, 0.5);
      strap.lookAt(strap.position.clone().add(new Vector3(0, 0, 1)));
      const dir = to.clone().sub(from).normalize();
      strap.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      strap.rotateY(a);
      bag.add(strap);
    }
    const ring = new Mesh(new TorusGeometry(0.15, 0.045, 8, 18), new MeshStandardMaterial({ color: 0x9aa6b4, roughness: 0.5, metalness: 0.7 }));
    ring.position.y = hookY;
    ring.rotation.x = Math.PI / 2;
    bag.add(ring);
  }

  /* ---------- state ---------- */
  const st = {
    dist: 0, t: 0, spd: 4, alt: 0, windSpd: 0,
    pos: new Vector3(), vel: new Vector3(), prevVel: new Vector3(), acc: new Vector3(),
    q: new Quaternion(), e: new Euler(0, 0, 0, 'YXZ'),
    hook: new Vector3(), wind: new Vector3(),
  };
  const tmpV = new Vector3(), tmpA = new Vector3(), tmpB = new Vector3(), tmpQ = new Quaternion();
  const UP = new Vector3(0, 1, 0);
  const camTarget = new Vector3(), camWant = new Vector3();
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let physAcc = 0;

  function stepCraft(dt) {
    st.t += dt;
    const target = speedAt((st.dist / CURVE_LEN) % 1);
    st.spd += (target - st.spd) * Math.min(1, dt * 1.5);
    st.dist += st.spd * dt;
    const u = (st.dist / CURVE_LEN) % 1;
    curve.getPointAt(u, st.pos);
    curve.getTangentAt(u, tmpV);
    st.vel.copy(tmpV).multiplyScalar(st.spd);
    tmpA.copy(st.vel).sub(st.prevVel).divideScalar(Math.max(dt, 1e-4));
    st.acc.lerp(tmpA, Math.min(1, dt * 5));
    st.prevVel.copy(st.vel);

    const wA = wind1(st.t * 0.42) * 0.5 + 0.5;
    const gust = Math.max(0, wind1(st.t * 0.17 + 9.3));
    st.windSpd = 1.9 + wA * 2.3 + gust * 3.2;
    const wDir = 0.6 + wind1(st.t * 0.08) * 0.4;
    st.wind.set(Math.cos(wDir), 0, Math.sin(wDir)).multiplyScalar(st.windSpd);

    const yaw = Math.atan2(st.vel.x, st.vel.z);
    const fwd = tmpA.set(Math.sin(yaw), 0, Math.cos(yaw));
    const right = tmpB.set(fwd.z, 0, -fwd.x);
    const aF = st.acc.dot(fwd), aR = st.acc.dot(right);
    const pitch = clamp(aF * 0.06, -0.3, 0.34) + clamp(st.spd * 0.0075, 0, 0.13) + Math.sin(st.t * 0.9) * 0.012;
    const roll = clamp(-aR * 0.08, -0.5, 0.5) + Math.sin(st.t * 0.63 + 1.1) * 0.022 + st.wind.dot(right) * 0.0045;
    st.e.set(pitch, yaw, roll);
    st.q.setFromEuler(st.e);
    craft.quaternion.slerp(st.q, Math.min(1, dt * 4.5));
    craft.position.copy(st.pos);
    craft.position.y += Math.sin(st.t * 1.35) * 0.09;
    st.hook.set(0, -0.36, 0).applyQuaternion(craft.quaternion).add(craft.position);
    st.alt = Math.max(0, craft.position.y - terrainH(craft.position.x, craft.position.z));
  }

  function solveCable(dt) {
    const dd = dt * dt;
    for (let i = 1; i < NP; i++) {
      const c = pPos[i], o = pOld[i];
      const vx = (c.x - o.x) * 0.9982, vy = (c.y - o.y) * 0.9982, vz = (c.z - o.z) * 0.9982;
      o.copy(c);
      const drag = i === NP - 1 ? 0.42 : 0.12;
      c.x += vx + st.wind.x * drag * dd;
      c.y += vy - 9.81 * dd;
      c.z += vz + st.wind.z * drag * dd;
    }
    pPos[0].copy(st.hook); pOld[0].copy(st.hook);
    for (let k = 0; k < 7; k++) {
      for (let i = 0; i < NP - 1; i++) {
        const a = pPos[i], b = pPos[i + 1];
        tmpV.subVectors(b, a);
        const d = tmpV.length() || 1e-5;
        const diff = (d - segLen) / d;
        const wa = i === 0 ? 0 : (i === NP - 2 ? 0.68 : 0.5);
        const wb = i === 0 ? 1 : (i === NP - 2 ? 0.32 : 0.5);
        a.addScaledVector(tmpV, diff * wa);
        b.addScaledVector(tmpV, -diff * wb);
      }
      pPos[0].copy(st.hook);
    }
  }
  function syncCable() {
    for (let i = 0; i < NP - 1; i++) {
      const a = pPos[i];
      tmpV.subVectors(pPos[i + 1], a);
      const len = tmpV.length() || 1e-5;
      const m = segs[i];
      m.position.copy(a);
      m.quaternion.setFromUnitVectors(UP, tmpA.copy(tmpV).divideScalar(len));
      m.scale.set(1, len, 1);
    }
    const tip = pPos[NP - 1];
    tmpV.subVectors(tip, pPos[NP - 2]);
    tmpA.copy(tmpV).normalize().negate();
    bag.quaternion.setFromUnitVectors(UP, tmpA);
    bag.rotateY(Math.sin(st.t * 0.31) * 0.45 + st.t * 0.055);
    bag.position.copy(tip);
  }

  function step(dt) {
    stepCraft(dt);
    physAcc = Math.min(physAcc + dt, FIXED * 8);
    let guard = 0;
    while (physAcc >= FIXED && guard++ < 8) { solveCable(FIXED); physAcc -= FIXED; }
    syncCable();
    for (const r of rotors) r.m.rotation.y += r.sp * dt;
    const blink = (st.t % 1.15) < 0.08;
    strobe.halo.material.opacity = blink ? 1 : 0;
    strobe.bulb.visible = blink;
    const nb = 0.6 + 0.4 * Math.sin(st.t * 2.1);
    navR.halo.material.opacity = nb;
    navG.halo.material.opacity = nb;
    for (const p of pulses) {
      const k = (st.t * 0.4 + p.off) % 1;
      p.m.scale.setScalar(0.4 + k * 1.5);
      p.m.material.opacity = 0.55 * (1 - k) * (1 - k);
    }
  }

  function placeCamera(dt, snap) {
    const aspect = camera.aspect;
    const wide = aspect >= 1.05;
    const dist = wide ? 25 : 24;
    const yaw = Math.atan2(st.vel.x, st.vel.z) + Math.PI + Math.sin(st.t * 0.085) * 0.42 - 0.2;
    const height = (wide ? 4.2 : 5.4) + Math.sin(st.t * 0.061 + 2.2) * 2.1;
    camWant.set(
      st.pos.x + Math.sin(yaw) * dist + pointer.x * 2.6,
      st.pos.y + height + pointer.y * 1.6,
      st.pos.z + Math.cos(yaw) * dist
    );
    if (snap) camera.position.copy(camWant);
    else camera.position.lerp(camWant, 1 - Math.exp(-dt * 1.35));

    camera.lookAt(st.pos);
    camera.updateMatrixWorld();
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(st.pos);
    const fx = wide ? 0.32 : 0.06;
    const fy = wide ? 0.4 : 0.16;
    tmpA.setFromMatrixColumn(camera.matrixWorld, 0);
    tmpB.setFromMatrixColumn(camera.matrixWorld, 1);
    tmpV.copy(st.pos).addScaledVector(tmpA, -fx * halfH * aspect).addScaledVector(tmpB, -fy * halfH);
    if (snap) camTarget.copy(tmpV);
    else camTarget.lerp(tmpV, 1 - Math.exp(-dt * 2.4));
    camera.lookAt(camTarget);
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);
    tmpQ.copy(craft.quaternion).invert().multiply(camera.quaternion);
    navR.halo.quaternion.copy(tmpQ);
    navG.halo.quaternion.copy(tmpQ);
    strobe.halo.quaternion.copy(tmpQ);
  }

  /* ---------- sizing ---------- */
  let w = 0, h = 0;
  function resize() {
    const r = stage.getBoundingClientRect();
    const nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
    if (nw === w && nh === h) return false;
    w = nw; h = nh;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(w, h, false);
    return true;
  }
  resize();

  /* ---------- HUD ---------- */
  const hudEls = {
    alt: root.querySelector('[data-hud="alt"]'),
    spd: root.querySelector('[data-hud="spd"]'),
    wind: root.querySelector('[data-hud="wind"]'),
  };
  function updateHud() {
    if (hudEls.alt) hudEls.alt.textContent = String(Math.round(st.alt));
    if (hudEls.spd) hudEls.spd.textContent = st.spd.toFixed(1);
    if (hudEls.wind) hudEls.wind.textContent = st.windSpd.toFixed(1);
  }
  let started = false;
  function firstFrame() {
    if (started) return;
    started = true;
    if (still) stage.classList.add('is-instant');
    stage.classList.add('is-3d');
    if (hud) hud.hidden = false;
    updateHud();
  }

  /* warm-up: let the payload build a real swing before the first frame */
  function warmTo(uTarget) {
    const dt = 1 / 60;
    st.dist = CURVE_LEN * 0.07;
    curve.getPointAt(0.07, st.pos);
    curve.getTangentAt(0.07, st.prevVel).multiplyScalar(speedAt(0.07));
    st.spd = speedAt(0.07);
    st.hook.copy(st.pos);
    for (let i = 0; i < NP; i++) { pPos[i].set(st.pos.x, st.pos.y - i * segLen, st.pos.z); pOld[i].copy(pPos[i]); }
    let guard = 0;
    while ((st.dist / CURVE_LEN) % 1 < uTarget && guard++ < 4000) step(dt);
  }

  if (still) {
    warmTo(0.235);
    placeCamera(0, true);
    renderer.render(scene, camera);
    firstFrame();
    window.addEventListener('resize', () => {
      if (resize()) { placeCamera(0, true); renderer.render(scene, camera); }
    }, { passive: true });
    return;
  }

  warmTo(0.15);
  placeCamera(0, true);

  let raf = 0, last = 0, hudAcc = 0, slow = 0, degraded = false;
  let onScreen = true, visible = !document.hidden;

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3.2);
    pointer.y += (-pointer.ty - pointer.y) * Math.min(1, dt * 3.2);
    step(dt);
    placeCamera(dt, false);
    renderer.render(scene, camera);
    if (!started) firstFrame();
    hudAcc += dt;
    if (hudAcc > 0.12) { hudAcc = 0; updateHud(); }
    if (!degraded) {
      slow = dt > 0.036 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 45) { degraded = true; dprCap = 1; w = 0; resize(); }
    }
  }
  const play = () => { if (!raf && onScreen && visible) { last = 0; raf = requestAnimationFrame(loop); } };
  const pause = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      onScreen = es[0].isIntersecting;
      if (onScreen) play(); else pause();
    }, { rootMargin: '140px' }).observe(root);
  }
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) play(); else pause();
  });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize, { passive: true });

  if (window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      pointer.tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
      pointer.ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
    }, { passive: true });
  }

  play();
}
