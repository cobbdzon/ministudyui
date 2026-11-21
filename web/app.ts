import { api, errorMessage } from './api.js';
import type { AdminUser, AgentToken, AuthStatus, AuthUser } from './api.js';
import { icon } from './icons.js';
import { escapeHtml } from './math.js';
import { messages } from './messages.js';
import { busy, confirmDanger, dialog, relTime, toast, type DialogAction } from './ui.js';
import type { AppContext, RoutedViewId, ViewId, ViewModule } from './context.js';
import type { ChangeEvent } from '../shared/types.js';
import * as home from './views/home.js';
import * as review from './views/review.js';
import * as deck from './views/deck.js';
import * as quizzes from './views/quizzes.js';
import * as quiz from './views/quiz.js';
import * as attempt from './views/attempt.js';
import * as grading from './views/grading.js';
import * as stats from './views/stats.js';
import * as importView from './views/import.js';

const appEl = document.getElementById('app');
if (!appEl) throw new Error('#app not found');
const app = appEl;

interface NavItem { id: string; label: string; icon: string; href: string }
const NAV: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'home', href: '#/' },
  { id: 'quizzes', label: 'Quizzes', icon: 'quiz', href: '#/quizzes' },
  { id: 'grading', label: 'Grading', icon: 'grading', href: '#/grading' },
  { id: 'stats', label: 'Stats', icon: 'monitoring', href: '#/stats' },
];

const VIEWS: Record<RoutedViewId, ViewModule> = { home, review, deck, quizzes, quiz, attempt, grading, stats };
const ROUTED_IDS = new Set<string>(Object.keys(VIEWS));
function isRoutedViewId(value: string): value is RoutedViewId {
  return ROUTED_IDS.has(value);
}

function navItem(item: NavItem, cls: string): string {
  return `<a class="${cls}" href="${item.href}" data-nav="${item.id}">
    ${icon(item.icon)}
    <span>${item.label}</span>
  </a>`;
}

function shell(): void {
  app.innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <nav class="rail" aria-label="Main">
      <a class="brand" href="#/" aria-label="ministudyui home" title="ministudyui">∫</a>
      <div class="rail-nav">
        ${NAV.map((n) => navItem(n, 'rail-item')).join('')}
      </div>
      <div class="rail-foot">
        <div class="rail-account" id="rail-account"></div>
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
      <button class="bottom-nav__item" type="button" id="more" aria-label="More options" aria-haspopup="dialog" title="Account, import, shortcuts, and theme">
        ${icon('more_horiz')}
        <span>More</span>
      </button>
    </nav>`;
}

/* ---------- Theme ---------- */

type Theme = 'light' | 'dark';
function preferredTheme(): Theme {
  const saved = localStorage.getItem('ministudy.theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
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

function openShortcuts(): void {
  const row = (keys: string[], label: string) =>
    `<div class="shortcut-row"><span>${label}</span><span class="shortcut-keys">${keys
      .map((k) => `<kbd>${escapeHtml(k)}</kbd>`)
      .join('')}</span></div>`;
  const actions: DialogAction[] = [{ label: 'Close', value: 'close', variant: 'btn--tonal' }];
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
    actions,
  });
}

/* ---------- More sheet (mobile utilities) ---------- */

let moreSheet: HTMLDialogElement | null = null;

function closeMoreSheet(): void {
  if (!moreSheet) return;
  const sheet = moreSheet;
  moreSheet = null;
  sheet.classList.add('is-closing');
  setTimeout(() => sheet.close(), 170);
}

function themeAction(): { next: Theme; icon: string; label: string } {
  const current = document.documentElement.getAttribute('data-theme');
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  return { next, icon: next === 'dark' ? 'dark_mode' : 'light_mode', label: `Switch to ${next} theme` };
}

function openMoreSheet(): void {
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
        <button class="sheet__action" type="button" data-sheet-action="passphrase">
          <span class="sheet__icon">${icon('edit')}</span>
          <span class="sheet__label">Change passphrase</span>
          ${icon('chevron_right', 'icon--sm sheet__chevron')}
        </button>
        <button class="sheet__action" type="button" data-sheet-action="agent">
          <span class="sheet__icon">${icon('auto_awesome')}</span>
          <span class="sheet__label">Agent access</span>
          ${icon('chevron_right', 'icon--sm sheet__chevron')}
        </button>
        <button class="sheet__action" type="button" data-sheet-action="export">
          <span class="sheet__icon">${icon('download')}</span>
          <span class="sheet__label">Export data</span>
          ${icon('chevron_right', 'icon--sm sheet__chevron')}
        </button>
        ${
          authUser?.is_admin
            ? `<button class="sheet__action" type="button" data-sheet-action="admin">
          <span class="sheet__icon">${icon('fact_check')}</span>
          <span class="sheet__label">Admin panel</span>
          ${icon('chevron_right', 'icon--sm sheet__chevron')}
        </button>`
            : ''
        }
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
    const target = e.target instanceof Element ? e.target : null;
    const action = target?.closest<HTMLElement>('[data-sheet-action]');
    if (!action) return;
    const kind = action.dataset.sheetAction;
    if (kind === 'theme') {
      applyTheme(themeAction().next);
      const updated = themeAction();
      const iconEl = action.querySelector<HTMLElement>('.sheet__icon');
      const labelEl = action.querySelector<HTMLElement>('.sheet__label');
      if (iconEl) iconEl.innerHTML = icon(updated.icon);
      if (labelEl) labelEl.textContent = updated.label;
      return;
    }
    closeMoreSheet();
    if (kind === 'import') importView.openImport(ctx);
    if (kind === 'shortcuts') openShortcuts();
    if (kind === 'passphrase') openPassphraseDialog();
    if (kind === 'agent') void openAgentDialog();
    if (kind === 'export') void openExportDialog();
    if (kind === 'admin') void openAdminDialog();
  });
  sheet.showModal();
}

/* ---------- Account controls ---------- */

let authUser: AuthUser | null = null;
let unlocked = false;

function updateAccountUI(): void {
  const slot = document.getElementById('rail-account');
  if (!slot) return;
  slot.innerHTML = authUser
    ? `<span class="rail-account__name" title="Signed in as ${escapeHtml(authUser.username)}">${escapeHtml(authUser.username)}</span>
       <button class="rail-account__lock" type="button" id="lock" aria-label="Lock account" title="Lock account">
         ${icon('arrow_back', 'icon--sm')}<span>Lock</span>
       </button>`
    : '';
  slot.querySelector('#lock')?.addEventListener('click', () => { void lockNow(); });
}

function closeOpenDialogs(): void {
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((el) => {
    el.dispatchEvent(new Event('cancel'));
  });
}

async function lockNow(): Promise<void> {
  try { await api.auth.logout(); } catch { /* lock locally even if the request fails */ }
  unlocked = false;
  authUser = null;
  stopLive();
  clearSessionState();
  closeOpenDialogs();
  updateAccountUI();
  openGate('login');
}

/* ---------- Auth gate ---------- */

interface AuthCopy {
  brand: string; tagline: string; username: string; passphrase: string;
  confirmPassphrase: string; recoveryKey: string; inviteCode: string;
  setup: { title: string; intro: string; submit: string; toLogin: string };
  login: { title: string; intro: string; submit: string; toRecover: string; toRegister: string };
  recover: { title: string; intro: string; submit: string; toLogin: string };
  register: { title: string; intro: string; submit: string; toLogin: string; disclosure: string };
  recovery: { title: string; intro: string; saved: string; continue: string; copy: string };
  errors: { mismatch: string; short: string; savedRequired: string; generic: string };
}
const copy = (messages as unknown as { auth: AuthCopy }).auth;

type GateScreen = 'setup' | 'login' | 'recover' | 'register' | 'recovery';
let gateEl: HTMLElement | null = null;
let focusBeforeGate: HTMLElement | null = null;
// One-time values live in JS memory only — never in storage or the URL.
let pendingRecoveryKey: string | null = null;
let pendingUser: AuthUser | null = null;

function setAppInert(value: boolean): void {
  if ('inert' in HTMLElement.prototype) {
    (app as HTMLElement & { inert?: boolean }).inert = value;
  }
}

function openGate(screen: GateScreen): void {
  if (gateEl) {
    renderGate(screen);
    return;
  }
  focusBeforeGate = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  gateEl = document.createElement('div');
  gateEl.className = 'gate';
  gateEl.setAttribute('role', 'dialog');
  gateEl.setAttribute('aria-modal', 'true');
  gateEl.setAttribute('aria-labelledby', 'gate-title');
  gateEl.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const link = target?.closest<HTMLElement>('[data-gate-screen]');
    if (link?.dataset.gateScreen) renderGate(link.dataset.gateScreen as GateScreen);
  });
  gateEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !gateEl) return;
    const focusables = [...gateEl.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  document.body.appendChild(gateEl);
  setAppInert(true);
  document.body.classList.add('auth-locked');
  renderGate(screen);
}

function closeGate(): void {
  if (!gateEl) return;
  const el = gateEl;
  gateEl = null;
  setAppInert(false);
  document.body.classList.remove('auth-locked');
  el.classList.add('is-closing');
  setTimeout(() => el.remove(), 220);
  const restore = focusBeforeGate && document.contains(focusBeforeGate) ? focusBeforeGate : document.getElementById('main');
  focusBeforeGate = null;
  restore?.focus();
}

interface FieldOptions {
  required?: boolean; minlength?: number; value?: string; mono?: boolean; autocomplete?: string;
}
function inputField(
  id: string, name: string, label: string, type: string, autocomplete: string, opts: FieldOptions = {},
): string {
  return `<label class="gate__field" for="${id}">
    <span class="gate__label">${escapeHtml(label)}</span>
    <input class="input${opts.mono ? ' input--mono' : ''}" id="${id}" name="${name}" type="${type}"
      autocomplete="${autocomplete}" spellcheck="false" aria-invalid="false"
      ${opts.required ? 'required' : ''} ${opts.minlength ? `minlength="${opts.minlength}"` : ''}
      value="${escapeHtml(opts.value ?? '')}">
  </label>`;
}

// Registration may arrive as #/register?invite=... The code is read once and
// the fragment is stripped immediately; it is never stored in the address bar.
function takeInviteFromHash(): string {
  const hash = location.hash;
  if (!hash) return '';
  const q = hash.indexOf('?');
  const code = q >= 0 ? new URLSearchParams(hash.slice(q + 1)).get('invite') ?? '' : '';
  if (code) history.replaceState(null, '', location.pathname + location.search);
  return code;
}

type GateSubmit = (
  values: Record<string, string>,
  fail: (message: string, field?: string) => void,
) => Promise<void>;

function wireGateForm(form: HTMLFormElement, submit: GateSubmit): void {
  const region = gateEl?.querySelector<HTMLElement>('.gate__error') ?? null;
  const fields = [...form.querySelectorAll<HTMLInputElement>('input[name]')];
  const fail = (message: string, field?: string) => {
    if (region) region.textContent = message;
    fields.forEach((f) => f.setAttribute('aria-invalid', field ? String(f.name === field) : 'false'));
    const target = field ? fields.find((f) => f.name === field) : fields[0];
    target?.focus();
  };
  const clear = (f: HTMLInputElement) => {
    f.setAttribute('aria-invalid', 'false');
    if (region) region.textContent = '';
  };
  fields.forEach((f) => {
    f.addEventListener('input', () => clear(f));
    f.addEventListener('change', () => clear(f));
    f.addEventListener('blur', () => f.setAttribute('aria-invalid', f.checkValidity() ? 'false' : 'true'));
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    busy(button, true);
    const values = Object.fromEntries(fields.map((f) => [f.name, f.value]));
    void Promise.resolve(submit(values, fail))
      .catch((err: unknown) => fail(errorMessage(err, copy.errors.generic)))
      .finally(() => busy(button, false));
  });
}

function copyButton(label: string, targetId: string): string {
  return `<span class="copy-group">
    <button class="copy-btn" type="button" data-copy-target="${escapeHtml(targetId)}"
      aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon('content_copy')}</button>
    <span class="copy-feedback" role="status" aria-live="polite"></span>
  </span>`;
}

function wireCopy(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('[data-copy-target]').forEach((button) => {
    if (button.dataset.copyWired === 'true') return;
    button.dataset.copyWired = 'true';
    button.addEventListener('click', async () => {
      const target = document.getElementById(button.dataset.copyTarget ?? '');
      const text = target?.textContent?.trim() ?? '';
      const bubble = button.parentElement?.querySelector<HTMLElement>('.copy-feedback');
      let message = 'Copied';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        message = 'Copy failed';
      }
      if (!bubble) return;
      if (bubble.dataset.timer) clearTimeout(Number(bubble.dataset.timer));
      bubble.textContent = '';
      requestAnimationFrame(() => { bubble.textContent = message; });
      bubble.classList.add('is-visible');
      bubble.dataset.timer = String(setTimeout(() => {
        bubble.classList.remove('is-visible');
        bubble.textContent = '';
        bubble.dataset.timer = '';
      }, 2000));
    });
  });
}

function gateLinks(links: Array<[string, GateScreen]>): string {
  if (!links.length) return '';
  return `<div class="gate__links">${links.map(([label, screen]) =>
    `<button class="gate__link" type="button" data-gate-screen="${screen}">${escapeHtml(label)}</button>`,
  ).join('')}</div>`;
}

function renderGate(screen: GateScreen): void {
  if (!gateEl) return;
  let title = '';
  let intro = '';
  let form = '';
  let links: Array<[string, GateScreen]> = [];

  if (screen === 'setup') {
    const c = copy.setup;
    title = c.title; intro = c.intro;
    form = `
      ${inputField('gate-username', 'username', copy.username, 'text', 'username', { required: true })}
      ${inputField('gate-passphrase', 'passphrase', copy.passphrase, 'password', 'new-password', { required: true, minlength: 10 })}
      ${inputField('gate-confirm', 'confirm_passphrase', copy.confirmPassphrase, 'password', 'new-password', { required: true })}
      <button class="btn btn--filled btn--block" type="submit">${escapeHtml(c.submit)}</button>`;
    links = [[c.toLogin, 'login']];
  } else if (screen === 'login') {
    const c = copy.login;
    title = c.title; intro = c.intro;
    form = `
      ${inputField('gate-username', 'username', copy.username, 'text', 'username', { required: true })}
      ${inputField('gate-passphrase', 'passphrase', copy.passphrase, 'password', 'current-password', { required: true })}
      <button class="btn btn--filled btn--block" type="submit">${escapeHtml(c.submit)}</button>`;
    links = [[c.toRecover, 'recover'], [c.toRegister, 'register']];
  } else if (screen === 'recover') {
    const c = copy.recover;
    title = c.title; intro = c.intro;
    form = `
      ${inputField('gate-recovery', 'recovery_key', copy.recoveryKey, 'text', 'off', { required: true, mono: true })}
      ${inputField('gate-passphrase', 'passphrase', copy.passphrase, 'password', 'new-password', { required: true, minlength: 10 })}
      ${inputField('gate-confirm', 'confirm_passphrase', copy.confirmPassphrase, 'password', 'new-password', { required: true })}
      <button class="btn btn--filled btn--block" type="submit">${escapeHtml(c.submit)}</button>`;
    links = [[c.toLogin, 'login']];
  } else if (screen === 'register') {
    const c = copy.register;
    title = c.title; intro = c.intro;
    form = `
      ${inputField('gate-invite', 'invite_code', copy.inviteCode, 'text', 'off', { required: true, value: takeInviteFromHash(), mono: true })}
      ${inputField('gate-username', 'username', copy.username, 'text', 'username', { required: true })}
      ${inputField('gate-passphrase', 'passphrase', copy.passphrase, 'password', 'new-password', { required: true, minlength: 10 })}
      ${inputField('gate-confirm', 'confirm_passphrase', copy.confirmPassphrase, 'password', 'new-password', { required: true })}
      <p class="auth-disclosure">${escapeHtml(c.disclosure)}</p>
      <button class="btn btn--filled btn--block" type="submit">${escapeHtml(c.submit)}</button>`;
    links = [[c.toLogin, 'login']];
  } else {
    const c = copy.recovery;
    title = c.title; intro = c.intro;
    form = `
      <div class="auth-secret">
        <code class="auth-secret__value" id="gate-recovery-value">${escapeHtml(pendingRecoveryKey ?? '')}</code>
        ${copyButton(c.copy, 'gate-recovery-value')}
      </div>
      <label class="check-row auth-secret__saved" for="gate-saved">
        <input type="checkbox" id="gate-saved">
        <span>${escapeHtml(c.saved)}</span>
      </label>
      <button class="btn btn--filled btn--block" type="button" id="gate-continue">${escapeHtml(c.continue)}</button>`;
  }

  gateEl.innerHTML = `
    <div class="gate__scrim" aria-hidden="true"></div>
    <div class="gate__card">
      <div class="gate__brand"><span class="gate__mark" aria-hidden="true">∫</span>${escapeHtml(copy.brand)}</div>
      <p class="gate__tagline">${escapeHtml(copy.tagline)}</p>
      <h1 class="gate__title" id="gate-title">${escapeHtml(title)}</h1>
      <p class="gate__intro">${escapeHtml(intro)}</p>
      <p class="gate__error" role="status" aria-live="polite"></p>
      ${screen === 'recovery' ? `<div class="gate__form">${form}</div>` : `<form class="gate__form">${form}</form>`}
      ${gateLinks(links)}
    </div>`;

  if (screen === 'recovery') {
    const region = gateEl.querySelector<HTMLElement>('.gate__error');
    gateEl.querySelector('#gate-continue')?.addEventListener('click', () => {
      const saved = gateEl?.querySelector<HTMLInputElement>('#gate-saved');
      if (!saved?.checked) {
        if (region) region.textContent = copy.errors.savedRequired;
        saved?.focus();
        return;
      }
      const user = pendingUser;
      pendingRecoveryKey = null;
      pendingUser = null;
      if (user) unlock(user);
      else renderGate('login');
    });
    wireCopy(gateEl);
    gateEl.querySelector<HTMLElement>('#gate-saved')?.focus();
    return;
  }

  const formEl = gateEl.querySelector<HTMLFormElement>('.gate__form');
  if (!formEl) return;
  const checkConfirm = (values: Record<string, string>, fail: (msg: string, field?: string) => void): boolean => {
    if (values.passphrase !== values.confirm_passphrase) {
      fail(copy.errors.mismatch, 'confirm_passphrase');
      return false;
    }
    if (values.passphrase.length < 10) {
      fail(copy.errors.short, 'passphrase');
      return false;
    }
    return true;
  };

  if (screen === 'setup') {
    wireGateForm(formEl, async (values, fail) => {
      if (!checkConfirm(values, fail)) return;
      const result = await api.auth.setup({ username: values.username, passphrase: values.passphrase });
      pendingRecoveryKey = result.recovery_key;
      pendingUser = result.user;
      renderGate('recovery');
    });
  } else if (screen === 'login') {
    wireGateForm(formEl, async (values, fail) => {
      const result = await api.auth.login({ username: values.username, passphrase: values.passphrase });
      unlock(result.user);
    });
  } else if (screen === 'recover') {
    wireGateForm(formEl, async (values, fail) => {
      if (!checkConfirm(values, fail)) return;
      const result = await api.auth.recover({ recovery_key: values.recovery_key, passphrase: values.passphrase });
      const session = await api.auth.login({ username: result.user.username, passphrase: values.passphrase });
      unlock(session.user);
    });
  } else {
    wireGateForm(formEl, async (values, fail) => {
      if (!checkConfirm(values, fail)) return;
      await api.auth.register({
        invite_code: values.invite_code, username: values.username, passphrase: values.passphrase,
      });
      const session = await api.auth.login({ username: values.username, passphrase: values.passphrase });
      unlock(session.user);
    });
  }
  gateEl.querySelector<HTMLInputElement>('input')?.focus();
}

function unlock(user: AuthUser): void {
  authUser = { ...user };
  unlocked = true;
  pendingRecoveryKey = null;
  pendingUser = null;
  closeGate();
  updateAccountUI();
  document.getElementById('main')?.focus();
  startLive();
  void route();
}

/* ---------- Account dialogs ---------- */

function section(title: string, content: string): string {
  return `<div class="auth-section"><h3 class="auth-section__title">${escapeHtml(title)}</h3>${content}</div>`;
}

function dialogError(): string {
  return `<p class="gate__error" role="status" aria-live="polite"></p>`;
}

function wireDialogError(root: HTMLElement): (message: string, field?: string) => void {
  const region = root.querySelector<HTMLElement>('.gate__error');
  return (message, field) => {
    if (region) region.textContent = message;
    root.querySelectorAll<HTMLInputElement>('input[name]').forEach((f) => {
      f.setAttribute('aria-invalid', field ? String(f.name === field) : 'false');
    });
    if (field) root.querySelector<HTMLInputElement>(`input[name="${field}"]`)?.focus();
  };
}

function openPassphraseDialog(): void {
  void dialog({
    title: 'Change passphrase',
    body: `
      <div class="auth-form">
        ${inputField('pp-current', 'current_passphrase', 'Current passphrase', 'password', 'current-password', { required: true })}
        ${inputField('pp-new', 'new_passphrase', 'New passphrase', 'password', 'new-password', { required: true, minlength: 10 })}
        ${inputField('pp-confirm', 'confirm_passphrase', copy.confirmPassphrase, 'password', 'new-password', { required: true })}
        ${dialogError()}
        <div class="auth-form__actions">
          <button class="btn btn--filled" type="button" data-action="save">Change passphrase</button>
        </div>
      </div>`,
    actions: [{ label: 'Close', value: 'close', variant: 'btn--tonal' }],
    onMount(root, close) {
      const fail = wireDialogError(root);
      root.querySelector('[data-action="save"]')?.addEventListener('click', async (e) => {
        const button = e.currentTarget as HTMLButtonElement;
        const current = root.querySelector<HTMLInputElement>('#pp-current')!.value;
        const next = root.querySelector<HTMLInputElement>('#pp-new')!.value;
        const confirm = root.querySelector<HTMLInputElement>('#pp-confirm')!.value;
        if (next !== confirm) { fail(copy.errors.mismatch, 'confirm_passphrase'); return; }
        if (next.length < 10) { fail(copy.errors.short, 'new_passphrase'); return; }
        busy(button, true);
        try {
          await api.auth.changePassphrase({ current_passphrase: current, new_passphrase: next });
          toast('Passphrase changed', { icon: 'check_circle' });
          close('done');
        } catch (err) {
          fail(errorMessage(err, copy.errors.generic), 'current_passphrase');
        } finally {
          busy(button, false);
        }
      });
    },
  });
}

function agentConfig(token: string): string {
  return JSON.stringify({
    mcp: {
      servers: {
        ministudyui: {
          type: 'remote',
          url: `${location.origin}/mcp`,
          oauth: false,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
  }, null, 2);
}

function tokenRow(token: AgentToken): string {
  const revoked = !!token.revoked_at;
  return `<div class="auth-row${revoked ? ' auth-row--muted' : ''}">
    <div class="auth-row__main">
      <div class="auth-row__title">${escapeHtml(token.label)}
        <span class="chip chip--${token.mode === 'read' ? 'tonal' : 'primary'}">${token.mode === 'read' ? 'Read-only' : 'Write'}</span>
        ${revoked ? '<span class="chip chip--error">Revoked</span>' : ''}
      </div>
      <div class="auth-row__meta">Created ${escapeHtml(relTime(token.created_at))}${
        token.last_used_at ? ` · Last used ${escapeHtml(relTime(token.last_used_at))}` : ' · Never used'
      }</div>
    </div>
    ${revoked ? '' : `<button class="btn btn--text btn--sm" type="button" data-revoke="${escapeHtml(token.token_id)}">Revoke</button>`}
  </div>`;
}

async function openAgentDialog(): Promise<void> {
  void dialog({
    title: 'Agent access',
    wide: true,
    body: `
      ${section('Create a token', `
        <p class="auth-note">A token lets an AI agent reach this account through the MCP endpoint. The token is shown only once.</p>
        <div class="auth-form">
          ${inputField('agent-label', 'label', 'Label', 'text', 'off', { required: true })}
          <label class="check-row" for="agent-readonly">
            <input type="checkbox" id="agent-readonly">
            <span>Read-only (agents can look but not change data)</span>
          </label>
          <div class="auth-form__actions">
            <button class="btn btn--tonal" type="button" data-action="create">${icon('add')} Create token</button>
          </div>
        </div>
        <div id="agent-new"></div>`)}
      <div class="auth-divider"></div>
      <div class="auth-section__head">
        <h3 class="auth-section__title">Your tokens</h3>
        <button class="btn btn--sm" type="button" data-action="refresh">Refresh</button>
      </div>
      <div class="auth-list" id="agent-list" aria-live="polite"></div>`,
    actions: [{ label: 'Close', value: 'close', variant: 'btn--tonal' }],
    async onMount(root) {
      const fail = wireDialogError(root);
      const list = root.querySelector<HTMLElement>('#agent-list')!;
      const render = async () => {
        try {
          const { tokens } = await api.agentTokens();
          list.innerHTML = tokens.length
            ? tokens.map(tokenRow).join('')
            : '<p class="auth-note">No tokens yet.</p>';
        } catch (err) {
          list.innerHTML = `<p class="auth-note">${escapeHtml(errorMessage(err, copy.errors.generic))}</p>`;
        }
      };
      await render();

      root.querySelector('[data-action="refresh"]')?.addEventListener('click', () => { void render(); });
      root.querySelector('[data-action="create"]')?.addEventListener('click', async (e) => {
        const button = e.currentTarget as HTMLButtonElement;
        const label = root.querySelector<HTMLInputElement>('#agent-label')!.value.trim();
        if (!label) { fail('Give the token a label.', 'label'); return; }
        const readOnly = root.querySelector<HTMLInputElement>('#agent-readonly')!.checked;
        busy(button, true);
        try {
          const created = await api.createAgentToken(label, readOnly);
          const newArea = root.querySelector<HTMLElement>('#agent-new')!;
          newArea.innerHTML = `
            <div class="auth-secret auth-secret--token">
              <p class="auth-note">Copy this token now — it will not be shown again.</p>
              <code class="auth-secret__value" id="agent-token-value">${escapeHtml(created.token)}</code>
              ${copyButton('Copy token', 'agent-token-value')}
              <p class="auth-note">OpenCode v2 config</p>
              <pre class="auth-code" id="agent-config">${escapeHtml(agentConfig(created.token))}</pre>
              ${copyButton('Copy OpenCode config', 'agent-config')}
            </div>`;
          wireCopy(root);
          toast('Token created', { icon: 'check_circle' });
          await render();
        } catch (err) {
          fail(errorMessage(err, copy.errors.generic), 'label');
        } finally {
          busy(button, false);
        }
      });
      list.addEventListener('click', async (e) => {
        const target = e.target instanceof Element ? e.target : null;
        const revoke = target?.closest<HTMLElement>('[data-revoke]');
        if (!revoke?.dataset.revoke) return;
        const id = revoke.dataset.revoke;
        const ok = await confirmDanger({
          title: 'Revoke this token?',
          body: 'An agent using it will lose access immediately.',
          confirmLabel: 'Revoke token',
        });
        if (!ok) return;
        try {
          await api.revokeAgentToken(id);
          toast('Token revoked', { icon: 'check_circle' });
          await render();
        } catch (err) {
          toast(errorMessage(err, copy.errors.generic), { type: 'error' });
        }
      });
    },
  });
}

async function openExportDialog(): Promise<void> {
  void dialog({
    title: 'Export your data',
    body: `
      <div class="auth-note auth-note--warning">
        ${icon('fact_check')}
        <span>The downloaded file is <strong>plaintext</strong>. It contains your decks, cards, quizzes, and attempts without encryption. Store it somewhere safe and do not share it.</span>
      </div>`,
    actions: [{ label: 'Close', value: 'close', variant: 'btn--tonal' }],
    onMount(root) {
      const button = document.createElement('button');
      button.className = 'btn btn--filled';
      button.type = 'button';
      button.innerHTML = `${icon('download')} Download plaintext bundle`;
      button.addEventListener('click', async () => {
        busy(button, true);
        try {
          const bundle = await api.exportBundle();
          const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = `ministudyui-export-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          toast('Export downloaded', { icon: 'download' });
        } catch (err) {
          toast(errorMessage(err, copy.errors.generic), { type: 'error' });
        } finally {
          busy(button, false);
        }
      });
      root.querySelector('.dialog__actions')?.prepend(button);
    },
  });
}

function userRow(user: AdminUser): string {
  const disabled = !!user.disabled_at;
  return `<div class="auth-row">
    <div class="auth-row__main">
      <div class="auth-row__title">${escapeHtml(user.username)}
        ${user.is_admin ? '<span class="chip chip--primary">Admin</span>' : ''}
        ${disabled ? '<span class="chip chip--warning">Disabled</span>' : ''}
      </div>
      <div class="auth-row__meta">ID ${user.id} · Joined ${escapeHtml(relTime(user.created_at))}</div>
    </div>
    <div class="auth-row__actions">
      <button class="btn btn--text btn--sm" type="button" data-user-toggle="${user.id}" data-disabled="${disabled}">
        ${disabled ? 'Enable' : 'Disable'}
      </button>
      <button class="btn btn--text btn--sm" type="button" data-user-delete="${user.id}"
        ${user.username === authUser?.username ? 'disabled title="You cannot delete your own account"' : ''}>Delete</button>
    </div>
  </div>`;
}

async function openAdminDialog(): Promise<void> {
  void dialog({
    title: 'Admin panel',
    wide: true,
    body: `
      ${section('Invite a user', `
        <p class="auth-note">Invite links can only be used once. Share them privately.</p>
        <div class="auth-form">
          <label class="gate__field" for="invite-ttl">
            <span class="gate__label">Link expires after</span>
            <select class="input" id="invite-ttl">
              <option value="86400">1 day</option>
              <option value="604800" selected>7 days</option>
              <option value="2592000">30 days</option>
            </select>
          </label>
          <div class="auth-form__actions">
            <button class="btn btn--tonal" type="button" data-action="invite">${icon('add')} Create invite link</button>
          </div>
        </div>
        <div id="admin-invite"></div>`)}
      <div class="auth-divider"></div>
      <div class="auth-section__head">
        <h3 class="auth-section__title">Users</h3>
        <button class="btn btn--sm" type="button" data-action="refresh">Refresh</button>
      </div>
      <div class="auth-list" id="admin-users" aria-live="polite"></div>
      <div class="auth-divider"></div>
      <div class="auth-section__head"><h3 class="auth-section__title">Recent invites</h3></div>
      <div class="auth-list" id="admin-invites" aria-live="polite"></div>`,
    actions: [{ label: 'Close', value: 'close', variant: 'btn--tonal' }],
    async onMount(root) {
      const usersEl = root.querySelector<HTMLElement>('#admin-users')!;
      const invitesEl = root.querySelector<HTMLElement>('#admin-invites')!;
      const render = async () => {
        try {
          const [{ users }, { invites }] = await Promise.all([api.adminUsers(), api.adminInvites()]);
          usersEl.innerHTML = users.length ? users.map(userRow).join('') : '<p class="auth-note">No users.</p>';
          invitesEl.innerHTML = invites.length
            ? invites.map((invite) => `<div class="auth-row">
                <div class="auth-row__main">
                  <div class="auth-row__title">Invite #${invite.id}
                    ${invite.used_at ? '<span class="chip chip--tonal">Used</span>' : ''}
                  </div>
                  <div class="auth-row__meta">Created ${escapeHtml(relTime(invite.created_at))} · Expires ${escapeHtml(
                    new Date(invite.expires_at).toLocaleString(),
                  )}</div>
                </div>
              </div>`).join('')
            : '<p class="auth-note">No invites yet.</p>';
        } catch (err) {
          usersEl.innerHTML = `<p class="auth-note">${escapeHtml(errorMessage(err, copy.errors.generic))}</p>`;
        }
      };
      await render();
      root.querySelector('[data-action="refresh"]')?.addEventListener('click', () => { void render(); });

      root.querySelector('[data-action="invite"]')?.addEventListener('click', async (e) => {
        const button = e.currentTarget as HTMLButtonElement;
        const ttl = Number(root.querySelector<HTMLSelectElement>('#invite-ttl')!.value);
        busy(button, true);
        try {
          const invite = await api.createInvite(ttl);
          const link = `${location.origin}${location.pathname}#/register?invite=${encodeURIComponent(invite.code)}`;
          root.querySelector<HTMLElement>('#admin-invite')!.innerHTML = `
            <div class="auth-secret">
              <code class="auth-secret__value" id="admin-invite-link">${escapeHtml(link)}</code>
              ${copyButton('Copy invite link', 'admin-invite-link')}
            </div>`;
          wireCopy(root);
          toast('Invite link created', { icon: 'check_circle' });
          await render();
        } catch (err) {
          toast(errorMessage(err, copy.errors.generic), { type: 'error' });
        } finally {
          busy(button, false);
        }
      });

      usersEl.addEventListener('click', async (e) => {
        const target = e.target instanceof Element ? e.target : null;
        const toggle = target?.closest<HTMLElement>('[data-user-toggle]');
        const del = target?.closest<HTMLElement>('[data-user-delete]');
        if (toggle?.dataset.userToggle) {
          const id = Number(toggle.dataset.userToggle);
          const disabled = toggle.dataset.disabled === 'true';
          try {
            await api.setUserDisabled(id, !disabled);
            toast(disabled ? 'User enabled' : 'User disabled', { icon: 'check_circle' });
            await render();
          } catch (err) {
            toast(errorMessage(err, copy.errors.generic), { type: 'error' });
          }
          return;
        }
        if (!del?.dataset.userDelete) return;
        const id = Number(del.dataset.userDelete);
        const ok = await confirmDanger({
          title: 'Delete this user?',
          body: 'Their account, keys, and study data will be removed. This cannot be undone.',
          confirmLabel: 'Delete user',
        });
        if (!ok) return;
        try {
          await api.deleteUser(id);
          toast('User deleted', { icon: 'check_circle' });
          await render();
        } catch (err) {
          toast(errorMessage(err, copy.errors.generic), { type: 'error' });
        }
      });
    },
  });
}

/* ---------- Router ---------- */

let cleanup: (() => void) | null = null;
let lastHash: string | null = null;
let renderedView: ViewId | null = null;
let viewEnterTimer: ReturnType<typeof setTimeout> | null = null;

function parseHash(): string[] {
  const raw = location.hash.replace(/^#\/?/, '');
  return raw.split('/').filter(Boolean);
}

function activeNav(viewId: ViewId): string {
  if (viewId === 'home' || viewId === 'review' || viewId === 'deck') return 'home';
  if (viewId === 'quizzes' || viewId === 'quiz' || viewId === 'attempt') return 'quizzes';
  return viewId;
}

function setActiveNav(viewId: ViewId): void {
  const active = activeNav(viewId);
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
    if (el.dataset.nav === active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

function loadingState(): string {
  return `<div aria-busy="true" aria-label="Loading">
    <div class="skeleton" style="width:240px;height:34px;margin:8px 0 12px"></div>
    <div class="skeleton" style="width:min(420px,80%);height:16px;margin-bottom:32px"></div>
    <div class="skeleton" style="width:100%;height:76px;margin-bottom:10px"></div>
    <div class="skeleton" style="width:100%;height:76px;margin-bottom:10px"></div>
    <div class="skeleton" style="width:100%;height:76px"></div>
  </div>`;
}

function errorState(message: string): string {
  return `<div class="empty" style="margin-top:12vh">
    <div class="empty__icon">${icon('cancel')}</div>
    <h1 class="empty__title">That didn’t load</h1>
    <p class="empty__body">${escapeHtml(message || 'The app could not reach its local server.')}</p>
    <button class="btn btn--tonal" id="retry">Try again</button>
  </div>`;
}

const ctx: AppContext = {
  api,
  icon,
  esc: escapeHtml,
  toast,
  go(hash) { location.hash = hash; },
  onChange(handler) {
    const listener = (e: CustomEvent<ChangeEvent[]>) => handler(e.detail);
    window.addEventListener('live:change', listener);
    return () => window.removeEventListener('live:change', listener);
  },
  params: [],
  viewId: 'home',
};

async function route(): Promise<void> {
  const main = document.getElementById('main');
  if (!main || !unlocked) return;
  const segments = parseHash();
  const rawViewId = segments[0] || 'home';
  const viewId: ViewId = isRoutedViewId(rawViewId) ? rawViewId : 'home';
  const view = VIEWS[viewId];
  const params = segments.slice(1);

  if (typeof cleanup === 'function') {
    try { cleanup(); } catch { /* a failing unmount must not stop navigation */ }
  }
  cleanup = null;

  document.body.classList.remove('focus-mode');
  closeMoreSheet();
  renderedView = viewId;
  setActiveNav(viewId);
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (lastHash !== location.hash) {
    main.innerHTML = loadingState();
    if (viewEnterTimer) clearTimeout(viewEnterTimer);
    main.classList.remove('view-enter');
    void main.offsetWidth;
    main.classList.add('view-enter');
    viewEnterTimer = setTimeout(() => main.classList.remove('view-enter'), 700);
  }
  lastHash = location.hash;

  try {
    const unmount = await view.mount(main, { ...ctx, params, viewId });
    cleanup = typeof unmount === 'function' ? unmount : null;
    // Review and quiz report their own current card/question; every other
    // screen means there is nothing in focus for an MCP tool to look at.
    if (viewId !== 'review' && viewId !== 'quiz') {
      void ctx.api.setUiContext({ view: null }).catch(() => {});
    }
  } catch (err) {
    console.error(err);
    document.body.classList.remove('focus-mode');
    main.innerHTML = errorState(errorMessage(err));
    document.getElementById('retry')?.addEventListener('click', () => { void route(); });
  }
}

/* ---------- Live updates ---------- */

let unsubscribeLive: (() => void) | null = null;

function batchChanges(subscribe: (cb: (c: ChangeEvent) => void) => () => void): () => void {
  let queue: ChangeEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
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
        (c) => c.entity === 'answer' && c.op === 'update' && renderedView === 'grading',
      ).length;
      if (cards) toast(`${cards === 1 ? 'A card was' : `${cards} cards were`} added`, { icon: 'style' });
      if (quizzesAdded) toast(`${quizzesAdded === 1 ? 'A quiz was' : `${quizzesAdded} quizzes were`} added`, { icon: 'quiz' });
      if (graded) toast('Grading queue updated', { icon: 'grading' });
    }, 550);
  });
}

function startLive(): void {
  if (unsubscribeLive) return;
  try {
    unsubscribeLive = batchChanges(api.subscribe.bind(api));
  } catch {
    /* live updates are a bonus; the app works without them */
  }
}

function stopLive(): void {
  if (!unsubscribeLive) return;
  try { unsubscribeLive(); } catch { /* an SSE failure must not stop locking */ }
  unsubscribeLive = null;
}

function clearSessionState(): void {
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch { /* a failing unmount must not stop locking */ }
  }
  cleanup = null;
  lastHash = null;
  renderedView = null;
  if (viewEnterTimer) clearTimeout(viewEnterTimer);
  viewEnterTimer = null;
  ctx.params = [];
  ctx.viewId = 'home';
  closeMoreSheet();
  document.body.classList.remove('focus-mode');
  document.getElementById('main')?.replaceChildren();
  stopLive();
}

window.addEventListener('auth:locked', () => {
  if (!unlocked && !gateEl) {
    openGate('login');
    return;
  }
  unlocked = false;
  authUser = null;
  pendingRecoveryKey = null;
  pendingUser = null;
  stopLive();
  clearSessionState();
  updateAccountUI();
  // Close any open account dialogs; their data is stale once locked.
  closeOpenDialogs();
  // Keep an already-open gate form (and its error message) intact.
  if (!gateEl) openGate('login');
});

/* ---------- Boot ---------- */

function initialGateScreen(status: AuthStatus['status']): GateScreen {
  if (status === 'setup') return 'setup';
  const match = /^#\/?(register|recover|login)\b/.exec(location.hash);
  return match ? match[1] as GateScreen : 'login';
}

async function bootstrap(): Promise<void> {
  try {
    const status = await api.auth.status();
    if (status.status === 'unlocked' && status.user) {
      unlock(status.user);
      return;
    }
    unlocked = false;
    clearSessionState();
    openGate(initialGateScreen(status.status));
  } catch (err) {
    unlocked = false;
    clearSessionState();
    openGate('login');
    const region = gateEl?.querySelector<HTMLElement>('.gate__error');
    if (region) region.textContent = errorMessage(err, copy.errors.generic);
  }
}

shell();
applyTheme(preferredTheme());
document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});
document.getElementById('shortcuts')?.addEventListener('click', openShortcuts);
document.getElementById('import')?.addEventListener('click', () => importView.openImport(ctx));
document.getElementById('more')?.addEventListener('click', openMoreSheet);
updateAccountUI();

document.addEventListener('keydown', (e) => {
  const target = e.target instanceof Element ? e.target : null;
  const tag = (target?.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (target instanceof HTMLElement && target.isContentEditable);
  if (e.key === '?' && !typing && !document.querySelector('dialog[open]') && !gateEl) {
    e.preventDefault();
    openShortcuts();
  }
});

window.addEventListener('hashchange', () => { if (unlocked) void route(); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (!localStorage.getItem('ministudy.theme')) applyTheme(preferredTheme());
});

void bootstrap();
