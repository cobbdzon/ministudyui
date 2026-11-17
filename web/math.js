// Content rendering: the one place where untrusted text becomes DOM.
// Escape first, then let KaTeX auto-render (throwOnError:false, trust:false).

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMath(el) {
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

export function debounce(fn, ms = 150) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}
