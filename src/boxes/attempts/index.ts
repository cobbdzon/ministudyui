import * as store from '../store/index.js';
import * as library from '../library/index.js';
import { gradeAuto } from '../grader/index.js';

function err(code: string, message: string, field?: any): any { const e: any = new Error(message); e.code = code; e.field = field; return e; }

export function start({ quizId }: any): any {
  const quiz = store.get('SELECT * FROM quizzes WHERE id=?', [quizId]);
  if (!quiz) throw err('NOT_FOUND', 'quiz not found');
  const qs = store.all('SELECT points FROM questions WHERE quiz_id=?', [quizId]);
  const maxScore = qs.reduce((a, q) => a + q.points, 0);
  const r = store.run('INSERT INTO attempts (quiz_id, max_score) VALUES (?,?)', [quizId, maxScore]);
  return { id: r.lastInsertRowid, quiz_id: quizId, status: 'in_progress', max_score: maxScore };
}

export function answer({ attemptId, questionId, response }: any): any {
  const att = store.get('SELECT * FROM attempts WHERE id=?', [attemptId]);
  if (!att) throw err('NOT_FOUND', 'attempt not found');
  if (att.status !== 'in_progress') throw err('CONFLICT', 'attempt not in progress');
  const q = store.get('SELECT * FROM questions WHERE id=?', [questionId]);
  if (!q) throw err('NOT_FOUND', 'question not found');
  const existing = store.get('SELECT id FROM answers WHERE attempt_id=? AND question_id=?', [attemptId, questionId]);
  const res = typeof response === 'string' ? response : JSON.stringify(response);
  if (existing) {
    store.run('UPDATE answers SET response=?, grading_status=\'pending\', is_correct=NULL, points_awarded=NULL, feedback=\'\', graded_by=NULL, graded_at=NULL WHERE id=?', [res, existing.id]);
    return { ok: true, answer_id: existing.id };
  }
  const g = gradeAuto(q, res);
  const r = store.run('INSERT INTO answers (attempt_id, question_id, response, grading_status, is_correct, points_awarded, feedback, graded_by, graded_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [attemptId, questionId, res, g.status, g.is_correct, g.points, g.feedback, g.status === 'graded' ? 'auto' : null, g.status === 'graded' ? new Date().toISOString() : null]);
  return { ok: true, answer_id: r.lastInsertRowid };
}

export function submit({ attemptId }: any): any {
  const att = store.get('SELECT * FROM attempts WHERE id=?', [attemptId]);
  if (!att) throw err('NOT_FOUND', 'attempt not found');
  // auto-grade any pending mcq/numeric that were answered via answer() already graded; ensure all questions have answer rows? We'll grade on submit for any missing? Spec: student answers; submit just finalizes.
  // Recompute score from answers
  const answers = store.all('SELECT * FROM answers WHERE attempt_id=?', [attemptId]);
  const questions = store.all('SELECT * FROM questions WHERE quiz_id=?', [att.quiz_id]);
  const qmap = Object.fromEntries(questions.map((q) => [q.id, q]));
  let score = 0;
  for (const a of answers) {
    if (a.grading_status === 'pending') {
      const q = qmap[a.question_id];
      const g = gradeAuto(q, a.response);
      if (g.status === 'graded') {
        store.run('UPDATE answers SET grading_status=\'graded\', is_correct=?, points_awarded=?, feedback=?, graded_by=\'auto\', graded_at=? WHERE id=?',
          [g.is_correct, g.points, g.feedback, new Date().toISOString(), a.id]);
        score += g.points || 0;
      }
    } else {
      score += a.points_awarded || 0;
    }
  }
  const hasPending = store.get("SELECT COUNT(*) AS n FROM answers WHERE attempt_id=? AND grading_status='pending'", [attemptId]).n > 0;
  const status = hasPending ? 'submitted' : 'graded';
  store.run('UPDATE attempts SET submitted_at=?, status=?, score=?, max_score=? WHERE id=?',
    [new Date().toISOString(), status, score, att.max_score, attemptId]);
  return { ok: true, attempt: { id: attemptId, status, score, max_score: att.max_score } };
}

export function gradeAnswer({ answerId, points, feedback }: any): any {
  const a = store.get('SELECT * FROM answers WHERE id=?', [answerId]);
  if (!a) throw err('NOT_FOUND', 'answer not found');
  const q = store.get('SELECT * FROM questions WHERE id=?', [a.question_id]);
  if (points < 0 || points > q.points) throw err('VALIDATION', 'points out of range', 'points');
  store.run('UPDATE answers SET grading_status=\'graded\', is_correct=?, points_awarded=?, feedback=?, graded_by=\'ai\', graded_at=? WHERE id=?',
    [points >= q.points ? 1 : (points > 0 ? null : 0), points, feedback, new Date().toISOString(), answerId]);
  // recompute attempt score
  const att = store.get('SELECT * FROM attempts WHERE id=?', [a.attempt_id]);
  const answers = store.all('SELECT * FROM answers WHERE attempt_id=?', [a.attempt_id]);
  let score = 0; let pending = 0;
  for (const x of answers) {
    if (x.grading_status === 'pending') pending++;
    else score += x.points_awarded || 0;
  }
  const status = pending === 0 ? 'graded' : 'submitted';
  store.run('UPDATE attempts SET status=?, score=? WHERE id=?', [status, score, att.id]);
  return { ok: true, answer: { id: answerId }, attempt: { id: att.id, status, score, max_score: att.max_score } };
}

export function pending({ limit }: any): any {
  const lim = Math.min(Math.max(limit || 20, 1), 50);
  const rows = store.all(
    `SELECT a.id AS answer_id, a.attempt_id, q.type AS question_type, q.prompt, q.answer_json, q.points AS max_points, a.response
     FROM answers a JOIN questions q ON q.id=a.question_id
     WHERE a.grading_status='pending' ORDER BY a.id LIMIT ?`, [lim]);
  return rows.map((r) => {
    const ans = JSON.parse(r.answer_json);
    return { answer_id: r.answer_id, attempt_id: r.attempt_id, question_type: r.question_type,
      prompt: r.prompt, reference: ans.reference || null, rubric: ans.rubric || null,
      max_points: r.max_points, response: r.response };
  });
}

export function list({ status, quizId, limit }: any): any {
  const lim = Math.min(Math.max(limit || 20, 1), 100);
  let sql = 'SELECT * FROM attempts WHERE 1=1';
  const params: any[] = [];
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (quizId) { sql += ' AND quiz_id=?'; params.push(quizId); }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(lim);
  return store.all(sql, params);
}