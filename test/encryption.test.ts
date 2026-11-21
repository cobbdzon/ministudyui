// Definition of "encrypted at rest": unique canaries written through every
// write path must not appear in raw DB bytes, and every TEXT column is either
// explicitly encrypted or explicitly allow-listed as plaintext metadata.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as scope from '../src/boxes/scope/index.js';
import * as store from '../src/boxes/store/index.js';
import * as vault from '../src/boxes/vault/index.js';
import * as library from '../src/boxes/library/index.js';
import * as study from '../src/boxes/study/index.js';
import * as attempts from '../src/boxes/attempts/index.js';
import * as auth from '../src/boxes/auth/index.js';

const TMP_BASE = '/tmp/opencode';
const ENCRYPTED = new Set([
  'decks.name', 'decks.description',
  'cards.front', 'cards.back', 'cards.tags_json',
  'quizzes.title', 'quizzes.description',
  'questions.prompt', 'questions.choices_json', 'questions.answer_json', 'questions.explanation',
  'answers.response', 'answers.feedback',
]);
const PLAINTEXT = new Set([
  'decks.name_key', 'decks.created_at',
  'cards.source', 'cards.created_at', 'cards.updated_at',
  'card_state.due_at', 'card_state.last_reviewed_at',
  'reviews.reviewed_at', 'reviews.prev_state_json',
  'quizzes.source', 'quizzes.created_at',
  'questions.type', 'questions.position', 'questions.points',
  'attempts.started_at', 'attempts.submitted_at', 'attempts.status', 'attempts.question_order_json',
  'answers.grading_status', 'answers.graded_by', 'answers.graded_at',
  'ui_context.view', 'ui_context.updated_at',
  'changes.ts', 'changes.entity', 'changes.op',
]);

let tmp = '';
let oldDir: string | undefined;
let db: Database;
let ctx: scope.UserContext;

beforeEach(() => {
  tmp = mkdtempSync(join(TMP_BASE, 'ms-canary-'));
  oldDir = process.env.DATA_DIR;
  process.env.DATA_DIR = tmp;
  db = new Database(join(tmp, 'user.db'));
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  store.migrateDb(db);
  ctx = { userId: 1, db, keys: { enc: vault.randomBytes(32), idx: vault.randomBytes(32) } };
  auth.open(join(tmp, 'auth.db'));
  auth.migrate();
});

afterEach(() => {
  auth.close();
  db.close();
  if (oldDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDir;
  rmSync(tmp, { recursive: true, force: true });
});

const R = () => Math.random().toString(36).slice(2, 10);
const canaries = {
  deckName: `CANARY_DECK_NAME_${R()}`,
  deckDesc: `CANARY_DECK_DESC_${R()}`,
  cardFront: `CANARY_CARD_FRONT_${R()}`,
  cardBack: `CANARY_CARD_BACK_${R()}`,
  cardTag: `CANARY_TAG_${R()}`,
  quizTitle: `CANARY_QUIZ_TITLE_${R()}`,
  quizDesc: `CANARY_QUIZ_DESC_${R()}`,
  prompt: `CANARY_PROMPT_${R()}`,
  answer: `CANARY_ANSWER_JSON_${R()}`,
  response: `CANARY_RESPONSE_${R()}`,
  feedback: `CANARY_FEEDBACK_${R()}`,
  importDeck: `CANARY_IMPORT_DECK_${R()}`,
  importCard: `CANARY_IMPORT_CARD_${R()}`,
  choices: `CANARY_CHOICES_${R()}`,
  deckUpdated: `CANARY_DECK_UPDATED_${R()}`,
  cardUpdated: `CANARY_CARD_UPDATED_${R()}`,
  quizUpdated: `CANARY_QUIZ_UPDATED_${R()}`,
  questionUpdated: `CANARY_QUESTION_UPDATED_${R()}`,
  response2: `CANARY_RESPONSE_REANSWER_${R()}`,
  feedback2: `CANARY_FEEDBACK_GRADED_${R()}`,
};

function writeAllCanaries(): void {
  const deck = library.deckCreate({ name: canaries.deckName, description: canaries.deckDesc });
  const cards = library.cardAdd({
    deck: deck.id,
    cards: [{ front: canaries.cardFront, back: canaries.cardBack, tags: [canaries.cardTag] }],
  });
  const quiz = library.quizCreate({
    title: canaries.quizTitle, description: canaries.quizDesc,
    questions: [{ type: 'short', prompt: canaries.prompt, reference: canaries.answer }],
  });
  const att = attempts.start({ quizId: quiz.id });
  const qid = db.prepare('SELECT id FROM questions WHERE quiz_id=?').get(quiz.id) as { id: number };
  const ans = attempts.answer({ attemptId: att.id, questionId: qid.id, response: canaries.response });
  attempts.gradeAnswer({ answerId: ans.answer_id, points: 1, feedback: canaries.feedback });
  // Update paths must seal too, not just create paths.
  library.deckUpdate({ deck: deck.id, description: canaries.deckUpdated });
  library.cardUpdate({ cardId: cards.card_ids[0], front: canaries.cardUpdated, back: canaries.cardUpdated, tags: [canaries.cardUpdated] });
  library.quizUpdate({ quizId: quiz.id, description: canaries.quizUpdated });
  library.questionUpdate({ questions: [{ questionId: qid.id, prompt: canaries.questionUpdated }] });
  const fresh = attempts.restart({ quizId: quiz.id });
  const reanswered = attempts.answer({ attemptId: fresh.id, questionId: qid.id, response: canaries.response2 });
  attempts.submit({ attemptId: fresh.id });
  attempts.gradeAnswer({ answerId: reanswered.answer_id, points: 1, feedback: canaries.feedback2 });
  // An MCQ question exercises the nullable choices_json column.
  library.quizCreate({
    title: canaries.quizUpdated,
    questions: [{
      type: 'mcq', prompt: canaries.questionUpdated,
      choices: [{ id: 'a', text: canaries.choices }, { id: 'b', text: 'B' }], correct: 'a',
    }],
  });
  study.review({ cardId: cards.card_ids[0], rating: 3 });
  library.importBundle({
    decks: [{ name: canaries.importDeck, description: '', cards: [{ front: canaries.importCard, back: 'import back', tags: [] }] }],
    quizzes: [],
  } as never);
}

function rawBytes(): Buffer[] {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const file = join(tmp, 'user.db');
  return [file, file + '-wal', file + '-shm', join(tmp, 'auth.db')]
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p));
}

describe('encryption at rest', () => {
  test('canaries through every box/import/auth path are absent from raw DB bytes', async () => {
    await auth.createUser({ username: 'canaryuser', passphrase: `CANARY_PASS_${R()}_LONG`, admin: true, kdfCost: { N: 16, r: 8, p: 1 } });
    scope.run(ctx, writeAllCanaries);
    const blobs = rawBytes();
    for (const [name, value] of Object.entries(canaries)) {
      for (const [i, blob] of blobs.entries()) {
        expect(blob.includes(Buffer.from(value)), `${name} found in DB file ${i}`).toBe(false);
      }
    }
  });

  test('every TEXT column is encrypted or explicitly allow-listed as plaintext metadata', () => {
    scope.run(ctx, writeAllCanaries);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
    let checked = 0;
    for (const { name: table } of tables) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; type: string }>;
      for (const col of cols) {
        if (col.type.toUpperCase() !== 'TEXT') continue;
        const key = `${table}.${col.name}`;
        expect(ENCRYPTED.has(key) || PLAINTEXT.has(key), `unclassified TEXT column ${key}`).toBe(true);
        if (!ENCRYPTED.has(key)) continue;
        const rows = db.prepare(`SELECT ${col.name} AS v FROM ${table}`).all() as Array<{ v: string | null }>;
        for (const row of rows) {
          expect(row.v === null || row.v.startsWith('enc1:'), `${key} holds plaintext: ${String(row.v).slice(0, 20)}`).toBe(true);
        }
        checked++;
      }
    }
    expect(checked).toBe(ENCRYPTED.size);
    // The blind index must be present and not a plaintext name.
    const names = db.prepare('SELECT name, name_key FROM decks').all() as Array<{ name: string; name_key: string }>;
    for (const row of names) {
      expect(row.name.startsWith('enc1:')).toBe(true);
      expect(row.name_key).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
