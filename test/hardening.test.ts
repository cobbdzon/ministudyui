// Regression tests for findings from the final adversarial review.
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as auth from '../src/boxes/auth/index.js';

describe('review hardening', () => {
  test('/mcp zeroes the unwrapped agent subkeys after each request', () => {
    const src = readFileSync('src/http/mcp.ts', 'utf8');
    expect(src).toMatch(/vault\.zero\(unlocked\.keys\.enc\)/);
    expect(src).toMatch(/vault\.zero\(unlocked\.keys\.idx\)/);
  });

  test('the SSE stream rechecks session validity while open', () => {
    const src = readFileSync('src/http/app.ts', 'utf8');
    expect(src).toMatch(/session\.get\(sid, config\.sessionTtlMinutes\)/);
    expect(src).toMatch(/user\.disabled_at\) \{ closed = true/);
  });

  test('invalid invite codes are rejected before any scrypt work', async () => {
    const tmp = mkdtempSync('/tmp/opencode/ms-hardening-');
    const old = process.env.DATA_DIR;
    process.env.DATA_DIR = tmp;
    try {
      auth.open(join(tmp, 'auth.db'));
      auth.migrate();
      await auth.createUser({
        username: 'admin', passphrase: 'default cost passphrase',
        admin: true, kdfCost: { N: 16, r: 8, p: 1 },
      });
      // Omit the cheap KDF override: a valid invite would cost two scrypt(2^17)
      // calls (~hundreds of ms). A random invite must fail in a few ms.
      const t0 = performance.now();
      await expect(auth.registerWithInvite('msi-not-a-real-invite-code', 'bob', 'a long passphrase'))
        .rejects.toThrow(/Invite/);
      expect(performance.now() - t0).toBeLessThan(150);
    } finally {
      auth.close();
      if (old === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = old;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('auth gate keeps password-manager behaviour and accessible feedback', () => {
    const app = readFileSync('web/app.ts', 'utf8');
    const css = readFileSync('web/scss/views.scss', 'utf8');
    const base = readFileSync('web/scss/components.scss', 'utf8');
    expect(app).toMatch(/'password', 'current-password'/);
    expect(app).toMatch(/'password', 'new-password'/);
    expect(app).toMatch(/data-toggle-for/);
    expect(app).toMatch(/aria-pressed/);
    expect(app).toMatch(/getModifierState\('CapsLock'\)/);
    expect(app).toMatch(/class="gate__error" role="alert"/);
    expect(app).toMatch(/copy\.unlocking/);
    expect(base).toMatch(/\.input:focus-visible/);
    expect(css).toMatch(/@media \(max-width: 720px\)/);
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
  });

  test('an SSE error confirms the session before showing the gate', () => {
    const src = readFileSync('web/api.ts', 'utf8');
    expect(src).toMatch(/es\.addEventListener\('error'/);
    expect(src).toMatch(/fetch\('\/api\/auth\/status'\)/);
    expect(src).toMatch(/new CustomEvent\('auth:locked'\)/);
  });

  test('mock mode has no circular ESM import with api.ts', () => {
    const src = readFileSync('web/api.mock.ts', 'utf8');
    expect(src).not.toMatch(/import\s*\{\s*ApiError\s*\}\s*from\s*['"]\.\/api\.js['"]/);
    expect(src).toMatch(/class ApiError extends Error/);
  });

  test('invite and recovery hash lookups use constant-time comparison', () => {
    const src = readFileSync('src/boxes/auth/index.ts', 'utf8');
    expect(src).toMatch(/vault\.constantTimeEqual\(Buffer\.from\(hash, 'hex'\), stored\)/);
    expect(src).toMatch(/vault\.constantTimeEqual\(\s*Buffer\.from\(rid, 'hex'\)/);
  });
});
