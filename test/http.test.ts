import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import { app } from '../src/http/app.js';
import * as store from '../src/boxes/store/index.js';
import * as auth from '../src/boxes/auth/index.js';
import * as scope from '../src/boxes/scope/index.js';
import * as session from '../src/http/session.js';

const HOST = { host: '127.0.0.1:3000' };
let COOKIE = '';
let tmp = '';
let db: Database;

async function call(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {},
) {
  const headers: Record<string, string> = { ...HOST, ...(COOKIE ? { cookie: COOKIE } : {}), ...(opts.headers ?? {}) };
  let body: string | undefined = opts.raw;
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await app.request(path, { method: opts.method ?? 'GET', headers, body });
  const json = await res.json().catch(() => null);
  return { res, json };
}

beforeAll(async () => {
  process.env.PORT = '3000';
  tmp = mkdtempSync('/tmp/opencode/ms-http-');
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
  COOKIE = `ms_session=${session.create({
    userId: 1, username: 'tester', isAdmin: true, keys: scope.devKeys(), db,
  })}`;
});

describe('security and error envelope', () => {
  it('rejects a foreign host with 403', async () => {
    const res = await app.request('/api/decks', { headers: { host: 'evil.example' } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a foreign origin with 403', async () => {
    const res = await app.request('/api/decks', { headers: { ...HOST, origin: 'http://evil.example' } });
    expect(res.status).toBe(403);
  });

  it('returns JSON 404 for an unknown /api route', async () => {
    const { res, json } = await call('/api/nope');
    expect(res.status).toBe(404);
    expect(json).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns 400 for a wrong content-type', async () => {
    const { res, json } = await call('/api/decks', {
      method: 'POST', raw: '{"name":"X"}', headers: { 'content-type': 'text/plain' },
    });
    expect(res.status).toBe(400);
    expect(json).toMatchObject({ code: 'VALIDATION', field: 'content-type' });
  });

  it('returns 400 (not 500) for malformed JSON', async () => {
    const { res, json } = await call('/api/decks', {
      method: 'POST', raw: '{bad', headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
    expect(json).toMatchObject({ code: 'VALIDATION' });
  });

  it('accepts a charset on the JSON content-type', async () => {
    const { res, json } = await call('/api/decks', {
      method: 'POST', raw: '{"name":"Charset"}',
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
    expect(res.status).toBe(200);
    expect(json.deck.name).toBe('Charset');
  });

  it('rejects a non-numeric id like the old ^\\d+$ routes', async () => {
    const { res } = await call('/api/decks/1e3', {
      method: 'PATCH', body: { name: 'x' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 JSON for an unmatched non-GET request', async () => {
    const { res, json } = await call('/not-a-route', { method: 'POST' });
    expect(res.status).toBe(404);
    expect(json).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('decks, cards and quizzes', () => {
  it('creates, lists, updates and deletes a deck', async () => {
    const created = await call('/api/decks', { method: 'POST', body: { name: 'Alpha', description: 'A' } });
    expect(created.res.status).toBe(200);
    expect(created.json.deck).toMatchObject({ name: 'Alpha', description: 'A' });
    const id = created.json.deck.id;

    const listed = await call('/api/decks');
    expect(listed.json.decks).toHaveLength(1);

    const updated = await call(`/api/decks/${id}`, { method: 'PATCH', body: { name: 'Beta' } });
    expect(updated.json.deck.name).toBe('Beta');

    const removed = await call(`/api/decks/${id}`, {
      method: 'DELETE', body: { confirm_name: 'Beta' },
    });
    expect(removed.json).toEqual({ ok: true });
    expect((await call('/api/decks')).json.decks).toHaveLength(0);
  });

  it('adds, searches and deletes cards', async () => {
    const deck = (await call('/api/decks', { method: 'POST', body: { name: 'Cards' } })).json.deck;
    const added = await call('/api/cards', {
      method: 'POST',
      body: { deck: deck.id, cards: [{ front: 'Q?', back: 'A', tags: ['t'] }] },
    });
    expect(added.res.status).toBe(200);
    expect(added.json.card_ids).toHaveLength(1);

    const found = await call(`/api/cards?deck=${deck.id}&limit=20`);
    expect(found.json.total).toBe(1);
    expect(found.json.cards[0].tags_json).toBeDefined();

    const removed = await call('/api/cards', {
      method: 'DELETE', body: { card_ids: added.json.card_ids },
    });
    expect(removed.json).toEqual({ ok: true });
    expect((await call(`/api/cards?deck=${deck.id}`)).json.total).toBe(0);
  });

  it('creates and fetches a quiz', async () => {
    const created = await call('/api/quizzes', {
      method: 'POST',
      body: {
        title: 'Quiz',
        questions: [{ type: 'mcq', prompt: 'P?', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: 'b' }],
      },
    });
    expect(created.res.status).toBe(200);
    const id = created.json.id;
    const got = await call(`/api/quizzes/${id}`);
    expect(got.json.quiz.title).toBe('Quiz');
    expect(got.json.questions).toHaveLength(1);
    expect(got.json.questions[0].answer).toEqual({ correct: 'b' });

    const without = await call(`/api/quizzes/${id}?include_answers=false`);
    expect(without.json.questions[0].answer).toBeUndefined();
  });

  it('creates a shuffled quiz and toggles shuffle with PATCH', async () => {
    const created = await call('/api/quizzes', {
      method: 'POST',
      body: {
        title: 'Shuffle',
        shuffle: true,
        questions: [
          { type: 'mcq', prompt: 'P?', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: 'a' },
        ],
      },
    });
    expect(created.res.status).toBe(200);
    const id = created.json.id;
    expect((await call(`/api/quizzes/${id}`)).json.quiz.shuffle).toBe(1);

    const patched = await call(`/api/quizzes/${id}`, { method: 'PATCH', body: { shuffle: false } });
    expect(patched.res.status).toBe(200);
    expect(patched.json.quiz.shuffle).toBe(0);
    expect((await call(`/api/quizzes/${id}`)).json.quiz.shuffle).toBe(0);
  });
});

describe('attempts, grading and stats', () => {
  async function seedQuiz() {
    return (await call('/api/quizzes', {
      method: 'POST',
      body: {
        title: 'Flow',
        questions: [
          { type: 'mcq', prompt: 'P?', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: 'b' },
          { type: 'latex', prompt: 'Show', reference: 'x' },
        ],
      },
    })).json;
  }

  it('runs start -> answer -> submit -> grade', async () => {
    const quiz = await seedQuiz();
    const started = await call('/api/attempts', { method: 'POST', body: { quiz_id: quiz.id } });
    expect(started.res.status).toBe(200);
    const attemptId = started.json.id;
    const questions = (await call(`/api/quizzes/${quiz.id}`)).json.questions;

    const answered = await call(`/api/attempts/${attemptId}/answers/${questions[0].id}`, {
      method: 'PATCH', body: { response: 'b' },
    });
    expect(answered.json.ok).toBe(true);
    const pending = await call(`/api/attempts/${attemptId}/answers/${questions[1].id}`, {
      method: 'PATCH', body: { response: 'x' },
    });
    expect(pending.json.ok).toBe(true);

    const submitted = await call(`/api/attempts/${attemptId}/submit`, { method: 'POST' });
    expect(submitted.json.attempt.status).toBe('submitted');

    const pendingList = await call('/api/grading/pending');
    expect(pendingList.json.answers).toHaveLength(1);
    const answerId = pendingList.json.answers[0].answer_id;

    const graded = await call(`/api/grading/${answerId}`, {
      method: 'POST', body: { points: 1, feedback: 'ok' },
    });
    expect(graded.json.attempt.status).toBe('graded');
    expect((await call(`/api/attempts/${attemptId}`)).json.attempt.status).toBe('graded');
  });

  it('serves one stable, shuffled question order for an attempt', async () => {
    const originalRandom = Math.random;
    Math.random = () => 0; // deterministic Fisher-Yates reversal
    try {
      const quiz = (await call('/api/quizzes', {
        method: 'POST',
        body: {
          title: 'Order',
          shuffle: true,
          questions: [1, 2, 3, 4].map((n) => ({
            type: 'mcq', prompt: `Q${n}?`,
            choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: 'a',
          })),
        },
      })).json;
      const authored = (await call(`/api/quizzes/${quiz.id}`)).json.questions.map((q: { id: number }) => q.id);
      const started = await call('/api/attempts', { method: 'POST', body: { quiz_id: quiz.id } });
      const attemptId = started.json.id;

      const first = await call(`/api/attempts/${attemptId}?include_answers=false`);
      const second = await call(`/api/attempts/${attemptId}?include_answers=false`);
      const order = first.json.questions.map((q: { id: number }) => q.id);
      expect(order).not.toEqual(authored);
      expect([...order].sort((a, b) => a - b)).toEqual([...authored].sort((a, b) => a - b));
      expect(second.json.questions.map((q: { id: number }) => q.id)).toEqual(order);
      expect(first.json.questions[0].answer).toBeUndefined();

      const withAnswers = await call(`/api/attempts/${attemptId}`);
      expect(withAnswers.json.questions[0].answer).toEqual({ correct: 'a' });
    } finally {
      Math.random = originalRandom;
    }
  });

  it('reports all three new stats fields with a deck filter', async () => {
    const deck = (await call('/api/decks', { method: 'POST', body: { name: 'Stats' } })).json.deck;
    await call('/api/cards', {
      method: 'POST',
      body: { deck: deck.id, cards: [{ front: 'Q', back: 'A', tags: ['t'] }] },
    });
    const { json } = await call(`/api/stats?deck=${deck.id}&days=30`);
    expect(json.total).toBe(1);
    expect(json).toHaveProperty('retention');
    expect(json.interval_distribution.map((b: { bucket: string }) => b.bucket)).toEqual(['new', 'learning', 'mature']);
    expect(Array.isArray(json.weakest_tags)).toBe(true);
  });

  it('treats an empty deck query as no filter', async () => {
    const { res } = await call('/api/stats?deck=');
    expect(res.status).toBe(200);
  });

  it('exposes an SSE event stream', async () => {
    const res = await app.request('/api/events', { headers: { ...HOST, cookie: COOKIE } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    await res.body?.cancel();
  });
});
