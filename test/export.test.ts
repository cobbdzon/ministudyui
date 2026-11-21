import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as store from '../src/boxes/store/index.js';
import * as scope from '../src/boxes/scope/index.js';
import * as vault from '../src/boxes/vault/index.js';
import * as library from '../src/boxes/library/index.js';
import * as attempts from '../src/boxes/attempts/index.js';
import * as exporter from '../src/boxes/export/index.js';

let tmp = '';
let oldDir: string | undefined;
let oldCap: string | undefined;

beforeEach(() => {
  tmp = mkdtempSync('/tmp/opencode/ms-export-');
  oldDir = process.env.DATA_DIR;
  process.env.DATA_DIR = tmp;
});
afterEach(() => {
  if (oldDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDir;
  if (oldCap === undefined) delete process.env.MAX_USER_DB_MB; else process.env.MAX_USER_DB_MB = oldCap;
  rmSync(tmp, { recursive: true, force: true });
});

function freshDb(): { db: Database; ctx: scope.UserContext } {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  store.migrateDb(db);
  return { db, ctx: { userId: 1, db, keys: { enc: vault.randomBytes(32), idx: vault.randomBytes(32) } } };
}

describe('export / import round trip', () => {
  test('exported plaintext bundle re-imports with content parity', () => {
    const source = freshDb();
    scope.run(source.ctx, () => {
      const d = library.deckCreate({ name: 'Calculus II', description: 'desc' });
      library.cardAdd({ deck: d.id, cards: [{ front: 'front $x$', back: 'back', tags: ['t1'] }] });
      const q = library.quizCreate({
        title: 'Quiz 1', description: 'qd',
        questions: [{ type: 'mcq', prompt: 'Pick', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: 'b' }],
      });
      const att = attempts.start({ quizId: q.id });
      const qid = source.db.prepare('SELECT id FROM questions WHERE quiz_id=?').get(q.id) as { id: number };
      attempts.answer({ attemptId: att.id, questionId: qid.id, response: 'b' });
      attempts.submit({ attemptId: att.id });
    });
    const bundle = scope.run(source.ctx, () => exporter.bundle());
    expect(bundle.exported_at).toBeTruthy();
    expect(bundle.srs).toHaveLength(1);
    expect(bundle.attempts).toHaveLength(1);
    expect(bundle.decks![0]!.name).toBe('Calculus II');

    const target = freshDb();
    const result = scope.run(target.ctx, () => library.importBundle(JSON.parse(JSON.stringify(bundle)) as never));
    expect(result.decks_created).toBe(1);
    const decks = scope.run(target.ctx, () => library.deckList());
    expect(decks[0]!.name).toBe('Calculus II');
    expect(decks[0]!.description).toBe('desc');
    const cards = scope.run(target.ctx, () => library.cardSearch({ deck: decks[0]!.id }));
    expect(cards.cards[0]!.front).toBe('front $x$');
    const quizzes = scope.run(target.ctx, () => library.quizList({}));
    expect(quizzes[0]!.title).toBe('Quiz 1');
    const quiz = scope.run(target.ctx, () => library.quizGet({ quizId: quizzes[0]!.id, includeAnswers: true }));
    expect(quiz.questions[0]!.prompt).toBe('Pick');
    source.db.close(); target.db.close();
  });

  test('MAX_USER_DB_MB enforces a clear CONFLICT on writes', () => {
    const source = freshDb();
    oldCap = process.env.MAX_USER_DB_MB;
    process.env.MAX_USER_DB_MB = '0.00001';
    scope.run(source.ctx, () => {
      try {
        expect(() => store.run('CREATE TABLE capped (x INTEGER)')).toThrow(/MB limit/);
      } catch (e) { expect((e as Error).message).toContain('MB limit'); }
    });
    source.db.close();
  });
});
