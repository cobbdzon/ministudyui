// Content rendering: the one place where untrusted text becomes DOM.
// Markdown is parsed with raw HTML disabled, then KaTeX auto-renders math.

import { Marked } from 'marked';

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MATH_TOKEN = 'MINISTUDYMATHSPAN';

function safeUrl(raw: string): string {
  const url = String(raw ?? '').trim();
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto') return '#';
  return escapeHtml(url);
}

const renderer = {
  // Never let user-written HTML through — markdown is the only markup allowed.
  html({ text }: { text: string }) {
    return escapeHtml(text);
  },
  link({ href, title, text }: { href: string; title?: string | null; text: string }) {
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${safeUrl(href)}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
  },
  image({ href, title, text }: { href: string; title?: string | null; text: string }) {
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<img src="${safeUrl(href)}" alt="${escapeHtml(text)}"${t} loading="lazy">`;
  },
};

const parser = new Marked({ gfm: true, breaks: true, renderer });

// Hide math from the markdown parser so `_`, `*`, `|` etc. inside a formula
// cannot be turned into emphasis or table cells. KaTeX sees it again below.
function hideMath(source: string): { text: string; spans: string[]; token: string } {
  let token = MATH_TOKEN;
  while (source.includes(token)) token += 'X';
  const spans: string[] = [];
  const stash = (span: string) => {
    spans.push(span);
    return `${token}${spans.length - 1}${token}`;
  };
  const text = source
    .replace(/\$\$[\s\S]+?\$\$/g, stash)
    .replace(/(?<!\$)\$(?!\$)([^\n$]+?)(?<!\$)\$(?!\$)/g, stash);
  return { text, spans, token };
}

function showMath(html: string, spans: string[], token: string): string {
  let out = html;
  if (spans.length) {
    const re = new RegExp(`${token}(\\d+)${token}`, 'g');
    out = out.replace(re, (whole, idx: string) => {
      const span = spans[Number(idx)];
      return span === undefined ? escapeHtml(whole) : escapeHtml(span);
    });
  }
  // Marked separates blocks with newlines; content areas historically used
  // pre-wrap, so collapse those to avoid double spacing between blocks.
  return out.replace(/>\s*\n\s*</g, '><');
}

function render(source: unknown, inline: boolean): string {
  const { text, spans, token } = hideMath(String(source ?? ''));
  const html = inline
    ? parser.parseInline(text, { async: false })
    : parser.parse(text, { async: false });
  return showMath(html, spans, token);
}

/** Markdown (block + inline) to safe HTML, ready for KaTeX auto-render. */
export function markdown(source: unknown): string {
  return render(source, false);
}

/** Inline markdown only — for labels, list rows, and answer choices. */
export function markdownInline(source: unknown): string {
  return render(source, true);
}

export function renderMath(el: Element | null | undefined): void {
  if (!el || typeof window === 'undefined' || !window.renderMathInElement) return;
  try {
    window.renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
      trust: false,
      strict: 'ignore',
      ignoredClasses: ['katex', 'no-math'],
    });
  } catch {
    // Rendering must never take the page down; KaTeX already falls back inline.
  }
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms = 150,
): ((...args: A) => void) & { cancel(): void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}
