import { errorMessage } from '../api.js';
import type { AppContext } from '../context.js';
import { icon } from '../icons.js';
import { debounce, escapeHtml as esc, markdown as md, markdownInline as mdi, renderMath } from '../math.js';
import { searchBar, searchFilterChip, wireSearchBar } from '../search-bar.js';
import { busy, dialog, plural, relTime, toast, typeLabel } from '../ui.js';
import type { ChangeEvent, SharedQuestionDto, SharedQuizDetail } from '../../shared/types.js';

export function quizTabs(active: 'mine' | 'shared'): string {
  return `<nav class="tabs quiz-tabs" aria-label="Quiz library">
    <a class="tab" href="#/quizzes"${active === 'mine' ? ' aria-current="page"' : ''}>My quizzes</a>
    <a class="tab" href="#/shared"${active === 'shared' ? ' aria-current="page"' : ''}>Shared</a>
  </nav>`;
}

function answerText(q: SharedQuestionDto): string {
  const a = q.answer;
  if (a.correct !== undefined) {
    const ids = Array.isArray(a.correct) ? a.correct : [a.correct];
    return ids.map((id) => q.choices?.find((c) => c.id === id)?.text || id).join(', ');
  }
  if (a.value !== undefined) return `${a.value}${a.unit ? ` ${a.unit}` : ''}`;
  return a.reference || '—';
}

function previewBody(item: SharedQuizDetail): string {
  return `<p class="shared-preview__intro">${mdi(item.description || 'No description')}</p>
    ${item.questions.map((q) => `
      <div class="question-preview">
        <span class="question-preview__num">${String(q.position).padStart(2, '0')}</span>
        <div class="question-preview__main">
          <div class="question-preview__prompt">${md(q.prompt)}</div>
          ${q.choices
        ? `<ul class="shared-choices">${q.choices
          .map((c) => `<li><strong>${esc(c.id)}.</strong> ${mdi(c.text)}</li>`)
          .join('')}</ul>`
        : ''}
          <div class="question-preview__meta">
            <span class="chip chip--plain">${esc(typeLabel(q.type))}</span>
            <span class="chip chip--mono">${q.points} ${Number(q.points) === 1 ? 'point' : 'points'}</span>
          </div>
          <p class="shared-answer"><strong>Answer:</strong> ${esc(answerText(q))}</p>
          ${q.explanation ? `<div class="shared-explanation">${md(q.explanation)}</div>` : ''}
        </div>
      </div>`).join('')}`;
}

export async function mount(el: HTMLElement, ctx: AppContext): Promise<void | (() => void)> {
  let disposed = false;
  let query = '';
  let mineOnly = false;

  function openPreview(item: SharedQuizDetail): void {
    void dialog({
      title: item.title,
      wide: true,
      body: previewBody(item),
      actions: [{ label: 'Close', value: 'close', variant: 'btn--tonal' }],
      onMount(root) {
        renderMath(root);
        root.querySelector<HTMLElement>('.dialog__body input, .dialog__body button')?.focus();
      },
    });
  }

  async function importQuiz(id: number): Promise<void> {
    try {
      const result = await ctx.api.importSharedQuiz(id);
      const parts: string[] = [];
      if (result.quizzes_created) parts.push(plural(result.quizzes_created, 'quiz', 'quizzes'));
      if (result.questions_added) parts.push(plural(result.questions_added, 'question'));
      toast(parts.length ? `Imported ${parts.join(' · ')} into your library` : 'Nothing new to import', { icon: 'check_circle' });
      window.dispatchEvent(new CustomEvent('live:change', {
        detail: [{ entity: 'quiz', op: 'insert' }, { entity: 'deck', op: 'update' }],
      }));
      await render();
    } catch (err) {
      toast(errorMessage(err, 'Could not import this quiz.'), { type: 'error' });
    }
  }

  async function unpublish(id: number, title: string): Promise<void> {
    try {
      await ctx.api.unpublishSharedQuiz(id);
      toast(`Removed “${title}” from the shared library`, { icon: 'check_circle' });
      await render();
    } catch (err) {
      toast(errorMessage(err, 'Could not remove the shared quiz.'), { type: 'error' });
    }
  }

  async function render(): Promise<void> {
    const { quizzes } = await ctx.api.sharedQuizzes({ q: query, mine: mineOnly, limit: 100 });
    if (disposed) return;
    el.innerHTML = `
      <header class="page-head">
        <div class="page-head__text">
          <h1 class="page-title">Shared quizzes</h1>
          <p class="page-sub">Quizzes other people chose to share. The shared library is unencrypted, so answers are visible in previews; importing makes a private, encrypted copy.</p>
        </div>
      </header>
      ${quizTabs('shared')}

      ${searchBar({
        id: 'shared-q',
        label: 'Search shared quizzes',
        placeholder: 'Title, description, or author',
        value: query,
        submitLabel: 'Search shared quizzes',
        filters: searchFilterChip({
          id: 'shared-mine', label: 'Only quizzes I published', name: 'mine', checked: mineOnly,
        }),
      })}

      <p class="shared-result-count" role="status" aria-live="polite">${
      quizzes.length ? plural(quizzes.length, 'shared quiz', 'shared quizzes') : ''
    }</p>
      ${
        quizzes.length
          ? `<div class="list shared-list">${quizzes.map((q) => `
              <div class="list__row shared-row">
                <button type="button" class="shared-row__main" data-preview="${q.id}">
                  <span class="list__title">${esc(q.title)}</span>
                  <span class="list__desc">${mdi(q.description || 'No description')}</span>
                  <span class="shared-row__meta">by ${esc(q.owner_username)} · ${
                    plural(q.question_count, 'question')
                  } · ${Math.round(q.total_points * 10) / 10} points · ${esc(relTime(q.updated_at))}</span>
                </button>
                <span class="shared-row__actions">
                  ${q.mine ? `<button class="btn btn--text btn--sm" type="button" data-unpublish="${q.id}"
                    aria-label="Unpublish ${esc(q.title)}">Unpublish</button>` : ''}
                  <button class="btn btn--tonal btn--sm" type="button" data-import="${q.id}"
                    aria-label="Import ${esc(q.title)}">${icon('download')}Import</button>
                </span>
              </div>`).join('')}</div>`
          : `<div class="empty">
              <div class="empty__icon">${icon('quiz')}</div>
              <h2 class="empty__title">${mineOnly ? 'You haven’t published a quiz yet' : 'No shared quizzes found'}</h2>
              <p class="empty__body">${
                mineOnly
                  ? 'Open one of your quizzes and choose Share to publish a snapshot here.'
                  : 'Try another search, or publish one of your own quizzes to get started.'
              }</p>
              <a class="btn btn--tonal" href="#/quizzes">Go to my quizzes</a>
            </div>`
      }`;
    el.querySelectorAll<HTMLElement>('.list__desc').forEach((d) => renderMath(d));
  }

  try {
    await render();
  } catch (err) {
    el.innerHTML = `<div class="empty">
      <div class="empty__icon">${icon('cancel')}</div>
      <h2 class="empty__title">Shared quizzes didn’t load</h2>
      <p class="empty__body">${esc(errorMessage(err, 'The local server did not answer.'))}</p>
      <button class="btn btn--tonal" id="shared-retry">Try again</button>
    </div>`;
    el.querySelector('#shared-retry')?.addEventListener('click', () => { void render().catch(() => {}); });
  }

  const refresh = debounce(() => {
    if (!disposed) void render().catch(() => {});
  }, 400);

  const unwireSearch = wireSearchBar(el, {
    onSearch: (value, form) => {
      query = value;
      mineOnly = !!form.querySelector<HTMLInputElement>('#shared-mine')?.checked;
      void render().catch(() => {});
    },
  });
  el.addEventListener('click', (e: Event) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const preview = target.closest<HTMLElement>('[data-preview]');
    if (preview) {
      void ctx.api.sharedQuiz(Number(preview.dataset.preview)).then(openPreview)
        .catch((err: unknown) => toast(errorMessage(err, 'Could not load this quiz.'), { type: 'error' }));
      return;
    }
    const imp = target.closest<HTMLElement>('[data-import]');
    if (imp) {
      const button = imp.closest<HTMLButtonElement>('button[data-import]');
      if (button) busy(button, true);
      void importQuiz(Number(imp.dataset.import))
        .finally(() => { if (button) busy(button, false); });
      return;
    }
    const unpub = target.closest<HTMLElement>('[data-unpublish]');
    if (unpub) void unpublish(Number(unpub.dataset.unpublish), unpub.getAttribute('aria-label') || 'quiz');
  });
  const off = ctx.onChange((changes: ChangeEvent[]) => {
    if (changes.some((c) => c.entity === 'quiz')) refresh();
  });

  return () => {
    disposed = true;
    refresh.cancel();
    unwireSearch();
    off();
  };
}
