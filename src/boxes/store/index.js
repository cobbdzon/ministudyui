import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

let db = null;

export function open(path) {
  db = new Database(path);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('PRAGMA busy_timeout=5000');
  db.exec('PRAGMA synchronous=NORMAL');
  return db;
}

export function migrate() {
  const v = db.prepare('PRAGMA user_version').get().user_version;
  if (v < 1) {
    const sql = readFileSync(join(__dir, 'schema.sql'), 'utf8');
    db.exec(sql);
    db.exec('PRAGMA user_version = 1');
  }
}

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function run(sql, params = []) { return db.prepare(sql).run(...params); }
export function get(sql, params = []) { return db.prepare(sql).get(...params); }
export function all(sql, params = []) { return db.prepare(sql).all(...params); }

export function close() { if (db) { db.close(); db = null; } }