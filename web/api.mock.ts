// In-memory fixtures with the same interface as api.ts's real adapter.
// Math-heavy content doubles as the KaTeX rendering regression fixture.
// Do NOT import ApiError from api.ts: api.ts top-level-awaits this module, and
// a static import back to it deadlocks the ESM graph in the no-bundler browser.
import type { ApiErrorBody } from '../shared/types.js';
class ApiError extends Error {
  constructor(readonly status: number, readonly body: ApiErrorBody) {
    super(body.message || `Request failed (${status})`);
    this.name = 'ApiError';
  }
}
import type {
  Api, AdminInvite, AdminUser, AgentToken, AgentTokenResult, AuthResult,
  AuthStatus, AuthUser, ExportBundle, InviteResult, RecoverResult, SetupResult,
} from './api.js';
import type {
  AnswerRow, AttemptStatus, CardDto, Choice, DeckRef, DeckSummary, GradeResult,
  OkResponse,
  PendingAnswerDto, QuestionAnswer, QuestionType, QuizQuestionDto,
  QuizSummary, ReviewCardDto, SharedPublishResponse, SharedQuestionDto,
  SharedQuizSummary, SharedStatus, Source, StatsDto, UiContext, UiContextInput,
} from '../shared/types.js';

interface DeckFixture { id: number; name: string; description: string; created_at: string }
interface CardFixture {
  id: number; deck_id: number; front: string; back: string;
  tags: string[]; source: Source; reps: number; due: boolean;
  ignored?: boolean; due_at_ms?: number;
}
interface QuizFixture {
  id: number; deck_id: number | null; title: string;
  description: string; source: Source; shuffle: number; created_at: string;
}
interface QuestionFixture {
  id: number; quiz_id: number; position: number; type: QuestionType;
  prompt: string; choices?: Choice[]; answer?: QuestionAnswer;
  points: number; explanation: string;
}
interface AttemptFixture {
  id: number; quiz_id: number; started_at: string; submitted_at: string | null;
  status: AttemptStatus; score: number | null; max_score: number;
  question_order_json: string | null;
}
interface AnswerFixture extends AnswerRow {}
interface LastReview { card: CardFixture; wasDue: boolean; reps: number }

const NOW = Date.now();
const iso = (daysAgo = 0, minutesAgo = 0): string =>
  new Date(NOW - daysAgo * 86400000 - minutesAgo * 60000).toISOString();
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)) as T);
const fail: (message: string) => never = (message) => {
  const e = new Error(message) as Error & { code: string };
  e.code = 'VALIDATION';
  throw e;
};

const decks: DeckFixture[] = [
  {
    id: 1,
    name: 'Calculus II',
    description: 'Integration by parts, sequences, and series convergence.',
    created_at: iso(40),
  },
  {
    id: 2,
    name: 'Linear Algebra',
    description: 'Vector spaces, eigenvalues, and the geometry behind matrices.',
    created_at: iso(32),
  },
  {
    id: 3,
    name: 'Physics 201',
    description: 'Mechanics and oscillations, derived rather than memorized.',
    created_at: iso(21),
  },
];

// due: whether the card appears in today's queue. reps drives new/mature.
const cards: CardFixture[] = [
  {
    id: 1,
    deck_id: 1,
    front: 'Evaluate $\\int_0^1 x^2\\,dx$.',
    back: '$\\dfrac{1}{3}$',
    tags: ['integrals', 'definite'],
    source: 'user',
    reps: 4,
    due: false,
  },
  {
    id: 2,
    deck_id: 1,
    front: 'What is $\\dfrac{d}{dx}\\ln x$?',
    back: '$\\dfrac{1}{x}$ for $x>0$.',
    tags: ['derivatives'],
    source: 'user',
    reps: 4,
    due: false,
  },
  {
    id: 3,
    deck_id: 1,
    front: 'State the ratio test for $\\sum a_n$.',
    back: 'If $\\lim_{n\\to\\infty}\\left|\\dfrac{a_{n+1}}{a_n}\\right| < 1$, the series converges absolutely.',
    tags: ['series'],
    source: 'ai',
    reps: 3,
    due: false,
  },
  {
    id: 4,
    deck_id: 1,
    front: 'Evaluate $\\int x e^x\\,dx$.',
    back: '$e^x(x-1)+C$, using parts with $u=x$ and $dv=e^x\\,dx$.',
    tags: ['integration-by-parts'],
    source: 'ai',
    reps: 2,
    due: true,
  },
  {
    id: 5,
    deck_id: 1,
    front: 'What does $\\sum_{n=1}^{\\infty} \\dfrac{1}{n^p}$ do for $p>1$?',
    back: 'It converges: a $p$-series with $p>1$.',
    tags: ['series'],
    source: 'ai',
    reps: 1,
    due: true,
  },
  {
    id: 6,
    deck_id: 1,
    front: 'Give the Taylor series of $e^x$ about $0$.',
    back: '$\\sum_{n=0}^{\\infty} \\dfrac{x^n}{n!}$',
    tags: ['series', 'taylor'],
    source: 'ai',
    reps: 0,
    due: true,
  },
  {
    id: 7,
    deck_id: 1,
    front: 'Compute $\\int_0^{\\pi} \\sin x\\,dx$.',
    back: '$2$',
    tags: ['integrals'],
    source: 'user',
    reps: 0,
    due: true,
  },
  {
    id: 8,
    deck_id: 1,
    front: 'A deliberately broken formula $\\frac{1}{2$ should stay inline.',
    back: 'KaTeX reports it without breaking the page, so the fixture stays useful.',
    tags: ['fixture'],
    source: 'ai',
    reps: 0,
    due: false,
  },
  {
    id: 9,
    deck_id: 1,
    front: 'What is $\\int \\dfrac{1}{x}\\,dx$?',
    back: '$\\ln|x| + C$',
    tags: ['integrals'],
    source: 'user',
    reps: 3,
    due: false,
  },
  {
    id: 10,
    deck_id: 2,
    front: 'Find the eigenvalues of $A=\\begin{pmatrix}2&1\\\\1&2\\end{pmatrix}$.',
    back: '$\\lambda=1$ and $\\lambda=3$. The eigenvectors are symmetric and antisymmetric.',
    tags: ['eigenvalues'],
    source: 'ai',
    reps: 4,
    due: true,
  },
  {
    id: 11,
    deck_id: 2,
    front: 'What is $\\det(AB)$?',
    back: '$\\det A \\cdot \\det B$',
    tags: ['determinants'],
    source: 'user',
    reps: 3,
    due: false,
  },
  {
    id: 12,
    deck_id: 2,
    front: 'When is a set of vectors linearly independent?',
    back: 'When $\\sum c_i v_i = 0$ forces every $c_i = 0$.',
    tags: ['independence'],
    source: 'ai',
    reps: 0,
    due: true,
  },
  {
    id: 13,
    deck_id: 2,
    front: 'What does a zero eigenvalue say about a matrix?',
    back: 'It is not invertible: $\\det A = 0$, so $A^{-1}$ does not exist.',
    tags: ['eigenvalues'],
    source: 'ai',
    reps: 2,
    due: false,
  },
  {
    id: 14,
    deck_id: 2,
    front: 'State the rank-nullity theorem.',
    back: '$\\dim V = \\operatorname{rank} T + \\operatorname{nullity} T$',
    tags: ['rank'],
    source: 'user',
    reps: 3,
    due: false,
  },
  {
    id: 15,
    deck_id: 2,
    front: 'Compute $\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}\\begin{pmatrix}x\\\\y\\end{pmatrix}$.',
    back: '$\\begin{pmatrix}x+2y\\\\3x+4y\\end{pmatrix}$',
    tags: ['matrices'],
    source: 'user',
    reps: 0,
    due: false,
  },
  {
    id: 16,
    deck_id: 3,
    front: 'A mass on a spring obeys $m\\ddot{x} = -kx$. What is its angular frequency?',
    back: '$\\omega = \\sqrt{k/m}$, so $x(t) = A\\cos(\\omega t + \\phi)$.',
    tags: ['oscillations'],
    source: 'ai',
    reps: 4,
    due: true,
  },
  {
    id: 17,
    deck_id: 3,
    front: "State Newton's second law for a variable mass.",
    back: '$F = \\dfrac{dp}{dt} = m\\dfrac{dv}{dt} + v\\dfrac{dm}{dt}$',
    tags: ['mechanics'],
    source: 'ai',
    reps: 3,
    due: false,
  },
  {
    id: 18,
    deck_id: 3,
    front: 'What is the period of a pendulum at small angles?',
    back: '$T = 2\\pi\\sqrt{L/g}$, independent of mass.',
    tags: ['oscillations'],
    source: 'user',
    reps: 3,
    due: false,
  },
  {
    id: 19,
    deck_id: 3,
    front: 'A projectile leaves at $v_0$ and angle $\\theta$. Write its range.',
    back: '$R = \\dfrac{v_0^2 \\sin 2\\theta}{g}$, for level ground.',
    tags: ['kinematics'],
    source: 'ai',
    reps: 0,
    due: false,
  },
  {
    id: 20,
    deck_id: 3,
    front: 'What is the work done by a constant force over a displacement?',
    back: '$W = \\vec{F}\\cdot\\vec{d} = Fd\\cos\\theta$',
    tags: ['energy'],
    source: 'user',
    reps: 2,
    due: false,
  },
];

const quizzes: QuizFixture[] = [
  {
    id: 1,
    deck_id: 1,
    title: 'Integration by parts',
    description: 'Four questions on choosing parts, definite integrals, and one worked solution.',
    source: 'ai',
    shuffle: 1,
    created_at: iso(6),
  },
  {
    id: 2,
    deck_id: 2,
    title: 'Eigenvalues check',
    description: 'A quick numeric check, then a proof you write out.',
    source: 'ai',
    shuffle: 0,
    created_at: iso(3),
  },
];

const questions: QuestionFixture[] = [
  {
    id: 1,
    quiz_id: 1,
    position: 1,
    type: 'mcq',
    prompt: 'Which choice of $u$ and $dv$ makes $\\int x e^x\\,dx$ easiest?',
    choices: [
      { id: 'a', text: 'u = x, dv = e^x dx' },
      { id: 'b', text: 'u = e^x, dv = x dx' },
      { id: 'c', text: 'u = x e^x, dv = dx' },
    ],
    answer: { correct: 'a' },
    points: 1,
    explanation: 'Differentiating $u=x$ gives $dx$, so the remaining integral is just $\\int e^x dx$.',
  },
  {
    id: 2,
    quiz_id: 1,
    position: 2,
    type: 'numeric',
    prompt: 'Compute $\\int_0^1 x^2\\,dx$.',
    answer: { value: 1 / 3, tolerance: 0.001, tolerance_type: 'abs', unit: null },
    points: 1,
    explanation: '$\\left[x^3/3\\right]_0^1 = 1/3$.',
  },
  {
    id: 3,
    quiz_id: 1,
    position: 3,
    type: 'latex',
    prompt: 'Compute $\\int x\\cos x\\,dx$. Show the integration by parts.',
    answer: {
      reference: '$x\\sin x + \\cos x + C$',
      rubric: 'Correct choice of parts (1), correct antiderivative (1), constant of integration (1).',
    },
    points: 3,
    explanation: 'Take $u=x$, $dv=\\cos x\\,dx$, then $\\int x\\cos x\\,dx = x\\sin x + \\cos x + C$.',
  },
  {
    id: 4,
    quiz_id: 1,
    position: 4,
    type: 'mcq',
    prompt: 'Which $p$-series converges?',
    choices: [
      { id: 'a', text: '$p=1$' },
      { id: 'b', text: '$p=2$' },
      { id: 'c', text: '$p=\\tfrac12$' },
    ],
    answer: { correct: 'b' },
    points: 1,
    explanation: '$\\sum 1/n^p$ converges only for $p>1$.',
  },
  {
    id: 5,
    quiz_id: 2,
    position: 1,
    type: 'numeric',
    prompt: 'For $A=\\begin{pmatrix}2&1\\\\1&2\\end{pmatrix}$, enter the larger eigenvalue.',
    answer: { value: 3, tolerance: 0.01, tolerance_type: 'abs', unit: null },
    points: 1,
    explanation: 'The characteristic polynomial is $(2-\\lambda)^2-1$, so $\\lambda=1,3$.',
  },
  {
    id: 6,
    quiz_id: 2,
    position: 2,
    type: 'mcq',
    prompt: 'A real $2\\times2$ matrix has two distinct real eigenvalues. What follows?',
    choices: [
      { id: 'a', text: 'It is diagonalizable.' },
      { id: 'b', text: 'It is orthogonal.' },
      { id: 'c', text: 'It is singular.' },
    ],
    answer: { correct: 'a' },
    points: 1,
    explanation: 'Two independent eigenvectors give a basis of $\\mathbb{R}^2$, so $A=PDP^{-1}$.',
  },
  {
    id: 7,
    quiz_id: 2,
    position: 3,
    type: 'latex',
    prompt: 'Show that eigenvectors of a symmetric matrix with distinct eigenvalues are orthogonal.',
    answer: {
      reference:
        'If $Av=\\lambda v$ and $Aw=\\mu w$ with $\\lambda\\ne\\mu$, then $\\lambda v\\cdot w=(Av)\\cdot w=v\\cdot(Aw)=\\mu v\\cdot w$, so $(\\lambda-\\mu)v\\cdot w=0$ and $v\\cdot w=0$.',
      rubric: 'Uses symmetry $A^T=A$ (2), compares both expansions of $v^T A w$ (1), concludes orthogonality (1).',
    },
    points: 4,
    explanation: 'Symmetry lets you move $A$ from one side of the inner product to the other.',
  },
];

interface SharedFixture {
  summary: SharedQuizSummary;
  questions: SharedQuestionDto[];
  sourceQuizId: number | null;
}
const sharedLibrary: SharedFixture[] = [
  {
    summary: {
      id: 101, title: 'Series convergence', description: 'A short check of the ratio and p-series tests.',
      owner_username: 'studyfriend', shuffle: false, question_count: 2, total_points: 4,
      published_at: iso(5), updated_at: iso(5), mine: false,
    },
    questions: [
      {
        position: 1, type: 'mcq', prompt: 'Which test fits $\\sum \\frac{1}{n^p}$ for $p>1$?',
        choices: [
          { id: 'a', text: 'p-series test' },
          { id: 'b', text: 'Ratio test' },
          { id: 'c', text: 'Root test' },
        ],
        answer: { correct: 'a' }, explanation: 'A p-series converges exactly when $p>1$.', points: 2,
      },
      {
        position: 2, type: 'numeric', prompt: 'For $\\sum a_n$, if $\\lim |a_{n+1}/a_n| = \\frac12$, the series…',
        answer: { value: 1, tolerance: 0 }, explanation: 'A ratio below 1 means absolute convergence.', points: 2,
      },
    ],
    sourceQuizId: null,
  },
  {
    summary: {
      id: 102, title: 'Eigenvector basics', description: 'Definitions and one short proof.',
      owner_username: 'mathbuddy', shuffle: true, question_count: 1, total_points: 3,
      published_at: iso(2), updated_at: iso(1), mine: false,
    },
    questions: [
      {
        position: 1, type: 'short', prompt: 'Define an eigenvector of a matrix $A$.',
        answer: { reference: 'A nonzero vector $v$ with $Av=\\lambda v$ for some scalar $\\lambda$.', rubric: 'Nonzero (1), equation (2).' },
        explanation: 'The scaling factor $\\lambda$ is the eigenvalue.', points: 3,
      },
    ],
    sourceQuizId: null,
  },
];
let sharedMineStale = false;

const answers: AnswerFixture[] = [];
const attempts: AttemptFixture[] = [
  {
    id: 1,
    quiz_id: 1,
    started_at: iso(3, 40),
    submitted_at: iso(3, 20),
    status: 'graded',
    score: 5,
    max_score: 6,
    question_order_json: null,
  },
  {
    id: 2,
    quiz_id: 2,
    started_at: iso(2, 30),
    submitted_at: iso(2, 18),
    status: 'submitted',
    score: 2,
    max_score: 6,
    question_order_json: null,
  },
  {
    id: 3,
    quiz_id: 1,
    started_at: iso(1, 55),
    submitted_at: iso(1, 40),
    status: 'submitted',
    score: 2,
    max_score: 6,
    question_order_json: null,
  },
  {
    id: 4,
    quiz_id: 1,
    started_at: iso(0, 12),
    submitted_at: null,
    status: 'in_progress',
    score: null,
    max_score: 6,
    question_order_json: '[4,3,2,1]',
  },
];

function addAnswer(
  attemptId: number, questionId: number, response: string,
  grading: number | null, gradedBy: 'auto' | 'ai' | 'manual' | null, feedback = '',
): number {
  const id = answers.length + 1;
  answers.push({
    id,
    attempt_id: attemptId,
    question_id: questionId,
    response,
    grading_status: gradedBy ? 'graded' : 'pending',
    is_correct: grading,
    points_awarded: gradedBy ? grading === 1 ? (questions.find((q) => q.id === questionId)?.points ?? 0) : 0 : null,
    feedback,
    graded_by: gradedBy,
    graded_at: gradedBy ? iso(3) : null,
  });
  return id;
}

// Attempt 1: fully graded, 5/6.
addAnswer(1, 1, 'a', 1, 'auto', 'Correct.');
addAnswer(1, 2, String(1 / 3), 1, 'auto', 'Correct.');
addAnswer(1, 3, '$x\\sin x + \\cos x$', null, 'ai', 'Parts are right. The constant of integration is missing.');
answers[answers.length - 1].points_awarded = 2;
answers[answers.length - 1].is_correct = null;
addAnswer(1, 4, 'b', 1, 'auto', 'Correct.');
// Attempt 2: numeric and MCQ right, proof pending.
addAnswer(2, 5, '3', 1, 'auto', 'Correct.');
addAnswer(2, 6, 'a', 1, 'auto', 'Correct.');
addAnswer(2, 7, '$Av=\\lambda v$, $Aw=\\mu w$, and $A=A^T$, so $v^T A w = \\lambda v^T w = \\mu v^T w$.', null, null);
// Attempt 3: one wrong, one pending.
addAnswer(3, 1, 'b', 0, 'auto', 'Incorrect.');
addAnswer(3, 2, '0.33', 1, 'auto', 'Correct.');
addAnswer(3, 3, '$x\\sin x + C$', null, null);
addAnswer(3, 4, 'b', 1, 'auto', 'Correct.');
// Attempt 4: in progress, first two answered.
addAnswer(4, 1, 'a', 1, 'auto', 'Correct.');
addAnswer(4, 2, '0.333', 1, 'auto', 'Correct.');

const reviewSeries = [
  6, 9, 0, 12, 7, 0, 0, 5, 8, 11, 4, 0, 13, 6, 0, 7, 10, 9, 0, 3, 8, 0, 14, 11, 5, 0, 6, 9, 7, 12,
];
const reviewsPerDay = reviewSeries.map((n, i) => ({
  day: new Date(NOW - (reviewSeries.length - 1 - i) * 86400000).toISOString().slice(0, 10),
  n,
}));

let lastReview: LastReview | null = null;
let nextDeckId = 4;
let nextCardId = 21;
let nextQuizId = 3;
let nextQuestionId = 8;

function summaries(): DeckSummary[] {
  return decks.map((d) => {
    const own = cards.filter((c) => c.deck_id === d.id);
    return {
      ...d,
      total: own.length,
      due: own.filter((c) => c.due && !c.ignored).length,
      new: own.filter((c) => c.reps === 0).length,
      mature: own.filter((c) => c.reps >= 3).length,
      ignored: own.filter((c) => c.ignored).length,
      quizzes: quizzes.filter((q) => q.deck_id === d.id).length,
    };
  });
}

function removeQuiz(id: number): void {
  const idx = quizzes.findIndex((q) => q.id === id);
  if (idx < 0) return;
  quizzes.splice(idx, 1);
  for (let i = questions.length - 1; i >= 0; i--) if (questions[i].quiz_id === id) questions.splice(i, 1);
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (attempts[i].quiz_id !== id) continue;
    for (let j = answers.length - 1; j >= 0; j--) if (answers[j].attempt_id === attempts[i].id) answers.splice(j, 1);
    attempts.splice(i, 1);
  }
}

function resolveDeck(ref: DeckRef): DeckFixture {
  const deck = typeof ref === 'number' ? decks.find((d) => d.id === ref) : decks.find((d) => d.name.toLowerCase() === String(ref).toLowerCase());
  if (!deck) throw new Error('deck not found');
  return deck;
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function questionDtos(quizId: number, includeAnswers: boolean, order?: number[] | null): QuizQuestionDto[] {
  let qs = [...questions].filter((q) => q.quiz_id === quizId);
  if (order?.length) {
    const rank = new Map(order.map((id, i) => [id, i]));
    qs.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  } else {
    qs.sort((a, b) => a.position - b.position);
  }
  return qs.map((q) => {
    const out: QuizQuestionDto = {
      id: q.id, position: q.position, type: q.type, prompt: q.prompt,
      explanation: q.explanation, points: q.points,
      ...(q.choices ? { choices: q.choices } : {}),
    };
    if (includeAnswers && q.answer) out.answer = q.answer;
    if (!includeAnswers || q.type === 'numeric') out.unit = q.answer?.unit ?? null;
    return out;
  });
}

function withPreview(card: CardFixture): ReviewCardDto {
  return {
    id: card.id,
    front: card.front,
    back: card.back,
    tags: [...card.tags],
    source: card.source,
    preview:
      card.reps === 0
        ? { again: '10m', hard: '1d', good: '3d', easy: '7d' }
        : card.reps < 3
          ? { again: '10m', hard: '2d', good: '4d', easy: '6d' }
          : { again: '10m', hard: '12d', good: '20d', easy: '30d' },
  };
}

function dueAtMs(card: CardFixture): number {
  return card.due_at_ms ?? NOW + (card.due ? 12 : 1440 + (card.id % 7) * 1440) * 60000;
}

function publicCard(card: CardFixture): CardDto {
  return {
    id: card.id,
    deck_id: card.deck_id,
    front: card.front,
    back: card.back,
    tags: [...card.tags],
    source: card.source,
    created_at: iso(10),
    updated_at: iso(2),
    due_at: new Date(dueAtMs(card)).toISOString(),
    ignored: !!card.ignored,
  };
}

function autoGrade(q: QuestionFixture, response: string): GradeResult {
  const ans = q.answer || {};
  if (q.type === 'mcq') {
    const ok = String(response).trim() === String(ans.correct);
    return { status: 'graded', is_correct: ok ? 1 : 0, points: ok ? q.points : 0, feedback: ok ? 'Correct.' : 'Incorrect.' };
  }
  if (q.type === 'multi') {
    let got: unknown[] = [];
    try {
      got = JSON.parse(response);
    } catch {
      got = [];
    }
    const want = (Array.isArray(ans.correct) ? ans.correct : []).map(String);
    const ok = got.length === want.length && got.every((x) => want.includes(String(x)));
    return { status: 'graded', is_correct: ok ? 1 : 0, points: ok ? q.points : 0, feedback: ok ? 'Correct.' : 'Incorrect.' };
  }
  if (q.type === 'numeric') {
    const v = Number(response);
    if (!Number.isFinite(v)) return { status: 'graded', is_correct: 0, points: 0, feedback: 'Not a number.' };
    const target = Number(ans.value);
    const tol = Number(ans.tolerance) || 0;
    const diff = ans.tolerance_type === 'rel' ? Math.abs(v - target) / Math.max(Math.abs(target), 1e-12) : Math.abs(v - target);
    const ok = diff <= tol;
    return {
      status: 'graded',
      is_correct: ok ? 1 : 0,
      points: ok ? q.points : 0,
      feedback: ok ? 'Correct.' : `Expected ${target}${ans.unit ? ` ${ans.unit}` : ''}.`,
    };
  }
  return { status: 'pending', is_correct: null, points: null, feedback: '' };
}

function recompute(attemptId: number): AttemptFixture {
  const attempt = attempts.find((a) => a.id === attemptId);
  if (!attempt) throw new Error('attempt not found');
  const rows = answers.filter((a) => a.attempt_id === attemptId);
  const pending = rows.filter((a) => a.grading_status === 'pending').length;
  attempt.score = rows.reduce((sum, a) => sum + (a.grading_status === 'graded' ? a.points_awarded || 0 : 0), 0);
  attempt.status = pending ? 'submitted' : attempt.submitted_at ? 'graded' : 'in_progress';
  return attempt;
}

let mockUiContext: UiContext | null = null;

/* ---------- Auth / accounts ------------------------------------------------ */

// The mock always represents a single demo admin. `?mock=1&auth=locked` starts
// on the gate; any credentials unlock it so the UI can be reviewed offline.
const DEMO_USER: AuthUser = { username: 'demo', is_admin: true };
let mockAuth: 'setup' | 'locked' | 'unlocked' =
  new URLSearchParams(location.search).get('auth') === 'locked' ? 'locked' : 'unlocked';

function requireUnlocked(): void {
  if (mockAuth === 'unlocked') return;
  window.dispatchEvent(new CustomEvent('auth:locked'));
  throw new ApiError(401, { code: 'UNAUTHENTICATED', message: 'Authentication required' });
}
function mockUnlock(): AuthUser {
  mockAuth = 'unlocked';
  return { ...DEMO_USER };
}

const mockAdminUsers: AdminUser[] = [
  { id: 1, username: 'demo', is_admin: 1, disabled_at: null, created_at: iso(60) },
  { id: 2, username: 'student', is_admin: 0, disabled_at: null, created_at: iso(14) },
];
const mockAdminInvites: AdminInvite[] = [
  {
    id: 1, created_by: 1, expires_at: new Date(NOW + 5 * 86400000).toISOString(),
    used_by: null, used_at: null, created_at: iso(2),
  },
];
const mockTokens: AgentToken[] = [
  {
    token_id: 'a1b2c3d4e5f60718', mode: 'write', label: 'Example agent',
    created_at: iso(5), last_used_at: iso(1), revoked_at: null,
  },
];

const api: Api = {
  auth: {
    status(): Promise<AuthStatus> {
      return Promise.resolve({
        status: mockAuth,
        user: mockAuth === 'unlocked' ? { ...DEMO_USER } : null,
      });
    },
    setup(): Promise<SetupResult> {
      return Promise.resolve({
        ok: true, recovery_key: 'MOCK-DEMO-RECOVERY-KEY', user: mockUnlock(),
      });
    },
    login(): Promise<AuthResult> {
      return Promise.resolve({ ok: true, user: mockUnlock() });
    },
    logout(): Promise<OkResponse> {
      mockAuth = 'locked';
      return Promise.resolve({ ok: true });
    },
    recover(): Promise<RecoverResult> {
      mockUnlock();
      return Promise.resolve({ ok: true, user: { username: DEMO_USER.username } });
    },
    register(): Promise<AuthResult> {
      return Promise.resolve({ ok: true, user: mockUnlock() });
    },
    changePassphrase(): Promise<OkResponse> {
      requireUnlocked();
      return Promise.resolve({ ok: true });
    },
  },

  adminUsers(): Promise<{ users: AdminUser[] }> {
    requireUnlocked();
    return Promise.resolve({ users: clone(mockAdminUsers) });
  },
  adminInvites(): Promise<{ invites: AdminInvite[] }> {
    requireUnlocked();
    return Promise.resolve({ invites: clone(mockAdminInvites) });
  },
  createInvite(ttlSeconds = 7 * 86400): Promise<InviteResult> {
    requireUnlocked();
    const invite: AdminInvite = {
      id: mockAdminInvites.length + 1, created_by: 1,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      used_by: null, used_at: null, created_at: new Date().toISOString(),
    };
    mockAdminInvites.unshift(invite);
    return Promise.resolve({ ok: true, code: `msi-mock-${invite.id}-demo`, expires_at: invite.expires_at });
  },
  setUserDisabled(id, disabled): Promise<OkResponse> {
    requireUnlocked();
    const user = mockAdminUsers.find((u) => u.id === id);
    if (!user) fail('user not found');
    user.disabled_at = disabled ? new Date().toISOString() : null;
    return Promise.resolve({ ok: true });
  },
  deleteUser(id): Promise<OkResponse> {
    requireUnlocked();
    const idx = mockAdminUsers.findIndex((u) => u.id === id);
    if (idx < 0) fail('user not found');
    mockAdminUsers.splice(idx, 1);
    return Promise.resolve({ ok: true });
  },

  agentTokens(): Promise<{ tokens: AgentToken[] }> {
    requireUnlocked();
    return Promise.resolve({ tokens: clone(mockTokens) });
  },
  createAgentToken(label, readOnly): Promise<AgentTokenResult> {
    requireUnlocked();
    if (!label.trim()) fail('label is required');
    const token: AgentToken = {
      token_id: Math.random().toString(16).slice(2, 18).padEnd(16, '0'),
      mode: readOnly ? 'read' : 'write', label: label.trim(),
      created_at: new Date().toISOString(), last_used_at: null, revoked_at: null,
    };
    mockTokens.unshift(token);
    return Promise.resolve({
      ok: true, token: `msk_${token.token_id}.mock-secret`,
      token_id: token.token_id, label: token.label, mode: token.mode, created_at: token.created_at,
    });
  },
  revokeAgentToken(id): Promise<OkResponse> {
    requireUnlocked();
    const token = mockTokens.find((t) => t.token_id === id);
    if (!token) fail('token not found');
    token.revoked_at = new Date().toISOString();
    return Promise.resolve({ ok: true });
  },
  exportBundle(): Promise<ExportBundle> {
    requireUnlocked();
    const data: ExportBundle = {
      exported_at: new Date().toISOString(),
      decks: summaries().map((d) => ({
        name: d.name, description: d.description,
        cards: cards.filter((c) => c.deck_id === d.id).map(publicCard),
      })),
      quizzes: quizzes.map((q) => ({ ...clone(q), questions: questionDtos(q.id, true) })),
      srs: [], attempts: clone(attempts),
    };
    return Promise.resolve(data);
  },

  decks() {
    return Promise.resolve({ decks: clone(summaries()) });
  },

  createDeck({ name, description }) {
    if (!name || !String(name).trim()) fail('name is required');
    if (decks.some((d) => d.name.toLowerCase() === String(name).trim().toLowerCase())) fail('deck name exists');
    const deck = { id: nextDeckId++, name: String(name).trim(), description: description || '', created_at: iso(0) };
    decks.push(deck);
    return Promise.resolve({ ok: true, deck: clone(deck) });
  },

  updateDeck(id, patch) {
    const deck = resolveDeck(Number.isNaN(Number(id)) ? id : Number(id));
    if (patch.name !== undefined) {
      const name = String(patch.name).trim();
      if (!name) fail('name is required');
      if (decks.some((d) => d.id !== deck.id && d.name.toLowerCase() === name.toLowerCase())) fail('deck name exists');
      deck.name = name;
    }
    if (patch.description !== undefined) deck.description = patch.description;
    return Promise.resolve({ ok: true, deck: clone(deck) });
  },

  deleteDeck(id, confirmName, deleteQuizzes = false) {
    const deck = resolveDeck(Number.isNaN(Number(id)) ? id : Number(id));
    if (confirmName !== deck.name) fail('confirm_name mismatch');
    if (deleteQuizzes) {
      for (const q of [...quizzes]) if (q.deck_id === deck.id) removeQuiz(q.id);
    } else {
      quizzes.forEach((q) => { if (q.deck_id === deck.id) q.deck_id = null; });
    }
    for (let i = cards.length - 1; i >= 0; i--) if (cards[i].deck_id === deck.id) cards.splice(i, 1);
    decks.splice(decks.indexOf(deck), 1);
    return Promise.resolve({ ok: true });
  },

  cards({ deck } = {}) {
    let rows = cards;
    if (deck !== undefined && deck !== null && deck !== '') {
      const d = resolveDeck(Number.isNaN(Number(deck)) ? deck : Number(deck));
      rows = rows.filter((c) => c.deck_id === d.id);
    }
    return Promise.resolve({ cards: clone(rows.map(publicCard)), total: rows.length });
  },

  addCards(deck, incoming) {
    const d = resolveDeck(Number.isNaN(Number(deck)) ? deck : Number(deck));
    const ids = [];
    for (const c of incoming) {
      if (!c.front || !c.back) fail('front and back are required');
      const card = {
        id: nextCardId++,
        deck_id: d.id,
        front: c.front,
        back: c.back,
        tags: c.tags || [],
        source: c.source || 'ai',
        reps: 0,
        due: true,
      };
      cards.push(card);
      ids.push(card.id);
    }
    return Promise.resolve({ ok: true, card_ids: ids });
  },

  importBundle(bundle) {
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) fail('bundle must be an object');
    const decksIn = bundle.decks || [];
    const quizzesIn = bundle.quizzes || [];
    if (!Array.isArray(decksIn) || !Array.isArray(quizzesIn)) fail('decks and quizzes must be arrays');
    if (!decksIn.length && !quizzesIn.length) fail('nothing to import');
    const counts = {
      ok: true as const, decks_created: 0, decks_reused: 0, cards_added: 0,
      quizzes_created: 0, questions_added: 0,
    };
    const ids = new Map();
    for (const d of decksIn) {
      if (!d.name || typeof d.name !== 'string') fail('deck name is required');
      let deck = decks.find((x) => x.name.toLowerCase() === d.name.toLowerCase());
      if (deck) counts.decks_reused++;
      else {
        deck = { id: nextDeckId++, name: d.name, description: d.description || '', created_at: iso(0) };
        decks.push(deck);
        counts.decks_created++;
      }
      ids.set(d.name.toLowerCase(), deck.id);
      for (const c of d.cards || []) {
        if (!c.front || !c.back) fail('front and back are required');
        cards.push({
          id: nextCardId++, deck_id: deck.id, front: c.front, back: c.back,
          tags: c.tags || [], source: 'import', reps: 0, due: true,
        });
        counts.cards_added++;
      }
    }
    const usedDecks = new Set();
    for (const q of quizzesIn) {
      if (!q.title || typeof q.title !== 'string') fail('quiz title is required');
      if (!Array.isArray(q.questions) || !q.questions.length) fail('quiz needs at least one question');
      let deckId = null;
      if (q.deck !== undefined && q.deck !== null && q.deck !== '') {
        const key = String(q.deck).toLowerCase();
        const found = ids.get(key) || (Number.isNaN(Number(q.deck))
          ? decks.find((d) => d.name.toLowerCase() === key)
          : decks.find((d) => d.id === Number(q.deck)));
        if (!found) fail('deck not found: ' + q.deck);
        deckId = found.id;
      }
      if (deckId !== null) {
        if (usedDecks.has(deckId) || quizzes.some((x) => x.deck_id === deckId))
          fail('a deck can only have one quiz');
        usedDecks.add(deckId);
      }
      const quiz: QuizFixture = {
        id: nextQuizId++, deck_id: deckId, title: q.title,
        description: q.description || '', source: 'import' as Source,
        shuffle: q.shuffle ? 1 : 0, created_at: iso(0),
      };
      quizzes.push(quiz);
      counts.quizzes_created++;
      for (const question of q.questions) {
        let answer;
        if (question.type === 'mcq' || question.type === 'multi') answer = { correct: question.correct };
        else if (question.type === 'numeric') answer = {
          value: question.value, tolerance: question.tolerance ?? 0,
          tolerance_type: question.tolerance_type || 'abs', unit: question.unit ?? null,
        };
        else answer = { reference: question.reference, rubric: question.rubric || null };
        questions.push({
          id: nextQuestionId++, quiz_id: quiz.id,
          position: questions.filter((x) => x.quiz_id === quiz.id).length + 1,
          type: question.type, prompt: question.prompt,
          choices: (question.type === 'mcq' || question.type === 'multi') ? question.choices : undefined,
          answer, points: question.points ?? 1, explanation: question.explanation || '',
        });
        counts.questions_added++;
      }
    }
    return Promise.resolve(counts);
  },

  sharedQuizzes(opts = {}) {
    const q = (opts.q || '').trim().toLowerCase();
    const items = sharedLibrary.filter((item) => {
      if (opts.mine && item.sourceQuizId === null) return false;
      if (!q) return true;
      return (item.summary.title + ' ' + item.summary.description + ' ' + item.summary.owner_username)
        .toLowerCase().includes(q);
    });
    const limit = Math.min(Math.max(opts.limit || 50, 1), 100);
    return Promise.resolve({
      quizzes: items.slice(0, limit).map((item) => ({
        ...clone(item.summary), mine: item.sourceQuizId !== null,
      })),
    });
  },

  sharedQuiz(id) {
    const item = sharedLibrary.find((s) => s.summary.id === id);
    if (!item) fail('shared quiz not found');
    return Promise.resolve({
      ...clone(item.summary), mine: item.sourceQuizId !== null, questions: clone(item.questions),
    });
  },

  sharedStatus(quizId) {
    const item = sharedLibrary.find((s) => s.sourceQuizId === quizId);
    const status: SharedStatus | null = item
      ? { shared_id: item.summary.id, stale: sharedMineStale, updated_at: item.summary.updated_at }
      : null;
    return Promise.resolve({ status });
  },

  publishQuiz(quizId) {
    const quiz = quizzes.find((q) => q.id === quizId);
    if (!quiz) fail('quiz not found');
    const dtoQuestions = questionDtos(quizId, true);
    const questions: SharedQuestionDto[] = dtoQuestions.map((q) => ({
      position: q.position, type: q.type, prompt: q.prompt, explanation: q.explanation,
      points: q.points, ...(q.choices ? { choices: q.choices } : {}), answer: q.answer ?? {},
    }));
    let item = sharedLibrary.find((s) => s.sourceQuizId === quizId);
    if (item) {
      item.summary = {
        ...item.summary, title: quiz.title, description: quiz.description,
        shuffle: !!quiz.shuffle, question_count: questions.length,
        total_points: questions.reduce((a, q) => a + q.points, 0),
        updated_at: iso(0), mine: true,
      };
      item.questions = questions;
    } else {
      item = {
        summary: {
          id: 103 + sharedLibrary.length, title: quiz.title, description: quiz.description,
          owner_username: 'you', shuffle: !!quiz.shuffle, question_count: questions.length,
          total_points: questions.reduce((a, q) => a + q.points, 0),
          published_at: iso(0), updated_at: iso(0), mine: true,
        },
        questions, sourceQuizId: quizId,
      };
      sharedLibrary.unshift(item);
    }
    sharedMineStale = false;
    const response: SharedPublishResponse = { ok: true, quiz: clone(item.summary) };
    return Promise.resolve(response);
  },

  unpublishSharedQuiz(id) {
    const idx = sharedLibrary.findIndex((s) => s.summary.id === id);
    if (idx < 0) fail('shared quiz not found');
    if (sharedLibrary[idx]!.sourceQuizId === null) fail('only the publisher can remove a shared quiz');
    sharedLibrary.splice(idx, 1);
    sharedMineStale = false;
    return Promise.resolve({ ok: true as const });
  },

  async importSharedQuiz(id) {
    const item = sharedLibrary.find((s) => s.summary.id === id);
    if (!item) fail('shared quiz not found');
    return api.importBundle({
      quizzes: [{
        title: item.summary.title, description: item.summary.description,
        shuffle: item.summary.shuffle,
        questions: item.questions.map((q) => ({
          type: q.type, prompt: q.prompt, explanation: q.explanation, points: q.points,
          ...(q.choices ? { choices: q.choices } : {}), ...q.answer,
        })) as never,
      }],
    });
  },

  updateCard(id, patch) {
    const card = cards.find((c) => c.id === id);
    if (!card) fail('card not found');
    Object.assign(card, {
      front: patch.front ?? card.front,
      back: patch.back ?? card.back,
      tags: patch.tags ?? card.tags,
    });
    return Promise.resolve({ ok: true, card: publicCard(card) });
  },

  adjustCardSchedule(id, patch) {
    const card = cards.find((c) => c.id === id);
    if (!card) fail('card not found');
    if (patch.ignored !== undefined) card.ignored = patch.ignored;
    if (patch.due_now || patch.adjust_minutes !== undefined) {
      const base = patch.due_now ? Date.now() : dueAtMs(card);
      const dueAt = base + (patch.adjust_minutes ?? 0) * 60000;
      card.due_at_ms = dueAt;
      card.due = dueAt <= Date.now();
    }
    return Promise.resolve({ ok: true });
  },

  deleteCards(ids) {
    for (const id of ids) {
      const idx = cards.findIndex((c) => c.id === id);
      if (idx >= 0) cards.splice(idx, 1);
    }
    return Promise.resolve({ ok: true });
  },

  reviewQueue(deck, limit = 10) {
    const d = resolveDeck(Number.isNaN(Number(deck)) ? deck : Number(deck));
    const rows = cards.filter((c) => c.deck_id === d.id && c.due && !c.ignored).slice(0, limit);
    return Promise.resolve({ cards: clone(rows.map(withPreview)) });
  },

  review(cardId, rating) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) fail('card not found');
    lastReview = { card, wasDue: card.due, reps: card.reps };
    card.due = false;
    card.reps = rating === 0 ? 0 : card.reps + 1;
    return Promise.resolve({ ok: true, review_id: Date.now() });
  },

  undo() {
    if (!lastReview) fail('no review to undo');
    lastReview.card.due = lastReview.wasDue;
    lastReview.card.reps = lastReview.reps;
    lastReview = null;
    return Promise.resolve({ ok: true, card_id: 0 });
  },

  quizzes(deck) {
    let rows = quizzes;
    if (deck !== undefined && deck !== null) {
      const d = resolveDeck(deck);
      rows = rows.filter((q) => q.deck_id === d.id);
    }
    const out = rows.map((q) => {
      const qs = questions.filter((x) => x.quiz_id === q.id);
      return {
        ...clone(q),
        question_count: qs.length,
        total_points: qs.reduce((a, x) => a + x.points, 0),
      };
    });
    return Promise.resolve({ quizzes: out });
  },

  quiz(id, { includeAnswers = true } = {}) {
    const quiz = quizzes.find((q) => String(q.id) === String(id));
    if (!quiz) fail('quiz not found');
    return Promise.resolve({ quiz: clone(quiz), questions: questionDtos(quiz.id, includeAnswers) });
  },

  updateQuiz(id, patch) {
    const quiz = quizzes.find((q) => String(q.id) === String(id));
    if (!quiz) fail('quiz not found');
    Object.assign(quiz, {
      title: patch.title ?? quiz.title,
      description: patch.description ?? quiz.description,
      shuffle: patch.shuffle === undefined ? quiz.shuffle : (patch.shuffle ? 1 : 0),
    });
    return Promise.resolve({ ok: true as const, quiz: clone(quiz) });
  },

  deleteQuiz(id, confirmTitle, deleteDeck = false) {
    const quiz = quizzes.find((q) => String(q.id) === String(id));
    if (!quiz) fail('quiz not found');
    if (confirmTitle !== quiz.title) fail('confirm_title mismatch');
    const deckId = quiz.deck_id;
    removeQuiz(quiz.id);
    if (deleteDeck && deckId != null) {
      const deck = decks.find((d) => d.id === deckId);
      if (deck) {
        quizzes.forEach((q) => { if (q.deck_id === deckId) q.deck_id = null; });
        for (let i = cards.length - 1; i >= 0; i--) if (cards[i].deck_id === deckId) cards.splice(i, 1);
        decks.splice(decks.indexOf(deck), 1);
      }
    }
    return Promise.resolve({ ok: true });
  },

  attempts({ quizId, limit = 20 } = {}) {
    let rows = attempts;
    if (quizId !== undefined) rows = rows.filter((a) => a.quiz_id === Number(quizId));
    rows = [...rows].sort((a, b) => b.id - a.id).slice(0, limit);
    return Promise.resolve({ attempts: clone(rows) });
  },

  attempt(id, { includeAnswers = true } = {}) {
    const attempt = attempts.find((a) => String(a.id) === String(id));
    if (!attempt) fail('attempt not found');
    let order: number[] | null = null;
    if (attempt.question_order_json) {
      try { order = JSON.parse(attempt.question_order_json) as number[]; } catch { /* ignore bad order */ }
    }
    return Promise.resolve({
      attempt: clone(attempt),
      answers: clone(answers.filter((a) => a.attempt_id === attempt.id)),
      questions: questionDtos(attempt.quiz_id, includeAnswers, order),
    });
  },

  startAttempt(quizId) {
    const quiz = quizzes.find((q) => q.id === Number(quizId));
    if (!quiz) fail('quiz not found');
    const quizQuestions = questions.filter((q) => q.quiz_id === quiz.id);
    const max = quizQuestions.reduce((a, q) => a + q.points, 0);
    const attempt: AttemptFixture = {
      id: Math.max(...attempts.map((a) => a.id), 0) + 1,
      quiz_id: quiz.id,
      started_at: iso(0),
      submitted_at: null,
      status: 'in_progress' as const,
      score: null,
      max_score: max,
      question_order_json: quiz.shuffle
        ? JSON.stringify(shuffled(quizQuestions.map((q) => q.id)))
        : null,
    };
    attempts.push(attempt);
    return Promise.resolve({ ok: true, attempt: clone(attempt) });
  },

  restartAttempt(quizId) {
    for (let i = attempts.length - 1; i >= 0; i--) {
      const a = attempts[i];
      if (a.quiz_id !== Number(quizId) || a.status !== 'in_progress') continue;
      for (let j = answers.length - 1; j >= 0; j--) {
        if (answers[j].attempt_id === a.id) answers.splice(j, 1);
      }
      attempts.splice(i, 1);
    }
    return this.startAttempt(quizId);
  },

  answerAttempt(attemptId, questionId, response) {
    const attempt = attempts.find((a) => a.id === Number(attemptId));
    if (!attempt) fail('attempt not found');
    if (attempt.status !== 'in_progress') fail('attempt is not in progress');
    const q = questions.find((x) => String(x.id) === String(questionId));
    if (!q) fail('question not found');
    const value = typeof response === 'string' ? response : JSON.stringify(response);
    const g = autoGrade(q, value);
    let row = answers.find((a) => a.attempt_id === attempt.id && a.question_id === q.id);
    if (!row) {
      row = {
        id: answers.length + 1,
        attempt_id: attempt.id,
        question_id: q.id,
        response: value,
        grading_status: 'pending',
        is_correct: null,
        points_awarded: null,
        feedback: '',
        graded_by: null,
        graded_at: null,
      };
      answers.push(row);
    }
    Object.assign(row, {
      response: value,
      grading_status: g.status,
      is_correct: g.is_correct,
      points_awarded: g.points,
      feedback: g.feedback,
      graded_by: g.status === 'graded' ? 'auto' : null,
      graded_at: g.status === 'graded' ? iso(0) : null,
    });
    return Promise.resolve({ ok: true, answer_id: row.id });
  },

  submitAttempt(id) {
    const attempt = attempts.find((a) => a.id === Number(id));
    if (!attempt) fail('attempt not found');
    attempt.submitted_at = iso(0);
    recompute(attempt.id);
    return Promise.resolve({ ok: true, attempt: clone(attempt) });
  },

  pending(limit = 20) {
    const rows = answers
      .filter((a) => {
        if (a.grading_status !== 'pending') return false;
        const attempt = attempts.find((x) => x.id === a.attempt_id);
        return attempt && attempt.status !== 'in_progress';
      })
      .slice(0, limit)
      .map((a) => {
        const q = questions.find((x) => x.id === a.question_id);
        if (!q) throw new Error('question not found');
        return {
          answer_id: a.id,
          attempt_id: a.attempt_id,
          question_type: q.type,
          prompt: q.prompt,
          reference: q.answer?.reference || null,
          rubric: q.answer?.rubric || null,
          max_points: q.points,
          response: a.response,
        };
      });
    return Promise.resolve({ answers: clone(rows) });
  },

  grade(answerId, points, feedback) {
    const row = answers.find((a) => a.id === Number(answerId));
    if (!row) fail('answer not found');
    const q = questions.find((x) => x.id === row.question_id);
    if (!q) fail('question not found');
    if (points < 0 || points > q.points) fail('points out of range');
    const attempt = attempts.find((a) => a.id === row.attempt_id);
    if (!attempt) fail('attempt not found');
    Object.assign(row, {
      grading_status: 'graded',
      is_correct: points >= q.points ? 1 : points > 0 ? null : 0,
      points_awarded: points,
      feedback,
      graded_by: 'manual',
      graded_at: iso(0),
    });
    recompute(attempt.id);
    return Promise.resolve({ ok: true, answer: { id: row.id }, attempt: clone(attempt) });
  },

  stats() {
    const total = cards.length;
    return Promise.resolve({
      total,
      due: cards.filter((c) => c.due && !c.ignored).length,
      reviews_per_day: clone(reviewsPerDay),
      retention: 87.2,
      interval_distribution: [
        { bucket: 'new', cards: cards.filter((c) => c.reps === 0).length },
        { bucket: 'learning', cards: cards.filter((c) => c.reps > 0 && c.reps < 3).length },
        { bucket: 'mature', cards: cards.filter((c) => c.reps >= 3).length },
      ],
      weakest_tags: [
        { tag: 'series', cards: 3, lapses: 2.3 },
        { tag: 'eigenvalues', cards: 2, lapses: 1.5 },
        { tag: 'kinematics', cards: 1, lapses: 0.8 },
      ],
    });
  },

  uiContext() {
    return Promise.resolve({ context: mockUiContext });
  },
  setUiContext(input: UiContextInput) {
    mockUiContext = {
      view: input.view, deck_id: input.deck_id ?? null, card_id: input.card_id ?? null,
      flipped: input.flipped ?? false, quiz_id: input.quiz_id ?? null,
      attempt_id: input.attempt_id ?? null, question_id: input.question_id ?? null,
      question_position: input.question_position ?? null, updated_at: new Date().toISOString(),
    };
    return Promise.resolve({ ok: true as const, context: mockUiContext });
  },

  subscribe() {
    return () => {};
  },
};

// Keep every data method behind the lock, including ones added later. Public
// auth methods and the SSE stub stay reachable from the gate.
const guarded = { ...api } as Api;
for (const key of Object.keys(api) as Array<keyof Api>) {
  if (key === 'auth' || key === 'subscribe') continue;
  const method = api[key] as (...args: unknown[]) => unknown;
  (guarded as unknown as Record<string, unknown>)[key] = (...args: unknown[]) => {
    requireUnlocked();
    return method.apply(api, args);
  };
}

export default guarded;
