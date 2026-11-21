import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as vault from '../src/boxes/vault/index.js';
import * as scope from '../src/boxes/scope/index.js';

const KEYS = scope.devKeys();
const CTX = { userId: 1, db: null as never, keys: KEYS };
const inScope = <T>(fn: () => T): T => scope.run(CTX, fn);

describe('vault primitives', () => {
  test('HKDF-SHA256 matches RFC 5869 Appendix A test cases 1-3', () => {
    const hex = (s: string) => new Uint8Array(Buffer.from(s.replace(/\s/g, ''), 'hex'));
    const cases = [
      {
        ikm: hex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'),
        salt: hex('000102030405060708090a0b0c'),
        info: hex('f0f1f2f3f4f5f6f7f8f9'),
        len: 42,
        okm: '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
      },
      {
        ikm: hex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'),
        salt: new Uint8Array(0),
        info: new Uint8Array(0),
        len: 42,
        okm: '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8',
      },
    ];
    for (const c of cases) {
      expect(Buffer.from(vault.hkdfSha256(c.ikm, c.salt, c.info, c.len)).toString('hex')).toBe(c.okm);
    }
    // Test case 2 (80-byte inputs, 82-byte output) exercises multi-block expansion.
    const seq = (start: number, end: number) => Array.from({ length: end - start }, (_, i) => start + i);
    const ikm = hex(seq(0, 80).map((b) => b.toString(16).padStart(2, '0')).join(''));
    const salt = hex(seq(0x60, 0xb0).map((b) => b.toString(16).padStart(2, '0')).join(''));
    const info = hex(seq(0xb0, 0x100).map((b) => b.toString(16).padStart(2, '0')).join(''));
    expect(Buffer.from(vault.hkdfSha256(ikm, salt, info, 82)).toString('hex')).toBe(
      'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c' +
      '59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71' +
      'cc30c58179ec3e87c14c01d5c1f3434f1d87');
  });

  test('AES-256-GCM field round trip, nulls, and wrong-key rejection', () => {
    const ct = inScope(() => vault.seal('cards', 'front', '∫ x² dx — héllo $x$'));
    expect(ct).toMatch(/^enc1:[A-Za-z0-9_-]+$/);
    expect(ct).not.toContain('héllo');
    expect(inScope(() => vault.open('cards', 'front', ct))).toBe('∫ x² dx — héllo $x$');
    expect(inScope(() => vault.seal('cards', 'front', null))).toBeNull();
    expect(inScope(() => vault.open('cards', 'front', null))).toBeNull();
    const other: scope.UserContext = { userId: 1, db: null as never, keys: { enc: vault.randomBytes(32), idx: vault.randomBytes(32) } };
    expect(() => scope.run(other, () => vault.open('cards', 'front', ct!))).toThrow(/could not be verified/);
  });

  test('tampering with ciphertext, tag, nonce or AAD is rejected', () => {
    const flip = (value: string, offset: number): string => {
      const raw = Buffer.from(value.slice(5), 'base64url');
      raw[offset] ^= 1;
      return 'enc1:' + raw.toString('base64url');
    };
    const ct = inScope(() => vault.seal('decks', 'name', 'CANARY_DECK_NAME_SECRET'))!;
    expect(() => inScope(() => vault.open('decks', 'name', flip(ct, 15)))).toThrow();
    expect(() => inScope(() => vault.open('decks', 'name', flip(ct, Buffer.from(ct.slice(5), 'base64url').length - 1)))).toThrow();
    expect(() => inScope(() => vault.open('decks', 'name', flip(ct, 2)))).toThrow();
    // Moving the ciphertext to a different column must fail (AAD binding),
    // including a different column in the SAME table.
    expect(() => inScope(() => vault.open('cards', 'front', ct))).toThrow();
    const sameTable = inScope(() => vault.seal('cards', 'front', 'front text'))!;
    expect(() => inScope(() => vault.open('cards', 'back', sameTable))).toThrow();
    expect(inScope(() => vault.open('cards', 'front', sameTable))).toBe('front text');
    expect(vault.openRaw(KEYS.enc, 'decks.name', ct.slice(5))).toBeNull(); // malformed (no prefix) too
  });

  test('nonce uniqueness over 100k seals', () => {
    const nonces = new Set<string>();
    inScope(() => {
      for (let i = 0; i < 100_000; i++) {
        const raw = Buffer.from(vault.seal('cards', 'back', 'x')!.slice(5), 'base64url');
        nonces.add(raw.subarray(0, 12).toString('hex'));
      }
    });
    expect(nonces.size).toBe(100_000);
  });

  test('scrypt wrap round trip with injectable cost and wrong-credential rejection', async () => {
    const dek = vault.randomDek();
    const salt = vault.randomBytes(16);
    const spec: vault.WrapSpec = { ...vault.defaultWrapSpec('passphrase', salt, 7), N: 16, r: 8, p: 1 };
    const kek = await vault.deriveKek('correct horse battery staple', spec, { N: 16, r: 8, p: 1 });
    const wrap = vault.wrapDek(dek, kek, spec);
    expect(wrap).toMatch(/^enc1:/);
    const ok = vault.unwrapDek(wrap, kek, spec);
    expect(ok).not.toBeNull();
    expect(Buffer.from(ok!).toString('hex')).toBe(Buffer.from(dek).toString('hex'));
    const wrong = await vault.deriveKek('wrong passphrase', spec, { N: 16, r: 8, p: 1 });
    expect(vault.unwrapDek(wrap, wrong, spec)).toBeNull();
    // Moving a wrap to another user's AAD must fail.
    expect(vault.unwrapDek(wrap, kek, { ...spec, aad: 'wrap.passphrase.8' })).toBeNull();
    vault.zero(kek); vault.zero(wrong); vault.zero(dek);
  });

  test('recovery base32 format round-trips and rejects corrupt input', () => {
    const key = vault.randomBytes(32);
    const text = vault.formatRecoveryKey(key);
    expect(text).toMatch(/^[A-Z2-7]{13}(-[A-Z2-7]{13}){3}$/);
    expect(Buffer.from(vault.parseRecoveryKey(text)).toString('hex')).toBe(Buffer.from(key).toString('hex'));
    expect(Buffer.from(vault.parseRecoveryKey(text.toLowerCase().replace(/-/g, ' '))).toString('hex'))
      .toBe(Buffer.from(key).toString('hex'));
    expect(() => vault.parseRecoveryKey(text.slice(0, 5) + '0' + text.slice(6))).toThrow();
    expect(() => vault.parseRecoveryKey(text.slice(0, -1))).toThrow(); // too short
    // Non-zero padding in the final base32 character is invalid.
    const last = text[text.length - 1];
    const padded = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(last);
    expect(() => vault.parseRecoveryKey(text.slice(0, -1) + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[padded | 1])).toThrow();
  });

  test('constantTimeEqual is content- and length-independent', () => {
    const a = Buffer.from('secret-A');
    const b = Buffer.from('secret-A');
    const c = Buffer.from('secret-B');
    expect(vault.constantTimeEqual(a, b)).toBe(true);
    expect(vault.constantTimeEqual(a, c)).toBe(false);
    expect(vault.constantTimeEqual(a, Buffer.from('secret-A-longer'))).toBe(false);
    // Mechanical guard: the comparison must go through timingSafeEqual, not an
    // early-exit loop that would pass the boolean assertions above.
    expect(readFileSync('src/boxes/vault/index.ts', 'utf8')).toMatch(/timingSafeEqual\(ah, bh\)/);
  });

  test('no secret is compared with === or == in vault/auth/http source', () => {
    const dirs = [
      'src/boxes/vault/index.ts',
      'src/boxes/auth/index.ts',
      'src/http/app.ts',
      'src/http/mcp.ts',
    ];
    for (const file of dirs) {
      let src: string;
      try { src = readFileSync(file, 'utf8'); } catch { continue; } // not created yet in Phase 2
      for (const [i, line] of src.split('\n').entries()) {
        if (/^\s*(\/\/|\*)/.test(line) || line.includes('typeof ')) continue;
        expect(line, `${file}:${i + 1}`).not.toMatch(/(passphrase|password|secret|token|recovery|invite|apikey|hash)\w*\s*={2,3}\s*[a-zA-Z_'"]/i);
        expect(line, `${file}:${i + 1}`).not.toMatch(/={2,3}\s*['"][^'"]*(s3cr3t|hunter2|super[-_]?secret|password123)[^'"]*['"]/i);
      }
    }
  });
});
