import { icon } from '../icons.js';
import { escapeHtml as esc, markdown as md, renderMath } from '../math.js';
import { plural, sourceMark, toast } from '../ui.js';
import { errorMessage } from '../api.js';
import type { AppContext } from '../context.js';
import type { DeckSummary, Rating, ReviewCardDto } from '../../shared/types.js';

const RATINGS: Array<{
  rating: Rating;
  label: string;
  key: string;
  cls: string;
  preview: 'again' | 'hard' | 'good' | 'easy';
}> = [
  { rating: 0, label: 'Again', key: '1', cls: 'rating--again', preview: 'again' },
  { rating: 1, label: 'Hard', key: '2', cls: 'rating--hard', preview: 'hard' },
  { rating: 2, label: 'Good', key: '3', cls: 'rating--good', preview: 'good' },
  { rating: 3, label: 'Easy', key: '4', cls: 'rating--easy', preview: 'easy' },
];

export async function mount(el: HTMLElement, ctx: AppContext): Promise<void | (() => void)> {
  document.body.classList.add('focus-mode');

  const deckParam = ctx.params[0];
  let cards: ReviewCardDto[] = [];
  let deckName = 'Review';
  let deckId: string | number = deckParam;
  let reviewed = 0;
  let again = 0;
  let flipped = false;
  let lastRated: { card: ReviewCardDto; rating: Rating } | null = null;
  let busyRating = false;
  let startedAt = Date.now();
  let disposed = false;

  // Let the MCP server know which card is on screen so an LLM can answer
  // questions about it. Reporting is best-effort and never blocks studying.
  function reportContext(cardId: number | null): void {
    const id = Number(deckId);
    void ctx.api.setUiContext({
      view: 'review',
      deck_id: Number.isFinite(id) && id > 0 ? id : null,
      card_id: cardId,
      flipped,
    }).catch(() => {});
  }

  el.innerHTML = `<div class="review-shell">
    <header class="review-bar">
      <button class="icon-btn" id="exit" aria-label="Leave review">${icon('close')}</button>
      <span class="review-bar__title" id="review-title">Loading…</span>
      <span class="review-bar__count" id="review-count"></span>
    </header>
    <div class="review-progress"><div class="progress"><div class="progress__bar" id="review-bar" style="width:0%"></div></div></div>
    <div class="review-body" id="review-stage" aria-live="polite"></div>
    <p class="sr-only" id="review-announce" aria-live="polite"></p>
  </div>`;

  const stage = el.querySelector('#review-stage') as HTMLElement;
  const titleEl = el.querySelector('#review-title') as HTMLElement;
  const countEl = el.querySelector('#review-count') as HTMLElement;
  const barEl = el.querySelector('#review-bar') as HTMLElement;
  const announceEl = el.querySelector('#review-announce') as HTMLElement;

  el.querySelector('#exit')?.addEventListener('click', () => {
    location.hash = '#/';
  });

  function announce(message: string): void {
    announceEl.textContent = '';
    setTimeout(() => {
      announceEl.textContent = message;
    }, 40);
  }

  function updateProgress(): void {
    const total = reviewed + cards.length;
    countEl.textContent = total ? `${reviewed} / ${total}` : '';
    barEl.style.width = total ? `${(reviewed / total) * 100}%` : '0%';
    titleEl.textContent = deckName;
  }

  function cardFace(card: ReviewCardDto): string {
    const tags = (card.tags || []).map((t) => `<span class="chip chip--plain">${esc(t)}</span>`).join('');
    return `<div class="study-card-wrap" id="card-wrap">
      <div class="study-card" id="study-card" data-flipped="false">
        <div class="study-card__face study-card__front">
          <div class="study-card__content">
            <div class="study-card__prompt">${md(card.front)}</div>
          </div>
          <div class="study-card__footer">
            <div class="chip-row">${tags || '<span class="source">No tags</span>'}</div>
            ${sourceMark(card.source)}
          </div>
        </div>
        <div class="study-card__face study-card__face--back study-card__back">
          <div class="study-card__content">
            <div class="study-card__prompt study-card__prompt--small">${md(card.front)}</div>
            <div class="study-card__divider"></div>
            <div class="study-card__answer">${md(card.back)}</div>
          </div>
          <div class="study-card__footer">
            <div class="chip-row">${tags}</div>
            ${sourceMark(card.source)}
          </div>
        </div>
      </div>
    </div>`;
  }

  function doneState(): string {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    return `<div class="session-complete">
      <div class="session-complete__icon">${icon('check')}</div>
      <h1 class="session-complete__title">Session complete.</h1>
      <p class="session-complete__body">${
        reviewed
          ? `You reviewed ${plural(reviewed, 'card')} in about ${plural(minutes, 'minute')}.${
              again ? ` ${again} ${again === 1 ? 'card comes' : 'cards come'} back in about 10 minutes.` : ''
            }`
          : 'No cards are due in this deck right now.'
      }</p>
      <div class="session-stats">
        <div class="session-stat"><div class="session-stat__num">${reviewed}</div><div class="session-stat__label">Reviewed</div></div>
        <div class="session-stat"><div class="session-stat__num">${again}</div><div class="session-stat__label">Again</div></div>
        <div class="session-stat"><div class="session-stat__num">${Math.round((Date.now() - startedAt) / 60000)}</div><div class="session-stat__label">Minutes</div></div>
      </div>
      <div class="row" style="justify-content:center">
        <a class="btn btn--filled" href="#/">Back home</a>
        <a class="btn btn--text" href="#/deck/${esc(String(deckId ?? ''))}">Open deck</a>
      </div>
      <div class="review-foot" style="justify-content:center">
        <button class="btn btn--text btn--sm" id="review-again">Check for more due</button>
      </div>
    </div>`;
  }

  function caughtUpState(): string {
    return `<div class="session-complete">
      <div class="session-complete__icon">${icon('check_circle')}</div>
      <h1 class="session-complete__title">All caught up.</h1>
      <p class="session-complete__body">No cards are due in ${esc(deckName)}. The next review will appear here when it is scheduled.</p>
      <div class="row" style="justify-content:center">
        <a class="btn btn--filled" href="#/">Back home</a>
        <a class="btn btn--text" href="#/deck/${esc(String(deckId ?? ''))}">Open deck</a>
      </div>
      <div class="review-foot" style="justify-content:center">
        <button class="btn btn--text btn--sm" id="review-again">Check again</button>
        <span class="review-hint"><kbd>Esc</kbd> to leave</span>
      </div>
    </div>`;
  }

  // There is only something to undo once a card in this batch has been rated.
  // `lastRated` is cleared on undo, so the button stays truthful about what it can restore.
  function canUndo(): boolean {
    return lastRated !== null;
  }

  function undoButton(): string {
    return `<button class="btn btn--text btn--sm" id="undo">${icon('undo')}Undo last</button>`;
  }

  function ratingGrid(card: ReviewCardDto): string {
    return `<div class="rating-grid" id="rating-grid" tabindex="-1" role="group" aria-label="Rate how well you knew this">
      ${RATINGS.map(
        (r) => `<button class="rating ${r.cls}" data-rating="${r.rating}">
          <kbd>${r.key}</kbd>
          <span class="rating__label">${r.label}</span>
          <span class="rating__int">${esc(card.preview?.[r.preview] ?? '')}</span>
        </button>`
      ).join('')}
    </div>
    <div class="review-foot">
      ${canUndo() ? undoButton() : '<span aria-hidden="true"></span>'}
      <span class="review-hint"><kbd>1</kbd>–<kbd>4</kbd> to rate · <kbd>Esc</kbd> to leave</span>
    </div>`;
  }

  function render(): void {
    updateProgress();
    reportContext(cards[0]?.id ?? null);
    if (!cards.length) {
      stage.innerHTML = reviewed ? doneState() : caughtUpState();
      bindDone();
      renderMath(stage);
      return;
    }
    const card = cards[0];
    flipped = false;
    const foot = canUndo()
      ? `<div class="review-foot">
          ${undoButton()}
          <span class="review-hint"><kbd>Space</kbd> to reveal</span>
        </div>`
      : `<p class="review-hint"><kbd>Space</kbd> to reveal</p>`;
    stage.innerHTML = `${cardFace(card)}
      <div class="review-controls" id="review-controls">
        <div id="controls-slot">
          <button class="btn btn--filled btn--lg" id="reveal">Show answer</button>
          ${foot}
        </div>
      </div>`;
    bindCard(card);
    renderMath(stage);
    requestAnimationFrame(() => {
      stage.querySelector<HTMLElement>('#reveal')?.focus({ preventScroll: true });
    });
  }

  function bindDone(): void {
    stage.querySelector('#review-again')?.addEventListener('click', async () => {
      try {
        const data = await ctx.api.reviewQueue(deckId, 10);
        cards = data.cards || [];
        reviewed = 0;
        again = 0;
        lastRated = null;
        startedAt = Date.now();
        render();
      } catch (err) {
        toast(errorMessage(err, 'Could not load the queue'), { type: 'error' });
      }
    });
  }

  function reveal(): void {
    if (flipped) return;
    const card = cards[0];
    if (!card) return;
    flipped = true;
    reportContext(card.id);
    stage.querySelector('#study-card')?.setAttribute('data-flipped', 'true');
    const slot = stage.querySelector('#controls-slot');
    if (slot) {
      slot.outerHTML = ratingGrid(card);
      stage.querySelector<HTMLElement>('#rating-grid')?.focus({ preventScroll: true });
      stage.querySelectorAll<HTMLElement>('[data-rating]').forEach((btn) => {
        btn.addEventListener('click', () => rate(Number(btn.dataset.rating) as Rating));
      });
      stage.querySelector('#undo')?.addEventListener('click', undo);
      renderMath(stage.querySelector('#rating-grid'));
    }
    announce('Answer revealed. Rate from 1 to 4.');
  }

  async function rate(rating: Rating): Promise<void> {
    if (busyRating || !flipped || !cards.length) return;
    const card = cards[0];
    busyRating = true;
    stage.querySelectorAll<HTMLButtonElement>('[data-rating]').forEach((b) => {
      b.disabled = true;
    });
    try {
      await ctx.api.review(card.id, rating);
      cards.shift();
      reviewed += 1;
      if (rating === 0) again += 1;
      lastRated = { card, rating };
      flipped = false;
      render();
      announce(`Rated ${RATINGS[rating].label}. ${cards.length} ${cards.length === 1 ? 'card' : 'cards'} left.`);
    } catch (err) {
      toast(errorMessage(err, 'Could not save the review'), { type: 'error' });
      stage.querySelectorAll<HTMLButtonElement>('[data-rating]').forEach((b) => {
        b.disabled = false;
      });
    } finally {
      busyRating = false;
    }
  }

  async function undo(): Promise<void> {
    if (!lastRated) return;
    try {
      await ctx.api.undo();
      cards.unshift(lastRated.card);
      reviewed = Math.max(0, reviewed - 1);
      if (lastRated.rating === 0) again = Math.max(0, again - 1);
      lastRated = null;
      render();
      announce('Last rating undone.');
      toast('Rating undone');
    } catch (err) {
      toast(errorMessage(err, 'Nothing to undo'), { type: 'error' });
    }
  }

  function bindCard(card: ReviewCardDto): void {
    stage.querySelector('#reveal')?.addEventListener('click', reveal);
    stage.querySelector('#undo')?.addEventListener('click', undo);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    const tag = (target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
    if (e.key === 'Escape') {
      location.hash = '#/';
      return;
    }
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (!flipped && cards.length) reveal();
      return;
    }
    if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      rate((Number(e.key) - 1) as Rating);
      return;
    }
    if (e.key.toLowerCase() === 'u') {
      e.preventDefault();
      undo();
    }
  }

  document.addEventListener('keydown', onKey);

  try {
    const deckData = await ctx.api.decks().catch(() => ({ decks: [] } as { decks: DeckSummary[] }));
    const decks = deckData.decks || [];
    let deck: DeckSummary | undefined = decks.find((d) => String(d.id) === String(deckId));
    if (!deck && !deckParam && decks.length) {
      deck = [...decks].sort((a, b) => (b.due || 0) - (a.due || 0))[0];
    }
    if (deck) {
      deckName = deck.name;
      deckId = deck.id;
    }
    if (deckId !== undefined && deckId !== null && deckId !== '') {
      const queue = await ctx.api.reviewQueue(deckId, 10);
      if (disposed) return () => {};
      cards = queue.cards || [];
      render();
    } else {
      render();
    }
  } catch (err) {
    stage.innerHTML = `<div class="empty">
      <div class="empty__icon">${icon('cancel')}</div>
      <h1 class="empty__title">Review didn’t load</h1>
      <p class="empty__body">${esc(errorMessage(err, 'Could not reach the review queue.'))}</p>
      <a class="btn btn--tonal" href="#/">Back home</a>
    </div>`;
  }

  return () => {
    disposed = true;
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('focus-mode');
  };
}
