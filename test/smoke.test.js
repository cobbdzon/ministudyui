import test from 'node:test';
import assert from 'node:assert/strict';
import * as srs from '../src/boxes/srs/index.js';
import { gradeAuto } from '../src/boxes/grader/index.js';

test('srs again does not increase interval and ordering holds', () => {
  const st = { ease: 2.5, interval_days: 3, reps: 2, lapses: 0 };
  const p = srs.preview(st, new Date().toISOString());
  const ords = { again: 0, hard: 1, good: 2, easy: 3 };
  // again -> 10m (0 days), others >=1d
  assert.equal(p.again, '10m');
  assert.ok(p.hard.endsWith('d'));
  assert.ok(p.good.endsWith('d'));
  assert.ok(p.easy.endsWith('d'));
  const n = (x) => x === '10m' ? 0 : parseInt(x);
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