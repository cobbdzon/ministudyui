// Production seed: first-initialization only. Creates the data directory and
// migrates the SQLite schema, but inserts no data. Safe to run on every boot.
import * as path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as store from '../src/boxes/store/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'ministudy.db');

mkdirSync(path.dirname(DB_PATH), { recursive: true });
store.open(DB_PATH);
store.migrate();
store.close();

console.log(`seed: ${DB_PATH} is ready (no data added).`);
