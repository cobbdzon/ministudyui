import { icon } from '../icons.js';
import { escapeHtml as esc, renderMath } from '../math.js';
import { plural, relTime, statusChip, toast, typeLabel } from '../ui.js';
import { errorMessage } from '../api.js';
import type { AppContext } from '../context.js';
import type { AnswerRow, AttemptRow, ChangeEvent, QuizQuestionDto, QuizRow } from '../../shared/types.js';

export async function mount(el: HTMLElement, ctx: AppContext): Promise<void | (() => void)> {
  const attemptId = ctx.params[0];
  let disposed = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt: AttemptRow | null = null;
  let answers: AnswerRow[] = [];
  let quiz: QuizRow | null = null;
  let questions: QuizQuestionDto[] = [];

  function answerFor(q: QuizQuestionDto) {
    return answers.find((a) => Number(a.question_id) === Number(q.id));
  }

  function responseText(q: QuizQuestionDto, raw: string) {
    if (raw === undefined || raw === null || String(raw).trim() === '') return '';
    if (q.type === 'mcq') {
      const choice = (q.choices || []).find((c) => String(c.id) === String(raw));
      return choice ? choice.text : String(raw);
    }
    if (q.type === 'multi') {
      let ids: unknown[] = [];
      try {
        ids = JSON.parse(raw);
      } catch {
        ids = String(raw).split(',').filter(Boolean);
      }
      return (Array.isArray(ids) ? ids : [])
        .map((id) => (q.choices || []).find((c) => String(c.id) === String(id))?.text || id)
        .join(' · ');
    }
    return String(raw);
  }

  function correctText(q: QuizQuestionDto) {
    const ans = q.answer || {};
    if (q.type === 'mcq') {
      const choice = (q.choices || []).find((c) => String(c.id) === String(ans.correct));
      return choice ? choice.text : String(ans.correct ?? '');
    }
    if (q.type === 'multi') {
      return ((ans.correct as string[] | undefined) || [])
        .map((id) => (q.choices || []).find((c) => String(c.id) === String(id))?.text || id)
        .join(' · ');
    }
    if (q.type === 'numeric') {
      const tol = Number(ans.tolerance) || 0;
      const unit = ans.unit ? ` ${ans.unit}` : '';
      if (!tol) return `${ans.value}${unit}`;
      return `${ans.value}${unit} ± ${tol}${ans.tolerance_type === 'rel' ? '%' : ''}`;
    }
    return ans.reference || '';
  }

  function outcome(a: AnswerRow | undefined, q: QuizQuestionDto) {
    if (!a) return `<span class="result-outcome result-outcome--no">${icon('cancel')}Not answered</span>`;
    if (a.grading_status === 'pending')
      return `<span class="result-outcome result-outcome--pending pending-pulse">${icon('schedule')}Awaiting AI</span>`;
    if (a.is_correct === 1) return `<span class="result-outcome result-outcome--ok">${icon('check_circle')}Correct</span>`;
    if (a.is_correct === 0) return `<span class="result-outcome result-outcome--no">${icon('cancel')}Incorrect</span>`;
    return `<span class="result-outcome">${icon('edit')}Partial</span>`;
  }

  function pointsLabel(a: AnswerRow | undefined, q: QuizQuestionDto) {
    if (!a) return `0 / ${q.points}`;
    if (a.grading_status === 'pending') return `— / ${q.points}`;
    return `${a.points_awarded ?? 0} / ${q.points}`;
  }

  function render() {
    if (!attempt || !quiz) return;
    const pending = answers.filter((a) => a.grading_status === 'pending').length;
    const pct = attempt.max_score ? Math.round(((attempt.score || 0) / attempt.max_score) * 100) : 0;
    const inProgress = attempt.status === 'in_progress';

    el.innerHTML = `
      <a class="back-link" href="#/quiz/${quiz.id}">${icon('chevron_left')}Back to quiz</a>
      <header class="result-head">
        <div>
          <p class="home-date" style="margin-bottom:8px">${esc(relTime(attempt.submitted_at || attempt.started_at))} · Attempt ${
            attempt.id
          }</p>
          <h1 class="page-title">${esc(quiz.title)}</h1>
          <div class="result-chip-row">
            <span class="chip chip--mono">${pct}%</span>
            ${statusChip(attempt.status)}
            <span class="chip chip--plain">${plural(questions.length, 'question')}</span>
          </div>
        </div>
        <div style="text-align:right">
          <div class="result-score" aria-label="Score ${attempt.score ?? 0} out of ${attempt.max_score ?? 0}">
            ${Number(attempt.score ?? 0)}<small>/ ${Number(attempt.max_score ?? 0)}</small>
          </div>
          <div class="section-meta" style="margin-top:4px">${pending ? 'Score updates as answers are graded' : 'Final score'}</div>
        </div>
      </header>

      ${
        inProgress
          ? `<div class="banner">
              ${icon('schedule')}
              <div class="banner__main">
                <p class="banner__title">This attempt is still in progress</p>
                <p class="banner__body">Finish the remaining questions to get a score.</p>
              </div>
              <a class="btn btn--sm btn--tonal banner__action" href="#/quiz/${quiz.id}">Resume</a>
            </div>`
          : pending
            ? `<div class="banner">
                ${icon('auto_awesome')}
                <div class="banner__main">
                  <p class="banner__title">${plural(pending, 'answer')} waiting for AI grading</p>
                  <p class="banner__body">Your AI grades free responses through MCP. This page updates on its own when the scores arrive.</p>
                </div>
              </div>`
            : ''
      }

      <div class="row row--between" style="margin:28px 0 12px">
        <h2 class="section-title">Question by question</h2>
        <div class="page-actions">
          <a class="btn btn--outlined btn--sm" href="#/quiz/${quiz.id}">${icon('refresh')}Retake</a>
          <a class="btn btn--text btn--sm" href="#/quizzes">All quizzes</a>
        </div>
      </div>

      <div>
        ${questions
          .map((q, i) => {
            const a = answerFor(q);
            const response = a ? responseText(q, a.response) : '';
            const correct = correctText(q);
            return `<article class="result-item">
              <div class="result-item__head">
                <span class="result-item__num">${String(i + 1).padStart(2, '0')}</span>
                <div class="result-item__prompt" data-math>${esc(q.prompt)}</div>
                <div class="result-item__marks">
                  ${outcome(a, q)}
                  <span class="chip chip--mono">${pointsLabel(a, q)}</span>
                </div>
              </div>
              <dl class="result-answer">
                <dt>Your answer</dt>
                <dd${response && !['mcq', 'multi'].includes(q.type) ? ' class="content-serif" data-math' : ''}>${
                  response ? esc(response) : '<span class="muted">No answer</span>'
                }</dd>
                <dt>Correct answer</dt>
                <dd class="content-serif" data-math>${esc(correct || '—')}</dd>
                ${
                  a?.feedback
                    ? `<dt>Feedback</dt><dd>${esc(a.feedback)}</dd>`
                    : ''
                }
                ${
                  q.explanation
                    ? `<dt>Why</dt><dd class="result-explanation">${esc(q.explanation)}</dd>`
                    : ''
                }
                <dt>Type</dt>
                <dd><span class="chip chip--plain">${esc(typeLabel(q.type))}</span></dd>
              </dl>
            </article>`;
          })
          .join('')}
      </div>`;

    el.querySelectorAll('[data-math]').forEach((node) => renderMath(node));
  }

  async function load() {
    const data = await ctx.api.attempt(attemptId as unknown as number);
    if (!data?.attempt) throw new Error('Attempt not found');
    attempt = data.attempt;
    answers = data.answers || [];
    const quizData = await ctx.api.quiz(attempt.quiz_id, { includeAnswers: true });
    quiz = quizData.quiz;
    questions = quizData.questions || [];
    render();
  }

  try {
    await load();
  } catch (err) {
    el.innerHTML = `<div class="empty" style="margin-top:12vh">
      <div class="empty__icon">${icon('cancel')}</div>
      <h2 class="empty__title">This attempt didn’t load</h2>
      <p class="empty__body">${esc(errorMessage(err, 'It may have been deleted.'))}</p>
      <a class="btn btn--tonal" href="#/quizzes">Back to quizzes</a>
    </div>`;
    return () => {
      disposed = true;
    };
  }

  const off = ctx.onChange((changes: ChangeEvent[]) => {
    if (!changes.some((c: ChangeEvent) => c.entity === 'answer' || c.entity === 'attempt')) return;
    clearTimeout(refreshTimer ?? undefined);
    refreshTimer = setTimeout(() => {
      if (disposed) return;
      load().catch(() => toast('Could not refresh the result', { type: 'error' }));
    }, 450);
  });

  return () => {
    disposed = true;
    clearTimeout(refreshTimer ?? undefined);
    off();
  };
}
