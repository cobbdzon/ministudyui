// Content rendering: the one place where untrusted text becomes DOM.
// Escape first, then let KaTeX auto-render (throwOnError:false, trust:false).

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
