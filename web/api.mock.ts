// In-memory fixtures with the same interface as api.js's real adapter.
// Math-heavy content doubles as the KaTeX rendering regression fixture.

const NOW = Date.now();
const iso = (daysAgo = 0, minutesAgo = 0) =>
  new Date(NOW - daysAgo * 86400000 - minutesAgo * 60000).toISOString();
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const fail = (message) => {
  const e = new Error(message);
  e.code = 'VALIDATION';
  throw e;
};

const decks = [
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
const cards = [
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

const quizzes = [
  {
    id: 1,
    deck_id: 1,
    title: 'Integration by parts',
    description: 'Four questions on choosing parts, definite integrals, and one worked solution.',
    source: 'ai',
    created_at: iso(6),
  },
  {
    id: 2,
    deck_id: 2,
    title: 'Eigenvalues check',
    description: 'A quick numeric check, then a proof you write out.',
    source: 'ai',
    created_at: iso(3),
  },
];

const questions = [
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

const answers = [];
const attempts = [
  {
    id: 1,
    quiz_id: 1,
    started_at: iso(3, 40),
    submitted_at: iso(3, 20),
    status: 'graded',
    score: 5,
    max_score: 6,
  },
  {
    id: 2,
    quiz_id: 2,
    started_at: iso(2, 30),
    submitted_at: iso(2, 18),
    status: 'submitted',
    score: 2,
    max_score: 6,
  },
  {
    id: 3,
    quiz_id: 1,
    started_at: iso(1, 55),
    submitted_at: iso(1, 40),
    status: 'submitted',
    score: 2,
    max_score: 6,
  },
  {
    id: 4,
    quiz_id: 1,
    started_at: iso(0, 12),
    submitted_at: null,
    status: 'in_progress',
    score: null,
    max_score: 6,
  },
];

function addAnswer(attemptId, questionId, response, grading, gradedBy, feedback = '') {
  const id = answers.length + 1;
  answers.push({
    id,
    attempt_id: attemptId,
    question_id: questionId,
    response,
    grading_status: gradedBy ? 'graded' : 'pending',
    is_correct: grading,
    points_awarded: gradedBy ? grading === 1 ? questions.find((q) => q.id === questionId).points : 0 : null,
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

let lastReview = null;
let nextDeckId = 4;
let nextCardId = 21;

function summaries() {
  return decks.map((d) => {
    const own = cards.filter((c) => c.deck_id === d.id);
    return {
      ...d,
      total: own.length,
      due: own.filter((c) => c.due).length,
      new: own.filter((c) => c.reps === 0).length,
      mature: own.filter((c) => c.reps >= 3).length,
    };
  });
}

function resolveDeck(ref) {
  const deck = typeof ref === 'number' ? decks.find((d) => d.id === ref) : decks.find((d) => d.name.toLowerCase() === String(ref).toLowerCase());
  if (!deck) throw new Error('deck not found');
  return deck;
}

function withPreview(card) {
  return {
    id: card.id,
    front: card.front,
    back: card.back,
    tags: [...card.tags],
    source: card.source,
    preview:
      card.reps === 0
        ? { again: '10m', hard: '1d', good: '1d', easy: '1d' }
        : card.reps < 3
          ? { again: '10m', hard: '2d', good: '4d', easy: '6d' }
          : { again: '10m', hard: '12d', good: '20d', easy: '30d' },
  };
}

function publicCard(card) {
  return {
    id: card.id,
    deck_id: card.deck_id,
    front: card.front,
    back: card.back,
    tags: [...card.tags],
    source: card.source,
    created_at: iso(10),
    updated_at: iso(2),
  };
}

function autoGrade(q, response) {
  const ans = q.answer || {};
  if (q.type === 'mcq') {
    const ok = String(response).trim() === String(ans.correct);
    return { status: 'graded', is_correct: ok ? 1 : 0, points: ok ? q.points : 0, feedback: ok ? 'Correct.' : 'Incorrect.' };
  }
  if (q.type === 'multi') {
    let got = [];
    try {
      got = JSON.parse(response);
    } catch {
      got = [];
    }
    const want = ans.correct || [];
    const ok = got.length === want.length && got.every((x) => want.includes(x));
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

function recompute(attemptId) {
  const attempt = attempts.find((a) => a.id === attemptId);
  const rows = answers.filter((a) => a.attempt_id === attemptId);
  const pending = rows.filter((a) => a.grading_status === 'pending').length;
  attempt.score = rows.reduce((sum, a) => sum + (a.grading_status === 'graded' ? a.points_awarded || 0 : 0), 0);
  attempt.status = pending ? 'submitted' : attempt.submitted_at ? 'graded' : 'in_progress';
  return attempt;
}

const api = {
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
    const deck = resolveDeck(isNaN(id) ? id : Number(id));
    if (patch.name !== undefined) {
      const name = String(patch.name).trim();
      if (!name) fail('name is required');
      if (decks.some((d) => d.id !== deck.id && d.name.toLowerCase() === name.toLowerCase())) fail('deck name exists');
      deck.name = name;
    }
    if (patch.description !== undefined) deck.description = patch.description;
    return Promise.resolve({ ok: true, deck: clone(deck) });
  },

  cards({ deck } = {}) {
    let rows = cards;
    if (deck !== undefined && deck !== null && deck !== '') {
      const d = resolveDeck(isNaN(deck) ? deck : Number(deck));
      rows = rows.filter((c) => c.deck_id === d.id);
    }
    return Promise.resolve({ cards: clone(rows.map(publicCard)), total: rows.length });
  },

  addCards(deck, incoming) {
    const d = resolveDeck(isNaN(deck) ? deck : Number(deck));
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

  deleteCards(ids) {
    for (const id of ids) {
      const idx = cards.findIndex((c) => c.id === id);
      if (idx >= 0) cards.splice(idx, 1);
    }
    return Promise.resolve({ ok: true });
  },

  reviewQueue(deck, limit = 10) {
    const d = resolveDeck(isNaN(deck) ? deck : Number(deck));
    const rows = cards.filter((c) => c.deck_id === d.id && c.due).slice(0, limit);
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
    return Promise.resolve({ ok: true });
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
    const qs = questions
      .filter((q) => q.quiz_id === quiz.id)
      .map((q) => {
        const out = { ...clone(q), quiz_id: undefined };
        delete out.quiz_id;
        if (!includeAnswers) {
          out.unit = q.answer?.unit ?? null;
          delete out.answer;
        } else if (q.type === 'numeric') {
          out.unit = q.answer?.unit ?? null;
        }
        return out;
      });
    return Promise.resolve({ quiz: clone(quiz), questions: qs });
  },

  attempts({ quizId, limit = 20 } = {}) {
    let rows = attempts;
    if (quizId !== undefined) rows = rows.filter((a) => a.quiz_id === Number(quizId));
    rows = [...rows].sort((a, b) => b.id - a.id).slice(0, limit);
    return Promise.resolve({ attempts: clone(rows) });
  },

  attempt(id) {
    const attempt = attempts.find((a) => String(a.id) === String(id));
    if (!attempt) fail('attempt not found');
    return Promise.resolve({
      attempt: clone(attempt),
      answers: clone(answers.filter((a) => a.attempt_id === attempt.id)),
    });
  },

  startAttempt(quizId) {
    const quiz = quizzes.find((q) => q.id === Number(quizId));
    if (!quiz) fail('quiz not found');
    const max = questions.filter((q) => q.quiz_id === quiz.id).reduce((a, q) => a + q.points, 0);
    const attempt = {
      id: Math.max(...attempts.map((a) => a.id), 0) + 1,
      quiz_id: quiz.id,
      started_at: iso(0),
      submitted_at: null,
      status: 'in_progress',
      score: null,
      max_score: max,
    };
    attempts.push(attempt);
    return Promise.resolve({ ok: true, attempt: clone(attempt) });
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
    if (points < 0 || points > q.points) fail('points out of range');
    const attempt = attempts.find((a) => a.id === row.attempt_id);
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
      due: cards.filter((c) => c.due).length,
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

  subscribe() {
    return () => {};
  },
};

export default api;
