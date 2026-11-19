import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';

const root = join(import.meta.dir, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.opencode']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function sourceFiles(): Array<{ rel: string; text: string }> {
  return walk(root).map((abs) => ({
    rel: relative(root, abs).split('\\').join('/'),
    text: readFileSync(abs, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, ''),
  }));
}

function specifiers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

const files = sourceFiles();
const nativeImports = files.flatMap((f) =>
  specifiers(f.text)
    .filter((s) => s === 'electrobun' || s.startsWith('electrobun/'))
    .map((s) => `${f.rel}: ${s}`),
);

describe('box boundaries', () => {
  it('finds source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('never imports electrobun outside desktop/', () => {
    expect(nativeImports.filter((line) => !line.startsWith('desktop/'))).toEqual([]);
  });

  it('never imports electrobun from web/', () => {
    expect(nativeImports.filter((line) => line.startsWith('web/'))).toEqual([]);
  });

  it('only imports cross-box code through index.ts', () => {
    const bad: string[] = [];
    for (const f of files) {
      const own = f.rel.match(/^src\/boxes\/([^/]+)\//)?.[1];
      if (!own) continue;
      for (const spec of specifiers(f.text)) {
        if (!spec.startsWith('.')) continue;
        const resolved = posix
          .normalize(posix.join(posix.dirname(f.rel), spec))
          .replace(/\.(js|ts|tsx)$/, '');
        const target = resolved.match(/^src\/boxes\/([^/]+)\/(.*)$/);
        if (!target) continue;
        const [, box, rest] = target;
        if (box !== own && rest !== 'index') {
          bad.push(`${f.rel}: ${spec} (reaches into box ${box})`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
