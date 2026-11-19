import { icon } from '../icons.js';
import { escapeHtml as esc, markdownInline as mdi, renderMath } from '../math.js';
import { plural, toast } from '../ui.js';
import { errorMessage } from '../api.js';
import type { AppContext } from '../context.js';
import type { ChangeEvent } from '../../shared/types.js';

export async function mount(el: HTMLElement, ctx: AppContext): Promise<void | (() => void)> {
  let disposed = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  async function render() {
    const [data, decksRes] = await Promise.all([ctx.api.quizzes(), ctx.api.decks()]);
    const quizzes = data.quizzes || [];
    const decks = decksRes.decks || [];
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
                const deck = decks.find((d) => String(d.id) === String(q.deck_id));
                const meta = [
                  q.question_count ? plural(q.question_count, 'question') : '',
                  q.total_points ? `${Math.round(q.total_points * 10) / 10} points` : '',
                  q.shuffle ? 'Shuffled' : '',
                ]
                  .filter(Boolean)
                  .join(' · ');
                return `<a class="list__row" href="#/quiz/${q.id}">
                  <span class="quiz-mark">${icon('quiz')}</span>
                  <span class="list__main">
                    <span class="list__title">${esc(q.title)}</span>
                    <span class="list__desc">${mdi(q.description || 'No description')}</span>
                    ${
                      deck
                        ? `<span class="quiz-deck" data-deck="${esc(
                            String(deck.id)
                          )}" role="link" tabindex="0" title="Linked deck: ${esc(deck.name)}">${icon(
                            'style'
                          )}${esc(deck.name)}</span>`
                        : ''
                    }
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
    el.querySelectorAll<HTMLElement>('.quiz-deck').forEach((chip) => {
      const go = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.go(`#/deck/${chip.dataset.deck}`);
      };
      chip.addEventListener('click', go);
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') go(e);
      });
    });
  }

  try {
    await render();
  } catch (err) {
    el.innerHTML = `<div class="empty">
      <div class="empty__icon">${icon('cancel')}</div>
      <h2 class="empty__title">Quizzes didn’t load</h2>
      <p class="empty__body">${esc(errorMessage(err, 'The local server did not answer.'))}</p>
      <button class="btn btn--tonal" id="quizzes-retry">Try again</button>
    </div>`;
    el.querySelector('#quizzes-retry')?.addEventListener('click', () => render().catch(() => {}));
    return () => {
      disposed = true;
    };
  }

  const off = ctx.onChange((changes: ChangeEvent[]) => {
    if (!changes.some((c: ChangeEvent) => c.entity === 'quiz')) return;
    clearTimeout(refreshTimer ?? undefined);
    refreshTimer = setTimeout(() => {
      if (disposed) return;
      render().catch(() => toast('Could not refresh quizzes', { type: 'error' }));
    }, 400);
  });

  return () => {
    disposed = true;
    clearTimeout(refreshTimer ?? undefined);
    off();
  };
}
