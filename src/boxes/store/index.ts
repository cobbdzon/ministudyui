import { Database, type SQLQueryBindings, type Changes } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

let db: Database | null = null;

export interface RunResult { changes: number; lastInsertRowid: number }

export function open(path: string): Database {
  db = new Database(path);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('PRAGMA busy_timeout=5000');
  db.exec('PRAGMA synchronous=NORMAL');
  return db;
}

export function migrate(): void {
  const v = (db!.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (v < 1) {
    const sql = readFileSync(join(__dir, 'schema.sql'), 'utf8');
    db!.exec(sql);
    db!.exec('PRAGMA user_version = 1');
  }
  if (v < 2) {
    // One quiz per deck (a quiz already has a single deck_id). Keep the oldest
    // quiz linked if an existing database has more than one, then enforce it.
    db!.exec(`UPDATE quizzes SET deck_id = NULL WHERE deck_id IS NOT NULL AND id NOT IN (
      SELECT MIN(id) FROM quizzes WHERE deck_id IS NOT NULL GROUP BY deck_id
    )`);
    db!.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_quizzes_deck ON quizzes(deck_id) WHERE deck_id IS NOT NULL');
    db!.exec('PRAGMA user_version = 2');
  }
}

export function tx<T>(fn: () => T): T {
  db!.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db!.exec('COMMIT'); return r; }
  catch (e) { db!.exec('ROLLBACK'); throw e; }
}

export function run(sql: string, params: SQLQueryBindings[] = []): RunResult {
  const r: Changes = db!.prepare(sql).run(...params);
  return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid ?? 0) };
}
export function get<T>(sql: string, params: SQLQueryBindings[] = []): T | null {
  return (db!.prepare(sql).get(...params) as T | undefined) ?? null;
}
export function all<T>(sql: string, params: SQLQueryBindings[] = []): T[] {
  return db!.prepare(sql).all(...params) as T[];
}
export function count(sql: string, params: SQLQueryBindings[] = []): number {
  return Number(get<{ n: number }>(sql, params)?.n ?? 0);
}

export function close(): void { if (db) { db.close(); db = null; } }
