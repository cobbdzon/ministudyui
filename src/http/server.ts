import { join } from 'node:path';
import * as store from '../boxes/store/index.js';
import { dataDir, ensureDataDir } from '../boxes/paths.js';
import { app } from './app.js';

// Temporary legacy file until per-user DBs are wired in Phase 5.
ensureDataDir();
store.open(join(dataDir(), 'ministudy.db'));
store.migrate();

const port = Number(process.env.PORT || 3000);
Bun.serve({ fetch: app.fetch, port, hostname: '127.0.0.1', idleTimeout: 255 });
console.log(`ministudyui http://127.0.0.1:${port}`);
