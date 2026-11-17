import { api } from './api.js';
import { icon } from './icons.js';
import { escapeHtml } from './math.js';
import { dialog, toast } from './ui.js';
import * as home from './views/home.js';
import * as review from './views/review.js';
import * as deck from './views/deck.js';
import * as quizzes from './views/quizzes.js';
import * as quiz from './views/quiz.js';
import * as attempt from './views/attempt.js';
import * as grading from './views/grading.js';
import * as stats from './views/stats.js';
import * as importView from './views/import.js';

const app = document.getElementById('app');

const NAV = [
  { id: 'home', label: 'Home', icon: 'home', href: '#/' },
  { id: 'quizzes', label: 'Quizzes', icon: 'quiz', href: '#/quizzes' },
  { id: 'grading', label: 'Grading', icon: 'grading', href: '#/grading' },
  { id: 'stats', label: 'Stats', icon: 'monitoring', href: '#/stats' },
];

const VIEWS = { home, review, deck, quizzes, quiz, attempt, grading, stats };

function navItem(item, cls) {
  return `<a class="${cls}" href="${item.href}" data-nav="${item.id}">
    ${icon(item.icon)}
    <span>${item.label}</span>
  </a>`;
}

function shell() {
  app.innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <nav class="rail" aria-label="Main">
      <a class="brand" href="#/" aria-label="ministudyui home" title="ministudyui">∫</a>
      <div class="rail-nav">
        ${NAV.map((n) => navItem(n, 'rail-item')).join('')}
      </div>
      <div class="rail-foot">
        <button class="icon-btn" id="import" aria-label="Import from AI" title="Import AI-generated decks and quizzes">
          ${icon('upload')}
        </button>
        <button class="icon-btn" id="shortcuts" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
          ${icon('keyboard')}
        </button>
        <button class="icon-btn" id="theme-toggle" aria-label="Switch color scheme" title="Switch color scheme">
          <span id="theme-icon">${icon('dark_mode')}</span>
        </button>
      </div>
    </nav>
    <main class="screen" id="main" tabindex="-1"></main>
    <nav class="bottom-nav" aria-label="Main">
      ${NAV.map((n) => navItem(n, 'bottom-nav__item')).join('')}
      <button class="bottom-nav__item" type="button" id="more" aria-label="More options" aria-haspopup="dialog" title="Import, shortcuts, and theme">
        ${icon('more_horiz')}
        <span>More</span>
      </button>
    </nav>`;
}

/* ---------- Theme ---------- */

function preferredTheme() {
  const saved = localStorage.getItem('ministudy.theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ministudy.theme', theme);
  const slot = document.getElementById('theme-icon');
  if (slot) slot.innerHTML = icon(theme === 'dark' ? 'light_mode' : 'dark_mode');
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    const next = theme === 'dark' ? 'light' : 'dark';
    btn.title = `Switch to ${next} theme`;
    btn.setAttribute('aria-label', `Switch to ${next} theme`);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101414' : '#FAFDFC');
}

/* ---------- Shortcuts ---------- */

function openShortcuts() {
  const row = (keys, label) =>
    `<div class="shortcut-row"><span>${label}</span><span class="shortcut-keys">${keys
      .map((k) => `<kbd>${escapeHtml(k)}</kbd>`)
      .join('')}</span></div>`;
  dialog({
    title: 'Keyboard shortcuts',
    body: `
      <div class="shortcut-list">
        ${row(['?'], 'Open this list')}
        ${row(['Esc'], 'Leave review or close a dialog')}
        ${row(['Space'], 'Reveal the card answer')}
        ${row(['1', '2', '3', '4'], 'Rate Again, Hard, Good, Easy')}
        ${row(['A', 'B', 'C', '…'], 'Pick a quiz option')}
        ${row(['←', '→'], 'Previous or next quiz question')}
        ${row(['⌘', '↵'], 'Submit the current quiz answer')}
      </div>`,
    actions: [{ label: 'Close', value: 'close', variant: 'btn--tonal' }],
  });
}

/* ---------- More sheet (mobile utilities) ---------- */

let moreSheet = null;

function closeMoreSheet() {
  if (!moreSheet) return;
  const sheet = moreSheet;
  moreSheet = null;
  sheet.classList.add('is-closing');
  setTimeout(() => sheet.close(), 170);
}

function themeAction() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  return { next, icon: next === 'dark' ? 'dark_mode' : 'light_mode', label: `Switch to ${next} theme` };
}

function openMoreSheet() {
  if (moreSheet) return;
  const theme = themeAction();
  const sheet = document.createElement('dialog');
  sheet.className = 'sheet';
  sheet.setAttribute('aria-label', 'More options');
  sheet.innerHTML = `
    <div class="sheet__inner">
      <div class="sheet__grab" aria-hidden="true"></div>
      <h2 class="sheet__title">More options</h2>
      <div class="sheet__list">
        <button class="sheet__action" type="button" data-sheet-action="import">
          <span class="sheet__icon">${icon('upload')}</span>
          <span class="sheet__label">Import from AI</span>
          ${icon('chevron_right', 'icon--sm sheet__chevron')}
        </button>
        <button class="sheet__action" type="button" data-sheet-action="shortcuts">
          <span class="sheet__icon">${icon('keyboard')}</span>
          <span class="sheet__label">Keyboard shortcuts</span>
          ${icon('chevron_right', 'icon--sm sheet__chevron')}
        </button>
        <button class="sheet__action" type="button" data-sheet-action="theme">
          <span class="sheet__icon">${icon(theme.icon)}</span>
          <span class="sheet__label">${theme.label}</span>
          ${icon('chevron_right', 'icon--sm sheet__chevron')}
        </button>
      </div>
    </div>`;
  document.body.appendChild(sheet);
  moreSheet = sheet;

  sheet.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeMoreSheet();
  });
  sheet.addEventListener('close', () => {
    sheet.remove();
    document.getElementById('more')?.focus();
  });
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) {
      closeMoreSheet();
      return;
    }
    const action = e.target.closest('[data-sheet-action]');
    if (!action) return;
    const kind = action.dataset.sheetAction;
    if (kind === 'theme') {
      applyTheme(themeAction().next);
      const updated = themeAction();
      action.querySelector('.sheet__icon').innerHTML = icon(updated.icon);
      action.querySelector('.sheet__label').textContent = updated.label;
      return;
    }
    closeMoreSheet();
    if (kind === 'import') importView.openImport(ctx);
    if (kind === 'shortcuts') openShortcuts();
  });
  sheet.showModal();
}

/* ---------- Router ---------- */

let cleanup = null;
let lastHash = null;
let renderedView = null;
let viewEnterTimer = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const segments = raw.split('/').filter(Boolean);
  return segments;
}

function activeNav(viewId) {
  if (viewId === 'home' || viewId === 'review' || viewId === 'deck') return 'home';
  if (viewId === 'quizzes' || viewId === 'quiz' || viewId === 'attempt') return 'quizzes';
  return viewId;
}

function setActiveNav(viewId) {
  const active = activeNav(viewId);
  document.querySelectorAll('[data-nav]').forEach((el) => {
    if (el.dataset.nav === active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

function loadingState() {
  return `<div aria-busy="true" aria-label="Loading">
    <div class="skeleton" style="width:240px;height:34px;margin:8px 0 12px"></div>
    <div class="skeleton" style="width:min(420px,80%);height:16px;margin-bottom:32px"></div>
    <div class="skeleton" style="width:100%;height:76px;margin-bottom:10px"></div>
    <div class="skeleton" style="width:100%;height:76px;margin-bottom:10px"></div>
    <div class="skeleton" style="width:100%;height:76px"></div>
  </div>`;
}

function errorState(message) {
  return `<div class="empty" style="margin-top:12vh">
    <div class="empty__icon">${icon('cancel')}</div>
    <h1 class="empty__title">That didn’t load</h1>
    <p class="empty__body">${escapeHtml(message || 'The app could not reach its local server.')}</p>
    <button class="btn btn--tonal" id="retry">Try again</button>
  </div>`;
}

const ctx = {
  api,
  icon,
  esc: escapeHtml,
  toast,
  go(hash) {
    location.hash = hash;
  },
  onChange(handler) {
    const listener = (e) => handler(e.detail);
    window.addEventListener('live:change', listener);
    return () => window.removeEventListener('live:change', listener);
  },
};

async function route() {
  const main = document.getElementById('main');
  if (!main) return;
  const segments = parseHash();
  const viewId = segments[0] || 'home';
  const view = VIEWS[viewId] || VIEWS.home;
  const params = segments.slice(1);

  if (typeof cleanup === 'function') {
    try {
      cleanup();
    } catch {
      /* a failing unmount must not stop navigation */
    }
  }
  cleanup = null;

  document.body.classList.remove('focus-mode');
  closeMoreSheet();
  renderedView = viewId;
  setActiveNav(viewId);
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (lastHash !== location.hash) {
    main.innerHTML = loadingState();
    clearTimeout(viewEnterTimer);
    main.classList.remove('view-enter');
    void main.offsetWidth;
    main.classList.add('view-enter');
    viewEnterTimer = setTimeout(() => main.classList.remove('view-enter'), 700);
  }
  lastHash = location.hash;

  try {
    const unmount = await view.mount(main, { ...ctx, params, viewId });
    cleanup = typeof unmount === 'function' ? unmount : null;
  } catch (err) {
    console.error(err);
    document.body.classList.remove('focus-mode');
    main.innerHTML = errorState(err?.message);
    document.getElementById('retry')?.addEventListener('click', () => route());
  }
}

/* ---------- Live updates ---------- */

function batchChanges(subscribe) {
  let queue = [];
  let timer = null;
  return subscribe((change) => {
    if (!change) return;
    queue.push(change);
    if (timer) return;
    timer = setTimeout(() => {
      const changes = queue;
      queue = [];
      timer = null;
      if (!changes.length) return;
      window.dispatchEvent(new CustomEvent('live:change', { detail: changes }));
      if (document.body.classList.contains('focus-mode')) return;
      const cards = changes.filter((c) => c.entity === 'card' && c.op === 'insert').length;
      const quizzesAdded = changes.filter((c) => c.entity === 'quiz' && c.op === 'insert').length;
      const graded = changes.filter(
        (c) => c.entity === 'answer' && c.op === 'update' && renderedView === 'grading'
      ).length;
      if (cards) toast(`${cards === 1 ? 'A card was' : `${cards} cards were`} added`, { icon: 'style' });
      if (quizzesAdded) toast(`${quizzesAdded === 1 ? 'A quiz was' : `${quizzesAdded} quizzes were`} added`, { icon: 'quiz' });
      if (graded) toast('Grading queue updated', { icon: 'grading' });
    }, 550);
  });
}

/* ---------- Boot ---------- */

shell();
applyTheme(preferredTheme());
document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});
document.getElementById('shortcuts')?.addEventListener('click', openShortcuts);
document.getElementById('import')?.addEventListener('click', () => importView.openImport(ctx));
document.getElementById('more')?.addEventListener('click', openMoreSheet);

document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  if (e.key === '?' && !typing && !document.querySelector('dialog[open]')) {
    e.preventDefault();
    openShortcuts();
  }
});

window.addEventListener('hashchange', route);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (!localStorage.getItem('ministudy.theme')) applyTheme(preferredTheme());
});

try {
  batchChanges(api.subscribe.bind(api));
} catch {
  /* live updates are a bonus; the app works without them */
}

route();
