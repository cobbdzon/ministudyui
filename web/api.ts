// The only data interface the UI knows. api.mock.ts implements the same Api
// against in-memory fixtures so the app can be reviewed without a server.
import { hc } from 'hono/client';
import type { AppType } from '../src/http/app.js';
import type {
  AnswerRow, ApiErrorBody, AttemptRow, AttemptStart, AttemptStatus, AttemptSummary,
  Bundle, CardDto, CardInput, CardPatchInput, CardRow, CardScheduleInput, ChangeEvent, DeckCreateInput, DeckRef,
  DeckSummary, DeckUpdateInput, ImportResult, OkResponse, PendingAnswerDto, QuizQuestionDto,
  QuizRow, QuizSummary, QuizUpdatePatch, Rating, ReviewCardDto, Source, StatsDto,
  UiContext, UiContextInput,
} from '../shared/types.js';

const useMock = new URLSearchParams(location.search).has('mock');
export const rpc = hc<AppType>('/');

export class ApiError extends Error {
  constructor(readonly status: number, readonly body: ApiErrorBody) {
    super(body.message || `Request failed (${status})`);
    this.name = 'ApiError';
  }
}

// hc methods return a Promise<ClientResponse>. Infer the payload from json()
// (ClientResponse.ok is boolean, not an `ok: true` literal on most handlers).
export async function unwrap<T>(
  res: Promise<{ ok: boolean; status: number; json(): Promise<T> }>,
): Promise<T> {
  const response = await res;
  if (response.ok) return response.json();
  let raw: unknown = null;
  try { raw = await response.json(); } catch { /* body may be empty */ }
  const b = (raw && typeof raw === 'object' ? raw : {}) as Partial<ApiErrorBody>;
  throw new ApiError(response.status, {
    code: String(b.code ?? 'ERROR'),
    message: String(b.message ?? `Request failed (${response.status})`),
    field: b.field,
    hint: b.hint,
  });
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  return fallback;
}

function normalizeCard(c: CardRow & { tags?: unknown; due_at?: string; ignored?: number | boolean }): CardDto {
  let tags: unknown = c.tags;
  if (!Array.isArray(tags)) {
    try { tags = JSON.parse(c.tags_json || '[]'); } catch { tags = []; }
  }
  return {
    id: c.id, deck_id: c.deck_id, front: c.front, back: c.back,
    tags: tags as string[], source: c.source, created_at: c.created_at, updated_at: c.updated_at,
    due_at: c.due_at || c.updated_at,
    ignored: c.ignored === 1 || c.ignored === true,
  };
}

export interface Api {
  decks(): Promise<{ decks: DeckSummary[] }>;
  createDeck(input: DeckCreateInput): Promise<{ ok: true; deck: { id: number; name: string; description: string } }>;
  deleteDeck(id: DeckRef, confirmName: string, deleteQuizzes?: boolean): Promise<OkResponse>;
  updateDeck(id: DeckRef, patch: DeckUpdateInput): Promise<{ ok: true; deck: { id: number; name: string; description: string } }>;
  cards(opts?: {
    deck?: DeckRef; q?: string; tag?: string; source?: Source; limit?: number; offset?: number;
  }): Promise<{ cards: CardDto[]; total: number }>;
  addCards(deck: DeckRef, cards: CardInput[]): Promise<{ card_ids: number[] }>;
  importBundle(bundle: Bundle): Promise<ImportResult>;
  updateCard(id: number, patch: CardPatchInput): Promise<OkResponse>;
  adjustCardSchedule(id: number, patch: CardScheduleInput): Promise<OkResponse>;
  deleteCards(ids: number[]): Promise<OkResponse>;
  reviewQueue(deck: DeckRef, limit?: number): Promise<{ cards: ReviewCardDto[] }>;
  review(cardId: number, rating: Rating): Promise<{ ok: true; review_id: number }>;
  undo(): Promise<{ ok: true; card_id: number }>;
  quizzes(deck?: DeckRef): Promise<{ quizzes: QuizSummary[] }>;
  quiz(id: number, opts?: { includeAnswers?: boolean }): Promise<{ quiz: QuizRow; questions: QuizQuestionDto[] }>;
  updateQuiz(id: number, patch: QuizUpdatePatch): Promise<{
    ok: true; quiz: Pick<QuizRow, 'id' | 'title' | 'description' | 'deck_id' | 'source' | 'shuffle'>;
  }>;
  deleteQuiz(id: number, confirmTitle: string, deleteDeck?: boolean): Promise<OkResponse>;
  attempts(opts?: { status?: AttemptStatus; quizId?: number; limit?: number }): Promise<{ attempts: AttemptRow[] }>;
  attempt(id: number, opts?: { includeAnswers?: boolean }): Promise<{ attempt: AttemptRow; answers: AnswerRow[]; questions: QuizQuestionDto[] }>;
  startAttempt(quizId: number): Promise<{ attempt: AttemptStart }>;
  restartAttempt(quizId: number): Promise<{ attempt: AttemptStart }>;
  answerAttempt(attemptId: number, questionId: number, response: unknown): Promise<{ ok: true; answer_id: number }>;
  submitAttempt(id: number): Promise<{ ok: true; attempt: AttemptSummary }>;
  pending(limit?: number): Promise<{ answers: PendingAnswerDto[] }>;
  grade(answerId: number, points: number, feedback: string): Promise<{ ok: true; answer: { id: number }; attempt: AttemptSummary }>;
  stats(deck?: DeckRef): Promise<StatsDto>;
  uiContext(): Promise<{ context: UiContext | null }>;
  setUiContext(context: UiContextInput): Promise<{ ok: true; context: UiContext }>;
  subscribe(cb: (change: ChangeEvent) => void): () => void;
}

const real: Api = {
  decks: () => unwrap(rpc.api.decks.$get()),
  createDeck: (input) => unwrap(rpc.api.decks.$post({
    json: { name: input.name, description: input.description ?? '' },
  })),
  deleteDeck: (id, confirmName, deleteQuizzes = false) => unwrap(rpc.api.decks[':id'].$delete({
    param: { id: String(id) },
    json: { confirm_name: confirmName, delete_quizzes: deleteQuizzes },
  })),
  updateDeck: (id, patch) => unwrap(rpc.api.decks[':id'].$patch({
    param: { id: String(id) }, json: patch,
  })),

  async cards(opts = {}) {
    const query: Record<string, string> = {};
    if (opts.deck !== undefined && opts.deck !== null) query.deck = String(opts.deck);
    if (opts.q) query.q = opts.q;
    if (opts.tag) query.tag = opts.tag;
    if (opts.source) query.source = opts.source;
    query.limit = String(opts.limit ?? 100);
    query.offset = String(opts.offset ?? 0);
    const data = await unwrap(rpc.api.cards.$get({ query }));
    return { ...data, cards: data.cards.map(normalizeCard) };
  },
  addCards: (deck, cards) => unwrap(rpc.api.cards.$post({ json: { deck, cards } })),
  importBundle: (bundle) => unwrap(rpc.api.import.$post({ json: bundle })),
  updateCard: (id, patch) => unwrap(rpc.api.cards[':id'].$patch({
    param: { id: String(id) }, json: patch,
  })),
  adjustCardSchedule: (id, patch) => unwrap(rpc.api.cards[':id'].schedule.$patch({
    param: { id: String(id) }, json: patch,
  })),
  deleteCards: (ids) => unwrap(rpc.api.cards.$delete({ json: { card_ids: ids } })),

  reviewQueue: (deck, limit = 10) => unwrap(rpc.api.review.queue.$get({
    query: { deck: String(deck ?? ''), limit: String(limit) },
  })),
  review: (cardId, rating) => unwrap(rpc.api.review.$post({ json: { card_id: cardId, rating } })),
  undo: () => unwrap(rpc.api.review.undo.$post()),

  quizzes: (deck) => unwrap(rpc.api.quizzes.$get({
    query: deck === undefined || deck === null ? {} : { deck: String(deck) },
  })),
  quiz: (id, opts = {}) => unwrap(rpc.api.quizzes[':id'].$get({
    param: { id: String(id) }, query: { include_answers: String(opts.includeAnswers ?? true) },
  })),
  updateQuiz: (id, patch) => unwrap(rpc.api.quizzes[':id'].$patch({
    param: { id: String(id) }, json: patch,
  })),
  deleteQuiz: (id, confirmTitle, deleteDeck = false) => unwrap(rpc.api.quizzes[':id'].$delete({
    param: { id: String(id) }, json: { confirm_title: confirmTitle, delete_deck: deleteDeck },
  })),

  attempts: (opts = {}) => {
    const query: Record<string, string> = {};
    if (opts.status) query.status = opts.status;
    if (opts.quizId) query.quiz_id = String(opts.quizId);
    query.limit = String(opts.limit ?? 20);
    return unwrap(rpc.api.attempts.$get({ query }));
  },
  attempt: (id, opts = {}) => unwrap(rpc.api.attempts[':id'].$get({
    param: { id: String(id) }, query: { include_answers: String(opts.includeAnswers ?? true) },
  })),
  async startAttempt(quizId) {
    return { attempt: await unwrap(rpc.api.attempts.$post({ json: { quiz_id: quizId } })) };
  },
  async restartAttempt(quizId) {
    return { attempt: await unwrap(rpc.api.attempts.restart.$post({ json: { quiz_id: quizId } })) };
  },
  answerAttempt: (attemptId, questionId, response) => unwrap(
    rpc.api.attempts[':id'].answers[':qid'].$patch({
      param: { id: String(attemptId), qid: String(questionId) }, json: { response },
    }),
  ),
  submitAttempt: (id) => unwrap(rpc.api.attempts[':id'].submit.$post({ param: { id: String(id) } })),

  pending: (limit = 20) => unwrap(rpc.api.grading.pending.$get({ query: { limit: String(limit) } })),
  grade: (answerId, points, feedback) => unwrap(rpc.api.grading[':id'].$post({
    param: { id: String(answerId) }, json: { points, feedback },
  })),

  stats: (deck) => unwrap(rpc.api.stats.$get({
    query: deck !== undefined ? { deck: String(deck) } : {},
  })),

  uiContext: () => unwrap(rpc.api.ui.context.$get()),
  setUiContext: (context) => unwrap(rpc.api.ui.context.$put({ json: context })),

  subscribe(cb) {
    if (typeof EventSource === 'undefined') return () => {};
    const es = new EventSource('/api/events');
    const handler = (e: MessageEvent<string>) => {
      try { cb(JSON.parse(e.data) as ChangeEvent); } catch { /* ignore malformed frames */ }
    };
    es.addEventListener('change', handler);
    return () => es.close();
  },
};

export const api: Api = useMock ? ((await import('./api.mock.js')).default as Api) : real;
