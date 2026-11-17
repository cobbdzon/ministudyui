import { icon } from './icons.js';
import { messages } from './messages.js';
import { escapeHtml } from './math.js';

/* ---------- Formatting ---------- */

export function fmtInterval(value) {
  if (typeof value === 'number') value = `${value}`;
  return escapeHtml(String(value ?? '—'));
}

export function fmtScore(score, max) {
  if (score === null || score === undefined) return '—';
  const s = Number(score);
  const m = Number(max);
  const clean = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));
  return m ? `${clean(s)} / ${clean(m)}` : clean(s);
}

export function fmtPercent(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toFixed(digits)}%`;
}

export function relTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function longDate(date = new Date()) {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function localTime(date = new Date()) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function pick(options) {
  if (!options?.length) return '';
  return options[Math.floor(Math.random() * options.length)];
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  const g = messages.greeting;
  if (h < 5) return pick(g.lateNight);
  if (h < 12) return pick(g.morning);
  if (h < 18) return pick(g.afternoon);
  return pick(g.evening);
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function pct(part, total) {
  if (!total) return 0;
  return Math.round((Number(part) / Number(total)) * 100);
}

export function typeLabel(type) {
  return (
    {
      mcq: 'Multiple choice',
      multi: 'Select all',
      numeric: 'Numeric',
      short: 'Short answer',
      latex: 'Show your work',
    }[type] || type
  );
}

/* ---------- Status renderers ---------- */

export function statusChip(status) {
  const map = {
    graded: ['success', 'Graded'],
    submitted: ['warning', 'Awaiting grading'],
    in_progress: ['tonal', 'In progress'],
  };
  const [tone, label] = map[status] || ['plain', status || 'Unknown'];
  return `<span class="chip chip--${tone}">${escapeHtml(label)}</span>`;
}

export function sourceMark(source) {
  const map = { ai: ['auto_awesome', 'AI'], user: ['edit', 'You'], import: ['download', 'Imported'] };
  const [iconName, label] = map[source] || ['edit', 'You'];
  return `<span class="source" title="Source: ${escapeHtml(label)}">${icon(iconName)}${escapeHtml(label)}</span>`;
}

export function deckMeter(deck) {
  const total = Math.max(Number(deck.total) || 0, 0);
  const newCount = Math.max(Number(deck.new) || 0, 0);
  const mature = Math.max(Number(deck.mature) || 0, 0);
  const learning = Math.max(total - newCount - mature, 0);
  const segs = [
    ['mature', mature],
    ['learning', learning],
    ['new', newCount],
  ];
  const parts = segs
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `<span class="meter__seg meter__seg--${kind}" style="flex:${n}"></span>`)
    .join('');
  return `<div class="meter${total ? '' : ' meter--empty'}" role="img" aria-label="${escapeHtml(
    `${mature} mature, ${learning} learning, ${newCount} new cards`
  )}">${parts || '<span class="meter__seg meter__seg--rest" style="flex:1"></span>'}</div>`;
}

export function heatmap(days = []) {
  // days: [{day:'YYYY-MM-DD', n}] newest last. Always render 14 whole weeks.
  const map = new Map(days.map((d) => [String(d.day).slice(0, 10), Number(d.n) || 0]));
  const max = Math.max(1, ...map.values());
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  // Move to the end of this week (Saturday), then start 14 weeks earlier on Sunday.
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end);
  start.setDate(start.getDate() - 14 * 7 + 1);

  let cells = '';
  for (let i = 0; i < 14 * 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const n = map.get(key) || 0;
    const level = n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4));
    const future = d > today;
    cells += `<span class="heatmap__cell" data-level="${future ? 0 : level}"${
      future ? ' data-future="true"' : ''
    } title="${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${future ? '' : ` · ${plural(n, 'review')}`}"></span>`;
  }
  const total = days.reduce((a, d) => a + (Number(d.n) || 0), 0);
  return `<div class="heatmap" role="img" aria-label="${escapeHtml(
    `Review activity for the last 14 weeks, ${plural(total, 'review')}`
  )}">${cells}</div>`;
}

/* ---------- Toasts ---------- */

let toastRegion = null;

export function toast(message, opts = {}) {
  if (!toastRegion) {
    toastRegion = document.createElement('div');
    toastRegion.className = 'toast-region';
    toastRegion.setAttribute('aria-live', 'polite');
    toastRegion.setAttribute('aria-atomic', 'false');
    document.body.appendChild(toastRegion);
  }
  const node = document.createElement('div');
  node.className = `toast${opts.type === 'error' ? ' toast--error' : ''}`;
  node.innerHTML = `${icon(opts.type === 'error' ? 'cancel' : opts.icon || 'check_circle')}<span>${escapeHtml(message)}</span>`;
  toastRegion.appendChild(node);
  const ttl = opts.duration || 3200;
  setTimeout(() => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 220);
  }, ttl);
}

/* ---------- Dialogs ---------- */

export function dialog({ title, body = '', actions = [], wide = false, onMount }) {
  return new Promise((resolve) => {
    const root = document.createElement('dialog');
    root.className = `dialog${wide ? ' dialog--wide' : ''}`;
    root.innerHTML = `
      <form method="dialog" novalidate>
        <div class="dialog__head">
          <h2 class="dialog__title">${escapeHtml(title)}</h2>
          <button class="icon-btn icon-btn--sm" value="cancel" formnovalidate aria-label="Close">${icon('close')}</button>
        </div>
        <div class="dialog__body">${body}</div>
        <div class="dialog__actions">
          ${actions
            .map(
              (a, i) =>
                `<button class="btn ${a.variant || 'btn--text'}" value="${escapeHtml(
                  a.value ?? String(i)
                )}"${a.danger ? ' data-danger="true"' : ''}>${a.icon ? icon(a.icon) : ''}${escapeHtml(a.label)}</button>`
            )
            .join('')}
        </div>
      </form>`;
    document.body.appendChild(root);
    const close = (value) => {
      resolve(value);
      if (root.classList.contains('is-closing')) return;
      root.classList.add('is-closing');
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        root.close();
        root.remove();
      };
      root.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 260);
    };
    root.addEventListener('cancel', (e) => {
      e.preventDefault();
      close('cancel');
    });
    root.addEventListener('click', (e) => {
      if (e.target === root) close('cancel');
    });
    root.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitter = e.submitter;
      if (submitter && submitter.value) close(submitter.value);
    });
    if (onMount) onMount(root, close);
    root.showModal();
    root.querySelector('.dialog__body input, .dialog__body textarea, .dialog__body button')?.focus();
  });
}

export async function confirmDanger({ title, body, confirmLabel = 'Delete' }) {
  const value = await dialog({
    title,
    body: `<p>${escapeHtml(body)}</p>`,
    actions: [
      { label: 'Cancel', value: 'cancel' },
      { label: confirmLabel, value: 'confirm', variant: 'btn--filled', danger: true },
    ],
  });
  return value === 'confirm';
}

/* ---------- SVG chart ---------- */

export function activityChart(days, { weeks = 30 } = {}) {
  // Fill a continuous window with zeroes so the chart is honest about quiet days.
  const map = new Map(days.map((d) => [String(d.day).slice(0, 10), Number(d.n) || 0]));
  const series = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    series.push({ date: d, n: map.get(key) || 0 });
  }
  const max = Math.max(1, ...series.map((s) => s.n));
  const W = 720;
  const H = 210;
  const pad = { top: 14, right: 8, bottom: 26, left: 30 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const gap = 3;
  const barW = Math.max(2, innerW / series.length - gap);
  const ticks = [0, Math.ceil(max / 2), max];

  const grid = ticks
    .map((t) => {
      const y = pad.top + innerH - (t / max) * innerH;
      return `<line class="chart-grid" x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}"/><text x="${pad.left - 6}" y="${
        y + 3
      }" text-anchor="end">${t}</text>`;
    })
    .join('');

  const bars = series
    .map((s, i) => {
      const h = s.n === 0 ? 0 : Math.max(2, (s.n / max) * innerH);
      const x = pad.left + i * (barW + gap);
      const y = pad.top + innerH - h;
      const label = `${s.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${plural(s.n, 'review')}`;
      return `<rect class="chart-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(
        1
      )}" height="${h.toFixed(1)}" rx="${Math.min(2.5, barW / 2).toFixed(1)}"><title>${escapeHtml(label)}</title></rect>`;
    })
    .join('');

  const xLabels = series
    .map((s, i) => {
      const first = i === 0;
      const last = i === series.length - 1;
      const weekly = i > 0 && i % 7 === 0;
      if (!first && !last && !weekly) return '';
      const x = pad.left + i * (barW + gap) + barW / 2;
      return `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${s.date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })}</text>`;
    })
    .join('');

  const total = series.reduce((a, s) => a + s.n, 0);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(
    `Reviews per day over the last ${weeks} days; ${plural(total, 'review')} in total, busiest day ${max}.`
  )}">
    ${grid}${bars}${xLabels}
  </svg>`;
}

/* ---------- Card mix pie ---------- */

const MIX_BUCKETS = [
  { key: 'new', label: 'New' },
  { key: 'learning', label: 'Learning' },
  { key: 'mature', label: 'Mature' },
];

export function mixPieChart(mix = [], { buckets = MIX_BUCKETS } = {}) {
  const values = buckets.map((b) => ({
    ...b,
    value: Math.max(Number(mix.find((m) => m.bucket === b.key)?.cards) || 0, 0),
  }));
  const total = values.reduce((a, b) => a + b.value, 0);

  const R = 54;
  const CIRC = 2 * Math.PI * R;
  const visible = values.filter((b) => b.value > 0);
  const gap = visible.length > 1 ? 3 : 0;

  let cursor = 0;
  const arcs = visible
    .map((b) => {
      const len = (b.value / total) * CIRC;
      const draw = Math.max(len - gap, 0.5);
      const offset = -(cursor + gap / 2);
      cursor += len;
      const label = `${b.label}: ${b.value} of ${total} cards`;
      return `<circle class="pie__seg pie--${b.key}" cx="70" cy="70" r="${R}" stroke-dasharray="${draw.toFixed(
        2
      )} ${(CIRC - draw).toFixed(2)}" stroke-dashoffset="${offset.toFixed(
        2
      )}" transform="rotate(-90 70 70)"><title>${escapeHtml(label)}</title></circle>`;
    })
    .join('');

  const legend = values
    .map((b) => {
      const share = total ? (b.value / total) * 100 : 0;
      const pctText = !total ? '—' : b.value > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`;
      return `<div class="pie-legend__row">
        <span class="pie-legend__swatch pie--${b.key}" aria-hidden="true"></span>
        <span class="pie-legend__label">${escapeHtml(b.label)}</span>
        <span class="pie-legend__value">${b.value}</span>
        <span class="pie-legend__pct">${pctText}</span>
      </div>`;
    })
    .join('');

  const summary = values.map((b) => `${b.value} ${b.label.toLowerCase()}`).join(', ');
  return `<div class="pie-chart">
    <div class="pie">
      <svg class="pie__svg" viewBox="0 0 140 140" role="img" aria-label="${escapeHtml(
        `Card mix: ${summary}. ${total} cards total.`
      )}">
        <circle class="pie__track" cx="70" cy="70" r="${R}"></circle>
        ${arcs}
        <text class="pie__total" x="70" y="70" text-anchor="middle" dominant-baseline="central">${total}</text>
        <text class="pie__total-label" x="70" y="90" text-anchor="middle">cards</text>
      </svg>
    </div>
    <div class="pie-legend">${legend}</div>
  </div>`;
}

/* ---------- Small DOM helpers ---------- */

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function qsa(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function on(root, event, handler, opts) {
  root.addEventListener(event, handler, opts);
  return () => root.removeEventListener(event, handler, opts);
}

export function busy(button, value = true) {
  if (!button) return;
  button.disabled = value;
  button.setAttribute('aria-busy', value ? 'true' : 'false');
}
