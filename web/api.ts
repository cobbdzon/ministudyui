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

import { pending } from './pending.js';

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
// Every request is registered with the stall tracker here so a hung server
// cannot leave a click looking like it did nothing.
export async function unwrap<T>(
  res: Promise<{ ok: boolean; status: number; json(): Promise<T> }>,
  opts: string | { label?: string; action?: boolean; silent?: boolean } = {},
): Promise<T> {
  const { label, action, silent } = typeof opts === 'string'
    ? { label: opts, action: true, silent: false }
    : opts;
  const task = silent ? null : pending.begin(label ?? 'Working…', { action: action ?? !!label });
  try {
    const response = await res;
    if (response.ok) return await response.json();
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:locked'));
    }
    let raw: unknown = null;
    try { raw = await response.json(); } catch { /* body may be empty */ }
    const b = (raw && typeof raw === 'object' ? raw : {}) as Partial<ApiErrorBody>;
    throw new ApiError(response.status, {
      code: String(b.code ?? 'ERROR'),
      message: String(b.message ?? `Request failed (${response.status})`),
      field: b.field,
      hint: b.hint,
    });
  } finally {
    task?.end();
  }
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  return fallback;
}

/* ---- Auth / account types (mirrored by api.mock.ts) ------------------------ */

export interface AuthUser { username: string; is_admin: boolean }
export interface AuthStatus {
  status: 'setup' | 'locked' | 'unlocked';
  user: AuthUser | null;
}
export interface AuthResult { ok: true; user: AuthUser }
export interface SetupResult extends AuthResult { recovery_key: string }
export interface RecoverResult { ok: true; user: { username: string } }
export interface AdminUser {
  id: number; username: string; is_admin: number | boolean;
  disabled_at: string | null; created_at: string;
}
export interface AdminInvite {
  id: number; created_by: number; expires_at: string;
  used_by: number | null; used_at: string | null; created_at: string;
}
export interface InviteResult { ok: true; code: string; expires_at: string }
export interface AgentToken {
  token_id: string; mode: 'read' | 'write'; label: string;
  created_at: string; last_used_at: string | null; revoked_at: string | null;
}
export interface AgentTokenResult {
  ok: true; token: string; token_id: string; label: string;
  mode: 'read' | 'write'; created_at: string;
}
// Plaintext on purpose: the export endpoint deliberately returns a portable,
// unencrypted bundle. Any decrypted study data is in JS memory only until download.
export type ExportBundle = Record<string, unknown>;

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
  auth: {
    status(): Promise<AuthStatus>;
    setup(input: { username: string; passphrase: string }): Promise<SetupResult>;
    login(input: { username: string; passphrase: string }): Promise<AuthResult>;
    logout(): Promise<OkResponse>;
    recover(input: { recovery_key: string; passphrase: string }): Promise<RecoverResult>;
    register(input: { invite_code: string; username: string; passphrase: string }): Promise<AuthResult>;
    changePassphrase(input: { current_passphrase: string; new_passphrase: string }): Promise<OkResponse>;
  };
  adminUsers(): Promise<{ users: AdminUser[] }>;
  adminInvites(): Promise<{ invites: AdminInvite[] }>;
  createInvite(ttlSeconds?: number): Promise<InviteResult>;
  setUserDisabled(id: number, disabled: boolean): Promise<OkResponse>;
  deleteUser(id: number): Promise<OkResponse>;
  agentTokens(): Promise<{ tokens: AgentToken[] }>;
  createAgentToken(label: string, readOnly: boolean): Promise<AgentTokenResult>;
  revokeAgentToken(id: string): Promise<OkResponse>;
  exportBundle(): Promise<ExportBundle>;
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
  auth: {
    async status() {
      const res = await unwrap<{ status: string; user: AuthUser | null }>(
        rpc.api.auth.status.$get(), 'Checking session…',
      );
      return { status: res.status as AuthStatus['status'], user: res.user };
    },
    setup: (input) => unwrap(rpc.api.auth.setup.$post({ json: input }), 'Creating account…'),
    login: (input) => unwrap(rpc.api.auth.login.$post({ json: input }), 'Checking passphrase…'),
    logout: () => unwrap(rpc.api.auth.logout.$post(), 'Locking…'),
    recover: (input) => unwrap(rpc.api.auth.recover.$post({ json: input }), 'Recovering account…'),
    register: (input) => unwrap(rpc.api.auth.register.$post({ json: input }), 'Creating account…'),
    changePassphrase: (input) => unwrap(rpc.api.auth['change-passphrase'].$post({ json: input }), 'Changing passphrase…'),
  },

  adminUsers: () => unwrap(rpc.api.admin.users.$get(), 'Loading users…'),
  adminInvites: () => unwrap(rpc.api.admin.invites.$get(), 'Loading invites…'),
  createInvite: (ttlSeconds) => unwrap(rpc.api.admin.invites.$post({
    json: ttlSeconds === undefined ? {} : { ttl_seconds: ttlSeconds },
  }), 'Creating invite…'),
  setUserDisabled: (id, disabled) => unwrap(rpc.api.admin.users[':id'].$patch({
    param: { id: String(id) }, json: { disabled },
  }), 'Updating user…'),
  deleteUser: (id) => unwrap(rpc.api.admin.users[':id'].$delete({ param: { id: String(id) } }), 'Deleting user…'),

  agentTokens: () => unwrap(rpc.api['agent-tokens'].$get(), 'Loading tokens…'),
  createAgentToken: (label, readOnly) => unwrap(rpc.api['agent-tokens'].$post({
    json: { label, read_only: readOnly },
  }), 'Creating token…'),
  revokeAgentToken: (id) => unwrap(rpc.api['agent-tokens'][':id'].$delete({ param: { id } }), 'Revoking token…'),
  exportBundle: () => unwrap(rpc.api.export.$get(), 'Preparing export…'),

  decks: () => unwrap(rpc.api.decks.$get(), 'Loading decks…'),
  createDeck: (input) => unwrap(rpc.api.decks.$post({
    json: { name: input.name, description: input.description ?? '' },
  }), 'Creating deck…'),
  deleteDeck: (id, confirmName, deleteQuizzes = false) => unwrap(rpc.api.decks[':id'].$delete({
    param: { id: String(id) },
    json: { confirm_name: confirmName, delete_quizzes: deleteQuizzes },
  }), 'Deleting deck…'),
  updateDeck: (id, patch) => unwrap(rpc.api.decks[':id'].$patch({
    param: { id: String(id) }, json: patch,
  }), 'Saving deck…'),

  async cards(opts = {}) {
    const query: Record<string, string> = {};
    if (opts.deck !== undefined && opts.deck !== null) query.deck = String(opts.deck);
    if (opts.q) query.q = opts.q;
    if (opts.tag) query.tag = opts.tag;
    if (opts.source) query.source = opts.source;
    query.limit = String(opts.limit ?? 100);
    query.offset = String(opts.offset ?? 0);
    const data = await unwrap(rpc.api.cards.$get({ query }), 'Loading cards…');
    return { ...data, cards: data.cards.map(normalizeCard) };
  },
  addCards: (deck, cards) => unwrap(rpc.api.cards.$post({ json: { deck, cards } }), 'Adding cards…'),
  importBundle: (bundle) => unwrap(rpc.api.import.$post({ json: bundle }), 'Importing…'),
  updateCard: (id, patch) => unwrap(rpc.api.cards[':id'].$patch({
    param: { id: String(id) }, json: patch,
  }), 'Saving card…'),
  adjustCardSchedule: (id, patch) => unwrap(rpc.api.cards[':id'].schedule.$patch({
    param: { id: String(id) }, json: patch,
  }), 'Saving schedule…'),
  deleteCards: (ids) => unwrap(rpc.api.cards.$delete({ json: { card_ids: ids } }), 'Deleting cards…'),

  reviewQueue: (deck, limit = 10) => unwrap(rpc.api.review.queue.$get({
    query: { deck: String(deck ?? ''), limit: String(limit) },
  }), 'Loading queue…'),
  review: (cardId, rating) => unwrap(rpc.api.review.$post({ json: { card_id: cardId, rating } }), 'Saving review…'),
  undo: () => unwrap(rpc.api.review.undo.$post(), 'Undoing review…'),

  quizzes: (deck) => unwrap(rpc.api.quizzes.$get({
    query: deck === undefined || deck === null ? {} : { deck: String(deck) },
  }), 'Loading quizzes…'),
  quiz: (id, opts = {}) => unwrap(rpc.api.quizzes[':id'].$get({
    param: { id: String(id) }, query: { include_answers: String(opts.includeAnswers ?? true) },
  }), 'Loading quiz…'),
  updateQuiz: (id, patch) => unwrap(rpc.api.quizzes[':id'].$patch({
    param: { id: String(id) }, json: patch,
  }), 'Saving quiz…'),
  deleteQuiz: (id, confirmTitle, deleteDeck = false) => unwrap(rpc.api.quizzes[':id'].$delete({
    param: { id: String(id) }, json: { confirm_title: confirmTitle, delete_deck: deleteDeck },
  }), 'Deleting quiz…'),

  attempts: (opts = {}) => {
    const query: Record<string, string> = {};
    if (opts.status) query.status = opts.status;
    if (opts.quizId) query.quiz_id = String(opts.quizId);
    query.limit = String(opts.limit ?? 20);
    return unwrap(rpc.api.attempts.$get({ query }), 'Loading attempts…');
  },
  attempt: (id, opts = {}) => unwrap(rpc.api.attempts[':id'].$get({
    param: { id: String(id) }, query: { include_answers: String(opts.includeAnswers ?? true) },
  }), 'Loading attempt…'),
  async startAttempt(quizId) {
    return { attempt: await unwrap(rpc.api.attempts.$post({ json: { quiz_id: quizId } }), 'Starting quiz…') };
  },
  async restartAttempt(quizId) {
    return { attempt: await unwrap(rpc.api.attempts.restart.$post({ json: { quiz_id: quizId } }), 'Restarting quiz…') };
  },
  answerAttempt: (attemptId, questionId, response) => unwrap(
    rpc.api.attempts[':id'].answers[':qid'].$patch({
      param: { id: String(attemptId), qid: String(questionId) }, json: { response },
    }), 'Saving answer…',
  ),
  submitAttempt: (id) => unwrap(rpc.api.attempts[':id'].submit.$post({ param: { id: String(id) } }), 'Submitting quiz…'),

  pending: (limit = 20) => unwrap(rpc.api.grading.pending.$get({ query: { limit: String(limit) } }), 'Loading grading queue…'),
  grade: (answerId, points, feedback) => unwrap(rpc.api.grading[':id'].$post({
    param: { id: String(answerId) }, json: { points, feedback },
  }), 'Saving grade…'),

  stats: (deck) => unwrap(rpc.api.stats.$get({
    query: deck !== undefined ? { deck: String(deck) } : {},
  }), 'Loading stats…'),

  uiContext: () => unwrap(rpc.api.ui.context.$get(), 'Loading focus…'),
  setUiContext: (context) => unwrap(rpc.api.ui.context.$put({ json: context }), { silent: true }),

  subscribe(cb) {
    if (typeof EventSource === 'undefined') return () => {};
    const es = new EventSource('/api/events');
    const handler = (e: MessageEvent<string>) => {
      try { cb(JSON.parse(e.data) as ChangeEvent); } catch { /* ignore malformed frames */ }
    };
    es.addEventListener('change', handler);
    // An EventSource error has no status code; confirm the session is really
    // gone before locking (network blips must not close the app).
    es.addEventListener('error', () => {
      if (useMock) return;
      void fetch('/api/auth/status')
        .then((r) => r.json())
        .then((s: { status?: string }) => {
          if (s.status !== 'unlocked') window.dispatchEvent(new CustomEvent('auth:locked'));
        })
        .catch(() => undefined);
    });
    return () => es.close();
  },
};

export const api: Api = useMock ? ((await import('./api.mock.js')).default as Api) : real;
