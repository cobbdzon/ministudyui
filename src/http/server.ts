import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as store from '../boxes/store/index.js';
import { app } from './app.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'ministudy.db');
mkdirSync(path.dirname(DB_PATH), { recursive: true });
store.open(DB_PATH);
store.migrate();

const port = Number(process.env.PORT || 3000);
Bun.serve({ fetch: app.fetch, port, hostname: '127.0.0.1', idleTimeout: 255 });
console.log(`ministudyui http://127.0.0.1:${port}`);
