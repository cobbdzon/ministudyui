// A shared quiz is authored by another user, so every text field is hostile
// input. Pin the render path used by web/views/shared.ts: markdown + escaping,
// raw HTML disabled, and no executable attributes or dangerous URL schemes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, markdown, markdownInline } from '../web/math.js';

const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror="alert(1)">',
  '<svg/onload=alert(1)>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '[click](javascript:alert(1))',
  '[click](JaVaScRiPt:alert(1))',
  '[click](java\tscript:alert(1))',
  '[click](java&#9;script:alert(1))',
  '[click](vbscript:msgbox(1))',
  '[click](file:///etc/passwd)',
  '[click](//evil.example)',
  '<javascript:alert(1)>',
  '![x](data:text/html,<script>alert(1)</script>)',
  '![x](javascript:alert(1))',
  '[x](https://example.com "t" onmouseover="alert(1)")',
  '**bold** [x](javascript:alert(1)) ![i](data:image/svg+xml,<svg onload=alert(1)>)',
  '$\\href{javascript:alert(1)}{click}$',
  '$\\includegraphics{javascript:alert(1)}$',
  'a</span><script>alert(1)</script><span>',
];

const EXECUTABLE = [
  /<script\b/i,
  /<iframe\b/i,
  /<[a-z][^>]*\son(?:error|load|click|mouseover|focus|toggle|animationstart)\s*=/i,
  /href\s*=\s*["']?(?:javascript|vbscript|data|file):/i,
  /src\s*=\s*["']?(?:javascript|vbscript|data:text\/html|file):/i,
];

test('hostile quiz text never renders as executable markup', () => {
  for (const payload of PAYLOADS) {
    for (const [kind, html] of [
      ['block', markdown(payload)],
      ['inline', markdownInline(payload)],
      ['escaped', escapeHtml(payload)],
    ] as const) {
      for (const pattern of EXECUTABLE) {
        assert.doesNotMatch(html, pattern, `${kind} render of ${JSON.stringify(payload)} matched ${pattern}`);
      }
    }
  }
});

test('attribute values cannot break out of their quotes', () => {
  const value = escapeHtml('" onmouseover="alert(1)');
  assert.equal(value, '&quot; onmouseover=&quot;alert(1)');
  assert.doesNotMatch(`<button aria-label="${value}">`, /\sonmouseover="alert\(1\)"/);
});
