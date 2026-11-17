import { icon } from '../icons.js';
import { escapeHtml as esc, renderMath } from '../math.js';
import { plural, toast } from '../ui.js';

export async function mount(el, ctx) {
  let disposed = false;
  let refreshTimer = null;

  async function render() {
    const data = await ctx.api.quizzes();
    const quizzes = data.quizzes || [];
    const totalQuestions = quizzes.reduce((a, q) => a + (Number(q.question_count) || 0), 0);

    el.innerHTML = `
      <header class="page-head">
        <div class="page-head__text">
          <h1 class="page-title">Quizzes</h1>
          <p class="page-sub">Check what stuck. Answers are revealed after you submit, and free responses are graded by your AI.</p>
        </div>
      </header>

      <div class="section-head">
        <h2 class="section-title">All quizzes</h2>
        <span class="section-meta">${
          quizzes.length ? `${plural(quizzes.length, 'quiz', 'quizzes')} · ${plural(totalQuestions, 'question')}` : ''
        }</span>
      </div>

      ${
        quizzes.length
          ? `<div class="list quiz-list">${quizzes
              .map((q) => {
                const meta = [
                  q.question_count ? plural(q.question_count, 'question') : '',
                  q.total_points ? `${Math.round(q.total_points * 10) / 10} points` : '',
                ]
                  .filter(Boolean)
                  .join(' · ');
                return `<a class="list__row" href="#/quiz/${q.id}">
                  <span class="quiz-mark">${icon('quiz')}</span>
                  <span class="list__main">
                    <span class="list__title">${esc(q.title)}</span>
                    <span class="list__desc">${esc(q.description || 'No description')}</span>
                  </span>
                  <span class="list__aside mono" style="font-size:11.5px">${esc(meta)}</span>
                  <span class="list__chevron" aria-hidden="true">${icon('chevron_right')}</span>
                </a>`;
              })
              .join('')}</div>`
          : `<div class="empty">
              <div class="empty__icon">${icon('quiz')}</div>
              <h2 class="empty__title">No quizzes yet</h2>
              <p class="empty__body">Ask your AI to build a quiz through MCP, with multiple choice, numeric, or worked answers. It appears here as soon as it is created.</p>
              <a class="btn btn--tonal" href="#/">Go to your decks</a>
            </div>`
      }`;
    el.querySelectorAll('.list__desc').forEach((d) => renderMath(d));
  }

  try {
    await render();
  } catch (err) {
    el.innerHTML = `<div class="empty">
      <div class="empty__icon">${icon('cancel')}</div>
      <h2 class="empty__title">Quizzes didn’t load</h2>
      <p class="empty__body">${esc(err.message || 'The local server did not answer.')}</p>
      <button class="btn btn--tonal" id="quizzes-retry">Try again</button>
    </div>`;
    el.querySelector('#quizzes-retry')?.addEventListener('click', () => render().catch(() => {}));
    return () => {
      disposed = true;
    };
  }

  const off = ctx.onChange((changes) => {
    if (!changes.some((c) => c.entity === 'quiz')) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (disposed) return;
      render().catch(() => toast('Could not refresh quizzes', { type: 'error' }));
    }, 400);
  });

  return () => {
    disposed = true;
    clearTimeout(refreshTimer);
    off();
  };
}
