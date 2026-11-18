import { icon } from '../icons.js';
import { escapeHtml as esc } from '../math.js';
import {
  deckMeter,
  dialog,
  greeting,
  heatmap,
  localTime,
  longDate,
  plural,
  relTime,
  toast,
} from '../ui.js';
import { errorMessage } from '../api.js';
import type { AppContext } from '../context.js';
import type { AttemptRow, DeckSummary, PendingAnswerDto, QuizSummary, StatsDto } from '../../shared/types.js';

export async function mount(el: HTMLElement, ctx: AppContext): Promise<void | (() => void)> {
  let disposed = false;
  let refreshing = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  async function load(): Promise<{
    decks: DeckSummary[];
    stats: StatsDto;
    pending: PendingAnswerDto[];
    attempts: AttemptRow[];
    quizzes: QuizSummary[];
  }> {
    const [decksRes, statsRes, pendingRes, attemptsRes, quizzesRes] = await Promise.allSettled([
      ctx.api.decks(),
      ctx.api.stats(),
      ctx.api.pending(5),
      ctx.api.attempts({ limit: 4 }),
      ctx.api.quizzes(),
    ]);
    const decks: DeckSummary[] = decksRes.status === 'fulfilled' ? decksRes.value.decks || [] : [];
    const stats: StatsDto = statsRes.status === 'fulfilled' ? statsRes.value || ({} as StatsDto) : ({} as StatsDto);
    const pending: PendingAnswerDto[] = pendingRes.status === 'fulfilled' ? pendingRes.value.answers || [] : [];
    const attempts: AttemptRow[] = attemptsRes.status === 'fulfilled' ? attemptsRes.value.attempts || [] : [];
    const quizzes: QuizSummary[] = quizzesRes.status === 'fulfilled' ? quizzesRes.value.quizzes || [] : [];
    return { decks, stats, pending, attempts, quizzes };
  }

  function deckRow(d: DeckSummary, quizzes: QuizSummary[]): string {
    const learning = Math.max((Number(d.total) || 0) - (Number(d.new) || 0) - (Number(d.mature) || 0), 0);
    const linked = quizzes.filter((q) => String(q.deck_id) === String(d.id));
    return `<a class="list__row" href="#/deck/${d.id}">
      <span class="list__main">
        <span class="list__title">
          <span class="list__title-text">${esc(d.name)}</span>
          <button class="icon-btn icon-btn--sm deck-list__edit" data-rename="${d.id}" title="Rename deck" aria-label="Rename ${esc(d.name)}">${icon('edit')}</button>
        </span>
        <span class="list__desc">${esc(d.description || 'No description')}</span>
        ${
          linked[0]
            ? `<span class="deck-row__quizzes" data-deck="${esc(
                String(linked[0].id)
              )}" role="link" tabindex="0" aria-label="Linked quiz: ${esc(
                linked[0].title
              )}" title="Linked quiz: ${esc(linked[0].title)}">${icon('style')}${esc(linked[0].title)}</span>`
            : ''
        }
      </span>
      <span class="deck-row__meter">
        ${deckMeter(d)}
        <span class="deck-row__counts">
          <span><b>${d.total ?? 0}</b> cards</span>
          <span><b>${d.mature ?? 0}</b> mature</span>
          <span title="Learning"><b>${learning}</b> learning</span>
        </span>
      </span>
      <span class="deck-row__side">
        <span class="deck-row__due"><b>${d.due ?? 0}</b>due now</span>
      </span>
      <span class="list__chevron" aria-hidden="true">${icon('chevron_right')}</span>
    </a>`;
  }

  function attemptRow(a: AttemptRow, quizzes: QuizSummary[]): string {
    const quiz = quizzes.find((q) => Number(q.id) === Number(a.quiz_id));
    const title = quiz ? quiz.title : `Quiz ${a.quiz_id}`;
    const href = a.status === 'in_progress' ? `#/quiz/${a.quiz_id}` : `#/attempt/${a.id}`;
    const score = Number(a.score ?? 0);
    const max = Number(a.max_score ?? 0);
    const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((score / max) * 100))) : 0;
    const statusLabel = {
      graded: 'Graded',
      submitted: 'Awaiting grading',
      in_progress: 'In progress',
    }[a.status] || 'Unknown';
    const result =
      a.status === 'in_progress'
        ? `<span class="attempt-row__chevron" aria-hidden="true">${icon('chevron_right')}</span>`
        : `<span class="attempt-row__result">
            <span class="attempt-row__score" role="img" aria-label="Score ${score} out of ${max}"><b>${score}</b><span>/${max}</span></span>
            <span class="attempt-row__bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
          </span>`;
    return `<a class="attempt-row attempt-row--${esc(a.status)}" href="${href}">
      <span class="attempt-row__body">
        <span class="attempt-row__title" title="${esc(title)}">${esc(title)}</span>
        <span class="attempt-row__meta">
          <span class="attempt-row__time">${esc(relTime(a.submitted_at || a.started_at))}</span>
          <span class="attempt-row__status"><i aria-hidden="true"></i>${esc(statusLabel)}</span>
        </span>
      </span>
      ${result}
    </a>`;
  }

  async function render(): Promise<void> {
    const { decks, stats, pending, attempts, quizzes } = await load();
    if (disposed) return;

    const totalDue = decks.reduce((a, d) => a + (Number(d.due) || 0), 0);
    const totalCards = decks.reduce((a, d) => a + (Number(d.total) || 0), 0);
    const deckCount = decks.length;
    const mostDue = [...decks].sort((a, b) => (b.due || 0) - (a.due || 0))[0];
    const reviewHref = mostDue ? `#/review/${mostDue.id}` : '#/quizzes';
    const hasDue = totalDue > 0;

    const dueLine = !deckCount
      ? 'Nothing here yet. Create a deck and add your first cards.'
      : hasDue
        ? `You have <strong>${totalDue} ${totalDue === 1 ? 'card' : 'cards'}</strong> due across ${
            decks.filter((d) => d.due > 0).length
          } ${decks.filter((d) => d.due > 0).length === 1 ? 'deck' : 'decks'}.`
        : 'Nothing is due right now. Everything is scheduled.';

    const pendingBanner = pending.length
      ? `<div class="banner">
          ${icon('fact_check')}
          <div class="banner__main">
            <p class="banner__title">${esc(plural(pending.length, 'answer'))} awaiting grading</p>
            <p class="banner__body">The AI grades these through MCP. You can also grade them by hand.</p>
          </div>
          <a class="btn btn--sm btn--tonal banner__action" href="#/grading">Open</a>
        </div>`
      : '';

    const reviewTotal = (stats.reviews_per_day || []).reduce((a, d) => a + (Number(d.n) || 0), 0);
    const now = new Date();

    el.innerHTML = `
      <div class="home-layout">
        <div class="home-main">
          <header class="home-hero">
            <p class="home-date">
              ${esc(longDate(now))}
              <span class="home-time">${icon('schedule')}<time datetime="${now.toTimeString().slice(0, 5)}">${esc(localTime(now))}</time></span>
            </p>
            <h1 class="home-greeting">${esc(greeting())}</h1>
            <p class="home-status">${dueLine}</p>
            <div class="home-actions">
              <a class="btn btn--filled btn--lg" href="${reviewHref}">
                ${hasDue ? icon('play_arrow') : icon('style')}
                ${hasDue ? 'Start review' : deckCount ? 'Open a deck' : 'Create a deck'}
              </a>
              <a class="btn btn--text" href="#/quizzes">View quizzes</a>
            </div>
          </header>

          <section aria-labelledby="decks-title">
            <div class="section-head">
              <h2 class="section-title" id="decks-title">Your decks</h2>
              <div class="row">
                <span class="section-meta">${deckCount ? `${plural(deckCount, 'deck')} · ${plural(totalCards, 'card')}` : ''}</span>
                <button class="btn btn--text btn--sm" id="new-deck">${icon('add')}New deck</button>
              </div>
            </div>
            ${
              decks.length
                ? `<div class="list deck-list">${decks.map((d) => deckRow(d, quizzes)).join('')}</div>`
                : `<div class="empty">
                    <div class="empty__icon">${icon('style')}</div>
                    <h3 class="empty__title">No decks yet</h3>
                    <p class="empty__body">Create a deck here, or ask your AI to build one through MCP. Cards you add show up live.</p>
                    <button class="btn btn--tonal" id="new-deck-empty">${icon('add')}Create a deck</button>
                  </div>`
            }
          </section>
        </div>

        <aside class="home-aside" aria-label="Study activity">
          ${pendingBanner}
          <section class="aside-block">
            <div class="section-head">
              <h2 class="section-title">Consistency</h2>
              <span class="section-meta mono">${reviewTotal ? plural(reviewTotal, 'review') : 'No reviews'}</span>
            </div>
            ${heatmap(stats.reviews_per_day || [])}
            <div class="heatmap-foot">
              <span>Last 14 weeks</span>
              <span class="heatmap-legend" aria-hidden="true">Less
                <i style="background:var(--md-sys-color-surface-container-high)"></i>
                <i style="background:color-mix(in srgb, var(--md-sys-color-primary) 30%, var(--md-sys-color-surface-container-high))"></i>
                <i style="background:color-mix(in srgb, var(--md-sys-color-primary) 58%, var(--md-sys-color-surface-container-high))"></i>
                <i style="background:var(--md-sys-color-primary)"></i>
              More</span>
            </div>
          </section>

          <section class="aside-block">
            <div class="section-head">
              <h2 class="section-title">Recent attempts</h2>
              <a class="section-meta" href="#/quizzes">All quizzes</a>
            </div>
            ${
              attempts.length
                ? `<div class="list attempts-list">${attempts.map((a) => attemptRow(a, quizzes)).join('')}</div>`
                : `<p class="muted" style="font: var(--md-sys-typescale-body-small)">No quiz attempts yet. Open a quiz to test yourself.</p>`
            }
          </section>
        </aside>
      </div>`;

    bind(decks, quizzes);
  }

  async function refresh(): Promise<void> {
    if (refreshing || disposed) return;
    refreshing = true;
    try {
      await render();
    } catch (err) {
      ctx.toast(errorMessage(err, 'Could not refresh home'), { type: 'error' });
    } finally {
      refreshing = false;
    }
  }

  function openNewDeck(): void {
    dialog({
      title: 'New deck',
      body: `
        <div class="stack">
          <label class="field">
            <span class="field__label">Deck name</span>
            <input class="input" id="deck-name" maxlength="120" autocomplete="off" placeholder="Real Analysis">
          </label>
          <label class="field">
            <span class="field__label">Description</span>
            <textarea class="textarea" id="deck-desc" maxlength="2000" rows="3" placeholder="What belongs in this deck?"></textarea>
          </label>
        </div>`,
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Create deck', value: 'create', variant: 'btn--filled' },
      ],
      onMount(root) {
        const submit = async (e: SubmitEvent) => {
          if ((e.submitter as HTMLButtonElement | null)?.value !== 'create') return;
          const name = root.querySelector<HTMLInputElement>('#deck-name')?.value.trim();
          const description = root.querySelector<HTMLTextAreaElement>('#deck-desc')?.value.trim();
          if (!name) {
            root.querySelector<HTMLInputElement>('#deck-name')?.focus();
            ctx.toast('Give the deck a name first', { type: 'error' });
            return;
          }
          try {
            await ctx.api.createDeck({ name, description });
            ctx.toast(`Deck “${name}” created`);
            await refresh();
          } catch (err) {
            ctx.toast(errorMessage(err, 'Could not create the deck'), { type: 'error' });
          }
        };
        root.addEventListener('submit', submit);
      },
    });
  }

  function openRenameDeck(deck: DeckSummary): void {
    dialog({
      title: 'Rename deck',
      body: `
        <label class="field">
          <span class="field__label">Deck name</span>
          <input class="input" id="deck-rename-name" maxlength="120" autocomplete="off" value="${esc(deck.name)}">
        </label>`,
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Save name', value: 'rename', variant: 'btn--filled' },
      ],
      onMount(root) {
        const input = root.querySelector<HTMLInputElement>('#deck-rename-name');
        input?.focus();
        input?.select();
        root.addEventListener('submit', async (e: SubmitEvent) => {
          if ((e.submitter as HTMLButtonElement | null)?.value !== 'rename') return;
          const name = input?.value.trim();
          if (!name) {
            ctx.toast('Give the deck a name first', { type: 'error' });
            return;
          }
          if (name === deck.name) return;
          try {
            await ctx.api.updateDeck(deck.id, { name });
            ctx.toast(`Deck renamed to “${name}”`);
            await refresh();
          } catch (err) {
            ctx.toast(errorMessage(err, 'Could not rename the deck'), { type: 'error' });
          }
        });
      },
    });
  }

  function bind(decks: DeckSummary[], quizzes: QuizSummary[]): void {
    el.querySelector('#new-deck')?.addEventListener('click', openNewDeck);
    el.querySelector('#new-deck-empty')?.addEventListener('click', openNewDeck);
    el.querySelectorAll<HTMLElement>('[data-rename]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const deck = decks.find((d) => String(d.id) === String(btn.dataset.rename));
        if (deck) openRenameDeck(deck);
      });
    });
    el.querySelectorAll<HTMLElement>('.deck-row__quizzes').forEach((chip) => {
      const go = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.go(chip.dataset.deck ? `#/quiz/${chip.dataset.deck}` : '#/quizzes');
      };
      chip.addEventListener('click', go);
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') go(e);
      });
    });
  }

  el.innerHTML = `<div aria-busy="true">
    <div class="skeleton" style="width:240px;height:44px;margin:12px 0 16px"></div>
    <div class="skeleton" style="width:min(440px,90%);height:16px;margin-bottom:32px"></div>
    <div class="skeleton" style="width:100%;height:78px;margin-bottom:8px"></div>
    <div class="skeleton" style="width:100%;height:78px"></div>
  </div>`;

  const off = ctx.onChange((changes) => {
    const relevant = changes.some((c) => ['deck', 'card', 'attempt', 'answer', 'review'].includes(c.entity));
    if (!relevant) return;
    clearTimeout(refreshTimer ?? undefined);
    refreshTimer = setTimeout(refresh, 400);
  });

  try {
    await render();
  } catch (err) {
    el.innerHTML = `<div class="empty" style="margin-top:12vh">
      <div class="empty__icon">${icon('cancel')}</div>
      <h2 class="empty__title">Home didn’t load</h2>
      <p class="empty__body">${esc(errorMessage(err, 'The local server did not answer.'))}</p>
      <button class="btn btn--tonal" id="home-retry">Try again</button>
    </div>`;
    el.querySelector('#home-retry')?.addEventListener('click', () => render().catch(() => {}));
  }

  return () => {
    disposed = true;
    clearTimeout(refreshTimer ?? undefined);
    off();
  };
}
