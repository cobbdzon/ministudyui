import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import { app } from '../src/http/app.js';
import * as store from '../src/boxes/store/index.js';
import * as context from '../src/boxes/context/index.js';
import * as vault from '../src/boxes/vault/index.js';
import * as auth from '../src/boxes/auth/index.js';
import * as scope from '../src/boxes/scope/index.js';
import * as session from '../src/http/session.js';

const HOST = { host: '127.0.0.1:3000' };
let COOKIE = '';
let tmp = '';
let db: Database;
const S = (t: string, c: string, v: string) => vault.seal(t, c, v)!;

function seed(): void {
  store.run('INSERT INTO decks (id, name, name_key) VALUES (1, ?, ?)',
    [S('decks', 'name', 'Linear Algebra'), vault.indexValue('linear algebra')]);
  store.run('INSERT INTO cards (id, deck_id, front, back, tags_json) VALUES (1, 1, ?, ?, ?)',
    [S('cards', 'front', 'What is $V$?'), S('cards', 'back', 'A vector space'), S('cards', 'tags_json', '["basics"]')]);
  store.run('INSERT INTO quizzes (id, deck_id, title) VALUES (1, 1, ?)', [S('quizzes', 'title', 'Quiz 1')]);
  store.run(`INSERT INTO questions (id, quiz_id, position, type, prompt, choices_json, answer_json, explanation, points)
    VALUES (1, 1, 1, 'mcq', ?, ?, ?, ?, 2)`, [
    S('questions', 'prompt', 'Pick one'),
    S('questions', 'choices_json', JSON.stringify([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }])),
    S('questions', 'answer_json', JSON.stringify({ correct: 'b' })),
    S('questions', 'explanation', 'Because it is true'),
  ]);
  store.run('INSERT INTO attempts (id, quiz_id) VALUES (1, 1)');
  store.run('INSERT INTO answers (attempt_id, question_id, response, feedback) VALUES (1, 1, ?, ?)',
    [S('answers', 'response', 'b'), S('answers', 'feedback', '')]);
}

beforeAll(async () => {
  process.env.PORT = '3000';
  tmp = mkdtempSync('/tmp/opencode/ms-context-');
  process.env.DATA_DIR = tmp;
  auth.open(join(tmp, 'auth.db'));
  auth.migrate();
  if (!auth.hasUsers()) {
    await auth.createUser({ username: 'tester', passphrase: 'test passphrase long', admin: true, kdfCost: { N: 16, r: 8, p: 1 } });
  }
});
afterAll(() => {
  auth.close(); store.close(); session.clear();
  rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => {
  session.clear();
  db = store.open(':memory:');
  store.migrate();
  seed();
  COOKIE = `ms_session=${session.create({
    userId: 1, username: 'tester', isAdmin: true, keys: scope.devKeys(), db,
  })}`;
});

describe('current UI context', () => {
  it('is empty until the UI reports something', () => {
    expect(context.read()).toBeNull();
    expect(context.current()).toMatchObject({
      context: null, card: null, question: null, deck: null, quiz: null, your_answer: null,
    });
  });

  it('returns the current card with its content when reviewing', () => {
    context.write({ view: 'review', deck_id: 1, card_id: 1, flipped: true });
    const cur = context.current();
    expect(cur.context).toMatchObject({ view: 'review', deck_id: 1, card_id: 1, flipped: true });
    expect(cur.card).toMatchObject({ front: 'What is $V$?', back: 'A vector space', tags: ['basics'] });
    expect(cur.deck).toEqual({ id: 1, name: 'Linear Algebra' });
    expect(cur.question).toBeNull();
  });

  it('returns the current question, answer and saved response in a quiz', () => {
    context.write({
      view: 'quiz', quiz_id: 1, deck_id: 1, attempt_id: 1,
      question_id: 1, question_position: 1,
    });
    const cur = context.current();
    expect(cur.context).toMatchObject({ view: 'quiz', question_id: 1, question_position: 1 });
    expect(cur.question).toMatchObject({
      id: 1, type: 'mcq', prompt: 'Pick one', explanation: 'Because it is true',
      answer: { correct: 'b' },
    });
    expect(cur.question?.choices).toHaveLength(2);
    expect(cur.your_answer).toMatchObject({ response: 'b', grading_status: 'pending' });
    expect(cur.quiz).toEqual({ id: 1, title: 'Quiz 1' });
  });

  it('clears completely when view is null', () => {
    context.write({ view: 'review', deck_id: 1, card_id: 1, flipped: true });
    context.write({ view: null });
    expect(context.read()).toBeNull();
    expect(context.current().card).toBeNull();
  });

  it('does not keep a deleted card as the current card', () => {
    context.write({ view: 'review', deck_id: 1, card_id: 1 });
    store.run('DELETE FROM cards WHERE id = 1');
    expect(context.current().card).toBeNull();
  });
});

describe('ui context HTTP endpoints', () => {
  it('round-trips the reported context', async () => {
    const put = await app.request('/api/ui/context', {
      method: 'PUT', headers: { ...HOST, cookie: COOKIE, 'content-type': 'application/json' },
      body: JSON.stringify({ view: 'review', deck_id: 1, card_id: 1, flipped: false }),
    });
    expect(put.status).toBe(200);
    expect((await put.json() as { context: { card_id: number } }).context.card_id).toBe(1);

    const get = await app.request('/api/ui/context', { headers: { ...HOST, cookie: COOKIE } });
    expect((await get.json() as { context: { view: string } }).context.view).toBe('review');
  });

  it('rejects an unknown view', async () => {
    const res = await app.request('/api/ui/context', {
      method: 'PUT', headers: { ...HOST, cookie: COOKIE, 'content-type': 'application/json' },
      body: JSON.stringify({ view: 'unknown' }),
    });
    expect(res.status).toBe(400);
  });
});
