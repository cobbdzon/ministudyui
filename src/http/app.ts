import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppError, asAppError, type ErrorCode } from '../boxes/errors.js';
import * as library from '../boxes/library/index.js';
import * as study from '../boxes/study/index.js';
import * as attempts from '../boxes/attempts/index.js';
import * as changefeed from '../boxes/changefeed/index.js';
import * as latex from '../boxes/latex/index.js';
import * as context from '../boxes/context/index.js';
import * as auth from '../boxes/auth/index.js';
import * as scope from '../boxes/scope/index.js';
import * as userdb from '../boxes/userdb/index.js';
import * as exporter from '../boxes/export/index.js';
import { REPO_ROOT } from '../boxes/paths.js';
import { serveStatic } from './static.js';
import { v } from './validate.js';
import { config } from './config.js';
import { handleMcp } from './mcp.js';
import * as session from './session.js';
import type { AttemptRow, AnswerRow, DeckRef } from '../../shared/types.js';
import * as S from '../../shared/schemas.js';

type ErrStatus = 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500;
const STATUS: Record<ErrorCode, ErrStatus> = {
  VALIDATION: 400, FORBIDDEN: 403, UNAUTHENTICATED: 401,
  NOT_FOUND: 404, CONFLICT: 409, INTERNAL: 500, ERROR: 500,
};

const COOKIE = 'ms_session';

// The import map is the only inline script. Hash it at startup so CSP can stay
// free of 'unsafe-inline' even when the import map changes.
const importMapHash = (() => {
  try {
    const html = readFileSync(join(REPO_ROOT, 'web', 'index.html'), 'utf8');
    const m = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
    return m ? createHash('sha256').update(m[1]!).digest('base64') : '';
  } catch { return ''; }
})();
const CSP = [
  "default-src 'self'",
  `script-src 'self'${importMapHash ? ` 'sha256-${importMapHash}'` : ''}`,
  "style-src 'self'", "img-src 'self' data:", "font-src 'self'", "connect-src 'self'",
  "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
].join('; ');

const app = new Hono();

// 1 — Host/Origin + security headers on every response, including static + SSE.
app.use('*', async (c, next) => {
  const host = c.req.header('host') ?? '';
  if (!config.isAllowedHost(host)) {
    return c.json({ code: 'FORBIDDEN', message: 'bad host/origin' }, 403);
  }
  const origin = c.req.header('origin');
  if (origin && !config.isAllowedOrigin(origin)) {
    return c.json({ code: 'FORBIDDEN', message: 'bad host/origin' }, 403);
  }
  c.header('Content-Security-Policy', CSP);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Frame-Options', 'DENY');
  if (config.secureCookie) c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  await next();
});

const PUBLIC_AUTH = new Set([
  '/api/auth/status', '/api/auth/setup', '/api/auth/login',
  '/api/auth/logout', '/api/auth/recover', '/api/auth/register',
]);
const rateBuckets = new Map<string, { count: number; reset: number }>();
const RATE_MAX = 600;
const RATE_WINDOW = 60_000;

// 2 — Session gate for every non-public /api route, then scope.run for boxes.
app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  if (PUBLIC_AUTH.has(path)) return next();
  const method = c.req.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const ct = (c.req.header('content-type') ?? '').toLowerCase();
    const len = Number(c.req.header('content-length') ?? 0);
    // A mutating request with no body and no content-type is fine (e.g. submit).
    if ((ct && !ct.startsWith('application/json')) || (len > 0 && !ct.startsWith('application/json'))) {
      return c.json({ code: 'VALIDATION', message: 'application/json required', field: 'content-type' }, 400);
    }
    if (len > 2 * 1024 * 1024) {
      return c.json({ code: 'VALIDATION', message: 'request body too large' }, 413);
    }
  }
  const s = session.get(getCookie(c, COOKIE), config.sessionTtlMinutes);
  if (!s) return c.json({ code: 'UNAUTHENTICATED', message: 'Authentication required' }, 401);
  const user = auth.listUsers().find((u) => u.id === s.userId);
  if (!user || user.disabled_at) {
    session.destroy(s.id);
    return c.json({ code: 'UNAUTHENTICATED', message: 'Authentication required' }, 401);
  }
  const bucketKey = `${s.userId}:${Math.floor(Date.now() / RATE_WINDOW)}`;
  const bucket = rateBuckets.get(bucketKey) ?? { count: 0, reset: Date.now() + RATE_WINDOW };
  if (bucket.count >= RATE_MAX) return c.json({ code: 'FORBIDDEN', message: 'rate limit exceeded' }, 429);
  bucket.count++; rateBuckets.set(bucketKey, bucket);
  if (rateBuckets.size > 1000) rateBuckets.clear();
  if (path.startsWith('/api/admin/') && !user.is_admin) {
    return c.json({ code: 'FORBIDDEN', message: 'admin only' }, 403);
  }
  return scope.run({ userId: s.userId, db: s.db, keys: s.keys }, async () => { await next(); });
});

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ code: 'VALIDATION', message: err.message }, 400);
  }
  const e = asAppError(err);
  if (!(err instanceof AppError)) console.error('[error]', e.code);
  return c.json({ code: e.code, message: e.message, field: e.field, hint: e.hint }, STATUS[e.code]);
});

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ code: 'NOT_FOUND', message: 'route not found' }, 404);
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return serveStatic(c);
  return c.json({ code: 'NOT_FOUND', message: 'route not found' }, 404);
});

function parseDeck(raw?: string): DeckRef | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  return Number.isNaN(Number(raw)) ? raw : Number(raw);
}
function parseId(raw: string): number {
  if (!/^\d+$/.test(raw)) throw new AppError('NOT_FOUND', 'route not found');
  return Number(raw);
}
function currentSession(c: Parameters<typeof getCookie>[0]): session.Session | null {
  return session.get(getCookie(c, COOKIE), config.sessionTtlMinutes);
}
function clientIp(c: Parameters<typeof getCookie>[0]): string {
  if (config.trustProxy) {
    return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  }
  const env = c.env as { requestIP?: (r: Request) => { hostname: string } } | undefined;
  return env?.requestIP?.(c.req.raw)?.hostname ?? 'unknown';
}
function setSessionCookie(c: Parameters<typeof setCookie>[0], id: string): void {
  setCookie(c, COOKIE, id, {
    httpOnly: true, sameSite: 'Strict', path: '/', secure: config.secureCookie,
    maxAge: config.sessionTtlMinutes * 60,
  });
}
function openSessionFor(userId: number, username: string, isAdmin: boolean, keys: scope.UserKeys): string {
  return session.create({ userId, username, isAdmin, keys, db: userdb.open(userId) });
}

const routes = app
  // ---- MCP (own bearer-token auth; not a cookie session route) --------------
  .all('/mcp', (c) => handleMcp(c))
  // ---- public auth ----------------------------------------------------------
  .get('/api/auth/status', (c) => {
    const s = currentSession(c);
    return c.json({
      status: !auth.hasUsers() ? 'setup' : s ? 'unlocked' : 'locked',
      user: s ? { username: s.username, is_admin: s.isAdmin } : null,
    });
  })
  .post('/api/auth/setup', v('json', S.SetupSchema), async (c) => {
    if (auth.hasUsers()) throw new AppError('CONFLICT', 'Setup already completed');
    const b = c.req.valid('json');
    const created = await auth.createUser({ username: b.username, passphrase: b.passphrase, admin: true });
    const unlocked = await auth.login(b.username, b.passphrase, clientIp(c));
    const id = openSessionFor(unlocked.userId, unlocked.username, unlocked.isAdmin, unlocked.keys);
    setSessionCookie(c, id);
    return c.json({ ok: true as const, recovery_key: created.recoveryKey, user: { username: b.username, is_admin: true } });
  })
  .post('/api/auth/login', v('json', S.LoginSchema), async (c) => {
    const b = c.req.valid('json');
    const unlocked = await auth.login(b.username, b.passphrase, clientIp(c));
    const id = openSessionFor(unlocked.userId, unlocked.username, unlocked.isAdmin, unlocked.keys);
    setSessionCookie(c, id);
    return c.json({ ok: true as const, user: { username: unlocked.username, is_admin: unlocked.isAdmin } });
  })
  .post('/api/auth/logout', (c) => {
    const id = getCookie(c, COOKIE);
    if (id) session.destroy(id);
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true as const });
  })
  .post('/api/auth/recover', v('json', S.RecoverSchema), async (c) => {
    const b = c.req.valid('json');
    const result = await auth.recoverWithKey(b.recovery_key, b.passphrase);
    return c.json({ ok: true as const, user: result });
  })
  .post('/api/auth/register', v('json', S.RegisterSchema), async (c) => {
    const b = c.req.valid('json');
    const result = await auth.registerWithInvite(b.invite_code, b.username, b.passphrase);
    return c.json({ ok: true as const, user: { username: result.user.username, is_admin: false } });
  })
  .post('/api/auth/change-passphrase', v('json', S.ChangePassphraseSchema), async (c) => {
    const s = currentSession(c);
    if (!s) throw new AppError('UNAUTHENTICATED', 'Authentication required');
    const b = c.req.valid('json');
    await auth.changePassphrase(s.userId, b.current_passphrase, b.new_passphrase);
    return c.json({ ok: true as const });
  })

  // ---- admin ----------------------------------------------------------------
  .get('/api/admin/users', (c) => c.json({ users: auth.listUsers() }))
  .get('/api/admin/invites', (c) => c.json({ invites: auth.listInvites() }))
  .post('/api/admin/invites', v('json', S.CreateInviteSchema), async (c) => {
    const s = currentSession(c)!;
    const b = c.req.valid('json');
    const invite = await auth.createInvite(s.userId, b.ttl_seconds);
    return c.json({ ok: true as const, code: invite.code, expires_at: invite.expiresAt });
  })
  .patch('/api/admin/users/:id', v('json', S.SetDisabledSchema), (c) => {
    const id = parseId(c.req.param('id'));
    const disabled = c.req.valid('json').disabled;
    if (disabled) auth.disableUser(id); else auth.enableUser(id);
    if (disabled) session.destroyAllForUser(id);
    return c.json({ ok: true as const });
  })
  .delete('/api/admin/users/:id', (c) => {
    const id = parseId(c.req.param('id'));
    session.destroyAllForUser(id);
    auth.deleteUser(id);
    return c.json({ ok: true as const });
  })

  // ---- agent tokens ---------------------------------------------------------
  .get('/api/agent-tokens', (c) => {
    const s = currentSession(c)!;
    return c.json({ tokens: auth.listAgentTokens(s.userId) });
  })
  .post('/api/agent-tokens', v('json', S.AgentTokenCreateSchema), (c) => {
    const s = currentSession(c)!;
    const b = c.req.valid('json');
    const token = auth.createAgentToken(s.userId, b.label, b.read_only ? 'read' : 'write', s.keys);
    return c.json({
      ok: true as const, token: token.token, token_id: token.tokenId,
      label: token.label, mode: token.mode, created_at: token.createdAt,
    });
  })
  .delete('/api/agent-tokens/:id', (c) => {
    const s = currentSession(c)!;
    auth.revokeAgentToken(s.userId, c.req.param('id'));
    return c.json({ ok: true as const });
  })

  // ---- export (plaintext warning is shown by the UI) ------------------------
  .get('/api/export', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json(exporter.bundle());
  })

  // ---- SSE event stream -----------------------------------------------------
  .get('/api/events', (c) => streamSSE(c, async (stream) => {
    let closed = false;
    const sid = getCookie(c, COOKIE);
    const unsub = changefeed.subscribe((change) => {
      if (closed) return;
      void stream.writeSSE({
        event: 'change',
        data: JSON.stringify({ entity: change.entity, id: change.entity_id, op: change.op }),
      });
    });
    const beat = setInterval(() => { if (!closed) void stream.write(':\n\n'); }, 20_000);
    // A long-lived stream must not outlive the session it was opened with:
    // logout, TTL expiry, disable or deletion ends the feed too.
    const revoke = setInterval(() => {
      const s = session.get(sid, config.sessionTtlMinutes);
      const user = s ? auth.listUsers().find((u) => u.id === s.userId) : null;
      if (!s || !user || user.disabled_at) { closed = true; clearInterval(beat); clearInterval(revoke); unsub(); }
    }, 1000);
    stream.onAbort(() => { closed = true; clearInterval(beat); clearInterval(revoke); unsub(); });
    while (!closed) await stream.sleep(1000);
  }))
  // decks
  .get('/api/decks', (c) => c.json({ decks: study.deckSummaries() }))
  .post('/api/decks', v('json', S.DeckCreateSchema), (c) =>
    c.json({ ok: true as const, deck: library.deckCreate(c.req.valid('json')) }))
  .delete('/api/decks/:id', v('json', S.DeckDeleteSchema), (c) => {
    const b = c.req.valid('json');
    return c.json(library.deckDelete({
      deck: parseId(c.req.param('id')), confirmName: b.confirm_name, deleteQuizzes: !!b.delete_quizzes,
    }));
  })
  .patch('/api/decks/:id', v('json', S.DeckUpdateSchema), (c) => {
    const b = c.req.valid('json');
    return c.json(library.deckUpdate({
      deck: parseId(c.req.param('id')), name: b.name, description: b.description,
    }));
  })
  // cards
  .get('/api/cards', v('query', S.CardQuerySchema), (c) => {
    const q = c.req.valid('query');
    return c.json(library.cardSearch({
      query: q.q, deck: parseDeck(q.deck), tag: q.tag, source: q.source,
      limit: Number(q.limit || 0) || 20, offset: Number(q.offset || 0) || 0,
    }));
  })
  .post('/api/cards', v('json', S.CardAddSchema), (c) =>
    c.json(library.cardAdd(c.req.valid('json'))))
  .patch('/api/cards/:id', v('json', S.CardPatchSchema), (c) =>
    c.json(library.cardUpdate({ cardId: parseId(c.req.param('id')), ...c.req.valid('json') })))
  .patch('/api/cards/:id/schedule', v('json', S.CardScheduleSchema), (c) => {
    const b = c.req.valid('json');
    return c.json(study.cardSchedule({
      cardId: parseId(c.req.param('id')),
      adjustMinutes: b.adjust_minutes,
      dueNow: b.due_now,
      ignored: b.ignored,
    }));
  })
  .delete('/api/cards', v('json', S.CardDeleteSchema), (c) =>
    c.json(library.cardDelete({ cardIds: c.req.valid('json').card_ids })))
  // review
  .get('/api/review/queue', v('query', S.ReviewQueueQuerySchema), (c) => {
    const q = c.req.valid('query');
    return c.json({ cards: study.queue({ deck: parseDeck(q.deck) ?? 0, limit: Number(q.limit || 0) || 10 }) });
  })
  .post('/api/review', v('json', S.ReviewSchema), (c) => {
    const b = c.req.valid('json');
    return c.json(study.review({ cardId: b.card_id, rating: b.rating }));
  })
  .post('/api/review/undo', (c) => c.json(study.undo()))
  // quizzes
  .get('/api/quizzes', v('query', S.QuizListQuerySchema), (c) => {
    const q = c.req.valid('query');
    return c.json({ quizzes: library.quizList({ deck: parseDeck(q.deck), limit: Number(q.limit || 0) || 50 }) });
  })
  .get('/api/quizzes/:id', v('query', S.QuizGetQuerySchema), (c) =>
    c.json(library.quizGet({
      quizId: parseId(c.req.param('id')), includeAnswers: c.req.valid('query').include_answers !== 'false',
    })))
  .post('/api/quizzes', v('json', S.QuizCreateSchema), (c) =>
    c.json(library.quizCreate(c.req.valid('json'))))
  .patch('/api/quizzes/:id', v('json', S.QuizUpdateSchema), (c) => {
    const b = c.req.valid('json');
    return c.json(library.quizUpdate({
      quizId: parseId(c.req.param('id')), title: b.title, description: b.description,
      deck: b.deck, source: b.source, shuffle: b.shuffle,
    }));
  })
  .delete('/api/quizzes/:id', v('json', S.QuizDeleteSchema), (c) => {
    const b = c.req.valid('json');
    return c.json(library.quizDelete({
      quizId: parseId(c.req.param('id')), confirmTitle: b.confirm_title, deleteDeck: !!b.delete_deck,
    }));
  })
  .post('/api/quizzes/:id/questions', v('json', S.QuestionsBodySchema), (c) =>
    c.json(library.quizAddQuestions({
      quizId: parseId(c.req.param('id')), questions: c.req.valid('json').questions,
    })))
  // import
  .post('/api/import', v('json', S.BundleSchema), (c) =>
    c.json(library.importBundle(c.req.valid('json'))))
  // attempts
  .post('/api/attempts/restart', v('json', S.QuizIdBodySchema), (c) =>
    c.json(attempts.restart({ quizId: c.req.valid('json').quiz_id })))
  .post('/api/attempts', v('json', S.QuizIdBodySchema), (c) =>
    c.json(attempts.start({ quizId: c.req.valid('json').quiz_id })))
  .get('/api/attempts', v('query', S.AttemptListQuerySchema), (c) => {
    const q = c.req.valid('query');
    return c.json({ attempts: attempts.list({
      status: q.status, quizId: q.quiz_id ? Number(q.quiz_id || 0) : undefined,
      limit: Number(q.limit || 0) || 20,
    }) });
  })
  .get('/api/attempts/:id', v('query', S.AttemptGetQuerySchema), (c) =>
    c.json(attempts.get({
      attemptId: parseId(c.req.param('id')),
      includeAnswers: c.req.valid('query').include_answers !== 'false',
    })))
  .patch('/api/attempts/:id/answers/:qid', v('json', S.AnswerBodySchema), (c) =>
    c.json(attempts.answer({
      attemptId: parseId(c.req.param('id')),
      questionId: parseId(c.req.param('qid')),
      response: c.req.valid('json').response,
    })))
  .post('/api/attempts/:id/submit', (c) =>
    c.json(attempts.submit({ attemptId: parseId(c.req.param('id')) })))
  // grading
  .get('/api/grading/pending', v('query', S.PendingQuerySchema), (c) => {
    const q = c.req.valid('query');
    return c.json({ answers: attempts.pending({ limit: Number(q.limit || 0) || 20 }) });
  })
  .post('/api/grading/:id', v('json', S.GradeBodySchema), (c) => {
    const b = c.req.valid('json');
    return c.json(attempts.gradeAnswer({
      answerId: parseId(c.req.param('id')), points: b.points, feedback: b.feedback,
    }));
  })
  // stats + latex + ui context
  .get('/api/stats', v('query', S.StatsQuerySchema), (c) => {
    const q = c.req.valid('query');
    return c.json(study.stats({ deck: parseDeck(q.deck), days: Number(q.days || 0) || 30 }));
  })
  .post('/api/latex/validate', v('json', S.LatexSchema), (c) =>
    c.json({ results: latex.validate(c.req.valid('json').sources) }))
  .get('/api/ui/context', (c) => c.json({ context: context.read() }))
  .put('/api/ui/context', v('json', S.UiContextSchema), (c) =>
    c.json({ ok: true as const, context: context.write(c.req.valid('json')) }))
  // fall-throughs
  .get('/api/*', (c) => c.json({ code: 'NOT_FOUND', message: 'route not found' }, 404))
  .get('*', (c) => serveStatic(c));

export { routes as app };
export type AppType = typeof routes;
export { config };
