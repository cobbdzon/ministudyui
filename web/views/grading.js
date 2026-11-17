import { icon } from '../icons.js';
import { escapeHtml as esc, renderMath } from '../math.js';
import { plural, toast, typeLabel } from '../ui.js';

export async function mount(el, ctx) {
  let disposed = false;
  let refreshTimer = null;

  async function render() {
    const data = await ctx.api.pending(20);
    const items = data.answers || [];

    el.innerHTML = `
      <header class="page-head">
        <div class="page-head__text">
          <h1 class="page-title">Grading queue</h1>
          <p class="page-sub">Free responses wait here until your AI grades them through MCP. Manual grading is available if you want to do it yourself.</p>
        </div>
        <div class="page-actions">
          <span class="chip chip--${items.length ? 'warning' : 'success'}">${icon(
            items.length ? 'schedule' : 'check_circle'
          )}${items.length ? `${plural(items.length, 'answer')} pending` : 'All clear'}</span>
        </div>
      </header>

      ${
        items.length
          ? items
              .map(
                (a) => `<article class="grade-item">
                  <div class="grade-item__head">
                    <span class="chip chip--warning">${icon('schedule')}Awaiting grade</span>
                    <span class="chip chip--plain">Attempt ${a.attempt_id}</span>
                    <span class="chip chip--plain">${esc(typeLabel(a.question_type))}</span>
                    <span class="section-meta mono" style="margin-left:auto">Max ${a.max_points} ${
                      Number(a.max_points) === 1 ? 'point' : 'points'
                    }</span>
                  </div>
                  <div class="grade-item__prompt" data-math>${esc(a.prompt)}</div>
                  <div class="grade-block">
                    <div class="grade-block__label">Student response</div>
                    <div class="grade-block__body" data-math>${esc(a.response || 'No response')}</div>
                  </div>
                  ${
                    a.reference
                      ? `<div class="grade-block">
                          <div class="grade-block__label">Model answer</div>
                          <div class="grade-block__body" data-math>${esc(a.reference)}</div>
                        </div>`
                      : ''
                  }
                  ${
                    a.rubric
                      ? `<div class="grade-block">
                          <div class="grade-block__label">Rubric</div>
                          <div class="grade-block__body">${esc(a.rubric)}</div>
                        </div>`
                      : ''
                  }
                  <details class="grade-manual">
                    <summary>${icon('chevron_right')}Grade manually</summary>
                    <form class="grade-form" data-answer="${a.answer_id}" data-max="${a.max_points}">
                      <label class="field">
                        <span class="field__label">Points</span>
                        <input class="input" name="points" type="number" min="0" max="${a.max_points}" step="0.5" value="${
                          a.max_points
                        }" required>
                      </label>
                      <label class="field">
                        <span class="field__label">Feedback</span>
                        <input class="input" name="feedback" maxlength="4000" placeholder="What was right, and what was missing?" required>
                      </label>
                      <button class="btn btn--filled" type="submit">Save grade</button>
                    </form>
                  </details>
                </article>`
              )
              .join('')
          : `<div class="empty">
              <div class="empty__icon">${icon('fact_check')}</div>
              <h2 class="empty__title">Nothing to grade</h2>
              <p class="empty__body">When a quiz has a short answer or worked solution, it lands here after submission. Your AI can grade it through MCP, and this page updates as soon as the score arrives.</p>
              <a class="btn btn--tonal" href="#/quizzes">Open quizzes</a>
            </div>`
      }`;

    el.querySelectorAll('[data-math]').forEach((node) => renderMath(node));

    el.querySelectorAll('.grade-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const answerId = Number(form.dataset.answer);
        const max = Number(form.dataset.max);
        const points = Number(new FormData(form).get('points'));
        const feedback = String(new FormData(form).get('feedback') || '').trim();
        if (!Number.isFinite(points) || points < 0 || points > max) {
          toast(`Points must be between 0 and ${max}`, { type: 'error' });
          return;
        }
        if (!feedback) {
          toast('Add a short note for the student', { type: 'error' });
          return;
        }
        const btn = form.querySelector('button[type="submit"]');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Saving…';
        }
        try {
          await ctx.api.grade(answerId, points, feedback);
          toast('Grade saved and score updated');
          await render();
        } catch (err) {
          toast(err.message || 'Could not save the grade', { type: 'error' });
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save grade';
          }
        }
      });
    });
  }

  try {
    await render();
  } catch (err) {
    el.innerHTML = `<div class="empty" style="margin-top:12vh">
      <div class="empty__icon">${icon('cancel')}</div>
      <h2 class="empty__title">The grading queue didn’t load</h2>
      <p class="empty__body">${esc(err.message || 'The local server did not answer.')}</p>
      <button class="btn btn--tonal" id="grading-retry">Try again</button>
    </div>`;
    el.querySelector('#grading-retry')?.addEventListener('click', () => render().catch(() => {}));
    return () => {
      disposed = true;
    };
  }

  const off = ctx.onChange((changes) => {
    if (!changes.some((c) => c.entity === 'answer' || c.entity === 'attempt')) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (disposed) return;
      render().catch(() => {});
    }, 450);
  });

  return () => {
    disposed = true;
    clearTimeout(refreshTimer);
    off();
  };
}
