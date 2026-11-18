import { icon } from '../icons.js';
import { escapeHtml as esc } from '../math.js';
import { activityChart, fmtPercent, mixPieChart, plural, toast } from '../ui.js';
import { errorMessage } from '../api.js';
import type { AppContext } from '../context.js';
import type { ChangeEvent } from '../../shared/types.js';

export async function mount(el: HTMLElement, ctx: AppContext): Promise<void | (() => void)> {
  let disposed = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  async function render() {
    const [statsRes, decksRes] = await Promise.allSettled([ctx.api.stats(), ctx.api.decks()]);
    if (statsRes.status === 'rejected') throw statsRes.reason;
    const stats = statsRes.value || {};
    const decks = decksRes.status === 'fulfilled' ? decksRes.value.decks || [] : [];

    const days = stats.reviews_per_day || [];
    const reviewTotal = days.reduce((a, d) => a + (Number(d.n) || 0), 0);
    const deckTotal = decks.reduce((a, d) => a + (Number(d.total) || 0), 0);
    const totalCards = stats.total ?? deckTotal;
    const due = stats.due ?? decks.reduce((a, d) => a + (Number(d.due) || 0), 0);

    const derivedMix = (() => {
      const fresh = decks.reduce((a, d) => a + (Number(d.new) || 0), 0);
      const mature = decks.reduce((a, d) => a + (Number(d.mature) || 0), 0);
      return [
        { bucket: 'new', cards: fresh },
        { bucket: 'learning', cards: Math.max(deckTotal - fresh - mature, 0) },
        { bucket: 'mature', cards: mature },
      ];
    })();
    const mix = stats.interval_distribution?.length ? stats.interval_distribution : derivedMix;
    const mixTotal = mix.reduce((a, m) => a + (Number(m.cards) || 0), 0);
    const weakest = stats.weakest_tags || [];
    const maxLapses = Math.max(1, ...weakest.map((t) => Number(t.lapses) || 0));

    el.innerHTML = `
      <header class="page-head">
        <div class="page-head__text">
          <h1 class="page-title">Stats</h1>
          <p class="page-sub">How much you have reviewed, how well it is sticking, and where the deck is still thin.</p>
        </div>
      </header>

      <div class="stat-band">
        <div class="stat">
          <div class="stat__num">${reviewTotal}</div>
          <div class="stat__label">Reviews in 30 days</div>
        </div>
        <div class="stat">
          <div class="stat__num">${stats.retention !== undefined && stats.retention !== null ? fmtPercent(stats.retention, 1) : '—'}</div>
          <div class="stat__label">Retention</div>
        </div>
        <div class="stat">
          <div class="stat__num">${due}</div>
          <div class="stat__label">Due now</div>
        </div>
        <div class="stat">
          <div class="stat__num">${totalCards}</div>
          <div class="stat__label">Cards total</div>
        </div>
      </div>

      <div class="stats-grid">
        <section class="chart-panel" aria-labelledby="activity-title">
          <div class="chart-panel__head">
            <h2 class="chart-panel__title" id="activity-title">Reviews per day</h2>
            <span class="chart-panel__meta">Last 30 days · ${plural(reviewTotal, 'review')}</span>
          </div>
          ${
            reviewTotal
              ? activityChart(days, { weeks: 30 })
              : `<div class="chart-empty">
                  <div>
                    <div style="font: var(--md-sys-typescale-title-medium); color: var(--md-sys-color-on-surface); margin-bottom: 4px">No reviews yet</div>
                    Finish a review session and the last 30 days appear here.
                  </div>
                </div>`
          }
        </section>

        <div class="stack">
          <section class="chart-panel" aria-labelledby="mix-title">
            <div class="chart-panel__head">
              <h2 class="chart-panel__title" id="mix-title">Card mix</h2>
              <span class="chart-panel__meta">${plural(mixTotal, 'card')}</span>
            </div>
            ${mixPieChart(mix)}
            <p class="muted mix-note">
              New cards have never been reviewed. Mature cards have an interval of three reps or more.
            </p>
          </section>

          ${
            weakest.length
              ? `<section class="chart-panel" aria-labelledby="weak-title">
                  <div class="chart-panel__head">
                    <h2 class="chart-panel__title" id="weak-title">Thinnest tags</h2>
                    <span class="chart-panel__meta">By lapses</span>
                  </div>
                  <div>
                    ${weakest
                      .slice(0, 6)
                      .map(
                        (t) => `<div class="tag-weak">
                          <span class="tag-weak__name">${esc(t.tag)}</span>
                          <span class="distribution__track" style="flex:1">
                            <span class="distribution__fill" style="width:${Math.round(
                              (Number(t.lapses) / maxLapses) * 100
                            )}%;background:var(--md-sys-color-warning)"></span>
                          </span>
                          <span class="tag-weak__value">${Number(t.lapses).toFixed(1)} lapses<br>${plural(
                            t.cards,
                            'card'
                          )}</span>
                        </div>`
                      )
                      .join('')}
                  </div>
                </section>`
              : ''
          }
        </div>
      </div>

      ${
        decks.length
          ? `<section class="stats-decks" aria-labelledby="decks-stats-title">
              <div class="section-head">
                <h2 class="section-title" id="decks-stats-title">By deck</h2>
                <span class="section-meta">${plural(decks.length, 'deck')}</span>
              </div>
              <div class="panel panel--plain">
                ${decks
                  .map(
                    (d) => `<div class="stats-deck">
                      <a class="stats-deck__name" href="#/deck/${d.id}">${esc(d.name)}</a>
                      <span class="deck-row__meter">
                        <span class="meter">
                          <span class="meter__seg meter__seg--mature" style="flex:${d.mature || 0}"></span>
                          <span class="meter__seg meter__seg--learning" style="flex:${Math.max(
                            (d.total || 0) - (d.new || 0) - (d.mature || 0),
                            0
                          )}"></span>
                          <span class="meter__seg meter__seg--new" style="flex:${d.new || 0}"></span>
                        </span>
                      </span>
                      <span class="stats-deck__count">${d.total || 0} cards · ${d.due || 0} due</span>
                    </div>`
                  )
                  .join('')}
              </div>
            </section>`
          : ''
      }`;
  }

  try {
    await render();
  } catch (err) {
    el.innerHTML = `<div class="empty" style="margin-top:12vh">
      <div class="empty__icon">${icon('cancel')}</div>
      <h2 class="empty__title">Stats didn’t load</h2>
      <p class="empty__body">${esc(errorMessage(err, 'The local server did not answer.'))}</p>
      <button class="btn btn--tonal" id="stats-retry">Try again</button>
    </div>`;
    el.querySelector('#stats-retry')?.addEventListener('click', () => render().catch(() => {}));
    return () => {
      disposed = true;
    };
  }

  const off = ctx.onChange((changes: ChangeEvent[]) => {
    if (!changes.some((c: ChangeEvent) => ['review', 'card', 'answer', 'deck'].includes(c.entity))) return;
    clearTimeout(refreshTimer ?? undefined);
    refreshTimer = setTimeout(() => {
      if (disposed) return;
      render().catch(() => toast('Could not refresh stats', { type: 'error' }));
    }, 500);
  });

  return () => {
    disposed = true;
    clearTimeout(refreshTimer ?? undefined);
    off();
  };
}
