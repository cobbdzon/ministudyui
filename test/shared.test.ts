// The shared library is the one intentional plaintext store. These tests pin
// that boundary: published text really is plaintext in shared.db, while the
// copy produced by import is sealed in the caller's database.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as store from '../src/boxes/store/index.js';
import * as scope from '../src/boxes/scope/index.js';
import * as vault from '../src/boxes/vault/index.js';
import * as library from '../src/boxes/library/index.js';
import * as shared from '../src/boxes/shared/index.js';

const TMP_BASE = '/tmp/opencode';
const TITLE = 'CANARY_SHARED_TITLE_9f2c';
const PROMPT = 'CANARY_SHARED_PROMPT_7b41';

let tmp = '';
let oldDir: string | undefined;
let oldCap: string | undefined;
let sharedFile = '';
let sharedDb: Database;

beforeEach(() => {
  tmp = mkdtempSync(join(TMP_BASE, 'ms-shared-'));
  oldDir = process.env.DATA_DIR;
  oldCap = process.env.MAX_SHARED_QUIZZES_PER_USER;
  process.env.DATA_DIR = tmp;
  delete process.env.MAX_SHARED_QUIZZES_PER_USER;
  sharedFile = join(tmp, 'shared.db');
  sharedDb = shared.open(sharedFile);
  shared.migrate();
});

afterEach(() => {
  shared.close();
  if (oldDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDir;
  if (oldCap === undefined) delete process.env.MAX_SHARED_QUIZZES_PER_USER;
  else process.env.MAX_SHARED_QUIZZES_PER_USER = oldCap;
  rmSync(tmp, { recursive: true, force: true });
});

function freshDb(userId: number, name: string): { db: Database; ctx: scope.UserContext; file: string } {
  const file = join(tmp, name);
  const db = new Database(file);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  store.migrateDb(db);
  return {
    db, file,
    ctx: { userId, db, keys: { enc: vault.randomBytes(32), idx: vault.randomBytes(32) } },
  };
}

function rawBytes(file: string): string {
  const db = new Database(file);
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } finally { db.close(); }
  return readFileSync(file).toString('utf8');
}

function makeQuiz(title: string, prompt = PROMPT): number {
  return scope.run(currentCtx!, () => library.quizCreate({
    title, description: 'published description',
    questions: [{
      type: 'mcq', prompt, points: 2,
      choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: 'b',
    }],
  })).id;
}

let currentCtx: scope.UserContext | null = null;

describe('shared quiz library', () => {
  test('publish stores plaintext; import stores an encrypted copy', () => {
    const owner = freshDb(1, 'owner.db');
    currentCtx = owner.ctx;
    const quizId = makeQuiz(TITLE);
    const published = scope.run(owner.ctx, () => shared.publish({ quizId, ownerUsername: 'owner' }));
    expect(published.title).toBe(TITLE);
    expect(published.mine).toBe(true);
    expect(published.question_count).toBe(1);

    sharedDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const sharedText = readFileSync(sharedFile).toString('utf8');
    expect(sharedText).toContain(TITLE);
    expect(sharedText).toContain(PROMPT);

    const reader = freshDb(2, 'reader.db');
    const result = scope.run(reader.ctx, () => shared.importInto({ id: published.id }));
    expect(result.quizzes_created).toBe(1);
    expect(result.questions_added).toBe(1);
    const quizzes = scope.run(reader.ctx, () => library.quizList({}));
    expect(quizzes).toHaveLength(1);
    expect(quizzes[0]!.title).toBe(TITLE);
    expect(quizzes[0]!.deck_id).toBeNull();
    expect(quizzes[0]!.source).toBe('import');
    const detail = scope.run(reader.ctx, () => library.quizGet({ quizId: quizzes[0]!.id, includeAnswers: true }));
    expect(detail.questions[0]!.prompt).toBe(PROMPT);
    expect(detail.questions[0]!.answer?.correct).toBe('b');
    expect(rawBytes(reader.file)).not.toContain(TITLE);
    expect(rawBytes(reader.file)).not.toContain(PROMPT);

    currentCtx = null;
    owner.db.close(); reader.db.close();
  });

  test('any signed-in user can read, but only the publisher can unpublish', () => {
    const owner = freshDb(1, 'owner.db');
    currentCtx = owner.ctx;
    const quizId = makeQuiz(TITLE);
    const published = scope.run(owner.ctx, () => shared.publish({ quizId, ownerUsername: 'owner' }));

    const other = freshDb(2, 'other.db');
    expect(scope.run(other.ctx, () => shared.get({ id: published.id })).questions).toHaveLength(1);
    expect(scope.run(other.ctx, () => shared.list({}))[0]!.mine).toBe(false);
    expect(() => scope.run(other.ctx, () => shared.unpublish({ id: published.id }))).toThrow(/Only the publisher/);
    expect(scope.run(other.ctx, () => shared.unpublish({ id: published.id, allowAny: true })).ok).toBe(true);
    expect(() => scope.run(owner.ctx, () => shared.get({ id: published.id }))).toThrow(/not found/);

    currentCtx = null;
    owner.db.close(); other.db.close();
  });

  test('republish replaces the snapshot and clears the stale flag', () => {
    const owner = freshDb(1, 'owner.db');
    currentCtx = owner.ctx;
    const quizId = makeQuiz(TITLE);
    const first = scope.run(owner.ctx, () => shared.publish({ quizId, ownerUsername: 'owner' }));
    expect(scope.run(owner.ctx, () => shared.statusForQuiz({ quizId }))!.stale).toBe(false);

    scope.run(owner.ctx, () => library.quizUpdate({ quizId, title: 'A different title' }));
    expect(scope.run(owner.ctx, () => shared.statusForQuiz({ quizId }))!.stale).toBe(true);
    const second = scope.run(owner.ctx, () => shared.publish({ quizId, ownerUsername: 'owner' }));
    expect(second.id).toBe(first.id);
    expect(second.title).toBe('A different title');
    expect(scope.run(owner.ctx, () => shared.statusForQuiz({ quizId }))!.stale).toBe(false);
    expect(sharedDb.prepare('SELECT COUNT(*) AS n FROM shared_quizzes').get()).toEqual({ n: 1 });
    expect(sharedDb.prepare('SELECT COUNT(*) AS n FROM shared_questions').get()).toEqual({ n: 1 });

    currentCtx = null;
    owner.db.close();
  });

  test('tampered plaintext JSON cannot crash a preview or be imported', () => {
    const owner = freshDb(1, 'owner.db');
    currentCtx = owner.ctx;
    const quizId = makeQuiz(TITLE);
    const published = scope.run(owner.ctx, () => shared.publish({ quizId, ownerUsername: 'owner' }));
    sharedDb.prepare('UPDATE shared_questions SET answer_json=? WHERE shared_quiz_id=?')
      .run('{not-json', published.id);

    const reader = freshDb(2, 'reader.db');
    const detail = scope.run(reader.ctx, () => shared.get({ id: published.id }));
    expect(detail.questions[0]!.answer).toEqual({});
    expect(() => scope.run(reader.ctx, () => shared.importInto({ id: published.id })))
      .toThrow(/reference|correct|value/);

    currentCtx = null;
    owner.db.close(); reader.db.close();
  });

  test('per-user publish cap and deleting a user removes their shared quizzes', () => {
    process.env.MAX_SHARED_QUIZZES_PER_USER = '1';
    const owner = freshDb(1, 'owner.db');
    currentCtx = owner.ctx;
    const one = makeQuiz(TITLE);
    scope.run(owner.ctx, () => shared.publish({ quizId: one, ownerUsername: 'owner' }));
    const two = makeQuiz('Second quiz');
    expect(() => scope.run(owner.ctx, () => shared.publish({ quizId: two, ownerUsername: 'owner' })))
      .toThrow(/limit reached/);
    shared.deleteAllForUser(1);
    expect(sharedDb.prepare('SELECT COUNT(*) AS n FROM shared_quizzes').get()).toEqual({ n: 0 });

    currentCtx = null;
    owner.db.close();
  });
});
