// Usage:
//   node tools/build.mjs                 -> index.html + assets/app.{css,js}
//   node tools/build.mjs --only 05-cargo -> preview-05-cargo.html + preview/05-cargo.{css,js}
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const SECTIONS = join(SRC, 'sections');

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1].split(',') : null;

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8').replace(/^\uFEFF/, '') : '');
const all = readdirSync(SECTIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(SECTIONS, d.name, 'section.html')))
  .map((d) => d.name)
  .sort();
const picked = only ? all.filter((n) => only.includes(n)) : all;
if (only && picked.length !== only.length) {
  console.error(`Unknown section in --only. Available: ${all.join(', ')}`);
  process.exit(1);
}

const tag = only ? only.join('+') : 'app';
const outHtml = only ? join(ROOT, `preview-${tag}.html`) : join(ROOT, 'index.html');
const assetDir = only ? join(ROOT, 'preview') : join(ROOT, 'assets');
const assetRel = only ? 'preview' : 'assets';
mkdirSync(assetDir, { recursive: true });

const cssSource = [read(join(SRC, 'base.css')), ...picked.map((n) => read(join(SECTIONS, n, 'section.css')))].join('\n');
const css = (await esbuild.transform(cssSource, { loader: 'css', minify: true, target: ['chrome110', 'safari16'] })).code;
writeFileSync(join(assetDir, `${tag}.css`), css);

const entry = [
  `import ${JSON.stringify(join(SRC, 'base.js').replaceAll('\\', '/'))};`,
  ...picked
    .filter((n) => existsSync(join(SECTIONS, n, 'section.js')))
    .map((n) => `import ${JSON.stringify(join(SECTIONS, n, 'section.js').replaceAll('\\', '/'))};`),
].join('\n');
const js = await esbuild.build({
  stdin: { contents: entry, resolveDir: ROOT, loader: 'js' },
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['chrome110', 'safari16'],
  nodePaths: [join(ROOT, 'tools', 'node_modules')],
  write: false,
  logLevel: 'warning',
});
const jsCode = js.outputFiles[0].text;
writeFileSync(join(assetDir, `${tag}.js`), jsCode);

const v = createHash('sha1').update(css + jsCode).digest('hex').slice(0, 8);
const head = read(join(SRC, 'head.html'));
const header = read(join(SRC, 'header.html'));
const body = picked.map((n) => read(join(SECTIONS, n, 'section.html'))).join('\n');

const html = `<!doctype html>
<html lang="ja">
<head>
${head}
<link rel="stylesheet" href="${assetRel}/${tag}.css?v=${v}">
</head>
<body>
${header}
<main id="main">
${body}
</main>
<script type="module" src="${assetRel}/${tag}.js?v=${v}"></script>
</body>
</html>
`;
writeFileSync(outHtml, html);
console.log(`built ${outHtml.replace(ROOT, '.')}  css ${(css.length / 1024).toFixed(1)}KB  js ${(jsCode.length / 1024).toFixed(1)}KB  sections: ${picked.join(', ')}`);
