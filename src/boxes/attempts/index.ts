import * as store from '../store/index.js';
import { AppError } from '../errors.js';
import { gradeAuto } from '../grader/index.js';
import type {
  AnswerResponse, AnswerRow, AttemptAnswerInput, AttemptListInput, AttemptQuestionsInput, AttemptRow,
  AttemptStart, AttemptStartInput, AttemptSubmitInput, Choice, GradeAnswerInput,
  GradeResponse, PendingAnswerDto, PendingInput, QuestionAnswer, QuestionRow,
  QuizQuestionDto, QuizRow, SubmitResponse,
} from '../../../shared/types.js';

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function start({ quizId }: AttemptStartInput): AttemptStart {
  const quiz = store.get<QuizRow>('SELECT * FROM quizzes WHERE id=?', [quizId]);
  if (!quiz) throw new AppError('NOT_FOUND', 'quiz not found');
  const qs = store.all<{ id: number; points: number }>('SELECT id, points FROM questions WHERE quiz_id=? ORDER BY position', [quizId]);
  const maxScore = qs.reduce((a, q) => a + q.points, 0);
  // The order is fixed once, when the attempt starts, so resuming or reopening
  // the result shows the same sequence the learner saw.
  const order = quiz.shuffle ? shuffled(qs.map((q) => q.id)) : null;
  const r = store.run('INSERT INTO attempts (quiz_id, max_score, question_order_json) VALUES (?,?,?)',
    [quizId, maxScore, order ? JSON.stringify(order) : null]);
  return { id: r.lastInsertRowid, quiz_id: quizId, status: 'in_progress', max_score: maxScore };
}

export function attemptQuestions({ attemptId, includeAnswers = true }: AttemptQuestionsInput): QuizQuestionDto[] {
  const att = store.get<AttemptRow>('SELECT * FROM attempts WHERE id=?', [attemptId]);
  if (!att) throw new AppError('NOT_FOUND', 'attempt not found');
  const rows = store.all<QuestionRow>('SELECT * FROM questions WHERE quiz_id=? ORDER BY position', [att.quiz_id]);
  if (att.question_order_json) {
    let ids: number[] = [];
    try { ids = JSON.parse(att.question_order_json) as number[]; } catch { /* fall back to authored order */ }
    const rank = new Map(ids.map((id, i) => [id, i]));
    rows.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  }
  return rows.map((r) => {
    const q: QuizQuestionDto = {
      id: r.id, position: r.position, type: r.type, prompt: r.prompt,
      explanation: r.explanation, points: r.points,
    };
    if (r.choices_json) q.choices = JSON.parse(r.choices_json) as Choice[];
    if (includeAnswers) q.answer = JSON.parse(r.answer_json) as QuestionAnswer;
    return q;
  });
}

export function restart({ quizId }: AttemptStartInput): AttemptStart {
  const quiz = store.get('SELECT * FROM quizzes WHERE id=?', [quizId]);
  if (!quiz) throw new AppError('NOT_FOUND', 'quiz not found');
  return store.tx(() => {
    // In-progress attempts are abandoned work: drop them (and their answers,
    // including any pending AI-graded ones) before starting a fresh attempt.
    store.run("DELETE FROM attempts WHERE quiz_id=? AND status='in_progress'", [quizId]);
    return start({ quizId });
  });
}

export function answer({ attemptId, questionId, response }: AttemptAnswerInput): AnswerResponse {
  const att = store.get<AttemptRow>('SELECT * FROM attempts WHERE id=?', [attemptId]);
  if (!att) throw new AppError('NOT_FOUND', 'attempt not found');
  if (att.status !== 'in_progress') throw new AppError('CONFLICT', 'attempt not in progress');
  const q = store.get<QuestionRow>('SELECT * FROM questions WHERE id=?', [questionId]);
  if (!q) throw new AppError('NOT_FOUND', 'question not found');
  const existing = store.get<{ id: number }>('SELECT id FROM answers WHERE attempt_id=? AND question_id=?', [attemptId, questionId]);
  const res = typeof response === 'string' ? response : JSON.stringify(response);
  if (existing) {
    store.run('UPDATE answers SET response=?, grading_status=\'pending\', is_correct=NULL, points_awarded=NULL, feedback=\'\', graded_by=NULL, graded_at=NULL WHERE id=?', [res, existing.id]);
    return { ok: true, answer_id: existing.id };
  }
  const g = gradeAuto(q, res);
  const r = store.run('INSERT INTO answers (attempt_id, question_id, response, grading_status, is_correct, points_awarded, feedback, graded_by, graded_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [attemptId, questionId, res, g.status, g.is_correct, g.points, g.feedback,
      g.status === 'graded' ? 'auto' : null, g.status === 'graded' ? new Date().toISOString() : null]);
  return { ok: true, answer_id: r.lastInsertRowid };
}

export function submit({ attemptId }: AttemptSubmitInput): SubmitResponse {
  const att = store.get<AttemptRow>('SELECT * FROM attempts WHERE id=?', [attemptId]);
  if (!att) throw new AppError('NOT_FOUND', 'attempt not found');
  const answers = store.all<AnswerRow>('SELECT * FROM answers WHERE attempt_id=?', [attemptId]);
  const questions = store.all<QuestionRow>('SELECT * FROM questions WHERE quiz_id=?', [att.quiz_id]);
  const qmap = new Map(questions.map((q) => [q.id, q]));
  let score = 0;
  for (const a of answers) {
    if (a.grading_status === 'pending') {
      const q = qmap.get(a.question_id);
      if (!q) continue;
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
  const hasPending = store.count("SELECT COUNT(*) AS n FROM answers WHERE attempt_id=? AND grading_status='pending'", [attemptId]) > 0;
  const status = hasPending ? 'submitted' : 'graded';
  store.run('UPDATE attempts SET submitted_at=?, status=?, score=?, max_score=? WHERE id=?',
    [new Date().toISOString(), status, score, att.max_score, attemptId]);
  return { ok: true, attempt: { id: attemptId, status, score, max_score: att.max_score } };
}

export function gradeAnswer({ answerId, points, feedback }: GradeAnswerInput): GradeResponse {
  const a = store.get<AnswerRow>('SELECT * FROM answers WHERE id=?', [answerId]);
  if (!a) throw new AppError('NOT_FOUND', 'answer not found');
  const q = store.get<QuestionRow>('SELECT * FROM questions WHERE id=?', [a.question_id]);
  if (!q) throw new AppError('NOT_FOUND', 'question not found');
  if (points < 0 || points > q.points) throw new AppError('VALIDATION', 'points out of range', 'points');
  store.run('UPDATE answers SET grading_status=\'graded\', is_correct=?, points_awarded=?, feedback=?, graded_by=\'ai\', graded_at=? WHERE id=?',
    [points >= q.points ? 1 : (points > 0 ? null : 0), points, feedback, new Date().toISOString(), answerId]);
  const att = store.get<AttemptRow>('SELECT * FROM attempts WHERE id=?', [a.attempt_id]);
  if (!att) throw new AppError('NOT_FOUND', 'attempt not found');
  const answers = store.all<AnswerRow>('SELECT * FROM answers WHERE attempt_id=?', [a.attempt_id]);
  let score = 0; let pending = 0;
  for (const x of answers) {
    if (x.grading_status === 'pending') pending++;
    else score += x.points_awarded || 0;
  }
  const status = pending === 0 ? 'graded' : 'submitted';
  store.run('UPDATE attempts SET status=?, score=? WHERE id=?', [status, score, att.id]);
  return { ok: true, answer: { id: answerId }, attempt: { id: att.id, status, score, max_score: att.max_score } };
}

export function pending({ limit }: PendingInput): PendingAnswerDto[] {
  const lim = Math.min(Math.max(limit || 20, 1), 50);
  const rows = store.all<{
    answer_id: number; attempt_id: number; question_type: PendingAnswerDto['question_type'];
    prompt: string; answer_json: string; max_points: number; response: string;
  }>(
    `SELECT a.id AS answer_id, a.attempt_id, q.type AS question_type, q.prompt, q.answer_json, q.points AS max_points, a.response
     FROM answers a JOIN questions q ON q.id=a.question_id
     WHERE a.grading_status='pending' ORDER BY a.id LIMIT ?`, [lim]);
  return rows.map((r) => {
    const ans = JSON.parse(r.answer_json) as QuestionAnswer;
    return {
      answer_id: r.answer_id, attempt_id: r.attempt_id, question_type: r.question_type,
      prompt: r.prompt, reference: ans.reference || null, rubric: ans.rubric || null,
      max_points: r.max_points, response: r.response,
    };
  });
}

export function list({ status, quizId, limit }: AttemptListInput): AttemptRow[] {
  const lim = Math.min(Math.max(limit || 20, 1), 100);
  let sql = 'SELECT * FROM attempts WHERE 1=1';
  const params: (string | number)[] = [];
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (quizId) { sql += ' AND quiz_id=?'; params.push(quizId); }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(lim);
  return store.all<AttemptRow>(sql, params);
}
