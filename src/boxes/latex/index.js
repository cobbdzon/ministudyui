import katex from 'katex';

function findSpans(text) {
  const spans = [];
  // $$...$$ first
  const re2 = /\$\$([\s\S]+?)\$\$/g;
  let m;
  while ((m = re2.exec(text)) !== null) spans.push({ expr: m[1], start: m.index });
  // $...$ (not $$)
  const re1 = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g;
  while ((m = re1.exec(text)) !== null) spans.push({ expr: m[1], start: m.index });
  return spans;
}

export function validate(sources) {
  return sources.map((src, index) => {
    const spans = findSpans(src);
    const errors = [];
    for (const sp of spans) {
      try {
        katex.renderToString(sp.expr, { throwOnError: true, displayMode: false });
      } catch (e) {
        errors.push({ span: sp.expr.slice(0, 80), message: String(e.message || e) });
      }
    }
    return { index, ok: errors.length === 0, errors };
  });
}