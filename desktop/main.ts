// Composition root for the Electrobun desktop shell.
// T11: run the real HTTP app in-process on a free port, DB in user-data dir.
import { BrowserWindow, Utils } from 'electrobun/main';
import { start } from '../src/http/server.js';
import { createPaths } from './boxes/paths/index.js';
import { createServerHost, reserveFreePort } from './boxes/server-host/index.js';
import { windowPolicy } from './boxes/window/index.js';

const token = crypto.randomUUID();
const paths = createPaths({ userData: Utils.paths.userData });
const host = createServerHost({
  dbPath: paths.dbPath,
  findPort: reserveFreePort,
  start: (input) => start({ ...input, token }),
});
const server = host.start();

console.log(`ministudyui desktop: ${server.url} (db: ${paths.dbPath})`);

const mainWindow = new BrowserWindow(windowPolicy({ url: server.url, token }));
void mainWindow;
