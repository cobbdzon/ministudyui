import { icon } from '../icons.js';
import { escapeHtml as esc } from '../math.js';
import {
  deckMeter,
  dialog,
  greeting,
  heatmap,
  longDate,
  plural,
  relTime,
  statusChip,
  toast,
} from '../ui.js';

export async function mount(el, ctx) {
  let disposed = false;
  let refreshing = false;
  let refreshTimer = null;

  async function load() {
    const [decksRes, statsRes, pendingRes, attemptsRes, quizzesRes] = await Promise.allSettled([
      ctx.api.decks(),
      ctx.api.stats(),
      ctx.api.pending(5),
      ctx.api.attempts({ limit: 4 }),
      ctx.api.quizzes(),
    ]);
    const decks = decksRes.status === 'fulfilled' ? decksRes.value.decks || [] : [];
    const stats = statsRes.status === 'fulfilled' ? statsRes.value || {} : {};
    const pending = pendingRes.status === 'fulfilled' ? pendingRes.value.answers || [] : [];
    const attempts = attemptsRes.status === 'fulfilled' ? attemptsRes.value.attempts || [] : [];
    const quizzes = quizzesRes.status === 'fulfilled' ? quizzesRes.value.quizzes || [] : [];
    return { decks, stats, pending, attempts, quizzes };
  }

  function deckRow(d) {
    const learning = Math.max((Number(d.total) || 0) - (Number(d.new) || 0) - (Number(d.mature) || 0), 0);
    return `<a class="list__row" href="#/deck/${d.id}">
      <span class="list__main">
        <span class="list__title">${esc(d.name)}</span>
        <span class="list__desc">${esc(d.description || 'No description')}</span>
      </span>
      <span class="deck-row__meter">
        ${deckMeter(d)}
        <span class="deck-row__counts">
          <span><b>${d.total ?? 0}</b> cards</span>
          <span><b>${d.mature ?? 0}</b> mature</span>
          <span title="Learning"><b>${learning}</b> learning</span>
        </span>
      </span>
      <span class="deck-row__due"><b>${d.due ?? 0}</b>due now</span>
      <span class="list__chevron" aria-hidden="true">${icon('chevron_right')}</span>
    </a>`;
  }

  function attemptRow(a, quizzes) {
    const quiz = quizzes.find((q) => Number(q.id) === Number(a.quiz_id));
    const title = quiz ? quiz.title : `Quiz ${a.quiz_id}`;
    const href = a.status === 'in_progress' ? `#/quiz/${a.quiz_id}` : `#/attempt/${a.id}`;
    const score =
      a.status === 'in_progress' ? '—' : `${Number(a.score ?? 0)}/${Number(a.max_score ?? 0)}`;
    return `<a class="attempt-row" href="${href}">
      <span class="attempt-row__main">
        <span class="attempt-row__title">${esc(title)}</span>
        <span class="attempt-row__time">${esc(relTime(a.submitted_at || a.started_at))}</span>
      </span>
      <span class="attempt-row__score">${esc(score)}</span>
      ${statusChip(a.status)}
    </a>`;
  }

  async function render() {
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

    el.innerHTML = `
      <div class="home-layout">
        <div class="home-main">
          <header class="home-hero">
            <p class="home-date">${esc(longDate())}</p>
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
                ? `<div class="list deck-list">${decks.map(deckRow).join('')}</div>`
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
                ? `<div>${attempts.map((a) => attemptRow(a, quizzes)).join('')}</div>`
                : `<p class="muted" style="font: var(--md-sys-typescale-body-small)">No quiz attempts yet. Open a quiz to test yourself.</p>`
            }
          </section>
        </aside>
      </div>`;

    bind();
  }

  async function refresh() {
    if (refreshing || disposed) return;
    refreshing = true;
    try {
      await render();
    } catch (err) {
      ctx.toast(err?.message || 'Could not refresh home', { type: 'error' });
    } finally {
      refreshing = false;
    }
  }

  function openNewDeck() {
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
        const submit = async (e) => {
          if (e.submitter?.value !== 'create') return;
          const name = root.querySelector('#deck-name').value.trim();
          const description = root.querySelector('#deck-desc').value.trim();
          if (!name) {
            root.querySelector('#deck-name').focus();
            ctx.toast('Give the deck a name first', { type: 'error' });
            return;
          }
          try {
            await ctx.api.createDeck({ name, description });
            ctx.toast(`Deck “${name}” created`);
            await refresh();
          } catch (err) {
            ctx.toast(err.message || 'Could not create the deck', { type: 'error' });
          }
        };
        root.addEventListener('submit', submit);
      },
    });
  }

  function bind() {
    el.querySelector('#new-deck')?.addEventListener('click', openNewDeck);
    el.querySelector('#new-deck-empty')?.addEventListener('click', openNewDeck);
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
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 400);
  });

  try {
    await render();
  } catch (err) {
    el.innerHTML = `<div class="empty" style="margin-top:12vh">
      <div class="empty__icon">${icon('cancel')}</div>
      <h2 class="empty__title">Home didn’t load</h2>
      <p class="empty__body">${esc(err.message || 'The local server did not answer.')}</p>
      <button class="btn btn--tonal" id="home-retry">Try again</button>
    </div>`;
    el.querySelector('#home-retry')?.addEventListener('click', () => render().catch(() => {}));
  }

  return () => {
    disposed = true;
    clearTimeout(refreshTimer);
    off();
  };
}
