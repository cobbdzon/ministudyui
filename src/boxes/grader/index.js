export function gradeAuto(question, response) {
  const ans = typeof question.answer_json === 'string' ? JSON.parse(question.answer_json) : question.answer_json;
  const pts = question.points ?? 1;
  if (question.type === 'mcq') {
    const ok = String(response).trim() === String(ans.correct).trim();
    return { status: 'graded', is_correct: ok ? 1 : 0, points: ok ? pts : 0, feedback: ok ? 'Correct.' : 'Incorrect.' };
  }
  if (question.type === 'multi') {
    let r;
    try { r = JSON.parse(response); } catch { r = []; }
    const got = Array.isArray(r) ? r.map(String) : [];
    const want = (ans.correct || []).map(String);
    const ok = got.length === want.length && got.every((x) => want.includes(x)) && want.every((x) => got.includes(x));
    return { status: 'graded', is_correct: ok ? 1 : 0, points: ok ? pts : 0, feedback: ok ? 'Correct.' : 'Incorrect.' };
  }
  if (question.type === 'numeric') {
    const v = Number(response);
    if (!Number.isFinite(v)) return { status: 'graded', is_correct: 0, points: 0, feedback: 'Not a number.' };
    const target = ans.value;
    const tol = ans.tolerance ?? 0;
    const type = ans.tolerance_type || 'abs';
    const diff = type === 'rel' ? Math.abs(v - target) / Math.max(Math.abs(target), 1e-12) : Math.abs(v - target);
    const ok = diff <= tol;
    return { status: 'graded', is_correct: ok ? 1 : 0, points: ok ? pts : 0, feedback: ok ? 'Correct.' : `Expected ${target}${ans.unit ? ' ' + ans.unit : ''}.` };
  }
  // short / latex -> pending
  return { status: 'pending', is_correct: null, points: null, feedback: '' };
}