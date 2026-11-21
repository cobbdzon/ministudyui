import { Database, type SQLQueryBindings, type Changes } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as scope from '../scope/index.js';
import { AppError } from '../errors.js';

const __dir = dirname(fileURLToPath(import.meta.url));

// The legacy singleton is kept for open()/migrate()/close() and for scripts.
// SQL helpers intentionally do NOT use it: they resolve the DB from the active
// scope, so a missing scope in a production entry point fails closed.
let defaultDb: Database | null = null;

export interface RunResult { changes: number; lastInsertRowid: number }

function pragmas(db: Database): void {
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('PRAGMA busy_timeout=5000');
  db.exec('PRAGMA synchronous=NORMAL');
}

export function open(path: string): Database {
  const db = new Database(path);
  pragmas(db);
  defaultDb = db;
  // In-memory databases are test-only; installing the fallback here keeps all
  // existing suites working unchanged. File-backed entry points get no fallback.
  if (path === ':memory:') scope.installTestFallback(scope.devContext(db));
  return db;
}

/** Apply migrations to an explicitly supplied DB (used by the userdb registry). */
export function migrateDb(db: Database): void {
  const v = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (v < 1) {
    const sql = readFileSync(join(__dir, 'schema.sql'), 'utf8');
    db.exec(sql);
    db.exec('PRAGMA user_version = 1');
  }
  if (v < 2) {
    db.exec(`UPDATE quizzes SET deck_id = NULL WHERE deck_id IS NOT NULL AND id NOT IN (
      SELECT MIN(id) FROM quizzes WHERE deck_id IS NOT NULL GROUP BY deck_id
    )`);
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_quizzes_deck ON quizzes(deck_id) WHERE deck_id IS NOT NULL');
    db.exec('PRAGMA user_version = 2');
  }
  if (v < 3) {
    const cols = db.prepare('PRAGMA table_info(card_state)').all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'ignored')) {
      db.exec('ALTER TABLE card_state ADD COLUMN ignored INTEGER NOT NULL DEFAULT 0 CHECK (ignored IN (0,1))');
    }
    db.exec('PRAGMA user_version = 3');
  }
  if (v < 4) {
    db.exec(`CREATE TABLE IF NOT EXISTS ui_context (
      id                INTEGER PRIMARY KEY CHECK (id = 1),
      view              TEXT CHECK (view IN ('review','quiz') OR view IS NULL),
      deck_id           INTEGER REFERENCES decks(id) ON DELETE SET NULL,
      card_id           INTEGER REFERENCES cards(id) ON DELETE SET NULL,
      flipped           INTEGER NOT NULL DEFAULT 0 CHECK (flipped IN (0,1)),
      quiz_id           INTEGER REFERENCES quizzes(id) ON DELETE SET NULL,
      attempt_id        INTEGER REFERENCES attempts(id) ON DELETE SET NULL,
      question_id       INTEGER REFERENCES questions(id) ON DELETE SET NULL,
      question_position INTEGER CHECK (question_position IS NULL OR question_position >= 1),
      updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`);
    db.exec('PRAGMA user_version = 4');
  }
  if (v < 5) {
    const quizCols = db.prepare('PRAGMA table_info(quizzes)').all() as Array<{ name: string }>;
    if (!quizCols.some((c) => c.name === 'shuffle'))
      db.exec('ALTER TABLE quizzes ADD COLUMN shuffle INTEGER NOT NULL DEFAULT 0 CHECK (shuffle IN (0,1))');
    const attCols = db.prepare('PRAGMA table_info(attempts)').all() as Array<{ name: string }>;
    if (!attCols.some((c) => c.name === 'question_order_json'))
      db.exec('ALTER TABLE attempts ADD COLUMN question_order_json TEXT');
    db.exec('PRAGMA user_version = 5');
  }
  if (v < 6) {
    // Encrypted names need a blind index for uniqueness. Fresh v6 databases
    // already have the column and UNIQUE constraint from schema.sql.
    const deckCols = db.prepare('PRAGMA table_info(decks)').all() as Array<{ name: string }>;
    if (!deckCols.some((c) => c.name === 'name_key')) {
      db.exec('ALTER TABLE decks ADD COLUMN name_key TEXT');
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_decks_name_key_v6 ON decks(name_key)');
    db.exec('PRAGMA user_version = 6');
  }
}

export function migrate(): void {
  migrateDb(defaultDb ?? scope.current().db);
}

function assertDbSize(db: Database): void {
  const maxMb = Number(process.env.MAX_USER_DB_MB || 512);
  if (!Number.isFinite(maxMb) || maxMb <= 0) return;
  const pages = (db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count;
  const size = (db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size;
  if (pages * size > maxMb * 1024 * 1024) {
    throw new AppError('CONFLICT', `User database exceeded ${maxMb} MB limit`);
  }
}

export function tx<T>(fn: () => T): T {
  const db = scope.current().db;
  assertDbSize(db);
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function run(sql: string, params: SQLQueryBindings[] = []): RunResult {
  const db = scope.current().db;
  assertDbSize(db);
  const r: Changes = db.prepare(sql).run(...params);
  return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid ?? 0) };
}
export function get<T>(sql: string, params: SQLQueryBindings[] = []): T | null {
  return (scope.current().db.prepare(sql).get(...params) as T | undefined) ?? null;
}
export function all<T>(sql: string, params: SQLQueryBindings[] = []): T[] {
  return scope.current().db.prepare(sql).all(...params) as T[];
}
export function count(sql: string, params: SQLQueryBindings[] = []): number {
  return Number(get<{ n: number }>(sql, params)?.n ?? 0);
}

// DB-agnostic variants for the separate auth.db. SQL stays behind this box.
export function txOn<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
export async function txOnAsync<T>(db: Database, fn: () => Promise<T>): Promise<T> {
  db.exec('BEGIN IMMEDIATE');
  try { const r = await fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
export function runOn(db: Database, sql: string, params: SQLQueryBindings[] = []): RunResult {
  const r: Changes = db.prepare(sql).run(...params);
  return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid ?? 0) };
}
export function getOn<T>(db: Database, sql: string, params: SQLQueryBindings[] = []): T | null {
  return (db.prepare(sql).get(...params) as T | undefined) ?? null;
}
export function allOn<T>(db: Database, sql: string, params: SQLQueryBindings[] = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}
export function countOn(db: Database, sql: string, params: SQLQueryBindings[] = []): number {
  return Number(getOn<{ n: number }>(db, sql, params)?.n ?? 0);
}

export function close(): void {
  if (defaultDb) { defaultDb.close(); defaultDb = null; }
  scope.clearTestFallback();
}
