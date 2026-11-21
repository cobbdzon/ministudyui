import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as auth from '../src/boxes/auth/index.js';
import * as vault from '../src/boxes/vault/index.js';
import * as scope from '../src/boxes/scope/index.js';
import { AppError } from '../src/boxes/errors.js';
import { userDbPath } from '../src/boxes/paths.js';

const TMP_BASE = '/tmp/opencode';
const COST = { kdfCost: { N: 16, r: 8, p: 1 } };
let tmp = '';
let oldDir: string | undefined;
let oldThrottle: string | undefined;

beforeEach(() => {
  tmp = mkdtempSync(join(TMP_BASE, 'ms-auth-'));
  oldDir = process.env.DATA_DIR;
  oldThrottle = process.env.AUTH_THROTTLE_BASE_MS;
  process.env.DATA_DIR = tmp;
  process.env.AUTH_THROTTLE_BASE_MS = '1';
  auth.open(join(tmp, 'auth.db'));
  auth.migrate();
});

afterEach(() => {
  auth.close();
  auth.resetAllThrottles();
  if (oldDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDir;
  if (oldThrottle === undefined) delete process.env.AUTH_THROTTLE_BASE_MS; else process.env.AUTH_THROTTLE_BASE_MS = oldThrottle;
  rmSync(tmp, { recursive: true, force: true });
});

async function makeUser(name: string, admin = false, passphrase = 'correct horse battery staple') {
  return auth.createUser({ username: name, passphrase, admin, ...COST });
}

describe('auth box', () => {
  test('auth.db schema, first-user admin and hasUsers', () => {
    expect(auth.hasUsers()).toBe(false);
    expect(auth.listUsers()).toEqual([]);
    expect(existsSync(join(tmp, 'auth.db'))).toBe(true);
  });

  test('create + login round trip; wraps contain no plaintext secrets', async () => {
    const canary = 'CANARY_PASSPHRASE_9f13aa77';
    const { user, recoveryKey } = await makeUser('alice', true, canary);
    expect(user.is_admin).toBe(1);
    expect(recoveryKey).toMatch(/^[A-Z2-7]{13}(-[A-Z2-7]{13}){3}$/);
    expect(auth.hasUsers()).toBe(true);
    const unlocked = await auth.login('alice', canary, '127.0.0.1', COST);
    expect(unlocked.userId).toBe(user.id);
    expect(unlocked.isAdmin).toBe(true);
    expect(unlocked.keys.enc.length).toBe(32);
    const bytes = readFileSync(join(tmp, 'auth.db'));
    expect(bytes.includes(Buffer.from(canary))).toBe(false);
    expect(bytes.includes(Buffer.from(recoveryKey))).toBe(false);
    expect(bytes.includes(Buffer.from(recoveryKey.replace(/-/g, '')))).toBe(false);
    expect(bytes.includes(Buffer.from(vault.parseRecoveryKey(recoveryKey)))).toBe(false); // raw key bytes
    // Only hashes/wraps are stored.
    expect(auth.listUsers()[0]).not.toHaveProperty('recovery_id');
  });

  test('unknown user and wrong passphrase are byte-identical and comparably slow', async () => {
    await makeUser('bob');
    const run = async (user: string, pass: string) => {
      const t0 = performance.now();
      try { await auth.login(user, pass, '127.0.0.1', COST); return { body: 'ok', ms: performance.now() - t0 }; }
      catch (e) {
        const a = e as AppError;
        return { body: JSON.stringify({ code: a.code, message: a.message }), ms: performance.now() - t0 };
      }
    };
    const unknown = await run('nobody', 'a wrong passphrase');
    const wrong = await run('bob', 'a wrong passphrase');
    expect(unknown.body).toBe(wrong.body);
    expect(unknown.body).toContain('Invalid credentials');
    expect(Math.max(unknown.ms, wrong.ms) / Math.max(0.01, Math.min(unknown.ms, wrong.ms))).toBeLessThan(10);
  });

  test('per-username and per-IP throttling kick in, and reset works', async () => {
    process.env.AUTH_THROTTLE_BASE_MS = '60000';
    await makeUser('carol');
    for (let i = 0; i < 3; i++) {
      await expect(auth.login('carol', 'wrong passphrase', '10.0.0.1', COST)).rejects.toThrow(/Invalid credentials/);
      await expect(auth.login(`ghost${i}`, 'wrong passphrase', '10.0.0.2', COST)).rejects.toThrow(/Invalid credentials/);
    }
    expect(auth.throttleDelayMs('carol', '10.0.0.1')).toBeGreaterThan(0);
    expect(auth.throttleDelayMs('ghost0', '10.0.0.2')).toBeGreaterThan(0);
    await expect(auth.login('carol', 'correct horse battery staple', '10.0.0.1', COST))
      .rejects.toThrow(/Too many attempts/);
    await expect(auth.login('someone', 'wrong passphrase', '10.0.0.2', COST))
      .rejects.toThrow(/Too many attempts/);
    auth.resetAllThrottles();
    expect((await auth.login('carol', 'correct horse battery staple', '10.0.0.1', COST)).userId).toBeGreaterThan(0);
  });

  test('passphrase change and recovery-key reset keep the same keys', async () => {
    const { user, recoveryKey } = await makeUser('dave');
    const before = (await auth.login('dave', 'correct horse battery staple', undefined, COST)).keys;
    await auth.changePassphrase(user.id, 'correct horse battery staple', 'a brand new passphrase', COST);
    await expect(auth.login('dave', 'correct horse battery staple', undefined, COST)).rejects.toThrow(/Invalid credentials/);
    const after = (await auth.login('dave', 'a brand new passphrase', undefined, COST)).keys;
    expect(Buffer.from(after.enc).toString('hex')).toBe(Buffer.from(before.enc).toString('hex'));
    expect(Buffer.from(after.idx).toString('hex')).toBe(Buffer.from(before.idx).toString('hex'));
    expect(await auth.recoverWithKey(recoveryKey, 'recovered passphrase', COST)).toEqual({ username: 'dave' });
    expect((await auth.login('dave', 'recovered passphrase', undefined, COST)).userId).toBe(user.id);
    await expect(auth.recoverWithKey('MSI-1-INVALID', 'another passphrase', COST)).rejects.toThrow(/Invalid credentials/);
  });

  test('invites are single-use, expiring, hash-only, and required for registration', async () => {
    const { user: admin } = await makeUser('admin', true);
    await expect(auth.registerWithInvite('msi-fake', 'eve', 'long passphrase here', COST))
      .rejects.toThrow(/Invite/);
    const { code } = await auth.createInvite(admin.id, 3600);
    expect(code.startsWith('msi-')).toBe(true);
    const invites = auth.listInvites();
    expect(invites).toHaveLength(1);
    expect(invites[0]).not.toHaveProperty('code_hash');
    const bytes = readFileSync(join(tmp, 'auth.db'));
    expect(bytes.includes(Buffer.from(code))).toBe(false);
    const created = await auth.registerWithInvite(code, 'eve', 'long passphrase here', COST);
    expect(created.user.is_admin).toBe(0);
    await expect(auth.registerWithInvite(code, 'fred', 'another long passphrase', COST)).rejects.toThrow(/Invite/);
    const expired = await auth.createInvite(admin.id, -1);
    await expect(auth.registerWithInvite(expired.code, 'fred', 'another long passphrase', COST))
      .rejects.toThrow(/Invite/);
  });

  test('disable blocks login and revokes tokens; enable restores login', async () => {
    const { user } = await makeUser('frank');
    const session = await auth.login('frank', 'correct horse battery staple', undefined, COST);
    const token = auth.createAgentToken(user.id, 'laptop', 'read', session.keys);
    auth.disableUser(user.id);
    await expect(auth.login('frank', 'correct horse battery staple', undefined, COST)).rejects.toThrow(/Invalid credentials/);
    expect(() => auth.unlockWithAgentToken(token.token)).toThrow(/Invalid token/);
    auth.enableUser(user.id);
    expect((await auth.login('frank', 'correct horse battery staple', undefined, COST)).userId).toBe(user.id);
    // Revocation is permanent: enabling the account must not resurrect the token.
    expect(() => auth.unlockWithAgentToken(token.token)).toThrow(/Invalid token/);
  });

  test('throttling is case-insensitive for usernames', async () => {
    process.env.AUTH_THROTTLE_BASE_MS = '60000';
    await makeUser('irmgard');
    for (const name of ['Irmgard', 'IRMGARD', 'irmgard']) {
      await expect(auth.login(name, 'wrong passphrase', '10.0.0.9', COST)).rejects.toThrow(/Invalid credentials/);
    }
    await expect(auth.login('IRMGARD', 'correct horse battery staple', '10.0.0.9', COST))
      .rejects.toThrow(/Too many attempts/);
    auth.resetAllThrottles();
  });

  test('concurrent registration with one invite succeeds exactly once', async () => {
    const { user: admin } = await makeUser('admin', true);
    const { code } = await auth.createInvite(admin.id, 3600);
    const results = await Promise.allSettled([
      auth.registerWithInvite(code, 'jake', 'a long passphrase one', COST),
      auth.registerWithInvite(code, 'jane', 'a long passphrase two', COST),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  test('deleteUser removes wraps and the per-user DB file', async () => {
    const { user } = await makeUser('grace');
    const file = userDbPath(user.id);
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(tmp, 'users'), { recursive: true });
    writeFileSync(file, 'fake');
    expect(existsSync(file)).toBe(true);
    auth.deleteUser(user.id);
    expect(existsSync(file)).toBe(false);
    expect(auth.listUsers().some((u) => u.id === user.id)).toBe(false);
    await expect(auth.login('grace', 'correct horse battery staple', undefined, COST)).rejects.toThrow(/Invalid credentials/);
  });
});

describe('agent tokens', () => {
  test('format, one-time secret, unlock, revoke, and failure indistinguishability', async () => {
    const { user } = await makeUser('heidi');
    const session = await auth.login('heidi', 'correct horse battery staple', undefined, COST);
    const created = auth.createAgentToken(user.id, 'claude', 'write', session.keys);
    expect(created.token).toMatch(/^msk_[0-9a-f]{16}\.[A-Za-z0-9_-]{43}$/);
    const bytes = readFileSync(join(tmp, 'auth.db'));
    const secret = created.token.split('.')[1];
    expect(bytes.includes(Buffer.from(secret))).toBe(false);
    const list = auth.listAgentTokens(user.id);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('wrap');
    expect(JSON.stringify(list)).not.toContain(secret);
    const unlocked = auth.unlockWithAgentToken(created.token);
    expect(unlocked.userId).toBe(user.id);
    expect(unlocked.mode).toBe('write');
    expect(Buffer.from(unlocked.keys.enc).toString('hex')).toBe(Buffer.from(session.keys.enc).toString('hex'));
    expect(Buffer.from(unlocked.keys.idx).toString('hex')).toBe(Buffer.from(session.keys.idx).toString('hex'));
    const failures = [
      'not-a-token',
      'msk_deadbeefdeadbeef.' + secret,
      created.token.replace('msk_', 'bad_'),
      created.token.slice(0, -1) + (secret.endsWith('A') ? 'B' : 'A'),
    ];
    const shapes = failures.map((t) => {
      try { auth.unlockWithAgentToken(t); return 'ok'; }
      catch (e) { const a = e as AppError; return JSON.stringify({ code: a.code, message: a.message }); }
    });
    expect(new Set(shapes).size).toBe(1);
    auth.revokeAgentToken(user.id, created.tokenId);
    expect(() => auth.unlockWithAgentToken(created.token)).toThrow(/Invalid token/);
  });

  test('a token for user A never yields user B keys', async () => {
    const a = await makeUser('ivan');
    const b = await makeUser('judy');
    const aSession = await auth.login('ivan', 'correct horse battery staple', undefined, COST);
    const bSession = await auth.login('judy', 'correct horse battery staple', undefined, COST);
    const tokenA = auth.createAgentToken(a.user.id, 'a', 'read', aSession.keys);
    const unlocked = auth.unlockWithAgentToken(tokenA.token);
    expect(unlocked.userId).toBe(a.user.id);
    expect(Buffer.from(unlocked.keys.enc).toString('hex')).not.toBe(Buffer.from(bSession.keys.enc).toString('hex'));
  });
});
