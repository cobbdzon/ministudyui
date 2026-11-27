// Cron-friendly backup: consistent VACUUM INTO copies of auth.db and every
// per-user DB, with time-based retention. Prints only paths, never content.
import { Database } from 'bun:sqlite';
import { mkdirSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from '../src/boxes/paths.js';

const root = dataDir();
const backups = join(root, 'backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = join(backups, stamp);
mkdirSync(target, { recursive: true });

function copyInto(source: string, dest: string): void {
  const escaped = dest.replace(/'/g, "''");
  const db = new Database(source, { readonly: true });
  try { db.exec(`VACUUM INTO '${escaped}'`); }
  finally { db.close(); }
}

const sources: string[] = [];
const authFile = join(root, 'auth.db');
if (existsSync(authFile)) sources.push(authFile);
const sharedFile = join(root, 'shared.db');
if (existsSync(sharedFile)) sources.push(sharedFile);
const usersDir = join(root, 'users');
if (existsSync(usersDir)) {
  for (const name of readdirSync(usersDir)) {
    if (/^\d+\.db$/.test(name)) sources.push(join(usersDir, name));
  }
}

mkdirSync(join(target, 'users'), { recursive: true });
for (const source of sources) {
  const name = source === authFile ? 'auth.db'
    : source === sharedFile ? 'shared.db'
      : `users/${source.split('/').pop()}`;
  copyInto(source, join(target, name));
}

const keep = Math.max(1, Number(process.env.BACKUP_KEEP || 14));
const dirs = readdirSync(backups)
  .filter((n) => statSync(join(backups, n)).isDirectory())
  .sort()
  .reverse();
for (const old of dirs.slice(keep)) rmSync(join(backups, old), { recursive: true, force: true });

console.log(`backup: ${sources.length} database(s) -> ${target} (keeping ${keep})`);
