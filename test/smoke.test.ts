import test from 'node:test';
import assert from 'node:assert/strict';
import * as srs from '../src/boxes/srs/index.js';
import { gradeAuto } from '../src/boxes/grader/index.js';
import * as store from '../src/boxes/store/index.js';
import * as library from '../src/boxes/library/index.js';
import * as attempts from '../src/boxes/attempts/index.js';

test('srs again does not increase interval and ordering holds', () => {
  const st = { ease: 2.5, interval_days: 3, reps: 2, lapses: 0 };
  const p = srs.preview(st, new Date().toISOString());
  const ords = { again: 0, hard: 1, good: 2, easy: 3 };
  // again -> 10m (0 days), others >=1d
  assert.equal(p.again, '10m');
  assert.ok(p.hard.endsWith('d'));
  assert.ok(p.good.endsWith('d'));
  assert.ok(p.easy.endsWith('d'));
  const n = (x: any) => x === '10m' ? 0 : parseInt(x);
  assert.ok(n(p.again) <= n(p.hard));
  assert.ok(n(p.hard) <= n(p.good));
  assert.ok(n(p.good) <= n(p.easy));
});

test('grader numeric tolerance', () => {
  const q = { type: 'numeric', answer_json: { value: 9.81, tolerance: 0.01, tolerance_type: 'abs', unit: null }, points: 1 };
  assert.equal(gradeAuto(q, '9.81').is_correct, 1);
  assert.equal(gradeAuto(q, '10').is_correct, 0);
  const q2 = { type: 'mcq', answer_json: { correct: 'b' }, points: 1 };
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

    const listed = library.deckList().find((d: any) => d.id === a.id);
    assert.equal(listed.name, 'Gamma');
    assert.equal(listed.description, 'Updated');

    assert.throws(
      () => library.deckUpdate({ deck: a.id, name: 'beta' }),
      (e: any) => e.code === 'CONFLICT' && e.field === 'name'
    );
    assert.throws(
      () => library.deckUpdate({ deck: b.id }),
      (e: any) => e.code === 'VALIDATION'
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
        { type: 'numeric', prompt: 'Second?', value: 5, tolerance: 0.1, unit: 'm', points: 1 },
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
    assert.equal(after.questions[0].choices.length, 2);
    assert.deepEqual(after.questions[0].answer, { correct: 'b' });
    assert.equal(after.questions[0].points, 2);
    assert.deepEqual(after.questions[1].answer, { value: 7, tolerance: 0.1, tolerance_type: 'abs', unit: 'm' });

    library.quizUpdate({ quizId: quiz.id, title: 'New title' });
    const meta = library.quizList({}).find((q: any) => q.id === quiz.id);
    assert.equal(meta.title, 'New title');
    assert.equal(meta.description, 'Original description');

    library.questionDelete({ questionIds: [q1.id] });
    const left = library.quizGet({ quizId: quiz.id, includeAnswers: false });
    assert.equal(left.questions.length, 1);
    assert.equal(left.questions[0].id, q2.id);
    assert.equal(left.questions[0].position, 1);

    assert.throws(
      () => library.quizDelete({ quizId: quiz.id, confirmTitle: 'wrong' }),
      (e: any) => e.code === 'VALIDATION'
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
      (e: any) => e.code === 'NOT_FOUND'
    );
  } finally {
    store.close();
  }
});