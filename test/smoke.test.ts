import test from 'node:test';
import assert from 'node:assert/strict';
import * as srs from '../src/boxes/srs/index.js';
import { gradeAuto } from '../src/boxes/grader/index.js';
import * as store from '../src/boxes/store/index.js';
import * as library from '../src/boxes/library/index.js';
import * as attempts from '../src/boxes/attempts/index.js';
import type { DeckRow, QuizRow, QuizSummary } from '../shared/types.js';

function hasCode(e: unknown, code: string, field?: string): boolean {
  if (!e || typeof e !== 'object') return false;
  const o = e as { code?: unknown; field?: unknown };
  return o.code === code && (field === undefined || o.field === field);
}

test('srs again does not increase interval and ordering holds', () => {
  const st = { ease: 2.5, interval_days: 3, reps: 2, lapses: 0 };
  const p = srs.preview(st, new Date().toISOString());
  const ords = { again: 0, hard: 1, good: 2, easy: 3 };
  // again -> 10m (0 days), others >=1d
  assert.equal(p.again, '10m');
  assert.ok(p.hard.endsWith('d'));
  assert.ok(p.good.endsWith('d'));
  assert.ok(p.easy.endsWith('d'));
  const n = (x: string) => x === '10m' ? 0 : parseInt(x);
  assert.ok(n(p.again) <= n(p.hard));
  assert.ok(n(p.hard) <= n(p.good));
  assert.ok(n(p.good) <= n(p.easy));
});

test('srs preview gives distinct, accurate intervals for a new card', () => {
  const now = new Date().toISOString();
  const fresh = { ease: 2.5, interval_days: 0, reps: 0, lapses: 0 };
  const preview = srs.preview(fresh, now);
  assert.deepEqual(preview, { again: '10m', hard: '1d', good: '3d', easy: '7d' });

  const ratings = [
    { rating: 1 as const, label: 'hard' as const },
    { rating: 2 as const, label: 'good' as const },
    { rating: 3 as const, label: 'easy' as const },
  ];
  for (const { rating, label } of ratings) {
    const result = srs.schedule(fresh, rating, now);
    const days = Math.round((new Date(result.due_at).getTime() - new Date(now).getTime()) / 86400000);
    assert.equal(preview[label], `${days}d`);
  }
});

test('grader numeric tolerance', () => {
  const q = { type: 'numeric' as const, answer_json: { value: 9.81, tolerance: 0.01, tolerance_type: 'abs' as const, unit: null }, points: 1 };
  assert.equal(gradeAuto(q, '9.81').is_correct, 1);
  assert.equal(gradeAuto(q, '10').is_correct, 0);
  const q2 = { type: 'mcq' as const, answer_json: { correct: 'b' }, points: 1 };
  assert.equal(gradeAuto(q2, 'b').points, 1);
});

test('deckUpdate renames, preserves fields on partial update, and rejects conflicts', () => {
  store.open(':memory:');
  store.migrate();
  try {
    const a = library.deckCreate({ name: 'Alpha', description: 'First' });
    const b = library.deckCreate({ name: 'Beta', description: 'Second' });

    const renamed = library.deckUpdate({ deck: a.id, name: 'Gamma' });
    assert.equal(renamed.ok, true);
    assert.equal(renamed.deck.name, 'Gamma');
    assert.equal(renamed.deck.description, 'First');

    const partial = library.deckUpdate({ deck: a.id, description: 'Updated' });
    assert.equal(partial.deck.name, 'Gamma');
    assert.equal(partial.deck.description, 'Updated');

    const listed = library.deckList().find((d: DeckRow) => d.id === a.id);
    assert.ok(listed);
    assert.equal(listed.name, 'Gamma');
    assert.equal(listed.description, 'Updated');

    assert.throws(
      () => library.deckUpdate({ deck: a.id, name: 'beta' }),
      (e: unknown) => hasCode(e, 'CONFLICT', 'name')
    );
    assert.throws(
      () => library.deckUpdate({ deck: b.id }),
      (e: unknown) => hasCode(e, 'VALIDATION')
    );
  } finally {
    store.close();
  }
});

test('quiz editing updates only supplied fields and preserves answer keys', () => {
  store.open(':memory:');
  store.migrate();
  try {
    const d = library.deckCreate({ name: 'EditDeck' });
    const quiz = library.quizCreate({
      title: 'Original title',
      description: 'Original description',
      deck: d.id,
      questions: [
        { type: 'mcq', prompt: 'First?', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: 'b', points: 2 },
        { type: 'numeric', prompt: 'Second?', value: 5, tolerance: 0.1, tolerance_type: 'abs', unit: 'm', points: 1 },
      ],
    });
    const outline = library.quizOutline({ quizId: quiz.id });
    assert.equal(outline.questions.length, 2);
    const [q1, q2] = outline.questions;

    const updated = library.questionUpdate({ questions: [
      { questionId: q1.id, prompt: 'First (edited)?' },
      { questionId: q2.id, value: 7 },
    ] });
    assert.equal(updated.question_ids.length, 2);
    const after = library.quizGet({ quizId: quiz.id, includeAnswers: true });
    assert.equal(after.questions[0].prompt, 'First (edited)?');
    assert.ok(after.questions[0].choices);
    assert.equal(after.questions[0].choices.length, 2);
    assert.deepEqual(after.questions[0].answer, { correct: 'b' });
    assert.equal(after.questions[0].points, 2);
    assert.deepEqual(after.questions[1].answer, { value: 7, tolerance: 0.1, tolerance_type: 'abs', unit: 'm' });

    library.quizUpdate({ quizId: quiz.id, title: 'New title' });
    const meta = library.quizList({}).find((q: QuizSummary) => q.id === quiz.id);
    assert.ok(meta);
    assert.equal(meta.title, 'New title');
    assert.equal(meta.description, 'Original description');

    library.questionDelete({ questionIds: [q1.id] });
    const left = library.quizGet({ quizId: quiz.id, includeAnswers: false });
    assert.equal(left.questions.length, 1);
    assert.equal(left.questions[0].id, q2.id);
    assert.equal(left.questions[0].position, 1);

    assert.throws(
      () => library.quizDelete({ quizId: quiz.id, confirmTitle: 'wrong' }),
      (e: unknown) => hasCode(e, 'VALIDATION')
    );
    assert.equal(library.quizDelete({ quizId: quiz.id, confirmTitle: 'New title' }).ok, true);
    assert.equal(library.quizList({}).length, 0);
  } finally {
    store.close();
  }
});

test('restart discards in-progress attempts and their pending AI-graded answers', () => {
  store.open(':memory:');
  store.migrate();
  try {
    const d = library.deckCreate({ name: 'RestartDeck' });
    const quiz = library.quizCreate({
      title: 'Restart quiz', deck: d.id,
      questions: [
        { type: 'latex', prompt: 'Derive it', reference: 'x^2', points: 2 },
        { type: 'mcq', prompt: 'Pick one', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: 'a', points: 1 },
      ],
    });
    const latexId = library.quizGet({ quizId: quiz.id, includeAnswers: false }).questions[0].id;

    const first = attempts.start({ quizId: quiz.id });
    const latexAnswer = attempts.answer({ attemptId: first.id, questionId: latexId, response: 'x^2' });
    assert.equal(attempts.pending({ limit: 20 }).length, 1);

    // A second abandoned attempt should be cleaned up too.
    attempts.start({ quizId: quiz.id });

    const fresh = attempts.restart({ quizId: quiz.id });
    assert.equal(fresh.status, 'in_progress');
    assert.equal(attempts.pending({ limit: 20 }).length, 0);
    const rows = attempts.list({ quizId: quiz.id, limit: 20 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, fresh.id);
    assert.equal(store.all('SELECT * FROM answers').length, 0);

    // Restart also works when there is nothing to discard.
    attempts.restart({ quizId: quiz.id });
    assert.equal(attempts.list({ quizId: quiz.id, limit: 20 }).length, 1);
    assert.throws(
      () => attempts.restart({ quizId: 9999 }),
      (e: unknown) => hasCode(e, 'NOT_FOUND')
    );
  } finally {
    store.close();
  }
});

test('shuffle flag is carried through create/update/import and fixes one order per attempt', () => {
  store.open(':memory:');
  store.migrate();
  const originalRandom = Math.random;
  try {
    const mkQuestions = () => [1, 2, 3, 4].map((n) => ({
      type: 'mcq' as const, prompt: `Q${n}?`,
      choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: 'a',
    }));
    const quiz = library.quizCreate({ title: 'Shuffled', shuffle: true, questions: mkQuestions() });
    const authored = library.quizGet({ quizId: quiz.id, includeAnswers: false }).questions.map((q) => q.id);
    assert.equal(library.quizGet({ quizId: quiz.id }).quiz.shuffle, 1);

    Math.random = () => 0; // deterministic reversal: [2,3,4,1]
    const first = attempts.start({ quizId: quiz.id });
    const order1 = attempts.attemptQuestions({ attemptId: first.id, includeAnswers: false }).map((q) => q.id);
    assert.equal(order1.length, 4);
    assert.notDeepEqual(order1, authored);
    assert.deepEqual([...order1].sort((a, b) => a - b), [...authored].sort((a, b) => a - b));
    // Re-reading keeps the same sequence: the order belongs to the attempt.
    assert.deepEqual(attempts.attemptQuestions({ attemptId: first.id }).map((q) => q.id), order1);

    Math.random = () => 0.5; // a different permutation on restart
    const second = attempts.restart({ quizId: quiz.id });
    const order2 = attempts.attemptQuestions({ attemptId: second.id }).map((q) => q.id);
    assert.notDeepEqual(order2, order1);

    library.quizUpdate({ quizId: quiz.id, shuffle: false });
    assert.equal(library.quizGet({ quizId: quiz.id }).quiz.shuffle, 0);
    const plain = attempts.start({ quizId: quiz.id });
    assert.deepEqual(attempts.attemptQuestions({ attemptId: plain.id }).map((q) => q.id), authored);

    library.importBundle({
      quizzes: [{ title: 'Imported shuffled', shuffle: true, questions: mkQuestions() }],
    });
    const imported = library.quizList({}).find((q: QuizSummary) => q.title === 'Imported shuffled');
    assert.equal(imported?.shuffle, 1);
  } finally {
    Math.random = originalRandom;
    store.close();
  }
});

test('importBundle creates decks, cards and quizzes with import provenance', () => {
  store.open(':memory:');
  store.migrate();
  try {
    const result = library.importBundle({
      decks: [{
        name: 'ImportDeck',
        description: 'From AI',
        cards: [
          { front: 'Q1', back: 'A1', tags: ['t'] },
          { front: 'Q2', back: 'A2' },
        ],
      }],
      quizzes: [{
        title: 'ImportQuiz', deck: 'ImportDeck',
        questions: [
          { type: 'mcq', prompt: 'Pick', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: 'b' },
          { type: 'latex', prompt: 'Show', reference: 'x^2' },
        ],
      }],
    });
    assert.deepEqual(result, {
      ok: true, decks_created: 1, decks_reused: 0, cards_added: 2,
      quizzes_created: 1, questions_added: 2,
    });

    assert.equal(store.all("SELECT * FROM cards WHERE source='import'").length, 2);
    const quiz = library.quizList({})[0];
    assert.equal(quiz.title, 'ImportQuiz');
    const full = library.quizGet({ quizId: quiz.id, includeAnswers: true });
    assert.equal(full.quiz.source, 'import');
    assert.deepEqual(full.questions[0].answer, { correct: 'b' });
    assert.ok(full.questions[1].answer);
    assert.equal(full.questions[1].answer.reference, 'x^2');

    // Re-importing the same deck name reuses it rather than conflicting.
    const again = library.importBundle({
      decks: [{ name: 'importdeck', cards: [{ front: 'Q3', back: 'A3' }] }],
    });
    assert.equal(again.decks_reused, 1);
    assert.equal(again.decks_created, 0);
    assert.equal(again.cards_added, 1);
  } finally {
    store.close();
  }
});

test('importBundle rejects invalid items atomically', () => {
  store.open(':memory:');
  store.migrate();
  try {
    assert.throws(
      () => library.importBundle({
        decks: [{ name: 'Valid', cards: [{ front: 'Q', back: 'A' }] }],
        quizzes: [{
          title: 'Bad',
          questions: [{ type: 'mcq', prompt: 'P', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: 'z' }],
        }],
      }),
      (e: unknown) => hasCode(e, 'VALIDATION', 'quizzes[0].questions[0].correct')
    );
    // Nothing was written: validation happens before the single transaction.
    assert.equal(store.all('SELECT * FROM decks').length, 0);
    assert.equal(store.all('SELECT * FROM cards').length, 0);
    assert.equal(store.all('SELECT * FROM quizzes').length, 0);
    assert.equal(store.all('SELECT * FROM questions').length, 0);

    assert.throws(
      () => library.importBundle({}),
      (e: unknown) => hasCode(e, 'VALIDATION')
    );
  } finally {
    store.close();
  }
});

const quizSeed = (title: string, deck?: number) => ({
  title, deck,
  questions: [{ type: 'short' as const, prompt: 'P', reference: 'R' }],
});

test('deleting a deck keeps linked quizzes by default and can remove them too', () => {
  store.open(':memory:');
  store.migrate();
  try {
    const d = library.deckCreate({ name: 'LinkedDeck' });
    library.cardAdd({ deck: d.id, cards: [{ front: 'Q', back: 'A' }] });
    const q = library.quizCreate(quizSeed('LinkedQuiz', d.id));

    library.deckDelete({ deck: d.id, confirmName: 'LinkedDeck' });
    assert.equal(store.get<QuizRow>('SELECT * FROM quizzes WHERE id=?', [q.id])?.deck_id, null);
    assert.equal(store.get('SELECT * FROM decks WHERE id=?', [d.id]), null);
    assert.equal(store.all('SELECT * FROM cards').length, 0);

    const d2 = library.deckCreate({ name: 'Doomed' });
    const q2 = library.quizCreate(quizSeed('DoomedQuiz', d2.id));
    library.deckDelete({ deck: d2.id, confirmName: 'Doomed', deleteQuizzes: true });
    assert.equal(store.get('SELECT * FROM quizzes WHERE id=?', [q2.id]), null);
    const keeper = library.deckCreate({ name: 'Keeper' });
    assert.throws(
      () => library.deckDelete({ deck: keeper.id, confirmName: 'wrong' }),
      (e: unknown) => hasCode(e, 'VALIDATION', 'confirm_name')
    );
  } finally {
    store.close();
  }
});

test('deleting a quiz can also delete its linked deck', () => {
  store.open(':memory:');
  store.migrate();
  try {
    const d = library.deckCreate({ name: 'QuizDeck' });
    library.cardAdd({ deck: d.id, cards: [{ front: 'Q', back: 'A' }] });
    const q = library.quizCreate(quizSeed('QuizToDelete', d.id));

    library.quizDelete({ quizId: q.id, confirmTitle: 'QuizToDelete', deleteDeck: true });
    assert.equal(store.get('SELECT * FROM quizzes WHERE id=?', [q.id]), null);
    assert.equal(store.get('SELECT * FROM decks WHERE id=?', [d.id]), null);
    assert.equal(store.all('SELECT * FROM cards').length, 0);

    const d2 = library.deckCreate({ name: 'OtherQuizDeck' });
    const other = library.quizCreate(quizSeed('OtherQuiz', d2.id));
    assert.throws(
      () => library.quizDelete({ quizId: other.id, confirmTitle: 'wrong' }),
      (e: unknown) => hasCode(e, 'VALIDATION', 'confirm_title')
    );
  } finally {
    store.close();
  }
});

test('a deck can only have one linked quiz', () => {
  store.open(':memory:');
  store.migrate();
  try {
    const a = library.deckCreate({ name: 'DeckA' });
    const b = library.deckCreate({ name: 'DeckB' });
    library.quizCreate(quizSeed('First', a.id));
    assert.throws(
      () => library.quizCreate(quizSeed('Second', a.id)),
      (e: unknown) => hasCode(e, 'CONFLICT', 'deck')
    );

    const other = library.quizCreate(quizSeed('Other', b.id));
    assert.throws(
      () => library.quizUpdate({ quizId: other.id, deck: a.id }),
      (e: unknown) => hasCode(e, 'CONFLICT', 'deck')
    );

    assert.throws(
      () => library.importBundle({
        decks: [{ name: 'DeckC' }],
        quizzes: [
          { title: 'A', deck: 'DeckC', questions: [{ type: 'short', prompt: 'P', reference: 'R' }] },
          { title: 'B', deck: 'DeckC', questions: [{ type: 'short', prompt: 'P', reference: 'R' }] },
        ],
      }),
      (e: unknown) => hasCode(e, 'CONFLICT', 'quizzes[1].deck')
    );

    const indexes = store.all<{ name: string }>("PRAGMA index_list('quizzes')").map((i) => i.name);
    assert.ok(indexes.includes('idx_quizzes_deck'));
  } finally {
    store.close();
  }
});