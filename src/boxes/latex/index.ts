import katex from 'katex';
import type { LatexError, LatexSpan, LatexValidationResult } from '../../../shared/types.js';

function findSpans(text: string): LatexSpan[] {
  const spans: LatexSpan[] = [];
  // $$...$$ first
  const re2 = /\$\$([\s\S]+?)\$\$/g;
  let m: RegExpExecArray | null;
  while ((m = re2.exec(text)) !== null) spans.push({ expr: m[1], start: m.index });
  // $...$ (not $$)
  const re1 = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g;
  while ((m = re1.exec(text)) !== null) spans.push({ expr: m[1], start: m.index });
  return spans;
}

export function validate(sources: string[]): LatexValidationResult[] {
  return sources.map((src, index) => {
    const spans = findSpans(src);
    const errors: LatexError[] = [];
    for (const sp of spans) {
      try {
        katex.renderToString(sp.expr, { throwOnError: true, displayMode: false });
      } catch (e: unknown) {
        errors.push({
          span: sp.expr.slice(0, 80),
          message: String(e instanceof Error ? e.message : e),
        });
      }
    }
    return { index, ok: errors.length === 0, errors };
  });
}
