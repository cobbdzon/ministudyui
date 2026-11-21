import * as auth from '../boxes/auth/index.js';
import { ensureDataDir } from '../boxes/paths.js';
import { app, config } from './app.js';

ensureDataDir();
auth.open();
auth.migrate();

Bun.serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.bindHost,
  idleTimeout: 255,
});
console.log(`ministudyui listening on ${config.bindHost}:${config.port}`);
