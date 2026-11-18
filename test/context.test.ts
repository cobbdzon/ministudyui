import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { app } from '../src/http/app.js';
import * as store from '../src/boxes/store/index.js';
import * as context from '../src/boxes/context/index.js';

const HOST = { host: '127.0.0.1:3000' };

function seed(): void {
  store.run("INSERT INTO decks (id, name) VALUES (1, 'Linear Algebra')");
  store.run("INSERT INTO cards (id, deck_id, front, back, tags_json) VALUES (1, 1, 'What is $V$?', 'A vector space', '[\"basics\"]')");
  store.run("INSERT INTO quizzes (id, deck_id, title) VALUES (1, 1, 'Quiz 1')");
  store.run(`INSERT INTO questions (id, quiz_id, position, type, prompt, choices_json, answer_json, explanation, points)
    VALUES (1, 1, 1, 'mcq', 'Pick one', ?, ?, 'Because it is true', 2)`, [
    JSON.stringify([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }]),
    JSON.stringify({ correct: 'b' }),
  ]);
  store.run('INSERT INTO attempts (id, quiz_id) VALUES (1, 1)');
  store.run("INSERT INTO answers (attempt_id, question_id, response) VALUES (1, 1, 'b')");
}

beforeAll(() => { process.env.PORT = '3000'; });
afterAll(() => store.close());
beforeEach(() => {
  store.close();
  store.open(':memory:');
  store.migrate();
  seed();
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
      method: 'PUT', headers: { ...HOST, 'content-type': 'application/json' },
      body: JSON.stringify({ view: 'review', deck_id: 1, card_id: 1, flipped: false }),
    });
    expect(put.status).toBe(200);
    expect((await put.json() as { context: { card_id: number } }).context.card_id).toBe(1);

    const get = await app.request('/api/ui/context', { headers: HOST });
    expect((await get.json() as { context: { view: string } }).context.view).toBe('review');
  });

  it('rejects an unknown view', async () => {
    const res = await app.request('/api/ui/context', {
      method: 'PUT', headers: { ...HOST, 'content-type': 'application/json' },
      body: JSON.stringify({ view: 'unknown' }),
    });
    expect(res.status).toBe(400);
  });
});
