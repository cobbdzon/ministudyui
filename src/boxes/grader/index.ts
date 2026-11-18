import type { GradeResult, QuestionAnswer, QuestionType } from '../../../shared/types.js';

interface GradeQuestion {
  type: QuestionType;
  answer_json: string | QuestionAnswer;
  points?: number;
}

export function gradeAuto(question: GradeQuestion, response: string): GradeResult {
  const raw = question.answer_json;
  const ans: QuestionAnswer = typeof raw === 'string' ? JSON.parse(raw) as QuestionAnswer : raw;
  const pts = question.points ?? 1;
  if (question.type === 'mcq') {
    const ok = String(response).trim() === String(ans.correct).trim();
    return { status: 'graded', is_correct: ok ? 1 : 0, points: ok ? pts : 0, feedback: ok ? 'Correct.' : 'Incorrect.' };
  }
  if (question.type === 'multi') {
    let r: unknown;
    try { r = JSON.parse(response); } catch { r = []; }
    const got = Array.isArray(r) ? r.map((x) => String(x)) : [];
    const want = (Array.isArray(ans.correct) ? ans.correct : []).map(String);
    const ok = got.length === want.length
      && got.every((x) => want.includes(x))
      && want.every((x) => got.includes(x));
    return { status: 'graded', is_correct: ok ? 1 : 0, points: ok ? pts : 0, feedback: ok ? 'Correct.' : 'Incorrect.' };
  }
  if (question.type === 'numeric') {
    const v = Number(response);
    if (!Number.isFinite(v)) return { status: 'graded', is_correct: 0, points: 0, feedback: 'Not a number.' };
    const target = Number(ans.value);
    const tol = ans.tolerance ?? 0;
    const type = ans.tolerance_type || 'abs';
    const diff = type === 'rel' ? Math.abs(v - target) / Math.max(Math.abs(target), 1e-12) : Math.abs(v - target);
    const ok = diff <= tol;
    return {
      status: 'graded', is_correct: ok ? 1 : 0, points: ok ? pts : 0,
      feedback: ok ? 'Correct.' : `Expected ${target}${ans.unit ? ' ' + ans.unit : ''}.`,
    };
  }
  // short / latex -> pending
  return { status: 'pending', is_correct: null, points: null, feedback: '' };
}
