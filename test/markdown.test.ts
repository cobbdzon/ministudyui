import test from 'node:test';
import assert from 'node:assert/strict';
import { markdown, markdownInline } from '../web/math.js';

test('markdown renders block and inline formatting', () => {
  const html = markdown('# Heading\n\nA **bold** word and *emphasis*.\n\n- one\n- two');
  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>emphasis<\/em>/);
  assert.match(html, /<ul>[\s\S]*<li>one<\/li>[\s\S]*<li>two<\/li>/);
});

test('inline markdown does not wrap text in paragraphs', () => {
  const html = markdownInline('Use `code` and [a link](https://example.com).');
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<a href="https:\/\/example\.com"/);
  assert.doesNotMatch(html, /<p>/);
});

test('math survives markdown and stays intact for KaTeX', () => {
  assert.equal(markdownInline('Value $x_1 * y_2$ here'), 'Value $x_1 * y_2$ here');
  assert.equal(markdownInline('$$\\frac{a}{b}$$'), '$$\\frac{a}{b}$$');
  const html = markdown('Text **$E = mc^2$** end');
  assert.match(html, /<strong>\$E = mc\^2\$<\/strong>/);
});

test('raw HTML is escaped and unsafe link targets are blocked', () => {
  const html = markdown('<script>alert(1)</script>\n\n[click](javascript:alert(1))\n\n![x](data:text/html,x)');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="#"/);
  assert.match(html, /src="#"/);
});

test('obfuscated javascript URLs are still blocked', () => {
  // A control character breaks the link syntax entirely, so no anchor is emitted.
  assert.doesNotMatch(markdownInline('[click](java\tscript:alert(1))'), /<a\b/i);
  // Entity-obfuscation must not decode back into a javascript: URL.
  const entity = markdownInline('[click](java&#9;script:alert(1))');
  assert.doesNotMatch(entity, /href="javascript/i);
  assert.doesNotMatch(entity, /href="[^"]*&#9;/i);
  assert.match(markdownInline('[x](//evil.example)'), /href="#"/);
});

test('blocks are separated without stray newlines from pre-wrap output', () => {
  assert.doesNotMatch(markdown('first\n\nsecond'), />\s*\n\s*</);
});
