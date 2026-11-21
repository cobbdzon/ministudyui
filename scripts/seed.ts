// Production seed: first-initialization only. Creates the data directory and
// migrates the SQLite schema, but inserts no data. Safe to run on every boot.
import { join } from 'node:path';
import * as store from '../src/boxes/store/index.js';
import { dataDir, ensureDataDir } from '../src/boxes/paths.js';

// Temporary legacy file until the auth DB / per-user DBs land in Phase 7.
ensureDataDir();
const file = join(dataDir(), 'ministudy.db');
store.open(file);
store.migrate();
store.close();

console.log(`seed: ${file} is ready (no data added).`);
