// Shared quiz library. This box owns shared.db, which is deliberately
// plaintext: publishing is an explicit opt-in to remove encryption for one
// copy of a quiz. Reading and importing happen in the caller's scope; the
// imported copy is written through library.importBundle and is sealed with the
// caller's keys, exactly like any other quiz in their private database.
import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from '../store/index.js';
import * as scope from '../scope/index.js';
import * as library from '../library/index.js';
import { sharedDbPath } from '../paths.js';
import { AppError } from '../errors.js';
import type {
  Bundle, Choice, ImportResult, OkResponse, QuestionAnswer, SharedQuestionDto,
  SharedQuizDetail, SharedQuizSummary, SharedStatus,
} from '../../../shared/types.js';

const __dir = dirname(fileURLToPath(import.meta.url));
let sharedDb: Database | null = null;

interface Row {
  id: number; owner_user_id: number; owner_username: string; source_quiz_id: number;
  title: string; description: string; shuffle: number; question_count: number;
  total_points: number; content_hash: string; published_at: string; updated_at: string;
}
interface QuestionRow {
  id: number; shared_quiz_id: number; position: number; type: SharedQuestionDto['type'];
  prompt: string; choices_json: string | null; answer_json: string;
  explanation: string; points: number;
}

export function open(path: string = sharedDbPath()): Database {
  const db = new Database(path);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('PRAGMA busy_timeout=5000');
  db.exec('PRAGMA synchronous=NORMAL');
  sharedDb = db;
  return db;
}

function db(): Database {
  if (!sharedDb) throw new AppError('INTERNAL', 'Shared store is not open');
  return sharedDb;
}

export function migrate(): void {
  const d = db();
  if ((d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 1) {
    d.exec(readFileSync(join(__dir, 'schema.sql'), 'utf8'));
    d.exec('PRAGMA user_version = 1');
  }
}

export function close(): void {
  if (sharedDb) { sharedDb.close(); sharedDb = null; }
}

function assertSize(d: Database): void {
  const maxMb = Number(process.env.MAX_SHARED_DB_MB || 64);
  if (!Number.isFinite(maxMb) || maxMb <= 0) return;
  const pages = (d.prepare('PRAGMA page_count').get() as { page_count: number }).page_count;
  const size = (d.prepare('PRAGMA page_size').get() as { page_size: number }).page_size;
  if (pages * size > maxMb * 1024 * 1024) {
    throw new AppError('CONFLICT', `Shared library exceeded ${maxMb} MB limit`);
  }
}

function maxPerUser(): number {
  const n = Number(process.env.MAX_SHARED_QUIZZES_PER_USER || 100);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 100;
}

// shared.db is plaintext and may be edited outside the app, so malformed JSON
// must produce a clear error (or a safe fallback), never a raw parse exception.
function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function countForUser(userId: number): number {
  return store.countOn(db(), 'SELECT COUNT(*) AS n FROM shared_quizzes WHERE owner_user_id=?', [userId]);
}

function toSummary(row: Row, userId: number): SharedQuizSummary {
  return {
    id: row.id, title: row.title, description: row.description,
    owner_username: row.owner_username, shuffle: !!row.shuffle,
    question_count: row.question_count, total_points: row.total_points,
    published_at: row.published_at, updated_at: row.updated_at,
    mine: row.owner_user_id === userId,
  };
}

function fingerprint(
  title: string, description: string, shuffle: boolean, questions: SharedQuestionDto[],
): string {
  const canonical = JSON.stringify({
    title, description, shuffle,
    questions: questions.map((q) => ({
      position: q.position, type: q.type, prompt: q.prompt, choices: q.choices ?? null,
      answer: q.answer, explanation: q.explanation, points: q.points,
    })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

// The current private snapshot, read through the caller's scope so all text is
// decrypted before it is copied into the plaintext store.
function currentSnapshot(quizId: number): {
  title: string; description: string; shuffle: boolean; questions: SharedQuestionDto[];
} {
  const got = library.quizGet({ quizId, includeAnswers: true });
  const questions: SharedQuestionDto[] = got.questions.map((q) => ({
    position: q.position, type: q.type, prompt: q.prompt,
    explanation: q.explanation, points: q.points,
    ...(q.choices ? { choices: q.choices } : {}),
    answer: q.answer ?? {},
  }));
  return {
    title: got.quiz.title, description: got.quiz.description,
    shuffle: !!got.quiz.shuffle, questions,
  };
}

export function publish({ quizId, ownerUsername }: { quizId: number; ownerUsername: string }): SharedQuizSummary {
  const d = db();
  const { userId } = scope.current();
  const snap = currentSnapshot(quizId);
  if (!snap.questions.length) throw new AppError('VALIDATION', 'A quiz needs at least one question before it can be shared');
  const existing = store.getOn<{ id: number }>(d,
    'SELECT id FROM shared_quizzes WHERE owner_user_id=? AND source_quiz_id=?', [userId, quizId]);
  const hash = fingerprint(snap.title, snap.description, snap.shuffle, snap.questions);
  const totalPoints = snap.questions.reduce((a, q) => a + (Number(q.points) || 0), 0);
  const id = store.txOn(d, () => {
    // Check inside BEGIN IMMEDIATE so two concurrent publishes cannot both
    // pass the cap before either writes.
    if (!existing && countForUser(userId) >= maxPerUser()) {
      throw new AppError('CONFLICT', `Shared quiz limit reached (${maxPerUser()})`);
    }
    let rowId: number;
    if (existing) {
      store.runOn(d, `UPDATE shared_quizzes
        SET title=?, description=?, shuffle=?, question_count=?, total_points=?, content_hash=?,
            owner_username=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=?`, [snap.title, snap.description, snap.shuffle ? 1 : 0, snap.questions.length,
          totalPoints, hash, ownerUsername, existing.id]);
      rowId = existing.id;
      store.runOn(d, 'DELETE FROM shared_questions WHERE shared_quiz_id=?', [rowId]);
    } else {
      const r = store.runOn(d, `INSERT INTO shared_quizzes
        (owner_user_id, owner_username, source_quiz_id, title, description, shuffle,
         question_count, total_points, content_hash)
        VALUES (?,?,?,?,?,?,?,?,?)`, [userId, ownerUsername, quizId, snap.title, snap.description,
          snap.shuffle ? 1 : 0, snap.questions.length, totalPoints, hash]);
      rowId = Number(r.lastInsertRowid);
    }
    for (const q of snap.questions) {
      store.runOn(d, `INSERT INTO shared_questions
        (shared_quiz_id, position, type, prompt, choices_json, answer_json, explanation, points)
        VALUES (?,?,?,?,?,?,?,?)`, [rowId, q.position, q.type, q.prompt,
          q.choices ? JSON.stringify(q.choices) : null, JSON.stringify(q.answer), q.explanation, q.points]);
    }
    assertSize(d);
    return rowId;
  });
  const row = store.getOn<Row>(d, 'SELECT * FROM shared_quizzes WHERE id=?', [id])!;
  return toSummary(row, userId);
}

export function list({
  q, mine = false, limit = 50,
}: { q?: string; mine?: boolean; limit?: number } = {}): SharedQuizSummary[] {
  const d = db();
  const { userId } = scope.current();
  const lim = Math.min(Math.max(limit || 50, 1), 100);
  const params: (string | number)[] = [];
  let sql = 'SELECT * FROM shared_quizzes WHERE 1=1';
  if (mine) { sql += ' AND owner_user_id=?'; params.push(userId); }
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    sql += ' AND (title LIKE ? OR description LIKE ? OR owner_username LIKE ?)';
    params.push(like, like, like);
  }
  sql += ' ORDER BY updated_at DESC, id DESC LIMIT ?';
  params.push(lim);
  return store.allOn<Row>(d, sql, params).map((row) => toSummary(row, userId));
}

export function get({ id }: { id: number }): SharedQuizDetail {
  const d = db();
  const row = store.getOn<Row>(d, 'SELECT * FROM shared_quizzes WHERE id=?', [id]);
  if (!row) throw new AppError('NOT_FOUND', 'shared quiz not found');
  const questions = store.allOn<QuestionRow>(d,
    'SELECT * FROM shared_questions WHERE shared_quiz_id=? ORDER BY position', [id]).map((q) => {
    const choices = parseJson<Choice[] | null>(q.choices_json, null);
    return {
      position: q.position, type: q.type, prompt: q.prompt, explanation: q.explanation,
      points: q.points, ...(choices ? { choices } : {}),
      answer: parseJson<QuestionAnswer>(q.answer_json, {}),
    };
  });
  return { ...toSummary(row, scope.current().userId), questions };
}

export function statusForQuiz({ quizId }: { quizId: number }): SharedStatus | null {
  const d = db();
  const { userId } = scope.current();
  const row = store.getOn<Row>(d,
    'SELECT * FROM shared_quizzes WHERE owner_user_id=? AND source_quiz_id=?', [userId, quizId]);
  if (!row) return null;
  const snap = currentSnapshot(quizId);
  return {
    shared_id: row.id, updated_at: row.updated_at,
    stale: fingerprint(snap.title, snap.description, snap.shuffle, snap.questions) !== row.content_hash,
  };
}

export function unpublish({ id, allowAny = false }: { id: number; allowAny?: boolean }): OkResponse {
  const d = db();
  const row = store.getOn<{ owner_user_id: number }>(d,
    'SELECT owner_user_id FROM shared_quizzes WHERE id=?', [id]);
  if (!row) throw new AppError('NOT_FOUND', 'shared quiz not found');
  const { userId } = scope.current();
  if (!allowAny && row.owner_user_id !== userId) {
    throw new AppError('FORBIDDEN', 'Only the publisher can remove this quiz');
  }
  store.runOn(d, 'DELETE FROM shared_quizzes WHERE id=?', [id]);
  return { ok: true };
}

export function unpublishForSource(ownerUserId: number, quizId: number): void {
  store.runOn(db(), 'DELETE FROM shared_quizzes WHERE owner_user_id=? AND source_quiz_id=?', [ownerUserId, quizId]);
}

export function deleteAllForUser(userId: number): void {
  store.runOn(db(), 'DELETE FROM shared_quizzes WHERE owner_user_id=?', [userId]);
}

// Import goes through importBundle: one transaction, full validation and every
// field sealed under the caller's key. The quiz has no deck, so it cannot clash
// with the one-quiz-per-deck rule.
export function importInto({ id }: { id: number }): ImportResult {
  const shared = get({ id });
  const bundle: Bundle = {
    quizzes: [{
      title: shared.title, description: shared.description, shuffle: shared.shuffle,
      questions: shared.questions.map((q) => ({
        type: q.type, prompt: q.prompt, explanation: q.explanation, points: q.points,
        ...(q.choices ? { choices: q.choices } : {}),
        ...q.answer,
      })) as never,
    }],
  };
  return library.importBundle(bundle);
}
