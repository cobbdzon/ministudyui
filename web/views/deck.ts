import { errorMessage } from '../api.js';
import type { AppContext } from '../context.js';
import { icon } from '../icons.js';
import {
  debounce,
  escapeHtml as esc,
  markdown as md,
  markdownInline as mdi,
  renderMath,
} from '../math.js';
import type { CardDto, CardScheduleInput, DeckSummary, QuizSummary, Source } from '../../shared/types.js';
import { confirmDanger, dialog, dueInLabel, minutesUntil, plural, sourceMark, toast } from '../ui.js';

const TOOLBAR: Array<{ label: string; snippet: string; caret: number | null; title: string }> = [
  { label: '$…$', snippet: '$$', caret: 1, title: 'Inline math' },
  { label: '$$…$$', snippet: '$$$$', caret: 2, title: 'Display math' },
  { label: 'x²', snippet: '^{}', caret: 2, title: 'Superscript' },
  { label: 'a⁄b', snippet: '\\frac{}{}', caret: 6, title: 'Fraction' },
  { label: '√', snippet: '\\sqrt{}', caret: 6, title: 'Square root' },
  { label: '∫', snippet: '\\int_{}^{}', caret: 6, title: 'Integral' },
  { label: 'matrix', snippet: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', caret: null, title: '2×2 matrix' },
];

export async function mount(el: HTMLElement, ctx: AppContext): Promise<void | (() => void)> {
  let disposed = false;
  let deckId: string | number = ctx.params[0] ?? '';
  let deck: DeckSummary | null = null;
  let cards: CardDto[] = [];
  let linkedQuizzes: QuizSummary[] = [];
  let selectedId: number | null = null;
  let draft: { front: string; back: string; tags: string[] } = { front: '', back: '', tags: [] };
  let saved: { front: string; back: string; tags: string[]; source: Source } = { front: '', back: '', tags: [], source: 'user' };
  let activeField: 'front' | 'back' = 'front';
  let query = '';
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;

  el.innerHTML = `<div aria-busy="true">
    <div class="skeleton" style="width:180px;height:14px;margin-bottom:16px"></div>
    <div class="skeleton" style="width:320px;height:38px;margin-bottom:10px"></div>
    <div class="skeleton" style="width:min(460px,80%);height:16px;margin-bottom:28px"></div>
    <div style="display:grid;grid-template-columns:330px 1fr;gap:20px">
      <div class="skeleton" style="height:420px"></div>
      <div class="skeleton" style="height:420px"></div>
    </div>
  </div>`;

  async function load() {
    const [decksRes, cardsRes, quizzesRes] = await Promise.all([
      ctx.api.decks(),
      ctx.api.cards({ deck: deckId, limit: 100 }),
      ctx.api.quizzes(deckId),
    ]);
    const decks = decksRes.decks || [];
    deck = decks.find((d) => String(d.id) === String(deckId)) || null;
    linkedQuizzes = (quizzesRes.quizzes || []).filter((q) => String(q.deck_id) === String(deckId));
    if (!deck && decks.length) {
      deck = decks[0];
      deckId = deck.id;
      const retry = await ctx.api.cards({ deck: deckId, limit: 100 });
      const retryQuizzes = await ctx.api.quizzes(deckId);
      linkedQuizzes = (retryQuizzes.quizzes || []).filter((q) => String(q.deck_id) === String(deckId));
      return { cards: retry.cards || [] };
    }
    return { cards: cardsRes.cards || [] };
  }

  function dirty() {
    return (
      draft.front !== saved.front ||
      draft.back !== saved.back ||
      draft.tags.join('\n') !== saved.tags.join('\n')
    );
  }

  function sourceLabel(card: CardDto): string {
    return { ai: 'AI', user: 'You', import: 'Imported' }[card.source] || 'You';
  }

  function selectedCard(): CardDto | undefined {
    return cards.find((c) => String(c.id) === String(selectedId));
  }

  function scheduleChipClass(c: CardDto): string {
    if (c.ignored) return 'chip chip--mono chip--plain';
    const mins = minutesUntil(c.due_at);
    return mins !== null && mins <= 10 ? 'chip chip--mono chip--warning' : 'chip chip--mono';
  }

  function dueTitle(dueAt: string): string {
    const t = new Date(dueAt);
    return Number.isNaN(t.getTime()) ? 'Unknown due time' : `Due ${t.toLocaleString()}`;
  }

  function filteredCards() {
    if (!query) return cards;
    const q = query.toLowerCase();
    return cards.filter(
      (c) =>
        c.front.toLowerCase().includes(q) ||
        c.back.toLowerCase().includes(q) ||
        (c.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }

  function renderShell() {
    const deckDue = deck?.due ?? 0;
    const total = deck?.total ?? cards.length;
    const mature = deck?.mature ?? 0;
    const learning = Math.max(total - (deck?.new ?? 0) - mature - (deck?.ignored ?? 0), 0);
    el.innerHTML = `
      <a class="back-link" href="#/">${icon('chevron_left')}All decks</a>
      <header class="page-head">
        <div class="page-head__text">
          <h1 class="page-title">${esc(deck?.name || 'Deck')}</h1>
          <div class="page-sub">${md(deck?.description || 'Add cards with Markdown and LaTeX that render as you type.')}</div>
          ${
            linkedQuizzes[0]
              ? `<div class="linked-item">
                   <span class="linked-item__label">Linked quiz</span>
                   <a class="chip chip--tonal chip--link" href="#/quiz/${esc(
                     String(linkedQuizzes[0].id)
                   )}" title="Linked quiz: ${esc(linkedQuizzes[0].title)}">${icon('style')}${esc(
                     linkedQuizzes[0].title
                   )}</a>
                 </div>`
              : ''
          }
          <div class="quiz-meta" style="margin-top:12px">
            <span class="chip chip--mono">${plural(total, 'card')}</span>
            <span class="chip chip--mono">${deckDue} due</span>
            <span class="chip chip--mono">${mature} mature</span>
            <span class="chip chip--mono">${learning} learning</span>
            <span class="chip chip--mono" title="Cards excluded from reviews">${deck?.ignored ?? 0} ignored</span>
          </div>
        </div>
        <div class="page-actions">
          <button class="btn btn--outlined" id="rename-deck">${icon('edit')}Rename</button>
          <button class="btn btn--outlined btn--danger" id="delete-deck">${icon('delete')}Delete</button>
          <a class="btn btn--filled" id="review-cta" href="#/review/${esc(String(deckId ?? ''))}">
            ${icon('play_arrow')}${deckDue ? `Review ${deckDue} due` : 'Start review'}
          </a>
        </div>
      </header>
      <div class="deck-layout">
        <div class="deck-cards">
          <div class="row row--between">
            <span class="section-meta">Cards</span>
            <span class="live" title="Cards created through MCP appear here automatically">
              <span class="dot dot--live"></span>Live
            </span>
          </div>
          <div class="deck-search">
            ${icon('search')}
            <input class="input" id="card-search" type="search" placeholder="Filter cards" aria-label="Filter cards" value="${esc(query)}">
          </div>
          <div class="card-list" id="card-list" role="listbox" aria-label="Cards in this deck"></div>
          <button class="btn btn--tonal btn--block" id="new-card">${icon('add')}New card</button>
        </div>

        <section class="editor" aria-label="Card editor">
          <header class="editor__head">
            <div>
              <div class="editor__title" id="editor-title">New card</div>
              <div class="editor__head-meta" id="editor-meta"></div>
            </div>
            <span class="chip chip--mono" id="char-total">0 / 4000</span>
          </header>
          <div class="editor__body">
            <div class="editor__write">
              <div class="field">
                <div class="field__row">
                  <label class="field__label" for="card-front">Front</label>
                  <span class="field__count" id="front-count">0 / 4000</span>
                </div>
                <div class="tex-toolbar" role="toolbar" aria-label="Insert LaTeX">
                  ${TOOLBAR.map(
                    (t) =>
                      `<button type="button" class="tex-btn" data-snippet="${esc(t.snippet)}" data-caret="${
                        t.caret ?? ''
                      }" title="${esc(t.title)}" aria-label="${esc(t.title)}">${esc(t.label)}</button>`
                  ).join('')}
                </div>
                <textarea class="textarea textarea--mono textarea--tall" id="card-front" maxlength="4000" placeholder="Question, prompt, or term. Markdown and $...$ math work here."></textarea>
              </div>
              <div class="field">
                <div class="field__row">
                  <label class="field__label" for="card-back">Back</label>
                  <span class="field__count" id="back-count">0 / 4000</span>
                </div>
                <textarea class="textarea textarea--mono" id="card-back" maxlength="4000" placeholder="The answer. Markdown and math work here too."></textarea>
              </div>
              <div class="field">
                <span class="field__label">Tags</span>
                <div class="tag-input" id="tag-input">
                  <input id="tag-field" maxlength="40" placeholder="Add tag and press Enter" aria-label="Add a tag">
                </div>
              </div>
              <div class="sched" id="sched" hidden>
                <div class="sched__head">
                  <span class="field__label">Scheduling</span>
                  <span class="chip chip--mono" id="sched-countdown">—</span>
                </div>
                <div class="sched__due" id="sched-due"></div>
                <div class="sched__row">
                  <label class="field__label" for="sched-adjust">Shift due time (minutes)</label>
                  <div class="sched__controls">
                    <input class="input" id="sched-adjust" type="number" step="1" min="-10000" max="10000" value="15" aria-label="Minutes to shift the due time by">
                    <button class="btn btn--outlined btn--sm" id="sched-apply">Shift</button>
                    <button class="btn btn--outlined btn--sm" id="sched-due-now">${icon('schedule')}Make due now</button>
                  </div>
                </div>
                <div class="sched__presets" aria-label="Quick due-time shifts">
                  <button class="btn btn--text btn--sm" data-shift="-15">&minus;15 min</button>
                  <button class="btn btn--text btn--sm" data-shift="15">+15 min</button>
                  <button class="btn btn--text btn--sm" data-shift="60">+1 hour</button>
                </div>
                <label class="check-row">
                  <input type="checkbox" id="sched-ignored">
                  <span>Ignore in reviews</span>
                </label>
              </div>
            </div>
            <div class="editor__preview">
              <span class="field__label">Live preview</span>
              <div class="preview-card">
                <div class="preview-card__section">
                  <span class="preview-card__label">Front</span>
                  <div class="preview-card__body" id="preview-front"></div>
                </div>
                <div class="preview-card__divider"></div>
                <div class="preview-card__section">
                  <span class="preview-card__label">Back</span>
                  <div class="preview-card__body" id="preview-back"></div>
                </div>
              </div>
              <p class="muted" style="font: var(--md-sys-typescale-body-small)">Markdown works here, along with $…$ for inline math and $$…$$ for display math. Broken formulas stay inline instead of breaking the page.</p>
            </div>
          </div>
          <footer class="editor__actions">
            <button class="btn btn--text btn--danger" id="delete-card" hidden>${icon('delete')}Delete</button>
            <div class="editor__actions-end">
              <span class="field__count" id="save-state">Saved</span>
              <button class="btn btn--outlined" id="discard" hidden>Discard</button>
              <button class="btn btn--filled" id="save-card">${icon('check')}Save card</button>
            </div>
          </footer>
        </section>
      </div>`;

    bindShell();
    renderList();
    loadIntoEditor();
    renderMath(el.querySelector('.page-sub'));
  }

  function renderList() {
    const listEl = el.querySelector('#card-list');
    if (!listEl) return;
    const items = filteredCards();
    if (!items.length) {
      listEl.innerHTML = `<div class="card-list__empty">${
        query ? `No cards match “${esc(query)}”.` : 'No cards yet. Write one on the right.'
      }</div>`;
      return;
    }
    listEl.innerHTML = items
      .map(
        (c) => `<button class="card-list__item" role="option" data-id="${c.id}" aria-selected="${
          String(c.id) === String(selectedId) ? 'true' : 'false'
        }">
          <span class="card-list__front">${mdi(c.front)}</span>
          <span class="card-list__meta">${esc(sourceLabel(c))}${c.tags?.length ? ` · ${esc(c.tags[0])}` : ''}</span>
          <span class="card-list__sched">
            <span class="${scheduleChipClass(c)}" data-countdown="${esc(c.due_at)}" title="${esc(dueTitle(c.due_at))}">${esc(dueInLabel(c.due_at))}</span>
            ${c.ignored ? `<span class="chip chip--plain chip--ignored">${icon('cancel')}Ignored</span>` : ''}
          </span>
        </button>`
      )
      .join('');
    listEl.querySelectorAll('.card-list__front').forEach((node) => renderMath(node));
    listEl.querySelectorAll<HTMLElement>('[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card = cards.find((c) => String(c.id) === btn.dataset.id);
        if (card) selectCard(card);
      });
    });
  }

  function bindShell() {
    el.querySelector('#rename-deck')?.addEventListener('click', openRenameDeck);
    el.querySelector('#delete-deck')?.addEventListener('click', openDeleteDeck);
    el.querySelector('#card-search')?.addEventListener('input', (e: Event) => {
      const target = e.target;
      if (target instanceof HTMLInputElement) query = target.value;
      renderList();
    });
    el.querySelector('#new-card')?.addEventListener('click', () => {
      maybeDiscard(() => {
        selectedId = null;
        draft = { front: '', back: '', tags: [] };
        saved = { front: '', back: '', tags: [], source: 'user' };
        renderList();
        loadIntoEditor();
        el.querySelector<HTMLElement>('#card-front')?.focus();
      });
    });
    el.querySelector('#save-card')?.addEventListener('click', save);
    el.querySelector('#sched-apply')?.addEventListener('click', () => {
      const input = el.querySelector<HTMLInputElement>('#sched-adjust');
      const minutes = Number(input?.value);
      if (!Number.isFinite(minutes) || !Number.isInteger(minutes)) {
        toast('Enter a whole number of minutes', { type: 'error' });
        input?.focus();
        return;
      }
      void applySchedule({ adjust_minutes: minutes });
    });
    el.querySelector('#sched-due-now')?.addEventListener('click', () => void applySchedule({ due_now: true }));
    el.querySelector('#sched-ignored')?.addEventListener('change', (e: Event) => {
      const target = e.target;
      if (target instanceof HTMLInputElement) void applySchedule({ ignored: target.checked });
    });
    el.querySelectorAll<HTMLButtonElement>('#sched [data-shift]').forEach((btn) => {
      btn.addEventListener('click', () => void applySchedule({ adjust_minutes: Number(btn.dataset.shift) }));
    });
    el.querySelector('#discard')?.addEventListener('click', async () => {
      const ok = await confirmDanger({
        title: 'Discard changes?',
        body: 'Your unsaved edits to this card will be lost.',
        confirmLabel: 'Discard',
      });
      if (!ok) return;
      if (selectedId) selectCard(cards.find((c) => String(c.id) === String(selectedId)), { force: true });
      else {
        draft = { front: '', back: '', tags: [] };
        loadIntoEditor();
      }
    });
    el.querySelector('#delete-card')?.addEventListener('click', removeCard);

    const front = el.querySelector<HTMLTextAreaElement>('#card-front');
    const back = el.querySelector<HTMLTextAreaElement>('#card-back');
    const tagField = el.querySelector<HTMLInputElement>('#tag-field');
    if (!front || !back || !tagField) return;

    front.addEventListener('input', () => {
      draft.front = front.value;
      schedulePreview();
      updateDirtyUi();
    });
    back.addEventListener('input', () => {
      draft.back = back.value;
      schedulePreview();
      updateDirtyUi();
    });
    front.addEventListener('focus', () => {
      activeField = 'front';
    });
    back.addEventListener('focus', () => {
      activeField = 'back';
    });

    el.querySelectorAll<HTMLButtonElement>('.tex-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ta = activeField === 'back' ? back : front;
        const snippet = btn.dataset.snippet;
        if (snippet === undefined) return;
        insertSnippet(ta, snippet, btn.dataset.caret);
      });
    });

    tagField.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(tagField.value);
        tagField.value = '';
      } else if (e.key === 'Backspace' && !tagField.value && draft.tags.length) {
        draft.tags.pop();
        renderTags();
        updateDirtyUi();
      }
    });
    tagField.addEventListener('blur', () => {
      if (tagField.value.trim()) {
        addTag(tagField.value);
        tagField.value = '';
      }
    });

    el.querySelector('#tag-input')?.addEventListener('click', (e: Event) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const removeBtn = target.closest<HTMLElement>('[data-remove-tag]');
      if (removeBtn) {
        const tag = removeBtn.dataset.removeTag;
        draft.tags = draft.tags.filter((t) => t !== tag);
        renderTags();
        updateDirtyUi();
        return;
      }
      if (target.id === 'tag-input') tagField.focus();
    });

    schedulePreview();
    updateDirtyUi();
    renderTags();
  }

  function openRenameDeck() {
    if (!deck) return;
    const currentDeck = deck;
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
        if (!input) return;
        input?.focus();
        input?.select();
        root.addEventListener('submit', async (e: SubmitEvent) => {
          const submitter = e.submitter;
          if (!(submitter instanceof HTMLButtonElement) || submitter.value !== 'rename') return;
          const name = input.value.trim();
          if (!name) {
            toast('Give the deck a name first', { type: 'error' });
            return;
          }
          if (name === currentDeck.name) return;
          try {
            await ctx.api.updateDeck(deckId, { name });
            currentDeck.name = name;
            const title = el.querySelector('.page-title');
            if (title) title.textContent = name;
            toast(`Deck renamed to “${name}”`);
          } catch (err) {
            toast(errorMessage(err, 'Could not rename the deck'), { type: 'error' });
          }
        });
      },
    });
  }

  function openDeleteDeck() {
    if (!deck) return;
    const currentDeck = deck;
    const linked = linkedQuizzes.length;
    dialog({
      title: 'Delete deck',
      body: `
        <p>Type <strong>${esc(deck.name)}</strong> to confirm. The deck, its cards and its review history will be removed.</p>
        ${
          linked
            ? `<p style="margin-top:10px">This deck has a linked quiz.</p>
               <label class="check-row">
                 <input type="checkbox" id="keep-quizzes" checked>
                 <span>Keep linked quiz?</span>
               </label>
               <p class="muted" id="delete-deck-hint" style="font-size:12.5px">The linked quiz stays in your library without a deck.</p>`
            : ''
        }
        <label class="field" style="margin-top:${linked ? '16' : '14'}px">
          <span class="field__label">Deck name</span>
          <input class="input" id="deck-delete-name" maxlength="120" autocomplete="off" placeholder="${esc(deck.name)}">
        </label>`,
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Delete deck', value: 'delete', variant: 'btn--filled', danger: true },
      ],
      onMount(root) {
        const input = root.querySelector<HTMLInputElement>('#deck-delete-name');
        const keep = root.querySelector<HTMLInputElement>('#keep-quizzes');
        const hint = root.querySelector('#delete-deck-hint');
        const submit = root.querySelector<HTMLButtonElement>('button[value="delete"]');
        if (!input) return;
        const update = () => {
          if (submit) submit.disabled = input.value.trim() !== currentDeck.name;
          if (keep && hint)
            hint.textContent = keep.checked
              ? 'The linked quiz stays in your library without a deck.'
              : 'The linked quiz, its questions and attempts will be deleted too.';
        };
        input.addEventListener('input', update);
        keep?.addEventListener('change', update);
        update();
        input.focus();
        root.addEventListener('submit', async (e: SubmitEvent) => {
          const submitter = e.submitter;
          if (!(submitter instanceof HTMLButtonElement) || submitter.value !== 'delete' || input.value.trim() !== currentDeck.name) return;
          try {
            await ctx.api.deleteDeck(deckId, currentDeck.name, keep ? !keep.checked : false);
            toast(`Deck “${currentDeck.name}” deleted`);
            ctx.go('#/');
          } catch (err) {
            toast(errorMessage(err, 'Could not delete the deck'), { type: 'error' });
          }
        });
      },
    });
  }

  function renderTags() {
    const wrap = el.querySelector('#tag-input');
    if (!wrap) return;
    const field = wrap.querySelector('#tag-field');
    wrap.querySelectorAll('.chip').forEach((c) => c.remove());
    draft.tags.forEach((t) => {
      const chip = document.createElement('span');
      chip.className = 'chip chip--plain';
      chip.innerHTML = `${esc(t)}<button type="button" data-remove-tag="${esc(t)}" aria-label="Remove tag ${esc(t)}">${icon(
        'close'
      )}</button>`;
      wrap.insertBefore(chip, field);
    });
  }

  function addTag(raw: string) {
    const tag = String(raw).trim().replace(/,$/, '').slice(0, 40);
    if (!tag) return;
    if (draft.tags.length >= 10) {
      toast('Ten tags is the limit for one card', { type: 'error' });
      return;
    }
    if (draft.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    draft.tags.push(tag);
    renderTags();
    updateDirtyUi();
  }

  function insertSnippet(
    ta: HTMLTextAreaElement | null,
    snippet: string,
    caret: string | number | null | undefined,
  ) {
    if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    const selected = ta.value.slice(start, end);
    let text = snippet;
    let pos = caret === '' || caret === undefined || caret === null ? text.length : Number(caret);
    if (selected && snippet.includes('{}')) {
      // Put the selection into the first brace pair.
      text = snippet.replace('{}', `{${selected}}`);
      pos = start + text.length;
    } else if (selected && snippet === '$$') {
      text = `$${selected}$`;
      pos = start + text.length;
    } else if (selected && snippet === '$$$$') {
      text = `$$${selected}$$`;
      pos = start + text.length;
    }
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    ta.focus();
    ta.setSelectionRange(pos, pos);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const schedulePreview = debounce(() => {
    const frontEl = el.querySelector('#preview-front');
    const backEl = el.querySelector('#preview-back');
    if (!frontEl || !backEl) return;
    frontEl.innerHTML = md(draft.front);
    backEl.innerHTML = md(draft.back);
    renderMath(frontEl);
    renderMath(backEl);
    updateCounts();
  }, 120);

  function updateCounts() {
    const front = draft.front.length;
    const back = draft.back.length;
    const total = front + back;
    const fc = el.querySelector<HTMLElement>('#front-count');
    const bc = el.querySelector<HTMLElement>('#back-count');
    const tc = el.querySelector<HTMLElement>('#char-total');
    if (fc) {
      fc.textContent = `${front} / 4000`;
      fc.dataset.state = front > 4000 ? 'over' : 'ok';
    }
    if (bc) {
      bc.textContent = `${back} / 4000`;
      bc.dataset.state = back > 4000 ? 'over' : 'ok';
    }
    if (tc) {
      tc.textContent = `${total} / 8000`;
      tc.classList.toggle('chip--error', total > 8000);
    }
  }

  function updateDirtyUi() {
    const isDirty = dirty();
    const state = el.querySelector('#save-state');
    if (state) state.textContent = isDirty ? 'Unsaved changes' : 'Saved';
    const discard = el.querySelector<HTMLButtonElement>('#discard');
    if (discard) discard.hidden = !isDirty;
    const save = el.querySelector<HTMLButtonElement>('#save-card');
    if (save) save.disabled = !isDirty || !draft.front.trim() || !draft.back.trim();
  }

  function loadIntoEditor() {
    const front = el.querySelector<HTMLTextAreaElement>('#card-front');
    const back = el.querySelector<HTMLTextAreaElement>('#card-back');
    if (!front || !back) return;
    front.value = draft.front;
    back.value = draft.back;
    front.disabled = false;
    back.disabled = false;

    const title = el.querySelector('#editor-title');
    const meta = el.querySelector('#editor-meta');
    const del = el.querySelector<HTMLElement>('#delete-card');
    if (title) title.textContent = selectedId ? `Card ${selectedId}` : 'New card';
    if (meta) {
      meta.innerHTML = selectedId
        ? `${sourceMark(saved.source)}${
            saved.tags.length ? `<span class="chip chip--plain">${esc(saved.tags[0])}</span>` : ''
          }`
        : '<span class="source">Created by you</span>';
    }
    if (del) del.hidden = !selectedId;

    const sched = el.querySelector<HTMLElement>('#sched');
    if (sched) {
      sched.hidden = !selectedId;
      const card = selectedCard();
      const countdown = el.querySelector<HTMLElement>('#sched-countdown');
      if (countdown) {
        countdown.textContent = card ? (card.ignored ? 'Ignored' : dueInLabel(card.due_at)) : '—';
        countdown.className = card ? scheduleChipClass(card) : 'chip chip--mono';
        countdown.title = card ? dueTitle(card.due_at) : '';
      }
      const due = el.querySelector<HTMLElement>('#sched-due');
      if (due) due.textContent = card ? dueTitle(card.due_at) : '';
      const ignored = el.querySelector<HTMLInputElement>('#sched-ignored');
      if (ignored) ignored.checked = !!card?.ignored;
    }
    schedulePreview();
    updateDirtyUi();
    renderTags();
  }

  function selectCard(card: CardDto | undefined, { force = false }: { force?: boolean } = {}) {
    if (!card) return;
    const go = () => {
      selectedId = card.id;
      draft = { front: card.front, back: card.back, tags: [...(card.tags || [])] };
      saved = { ...draft, tags: [...draft.tags], source: card.source || 'user' };
      renderList();
      loadIntoEditor();
    };
    if (force) go();
    else maybeDiscard(go);
  }

  function maybeDiscard(next: () => void) {
    if (!dirty()) {
      next();
      return;
    }
    dialog({
      title: 'Discard changes?',
      body: '<p>This card has edits that are not saved yet.</p>',
      actions: [
        { label: 'Keep editing', value: 'cancel' },
        { label: 'Discard', value: 'discard', variant: 'btn--filled', danger: true },
      ],
      onMount(root) {
        root.querySelectorAll<HTMLButtonElement>('.btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            if (btn.value === 'discard') next();
          });
        });
      },
    });
  }

  async function save() {
    if (draft.front.length > 4000 || draft.back.length > 4000) {
      toast('Front and back are limited to 4000 characters', { type: 'error' });
      return;
    }
    if (!draft.front.trim() || !draft.back.trim()) {
      toast('Both sides of the card are required', { type: 'error' });
      (draft.front.trim() ? el.querySelector<HTMLElement>('#card-back') : el.querySelector<HTMLElement>('#card-front'))?.focus();
      return;
    }
    const saveBtn = el.querySelector<HTMLButtonElement>('#save-card');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
    }
    try {
      if (selectedId) {
        await ctx.api.updateCard(selectedId, {
          front: draft.front,
          back: draft.back,
          tags: draft.tags,
        });
        const idx = cards.findIndex((c) => String(c.id) === String(selectedId));
        if (idx >= 0) cards[idx] = { ...cards[idx], front: draft.front, back: draft.back, tags: [...draft.tags] };
        saved = { ...draft, tags: [...draft.tags], source: saved.source };
        toast('Card saved');
      } else {
        const res = await ctx.api.addCards(deckId, [
          { front: draft.front, back: draft.back, tags: draft.tags, source: 'user' },
        ]);
        const newId = res.card_ids?.[0];
        const data = await ctx.api.cards({ deck: deckId, limit: 100 });
        cards = data.cards || [];
        if (newId) {
          const card = cards.find((c) => String(c.id) === String(newId));
          selectedId = newId;
          if (card) {
            draft = { front: card.front, back: card.back, tags: [...(card.tags || [])] };
            saved = { ...draft, tags: [...draft.tags], source: card.source || 'user' };
          }
        }
        toast('Card added');
      }
      await refreshSummary();
      renderList();
      loadIntoEditor();
    } catch (err) {
      toast(errorMessage(err, 'Could not save the card'), { type: 'error' });
    } finally {
      const btn = el.querySelector<HTMLButtonElement>('#save-card');
      if (btn) {
        btn.disabled = !dirty();
        btn.innerHTML = `${icon('check')}Save card`;
      }
    }
  }

  async function removeCard() {
    if (!selectedId) return;
    const card = cards.find((c) => String(c.id) === String(selectedId));
    const ok = await confirmDanger({
      title: 'Delete this card?',
      body: `“${(card?.front || draft.front).slice(0, 120)}” will be removed along with its review history.`,
      confirmLabel: 'Delete card',
    });
    if (!ok) return;
    try {
      await ctx.api.deleteCards([Number(selectedId)]);
      cards = cards.filter((c) => String(c.id) !== String(selectedId));
      selectedId = null;
      draft = { front: '', back: '', tags: [] };
      saved = { front: '', back: '', tags: [], source: 'user' };
      renderList();
      loadIntoEditor();
      await refreshSummary();
      toast('Card deleted');
    } catch (err) {
      toast(errorMessage(err, 'Could not delete the card'), { type: 'error' });
    }
  }

  async function applySchedule(patch: CardScheduleInput) {
    if (!selectedId) return;
    try {
      await ctx.api.adjustCardSchedule(Number(selectedId), patch);
      const data = await ctx.api.cards({ deck: deckId, limit: 100 });
      cards = data.cards || [];
      await refreshSummary();
      renderList();
      loadIntoEditor();
      const label = patch.ignored !== undefined
        ? (patch.ignored ? 'Card ignored in reviews' : 'Card back in reviews')
        : patch.due_now ? 'Card is due now' : 'Due time shifted';
      toast(label);
    } catch (err) {
      toast(errorMessage(err, 'Could not update scheduling'), { type: 'error' });
      loadIntoEditor();
    }
  }

  function tickCountdowns() {
    el.querySelectorAll<HTMLElement>('[data-countdown]').forEach((node) => {
      node.textContent = dueInLabel(node.dataset.countdown);
    });
    const card = selectedCard();
    const sched = el.querySelector<HTMLElement>('#sched-countdown');
    if (card && sched) {
      sched.textContent = card.ignored ? 'Ignored' : dueInLabel(card.due_at);
      sched.className = scheduleChipClass(card);
    }
  }

  async function refreshSummary() {
    try {
      const data = await ctx.api.decks();
      const fresh = (data.decks || []).find((d) => String(d.id) === String(deckId));
      if (fresh) deck = fresh;
      const title = el.querySelector('.page-title');
      if (title) title.textContent = deck?.name || 'Deck';
      const chips = el.querySelectorAll('.quiz-meta .chip');
      if (chips.length >= 5) {
        chips[0].textContent = plural(deck?.total ?? cards.length, 'card');
        chips[1].textContent = `${deck?.due ?? 0} due`;
        chips[2].textContent = `${deck?.mature ?? 0} mature`;
        chips[3].textContent = `${Math.max((deck?.total || 0) - (deck?.new || 0) - (deck?.mature || 0) - (deck?.ignored || 0), 0)} learning`;
        chips[4].textContent = `${deck?.ignored ?? 0} ignored`;
      }
      const cta = el.querySelector<HTMLElement>('#review-cta');
      if (cta) {
        const due = deck?.due ?? 0;
        cta.innerHTML = `${icon('play_arrow')}${due ? `Review ${due} due` : 'Start review'}`;
      }
    } catch {
      /* summary is cosmetic */
    }
  }

  async function refreshFromLive() {
    try {
      const data = await ctx.api.cards({ deck: deckId, limit: 100 });
      const next = data.cards || [];
      const previousSelected = selectedId;
      const selectedStillExists = next.some((c) => String(c.id) === String(previousSelected));
      cards = next;
      if (!selectedStillExists && previousSelected) {
        selectedId = null;
        draft = { front: '', back: '', tags: [] };
        saved = { front: '', back: '', tags: [], source: 'user' };
        loadIntoEditor();
      } else if (!dirty() && selectedId) {
        const card = next.find((c) => String(c.id) === String(selectedId));
        if (card) {
          draft = { front: card.front, back: card.back, tags: [...(card.tags || [])] };
          saved = { ...draft, tags: [...draft.tags], source: card.source || 'user' };
          loadIntoEditor();
        }
      }
      renderList();
      await refreshSummary();
    } catch {
      /* a background refresh failing is not worth a toast */
    }
  }

  try {
    const loaded = await load();
    if (disposed) return;
    cards = loaded.cards;
    if (cards.length) {
      const first = cards[0];
      selectedId = first.id;
      draft = { front: first.front, back: first.back, tags: [...(first.tags || [])] };
      saved = { ...draft, tags: [...draft.tags], source: first.source || 'user' };
    }
    renderShell();
    countdownTimer = setInterval(tickCountdowns, 30_000);
  } catch (err) {
    el.innerHTML = `<div class="empty" style="margin-top:12vh">
      <div class="empty__icon">${icon('cancel')}</div>
      <h2 class="empty__title">This deck didn’t load</h2>
      <p class="empty__body">${esc(errorMessage(err, 'The local server did not answer.'))}</p>
      <a class="btn btn--tonal" href="#/">Back home</a>
    </div>`;
    return () => {
      disposed = true;
    };
  }

  const off = ctx.onChange((changes) => {
    const relevant = changes.some((c) => c.entity === 'card' || c.entity === 'deck');
    if (!relevant) return;
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshFromLive, 450);
  });

  return () => {
    disposed = true;
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    if (countdownTimer !== null) clearInterval(countdownTimer);
    off();
  };
}
