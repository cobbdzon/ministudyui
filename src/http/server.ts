import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as store from '../boxes/store/index.js';
import { app, configureHttp } from './app.js';
import { configureStatic } from './static.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface StartOptions {
  port?: number;
  dbPath?: string;
  hostname?: string;
  idleTimeout?: number;
  serveDist?: boolean;
}

// Programmatic entry point used by the HTTP server and the desktop shell.
// The loopback Host/Origin guard is configured from the same port, never loosened.
export function start(options: StartOptions = {}) {
  const port = options.port ?? Number(process.env.PORT || 3000);
  const dbPath = options.dbPath ?? process.env.DB_PATH ?? path.join(ROOT, 'data', 'ministudy.db');
  mkdirSync(path.dirname(dbPath), { recursive: true });
  store.open(dbPath);
  store.migrate();
  configureHttp({ port });
  configureStatic({ dist: options.serveDist ?? process.env.MINISTUDY_DIST === '1' });

  const server = Bun.serve({
    fetch: app.fetch,
    port,
    hostname: options.hostname ?? '127.0.0.1',
    idleTimeout: options.idleTimeout ?? 255,
  });
  return { server, port, dbPath };
}

if (import.meta.main) {
  const { port } = start();
  console.log(`ministudyui http://127.0.0.1:${port}`);
}
