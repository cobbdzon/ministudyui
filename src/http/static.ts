import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Context } from 'hono';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// In the dev source tree ROOT is the repo root; in a bundled Electrobun app
// build.copy places assets under Resources/app/. Support both layouts.
const APP_ROOT = path.join(ROOT, 'app');
const webDir = (name: string): string =>
  existsSync(path.join(APP_ROOT, name, 'index.html'))
    ? path.join(APP_ROOT, name)
    : path.join(ROOT, name);
const WEB_SOURCE = webDir('web');
const DIST_WEB = webDir(path.join('dist', 'web'));
const SHARED = path.join(ROOT, 'shared');

// Dev flow always uses web/ (Bun transpiles .ts on request). The production
// bundle is opt-in so a stale dist/ never shadows a running dev server.
let WEB = WEB_SOURCE;
export function configureStatic(options: { dist?: boolean }): void {
  WEB = options.dist && existsSync(path.join(DIST_WEB, 'index.html')) ? DIST_WEB : WEB_SOURCE;
}
// Hono's client is a runtime import in the browser. There is no bundler, so an
// import map points "hono/client" at /vendor/hono/client/index.js and we serve
// the whole dist tree from here (its internal imports are relative).
const VENDOR = path.join(ROOT, 'node_modules', 'hono', 'dist');
const MARKDOWN = path.join(ROOT, 'node_modules', 'marked', 'lib');

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.json': 'application/json',
};

export function serveStatic(c: Context): Response {
  const url = new URL(c.req.url);
  let pathname: string;
  try { pathname = decodeURIComponent(url.pathname); } catch { pathname = url.pathname; }
  if (pathname.startsWith('/shared/')) {
    return send(path.join(SHARED, pathname.slice('/shared/'.length)), false, SHARED);
  }
  if (pathname.startsWith('/vendor/hono/')) {
    return send(path.join(VENDOR, pathname.slice('/vendor/hono/'.length)), false, VENDOR);
  }
  if (pathname.startsWith('/vendor/marked/')) {
    return send(path.join(MARKDOWN, pathname.slice('/vendor/marked/'.length)), false, MARKDOWN);
  }
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  return send(path.join(WEB, rel), true, WEB);
}

function send(candidate: string, spa: boolean, base: string): Response {
  const resolved = path.resolve(candidate);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    return new Response('Forbidden', { status: 403 }); // path traversal guard
  }

  let file = resolved;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (spa && file.endsWith('.js')) {
      const ts = file.replace(/\.js$/, '.ts');
      if (existsSync(ts)) file = ts;
      else file = path.join(WEB, 'index.html');
    } else if (spa) {
      file = path.join(WEB, 'index.html');
    } else {
      return new Response('Not found', { status: 404 });
    }
  }
  // Re-check the final path after the .js -> .ts / SPA fallback.
  if (file !== base && !file.startsWith(base + path.sep)) {
    return new Response('Forbidden', { status: 403 });
  }

  const ext = path.extname(file);
  if (ext === '.ts') {
    const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(readFileSync(file, 'utf8'));
    return new Response(code, { headers: { 'Content-Type': 'text/javascript' } });
  }
  return new Response(Bun.file(file), {
    headers: { 'Content-Type': MIME[ext] ?? 'application/octet-stream' },
  });
}
