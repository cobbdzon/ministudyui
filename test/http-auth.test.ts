// Phase 5: HTTP + auth matrix for the encrypted, multi-user build.
// Every assertion is boolean/scalar based so a failure never echoes a
// passphrase, recovery key, token, invite code, or content canary to output.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

process.env.PORT = '3000';
const { app, config } = await import('../src/http/app.js');
const { loadConfig } = await import('../src/http/config.js');
import * as store from '../src/boxes/store/index.js';
import * as auth from '../src/boxes/auth/index.js';
import * as userdb from '../src/boxes/userdb/index.js';
import * as scope from '../src/boxes/scope/index.js';
import * as vault from '../src/boxes/vault/index.js';
import * as library from '../src/boxes/library/index.js';
import * as changefeed from '../src/boxes/changefeed/index.js';
import * as session from '../src/http/session.js';
import { authDbPath, userDbPath } from '../src/boxes/paths.js';

type Db = Database;
type Json = { [key: string]: any };

const TMP_BASE = '/tmp/opencode';
const HOST = { host: '127.0.0.1:3000' };
const BASE_PASS = 'test passphrase long';
const COST = { kdfCost: { N: 16, r: 8, p: 1 } };
const RECOVERY_RE = /^[A-Z2-7]{13}(-[A-Z2-7]{13}){3}$/;
const TOKEN_RE = /^msk_[0-9a-f]{16}\.[A-Za-z0-9_-]{43}$/;
const rand = (): string => Math.random().toString(36).slice(2, 10);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const ENCRYPTED = new Set([
  'decks.name', 'decks.description',
  'cards.front', 'cards.back', 'cards.tags_json',
  'quizzes.title', 'quizzes.description',
  'questions.prompt', 'questions.choices_json', 'questions.answer_json', 'questions.explanation',
  'answers.response', 'answers.feedback',
]);
const PLAINTEXT = new Set([
  'decks.name_key', 'decks.created_at',
  'cards.source', 'cards.created_at', 'cards.updated_at',
  'card_state.due_at', 'card_state.last_reviewed_at',
  'reviews.reviewed_at', 'reviews.prev_state_json',
  'quizzes.source', 'quizzes.created_at',
  'questions.type', 'questions.position', 'questions.points',
  'attempts.started_at', 'attempts.submitted_at', 'attempts.status', 'attempts.question_order_json',
  'answers.grading_status', 'answers.graded_by', 'answers.graded_at',
  'ui_context.view', 'ui_context.updated_at',
  'changes.ts', 'changes.entity', 'changes.op',
]);

let tmp = '';
let db: Db;
let COOKIE = '';

type CallOpts = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  raw?: string;
  /** null = deliberately unauthenticated request */
  cookie?: string | null;
};

async function call(path: string, opts: CallOpts = {}) {
  const cookie = opts.cookie === null ? undefined : (opts.cookie ?? COOKIE);
  const headers: Record<string, string> = {
    ...HOST,
    ...(cookie ? { cookie } : {}),
    ...(opts.headers ?? {}),
  };
  let body = opts.raw;
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await app.request(path, { method: opts.method ?? 'GET', headers, body });
  const text = await res.text();
  let json: Json = {};
  try { json = JSON.parse(text) as Json; } catch { /* SSE / empty body */ }
  return { res, text, json };
}

async function makeUser(name: string, admin = false) {
  const passphrase = `passphrase for ${name} long`;
  const created = await auth.createUser({ username: name, passphrase, admin, ...COST });
  return { user: created.user, recoveryKey: created.recoveryKey, passphrase };
}

// Swap in a genuinely empty auth store so the public setup route can be
// exercised; restore the shared store afterwards. DATA_DIR is always a temp dir.
async function withFreshAuth<T>(fn: () => Promise<T>): Promise<T> {
  const savedDir = process.env.DATA_DIR;
  const originalAuth = join(tmp, 'auth.db');
  const fresh = mkdtempSync(join(TMP_BASE, 'ms-http-auth-fresh-'));
  session.clear();
  userdb.closeAll();
  auth.close();
  process.env.DATA_DIR = fresh;
  auth.open(join(fresh, 'auth.db'));
  auth.migrate();
  try {
    return await fn();
  } finally {
    auth.close();
    userdb.closeAll();
    session.clear();
    if (savedDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = savedDir;
    auth.open(originalAuth);
    auth.migrate();
    rmSync(fresh, { recursive: true, force: true });
  }
}

async function captureLogs(fn: () => Promise<void>): Promise<string> {
  const parts: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  const record = (chunk: unknown) => {
    parts.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8'));
  };
  const logSpy = ((...args: unknown[]) => { parts.push(args.map(String).join(' ')); }) as typeof console.log;
  const writeSpy = ((chunk: Uint8Array | string): boolean => { record(chunk); return true; }) as typeof process.stdout.write;
  console.log = logSpy;
  console.error = logSpy;
  process.stdout.write = writeSpy;
  process.stderr.write = writeSpy;
  try {
    await fn();
  } finally {
    console.log = origLog;
    console.error = origError;
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return parts.join('\n');
}

beforeAll(async () => {
  tmp = mkdtempSync(join(TMP_BASE, 'ms-http-auth-'));
  process.env.DATA_DIR = tmp;
  auth.open(join(tmp, 'auth.db'));
  auth.migrate();
  if (!auth.hasUsers()) {
    await auth.createUser({ username: 'tester', passphrase: BASE_PASS, admin: true, ...COST });
  }
});

afterAll(() => {
  session.clear();
  userdb.closeAll();
  auth.close();
  store.close();
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  session.clear();
  auth.resetAllThrottles();
  db = store.open(':memory:');
  store.migrate();
  COOKIE = `ms_session=${session.create({
    userId: 1, username: 'tester', isAdmin: true, keys: scope.devKeys(), db,
  })}`;
});

describe('session gate on every protected route', () => {
  it('returns 401 UNAUTHENTICATED without a session on all protected surfaces', async () => {
    for (const path of ['/api/decks', '/api/events', '/api/admin/users', '/api/agent-tokens', '/api/export']) {
      const { res, json } = await call(path, { cookie: null });
      expect(res.status, path).toBe(401);
      expect(json.code === 'UNAUTHENTICATED').toBe(true);
    }
    // Positive control: the same route is reachable with a session.
    const ok = await call('/api/decks');
    expect(ok.res.status).toBe(200);
  });
});

describe('host/origin and cookie hardening', () => {
  it('rejects a foreign Host and a disallowed Origin even on public auth routes', async () => {
    const badHost = await app.request('/api/auth/status', { headers: { host: 'evil.example' } });
    expect(badHost.status).toBe(403);
    expect((await badHost.json()).code === 'FORBIDDEN').toBe(true);

    const badOrigin = await app.request('/api/auth/status', {
      headers: { ...HOST, origin: 'http://evil.example' },
    });
    expect(badOrigin.status).toBe(403);
    expect((await badOrigin.json()).code === 'FORBIDDEN').toBe(true);

    const good = await app.request('/api/auth/status', { headers: HOST });
    expect(good.status).toBe(200);
  });

  it('sets Secure, HttpOnly, SameSite=Strict and Path=/ when PUBLIC_ORIGIN is https', async () => {
    const original = { ...config };
    const savedOrigin = process.env.PUBLIC_ORIGIN;
    process.env.PUBLIC_ORIGIN = 'https://study.example';
    const httpsConfig = loadConfig();
    try {
      expect(httpsConfig.secureCookie).toBe(true);
      expect(httpsConfig.isAllowedHost('study.example')).toBe(true);
      // Handlers capture `config` by object reference: assigning the freshly
      // loaded config is equivalent to booting the server with PUBLIC_ORIGIN.
      Object.assign(config, httpsConfig);
      const { res } = await call('/api/auth/login', {
        method: 'POST', body: { username: 'tester', passphrase: BASE_PASS },
      });
      expect(res.status).toBe(200);
      const setCookie = (res.headers.get('set-cookie') ?? '').toLowerCase();
      expect(setCookie.includes('ms_session=')).toBe(true);
      expect(setCookie.includes('secure')).toBe(true);
      expect(setCookie.includes('httponly')).toBe(true);
      expect(setCookie.includes('samesite=strict')).toBe(true);
      expect(setCookie.includes('path=/')).toBe(true);
    } finally {
      Object.assign(config, original);
      if (savedOrigin === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = savedOrigin;
      auth.resetAllThrottles();
    }
  }, 20000);
});

describe('login failure indistinguishability', () => {
  it('returns byte-identical 401 bodies for unknown user and wrong passphrase', async () => {
    auth.resetAllThrottles();
    const unknown = await call('/api/auth/login', {
      method: 'POST', body: { username: 'ghostuser', passphrase: 'a wrong passphrase' }, cookie: null,
    });
    const wrong = await call('/api/auth/login', {
      method: 'POST', body: { username: 'tester', passphrase: 'a wrong passphrase' }, cookie: null,
    });
    expect(unknown.res.status).toBe(401);
    expect(unknown.text === wrong.text).toBe(true);
    expect(unknown.text.includes('Invalid credentials')).toBe(true);
  }, 20000);

  it('only distinguishes the failure after the throttle threshold', async () => {
    auth.resetAllThrottles();
    const saved = process.env.AUTH_THROTTLE_BASE_MS;
    process.env.AUTH_THROTTLE_BASE_MS = '60000';
    try {
      const bodies: string[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await call('/api/auth/login', {
          method: 'POST', body: { username: 'tester', passphrase: 'wrong passphrase here' }, cookie: null,
        });
        expect(r.res.status).toBe(401);
        bodies.push(r.text);
      }
      expect(new Set(bodies).size).toBe(1);
      const throttled = await call('/api/auth/login', {
        method: 'POST', body: { username: 'tester', passphrase: BASE_PASS }, cookie: null,
      });
      expect(throttled.res.status).toBe(401);
      expect(throttled.text === bodies[0]).toBe(false);
      expect(throttled.text.includes('Too many attempts')).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.AUTH_THROTTLE_BASE_MS; else process.env.AUTH_THROTTLE_BASE_MS = saved;
      auth.resetAllThrottles();
    }
  }, 20000);
});

describe('account lifecycle over HTTP', () => {
  it('allows setup only with zero users and rejects a second setup with 409', async () => {
    await withFreshAuth(async () => {
      expect(auth.hasUsers()).toBe(false);
      const first = await call('/api/auth/setup', {
        method: 'POST',
        body: { username: 'firstuser', passphrase: `first user passphrase ${rand()}` },
        cookie: null,
      });
      expect(first.res.status).toBe(200);
      expect(first.json.ok === true).toBe(true);
      expect(RECOVERY_RE.test(String(first.json.recovery_key ?? ''))).toBe(true);
      expect(auth.hasUsers()).toBe(true);

      const second = await call('/api/auth/setup', {
        method: 'POST',
        body: { username: 'seconduser', passphrase: `second user passphrase ${rand()}` },
        cookie: null,
      });
      expect(second.res.status).toBe(409);
      expect(second.json.code === 'CONFLICT').toBe(true);
    });
  }, 30000);

  it('requires a valid, single-use, unexpired invite to register', async () => {
    const created = await call('/api/admin/invites', { method: 'POST', body: { ttl_seconds: 3600 } });
    expect(created.res.status).toBe(200);
    const code = String(created.json.code ?? '');
    expect(code.startsWith('msi-')).toBe(true);

    const registered = await call('/api/auth/register', {
      method: 'POST',
      body: { invite_code: code, username: 'reguser', passphrase: `registered passphrase ${rand()}` },
      cookie: null,
    });
    expect(registered.res.status).toBe(200);
    expect(registered.json.user?.is_admin === false).toBe(true);

    const reuse = await call('/api/auth/register', {
      method: 'POST',
      body: { invite_code: code, username: 'reuser', passphrase: `second passphrase ${rand()}` },
      cookie: null,
    });
    expect(reuse.res.status).toBe(400);
    expect(reuse.json.code === 'VALIDATION').toBe(true);

    const invalid = await call('/api/auth/register', {
      method: 'POST',
      body: { invite_code: 'msi-notreal', username: 'invalidu', passphrase: `third passphrase ${rand()}` },
      cookie: null,
    });
    expect(invalid.res.status).toBe(400);

    const expired = await auth.createInvite(1, -1);
    const expiredRes = await call('/api/auth/register', {
      method: 'POST',
      body: { invite_code: expired.code, username: 'expiredu', passphrase: `fourth passphrase ${rand()}` },
      cookie: null,
    });
    expect(expiredRes.res.status).toBe(400);
  }, 30000);

  it('resets the passphrase with the recovery key and invalidates the old one', async () => {
    const { user, recoveryKey, passphrase } = await makeUser(`recover${rand()}`);
    const newPass = `recovered passphrase ${rand()}`;
    const reset = await call('/api/auth/recover', {
      method: 'POST', body: { recovery_key: recoveryKey, passphrase: newPass }, cookie: null,
    });
    expect(reset.res.status).toBe(200);
    expect(reset.json.user?.username === user.username).toBe(true);

    auth.resetAllThrottles();
    const old = await call('/api/auth/login', {
      method: 'POST', body: { username: user.username, passphrase }, cookie: null,
    });
    expect(old.res.status).toBe(401);
    auth.resetAllThrottles();
    const fresh = await call('/api/auth/login', {
      method: 'POST', body: { username: user.username, passphrase: newPass }, cookie: null,
    });
    expect(fresh.res.status).toBe(200);
  }, 30000);

  it('invalidates the previous passphrase after change-passphrase', async () => {
    const { user, passphrase } = await makeUser(`change${rand()}`);
    const sessId = session.create({
      userId: user.id, username: user.username, isAdmin: false, keys: scope.devKeys(), db,
    });
    const newPass = `changed passphrase ${rand()}`;
    const changed = await call('/api/auth/change-passphrase', {
      method: 'POST',
      body: { current_passphrase: passphrase, new_passphrase: newPass },
      cookie: `ms_session=${sessId}`,
    });
    expect(changed.res.status).toBe(200);

    auth.resetAllThrottles();
    const old = await call('/api/auth/login', {
      method: 'POST', body: { username: user.username, passphrase }, cookie: null,
    });
    expect(old.res.status).toBe(401);
    auth.resetAllThrottles();
    const fresh = await call('/api/auth/login', {
      method: 'POST', body: { username: user.username, passphrase: newPass }, cookie: null,
    });
    expect(fresh.res.status).toBe(200);
  }, 30000);
});

describe('authorization gates', () => {
  it('denies a non-admin session on /api/admin/*', async () => {
    const { user } = await makeUser(`nonadmin${rand()}`);
    const sessId = session.create({
      userId: user.id, username: user.username, isAdmin: false, keys: scope.devKeys(), db,
    });
    for (const path of ['/api/admin/users', '/api/admin/invites']) {
      const r = await call(path, { cookie: `ms_session=${sessId}` });
      expect(r.res.status, path).toBe(403);
      expect(r.json.code === 'FORBIDDEN').toBe(true);
    }
  });

  it('rejects a disabled user on the next protected request', async () => {
    const { user } = await makeUser(`disabled${rand()}`);
    const sessId = session.create({
      userId: user.id, username: user.username, isAdmin: false, keys: scope.devKeys(), db,
    });
    const before = await call('/api/decks', { cookie: `ms_session=${sessId}` });
    expect(before.res.status).toBe(200);

    auth.disableUser(user.id);
    const after = await call('/api/decks', { cookie: `ms_session=${sessId}` });
    expect(after.res.status).toBe(401);
    expect(after.json.code === 'UNAUTHENTICATED').toBe(true);
    expect(session.get(sessId, 720) === null).toBe(true);
  });
});

describe('agent tokens over HTTP', () => {
  it('returns the secret once, omits it from lists, and revokes it', async () => {
    const created = await call('/api/agent-tokens', {
      method: 'POST', body: { label: `token-${rand()}`, read_only: false },
    });
    expect(created.res.status).toBe(200);
    const token = String(created.json.token ?? '');
    const tokenId = String(created.json.tokenId ?? '');
    const secret = token.split('.')[1] ?? '';
    expect(TOKEN_RE.test(token)).toBe(true);
    expect(auth.unlockWithAgentToken(token).userId).toBe(1);

    const listed = await call('/api/agent-tokens');
    expect(listed.res.status).toBe(200);
    expect(Array.isArray(listed.json.tokens)).toBe(true);
    expect(listed.json.tokens.some((t: Json) => t.token_id === tokenId)).toBe(true);
    expect(listed.text.includes(token)).toBe(false);
    expect(listed.text.includes(secret)).toBe(false);
    expect(listed.text.includes('wrap')).toBe(false);

    const revoked = await call(`/api/agent-tokens/${tokenId}`, { method: 'DELETE' });
    expect(revoked.res.status).toBe(200);
    let rejected = false;
    try { auth.unlockWithAgentToken(token); } catch { rejected = true; }
    expect(rejected).toBe(true);
  });
});

describe('plaintext export endpoint', () => {
  it('returns a decrypted bundle with exported_at, srs and attempts', async () => {
    const name = `Export Deck ${rand()}`;
    const deck = await call('/api/decks', { method: 'POST', body: { name, description: 'd' } });
    expect(deck.res.status).toBe(200);
    const deckId = deck.json.deck.id;

    const card = await call('/api/cards', {
      method: 'POST', body: { deck: deckId, cards: [{ front: 'f', back: 'b' }] },
    });
    expect(card.res.status).toBe(200);
    const cardId = card.json.card_ids[0];

    const reviewed = await call('/api/review', { method: 'POST', body: { card_id: cardId, rating: 3 } });
    expect(reviewed.res.status).toBe(200);

    const quiz = await call('/api/quizzes', {
      method: 'POST',
      body: { title: 'Export Quiz', questions: [{ type: 'short', prompt: 'p', reference: 'r' }] },
    });
    expect(quiz.res.status).toBe(200);
    const quizId = quiz.json.id;
    const withQuestion = await call(`/api/quizzes/${quizId}`);
    const questionId = withQuestion.json.questions[0].id;

    const started = await call('/api/attempts', { method: 'POST', body: { quiz_id: quizId } });
    expect(started.res.status).toBe(200);
    const attemptId = started.json.id;
    const answered = await call(`/api/attempts/${attemptId}/answers/${questionId}`, {
      method: 'PATCH', body: { response: 'answer' },
    });
    expect(answered.res.status).toBe(200);

    const exported = await call('/api/export');
    expect(exported.res.status).toBe(200);
    expect(typeof exported.json.exported_at === 'string').toBe(true);
    expect(Array.isArray(exported.json.srs)).toBe(true);
    expect(exported.json.srs.length > 0).toBe(true);
    expect(Array.isArray(exported.json.attempts)).toBe(true);
    expect(exported.json.attempts.length > 0).toBe(true);
    expect(exported.json.decks[0].name === name).toBe(true);
  }, 20000);
});

describe('per-user changefeed isolation', () => {
  it('never delivers user A changes to a session on a different user DB', async () => {
    const dbA = db;
    const dbB = new Database(':memory:');
    store.migrateDb(dbB);
    const idA = session.create({ userId: 1, username: 'tester', isAdmin: true, keys: scope.devKeys(), db: dbA });
    const idB = session.create({ userId: 1, username: 'tester', isAdmin: true, keys: scope.devKeys(), db: dbB });
    const sA = session.get(idA, 720)!;
    const sB = session.get(idB, 720)!;
    const ctxA = { userId: sA.userId, db: sA.db, keys: sA.keys };
    const ctxB = { userId: sB.userId, db: sB.db, keys: sB.keys };
    const seenA: string[] = [];
    const seenB: string[] = [];
    let unsubA: (() => void) | undefined;
    let unsubB: (() => void) | undefined;
    try {
      unsubA = scope.run(ctxA, () => changefeed.subscribe((c) => seenA.push(`${c.entity}:${c.entity_id}:${c.op}`)));
      unsubB = scope.run(ctxB, () => changefeed.subscribe((c) => seenB.push(`${c.entity}:${c.entity_id}:${c.op}`)));
      const deck = scope.run(ctxA, () => library.deckCreate({ name: `SSE-${rand()}` }));
      await sleep(1200);
      expect(seenA.length > 0).toBe(true);
      expect(seenA.some((e) => e === `deck:${deck.id}:insert`)).toBe(true);
      expect(seenB.length).toBe(0);
      const bCount = (dbB.prepare('SELECT COUNT(*) AS n FROM changes').get() as { n: number }).n;
      expect(bCount).toBe(0);
    } finally {
      unsubA?.();
      unsubB?.();
      session.destroy(idA);
      session.destroy(idB);
      dbB.close();
    }
  }, 5000);
});

describe('secrets never reach logs', () => {
  it('prints no passphrase, recovery key, agent token or canary during setup/login/recover/token creation', async () => {
    const canary = `CANARY_LOG_${rand()}`;
    const pass = `${canary}_passphrase_long`;
    const newPass = `${canary}_recovered_long`;
    let captured = '';
    let token = '';
    let recoveryKey = '';
    await withFreshAuth(async () => {
      captured = await captureLogs(async () => {
        // Proof that the spies were actually installed: this benign marker
        // must land in the buffer, not in the real test output.
        console.log('capture-spy-selftest');
        const setup = await call('/api/auth/setup', {
          method: 'POST', body: { username: 'loguser', passphrase: pass }, cookie: null,
        });
        expect(setup.res.status).toBe(200);
        recoveryKey = String(setup.json.recovery_key ?? '');
        const cookie = (setup.res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
        expect(cookie.startsWith('ms_session=')).toBe(true);

        const login = await call('/api/auth/login', {
          method: 'POST', body: { username: 'loguser', passphrase: pass }, cookie: null,
        });
        expect(login.res.status).toBe(200);

        const recovered = await call('/api/auth/recover', {
          method: 'POST', body: { recovery_key: recoveryKey, passphrase: newPass }, cookie: null,
        });
        expect(recovered.res.status).toBe(200);

        const created = await call('/api/agent-tokens', {
          method: 'POST', body: { label: canary }, cookie,
        });
        expect(created.res.status).toBe(200);
        token = String(created.json.token ?? '');
      });
    });

    expect(RECOVERY_RE.test(recoveryKey)).toBe(true);
    expect(TOKEN_RE.test(token)).toBe(true);
    const secret = token.split('.')[1] ?? '';
    expect(secret.length > 0).toBe(true);
    const rawRecovery = Buffer.from(vault.parseRecoveryKey(recoveryKey));

    expect(captured.includes('capture-spy-selftest')).toBe(true);
    expect(captured.includes(pass)).toBe(false);
    expect(captured.includes(newPass)).toBe(false);
    expect(captured.includes(canary)).toBe(false);
    expect(captured.includes(recoveryKey)).toBe(false);
    expect(captured.includes(recoveryKey.replace(/-/g, ''))).toBe(false);
    expect(captured.includes(rawRecovery.toString('hex'))).toBe(false);
    expect(captured.includes(rawRecovery.toString('latin1'))).toBe(false);
    expect(captured.includes(token)).toBe(false);
    expect(captured.includes(secret)).toBe(false);
  }, 60000);
});

describe('HTTP write-path canaries', () => {
  it('keeps deck/card/quiz/answer/export canaries out of raw user and auth DB bytes', async () => {
    const { user } = await makeUser(`canaryhttp${rand()}`);
    userdb.closeAll();
    const fileDb = userdb.open(user.id);
    const sessId = session.create({
      userId: user.id, username: user.username, isAdmin: false,
      keys: scope.devKeys(), db: fileDb,
    });
    const cookie = `ms_session=${sessId}`;
    const c = {
      deck: `CANARY_HTTP_DECK_${rand()}`,
      deckDesc: `CANARY_HTTP_DESC_${rand()}`,
      front: `CANARY_HTTP_FRONT_${rand()}`,
      back: `CANARY_HTTP_BACK_${rand()}`,
      tag: `CANARY_HTTP_TAG_${rand()}`,
      quiz: `CANARY_HTTP_QUIZ_${rand()}`,
      quizDesc: `CANARY_HTTP_QDESC_${rand()}`,
      prompt: `CANARY_HTTP_PROMPT_${rand()}`,
      reference: `CANARY_HTTP_REF_${rand()}`,
      response: `CANARY_HTTP_RESPONSE_${rand()}`,
      feedback: `CANARY_HTTP_FEEDBACK_${rand()}`,
    };
    try {
      const deck = await call('/api/decks', {
        method: 'POST', body: { name: c.deck, description: c.deckDesc }, cookie,
      });
      expect(deck.res.status).toBe(200);
      const deckId = deck.json.deck.id;

      const card = await call('/api/cards', {
        method: 'POST',
        body: { deck: deckId, cards: [{ front: c.front, back: c.back, tags: [c.tag] }] },
        cookie,
      });
      expect(card.res.status).toBe(200);

      const quiz = await call('/api/quizzes', {
        method: 'POST',
        body: {
          title: c.quiz, description: c.quizDesc,
          questions: [{ type: 'short', prompt: c.prompt, reference: c.reference }],
        },
        cookie,
      });
      expect(quiz.res.status).toBe(200);
      const quizId = quiz.json.id;
      const withQuestion = await call(`/api/quizzes/${quizId}`, { cookie });
      const questionId = withQuestion.json.questions[0].id;

      const started = await call('/api/attempts', { method: 'POST', body: { quiz_id: quizId }, cookie });
      expect(started.res.status).toBe(200);
      const attemptId = started.json.id;
      const answered = await call(`/api/attempts/${attemptId}/answers/${questionId}`, {
        method: 'PATCH', body: { response: c.response }, cookie,
      });
      expect(answered.res.status).toBe(200);
      const submitted = await call(`/api/attempts/${attemptId}/submit`, { method: 'POST', cookie });
      expect(submitted.res.status).toBe(200);
      const pending = await call('/api/grading/pending', { cookie });
      expect(pending.res.status).toBe(200);
      const answerId = pending.json.answers[0].answer_id;
      const graded = await call(`/api/grading/${answerId}`, {
        method: 'POST', body: { points: 1, feedback: c.feedback }, cookie,
      });
      expect(graded.res.status).toBe(200);

      // The export path must decrypt, not persist, the plaintext canaries.
      const exported = await call('/api/export', { cookie });
      expect(exported.res.status).toBe(200);
      expect(exported.json.decks[0].name === c.deck).toBe(true);
      expect(exported.json.attempts[0].answers[0].response === c.response).toBe(true);

      fileDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      const userFile = userDbPath(user.id);
      const paths = [userFile, `${userFile}-wal`, `${userFile}-shm`, authDbPath()];
      const blobs = paths.filter((p) => existsSync(p)).map((p) => readFileSync(p));
      expect(blobs.length >= 2).toBe(true);
      for (const [name, value] of Object.entries(c)) {
        for (const [i, blob] of blobs.entries()) {
          expect(blob.includes(Buffer.from(value)), `${name} found in raw DB blob ${i}`).toBe(false);
        }
      }

      // Column coverage: every TEXT column in the HTTP-written DB is either
      // sealed ciphertext or an explicitly allow-listed metadata column.
      const tables = fileDb.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      ).all() as Array<{ name: string }>;
      let checked = 0;
      for (const { name: table } of tables) {
        const cols = fileDb.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; type: string }>;
        for (const col of cols) {
          if (col.type.toUpperCase() !== 'TEXT') continue;
          const key = `${table}.${col.name}`;
          expect(ENCRYPTED.has(key) || PLAINTEXT.has(key), `unclassified TEXT column ${key}`).toBe(true);
          if (!ENCRYPTED.has(key)) continue;
          const rows = fileDb.prepare(`SELECT ${col.name} AS v FROM ${table}`).all() as Array<{ v: string | null }>;
          for (const row of rows) {
            expect(row.v === null || row.v.startsWith('enc1:'), `${key} holds plaintext`).toBe(true);
          }
          checked++;
        }
      }
      expect(checked).toBe(ENCRYPTED.size);
    } finally {
      session.destroy(sessId);
      userdb.closeAll();
    }
  }, 30000);
});
