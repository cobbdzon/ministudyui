// Registry of per-user SQLite handles. Handles are shared across requests and
// sessions, opened lazily, migrated on open, and evicted LRU with a lease count
// so a handle is never closed while a transaction or request is using it.
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { userDbPath } from '../paths.js';
import * as store from '../store/index.js';
import { AppError } from '../errors.js';

interface Entry {
  db: Database;
  leases: number;
  lastUsed: number;
}

const entries = new Map<number, Entry>();
const cap = (): number => Math.max(1, Number(process.env.MAX_OPEN_USER_DBS || 32));

function closeEntry(userId: number, entry: Entry): void {
  if (entry.leases > 0) return;
  entry.db.close();
  entries.delete(userId);
}

function evictOne(): void {
  let oldestId: number | null = null;
  let oldest = Infinity;
  for (const [id, e] of entries) {
    if (e.leases === 0 && e.lastUsed < oldest) { oldest = e.lastUsed; oldestId = id; }
  }
  if (oldestId !== null) closeEntry(oldestId, entries.get(oldestId)!);
}

export function open(userId: number): Database {
  const existing = entries.get(userId);
  if (existing) {
    existing.leases++;
    existing.lastUsed = Date.now();
    return existing.db;
  }
  while (entries.size >= cap()) {
    const before = entries.size;
    evictOne();
    if (entries.size === before) break; // every handle is leased; allow temporary overshoot
  }
  const file = userDbPath(userId);
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('PRAGMA busy_timeout=5000');
  db.exec('PRAGMA synchronous=NORMAL');
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version > 0 && version < 6) {
    db.close();
    throw new AppError('CONFLICT', 'Legacy user database found; run migrate:legacy instead');
  }
  store.migrateDb(db);
  entries.set(userId, { db, leases: 1, lastUsed: Date.now() });
  return db;
}

export function release(userId: number): void {
  const e = entries.get(userId);
  if (e) { e.leases = Math.max(0, e.leases - 1); e.lastUsed = Date.now(); }
}

export function close(userId: number): void {
  const e = entries.get(userId);
  if (e) closeEntry(userId, e);
}

export function closeAll(): void {
  for (const [id, e] of [...entries]) closeEntry(id, e);
}

export function openCount(): number {
  return entries.size;
}

export function leases(userId: number): number {
  return entries.get(userId)?.leases ?? 0;
}
