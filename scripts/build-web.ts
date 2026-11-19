// Production build of web/ into dist/web (gitignored). No node_modules needed
// at runtime: TS and vendor deps are bundled, SCSS is compiled, assets copied.
// Dev flow (bun run dev / bun run start) is unchanged and still uses web/.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as sass from 'sass';

const ROOT = path.resolve(import.meta.dir, '..');
const WEB = path.join(ROOT, 'web');
const OUT = path.join(ROOT, 'dist', 'web');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const result = await Bun.build({
  entrypoints: [path.join(WEB, 'app.ts')],
  outdir: OUT,
  target: 'browser',
  format: 'esm',
  minify: true,
  sourcemap: 'none',
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// index.html: the import map is only needed in dev (unbundled bare imports).
const html = readFileSync(path.join(WEB, 'index.html'), 'utf8')
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
writeFileSync(path.join(OUT, 'index.html'), html);

// SCSS sources referenced by index.html (app.scss is intentionally orphaned).
const cssDir = path.join(OUT, 'css');
mkdirSync(cssDir, { recursive: true });
for (const name of ['tokens', 'base', 'components', 'views', 'micro-interactions']) {
  const compiled = sass.compile(path.join(WEB, 'scss', `${name}.scss`), { style: 'compressed' });
  writeFileSync(path.join(cssDir, `${name}.css`), compiled.css);
}

// Static assets, including messages.json fetched relative to the bundle URL.
for (const name of ['favicon.svg', 'og-image.png', 'messages.json']) {
  const src = path.join(WEB, name);
  if (existsSync(src)) cpSync(src, path.join(OUT, name));
}
for (const dir of ['fonts', 'katex']) {
  cpSync(path.join(WEB, dir), path.join(OUT, dir), { recursive: true });
}

const bundle = result.outputs.find((o) => o.path.endsWith('.js'));
console.log(`[build:web] ${path.relative(ROOT, bundle?.path ?? OUT)} -> ${path.relative(ROOT, OUT)}`);
