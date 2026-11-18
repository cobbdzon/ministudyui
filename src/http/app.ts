import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { AppError, asAppError, type ErrorCode } from '../boxes/errors.js';
import * as store from '../boxes/store/index.js';
import * as library from '../boxes/library/index.js';
import * as study from '../boxes/study/index.js';
import * as attempts from '../boxes/attempts/index.js';
import * as changefeed from '../boxes/changefeed/index.js';
import * as latex from '../boxes/latex/index.js';
import { serveStatic } from './static.js';
import { v } from './validate.js';
import type { AttemptRow, AnswerRow, DeckRef } from '../../shared/types.js';
import * as S from '../../shared/schemas.js';

type ErrStatus = 400 | 403 | 404 | 409 | 500;
const STATUS: Record<ErrorCode, ErrStatus> = {
  VALIDATION: 400, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, INTERNAL: 500, ERROR: 500,
};

const app = new Hono();

// Security — exact current logic, applied to every request including static + SSE.
app.use('*', async (c, next) => {
  const port = Number(process.env.PORT || 3000);
  const host = c.req.header('host') ?? '';
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
    return c.json({ code: 'FORBIDDEN', message: 'bad host/origin' }, 403);
  }
  const origin = c.req.header('origin');
  if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) {
    return c.json({ code: 'FORBIDDEN', message: 'bad host/origin' }, 403);
  }
  await next();
});

app.onError((err, c) => {
  // hono/validator throws HTTPException(400) for malformed JSON before our
  // validator hook runs; keep that a 400 instead of letting it become a 500.
  if (err instanceof HTTPException) {
    return c.json({ code: 'VALIDATION', message: err.message }, 400);
  }
  const e = asAppError(err);
  if (!(err instanceof AppError)) console.error(err);
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

const routes = app
  // 1 — SSE event stream (never called through the RPC client)
  .get('/api/events', (c) => streamSSE(c, async (stream) => {
    let closed = false;
    const unsub = changefeed.subscribe((change) => {
      void stream.writeSSE({
        event: 'change',
        data: JSON.stringify({ entity: change.entity, id: change.entity_id, op: change.op }),
      });
    });
    const beat = setInterval(() => { void stream.write(':\n\n'); }, 20_000);
    stream.onAbort(() => { closed = true; clearInterval(beat); unsub(); });
    while (!closed) await stream.sleep(1000);
  }))
  // 2–5 — decks
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
  // 6–9 — cards
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
  // 10–12 — review
  .get('/api/review/queue', v('query', S.ReviewQueueQuerySchema), (c) => {
    const q = c.req.valid('query');
    // No deck filter historically resolved to deck 0 (empty queue), not a 404.
    return c.json({ cards: study.queue({ deck: parseDeck(q.deck) ?? 0, limit: Number(q.limit || 0) || 10 }) });
  })
  .post('/api/review', v('json', S.ReviewSchema), (c) => {
    const b = c.req.valid('json');
    return c.json(study.review({ cardId: b.card_id, rating: b.rating }));
  })
  .post('/api/review/undo', (c) => c.json(study.undo()))
  // 13–17 — quizzes
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
  // 18 — import
  .post('/api/import', v('json', S.BundleSchema), (c) =>
    c.json(library.importBundle(c.req.valid('json'))))
  // 19–24 — attempts
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
  .get('/api/attempts/:id', (c) => {
    const id = parseId(c.req.param('id'));
    const attempt = store.get<AttemptRow>('SELECT * FROM attempts WHERE id=?', [id]);
    if (!attempt) throw new AppError('NOT_FOUND', 'attempt not found');
    const answers = store.all<AnswerRow>('SELECT * FROM answers WHERE attempt_id=?', [id]);
    return c.json({ attempt, answers });
  })
  .patch('/api/attempts/:id/answers/:qid', v('json', S.AnswerBodySchema), (c) =>
    c.json(attempts.answer({
      attemptId: parseId(c.req.param('id')),
      questionId: parseId(c.req.param('qid')),
      response: c.req.valid('json').response,
    })))
  .post('/api/attempts/:id/submit', (c) =>
    c.json(attempts.submit({ attemptId: parseId(c.req.param('id')) })))
  // 25–26 — grading
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
  // 27 — stats
  .get('/api/stats', v('query', S.StatsQuerySchema), (c) => {
    const q = c.req.valid('query');
    return c.json(study.stats({ deck: parseDeck(q.deck), days: Number(q.days || 0) || 30 }));
  })
  // 28 — latex validate
  .post('/api/latex/validate', v('json', S.LatexSchema), (c) =>
    c.json({ results: latex.validate(c.req.valid('json').sources) }))
  // fall-throughs
  .get('/api/*', (c) => c.json({ code: 'NOT_FOUND', message: 'route not found' }, 404))
  .get('*', (c) => serveStatic(c));

export { routes as app };
export type AppType = typeof routes;
