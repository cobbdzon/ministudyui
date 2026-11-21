// Demo seed: fills the store with the same sample content the mock UI uses.
// Safe to re-run: it does nothing once the database already has decks.
// For a real, empty database use `bun run seed` instead.
import type { SQLQueryBindings } from 'bun:sqlite';
import * as store from '../src/boxes/store/index.js';
import * as scope from '../src/boxes/scope/index.js';
import * as vault from '../src/boxes/vault/index.js';
import * as auth from '../src/boxes/auth/index.js';
import * as userdb from '../src/boxes/userdb/index.js';
import { dataDir, ensureDataDir, userDbPath } from '../src/boxes/paths.js';

// Demo user with its own per-user DB. The default passphrase is INSECURE and
// only for local demos; set DEMO_PASSPHRASE to override it.
ensureDataDir();
auth.open();
auth.migrate();
const passphrase = process.env.DEMO_PASSPHRASE || 'insecure-demo-passphrase';
const cost = { kdfCost: { N: 16, r: 8, p: 1 } };
let demo = auth.listUsers().find((u) => u.username === 'demo');
if (!demo) demo = (await auth.createUser({ username: 'demo', passphrase, admin: !auth.hasUsers(), ...cost })).user;
const unlocked = await auth.login('demo', passphrase, 'seed-demo', cost);
const db = userdb.open(demo.id);
const scoped = <T>(fn: () => T): T => scope.run({ userId: demo.id, db, keys: unlocked.keys }, fn);

const existing = scoped(() => store.get<{ n: number }>('SELECT COUNT(*) AS n FROM decks')?.n ?? 0);
if (existing > 0) {
  console.log(`seed: ${userDbPath(demo.id)} already has ${existing} deck(s); nothing to do.`);
  userdb.release(demo.id);
  auth.close();
  process.exit(0);
}

const NOW = Date.now();
const iso = (daysAgo = 0, minutesAgo = 0) =>
  new Date(NOW - daysAgo * 86400000 - minutesAgo * 60000).toISOString();

const decks = [
  { id: 1, name: 'Calculus II', description: 'Integration by parts, sequences, and series convergence.', created_at: iso(40) },
  { id: 2, name: 'Linear Algebra', description: 'Vector spaces, eigenvalues, and the geometry behind matrices.', created_at: iso(32) },
  { id: 3, name: 'Physics 201', description: 'Mechanics and oscillations, derived rather than memorized.', created_at: iso(21) },
];

// [id, deck_id, front, back, tags, source, reps, due]
const cards: Array<[number, number, string, string, string[], string, number, boolean]> = [
  [1, 1, 'Evaluate $\\int_0^1 x^2\\,dx$.', '$\\dfrac{1}{3}$', ['integrals', 'definite'], 'user', 4, false],
  [2, 1, 'What is $\\dfrac{d}{dx}\\ln x$?', '$\\dfrac{1}{x}$ for $x>0$.', ['derivatives'], 'user', 4, false],
  [3, 1, 'State the ratio test for $\\sum a_n$.', 'If $\\lim_{n\\to\\infty}\\left|\\dfrac{a_{n+1}}{a_n}\\right| < 1$, the series converges absolutely.', ['series'], 'ai', 3, false],
  [4, 1, 'Evaluate $\\int x e^x\\,dx$.', '$e^x(x-1)+C$, using parts with $u=x$ and $dv=e^x\\,dx$.', ['integration-by-parts'], 'ai', 2, true],
  [5, 1, 'What does $\\sum_{n=1}^{\\infty} \\dfrac{1}{n^p}$ do for $p>1$?', 'It converges: a $p$-series with $p>1$.', ['series'], 'ai', 1, true],
  [6, 1, 'Give the Taylor series of $e^x$ about $0$.', '$\\sum_{n=0}^{\\infty} \\dfrac{x^n}{n!}$', ['series', 'taylor'], 'ai', 0, true],
  [7, 1, 'Compute $\\int_0^{\\pi} \\sin x\\,dx$.', '$2$', ['integrals'], 'user', 0, true],
  [8, 1, 'A deliberately broken formula $\\frac{1}{2$ should stay inline.', 'KaTeX reports it without breaking the page, so the fixture stays useful.', ['fixture'], 'ai', 0, false],
  [9, 1, 'What is $\\int \\dfrac{1}{x}\\,dx$?', '$\\ln|x| + C$', ['integrals'], 'user', 3, false],
  [10, 2, 'Find the eigenvalues of $A=\\begin{pmatrix}2&1\\\\1&2\\end{pmatrix}$.', '$\\lambda=1$ and $\\lambda=3$. The eigenvectors are symmetric and antisymmetric.', ['eigenvalues'], 'ai', 4, true],
  [11, 2, 'What is $\\det(AB)$?', '$\\det A \\cdot \\det B$', ['determinants'], 'user', 3, false],
  [12, 2, 'When is a set of vectors linearly independent?', 'When $\\sum c_i v_i = 0$ forces every $c_i = 0$.', ['independence'], 'ai', 0, true],
  [13, 2, 'What does a zero eigenvalue say about a matrix?', 'It is not invertible: $\\det A = 0$, so $A^{-1}$ does not exist.', ['eigenvalues'], 'ai', 2, false],
  [14, 2, 'State the rank-nullity theorem.', '$\\dim V = \\operatorname{rank} T + \\operatorname{nullity} T$', ['rank'], 'user', 3, false],
  [15, 2, 'Compute $\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}\\begin{pmatrix}x\\\\y\\end{pmatrix}$.', '$\\begin{pmatrix}x+2y\\\\3x+4y\\end{pmatrix}$', ['matrices'], 'user', 0, false],
  [16, 3, 'A mass on a spring obeys $m\\ddot{x} = -kx$. What is its angular frequency?', '$\\omega = \\sqrt{k/m}$, so $x(t) = A\\cos(\\omega t + \\phi)$.', ['oscillations'], 'ai', 4, true],
  [17, 3, "State Newton's second law for a variable mass.", '$F = \\dfrac{dp}{dt} = m\\dfrac{dv}{dt} + v\\dfrac{dm}{dt}$', ['mechanics'], 'ai', 3, false],
  [18, 3, 'What is the period of a pendulum at small angles?', '$T = 2\\pi\\sqrt{L/g}$, independent of mass.', ['oscillations'], 'user', 3, false],
  [19, 3, 'A projectile leaves at $v_0$ and angle $\\theta$. Write its range.', '$R = \\dfrac{v_0^2 \\sin 2\\theta}{g}$, for level ground.', ['kinematics'], 'ai', 0, false],
  [20, 3, 'What is the work done by a constant force over a displacement?', '$W = \\vec{F}\\cdot\\vec{d} = Fd\\cos\\theta$', ['energy'], 'user', 2, false],
];

const quizzes = [
  { id: 1, deck_id: 1, title: 'Integration by parts', description: 'Four questions on choosing parts, definite integrals, and one worked solution.', source: 'ai', created_at: iso(6) },
  { id: 2, deck_id: 2, title: 'Eigenvalues check', description: 'A quick numeric check, then a proof you write out.', source: 'ai', created_at: iso(3) },
];

// [id, quiz_id, position, type, prompt, choices|null, answer, explanation, points]
const questions: Array<[number, number, number, string, string, unknown, Record<string, unknown>, string, number]> = [
  [1, 1, 1, 'mcq', 'Which choice of $u$ and $dv$ makes $\\int x e^x\\,dx$ easiest?',
    [{ id: 'a', text: 'u = x, dv = e^x dx' }, { id: 'b', text: 'u = e^x, dv = x dx' }, { id: 'c', text: 'u = x e^x, dv = dx' }],
    { correct: 'a' }, 'Differentiating $u=x$ gives $dx$, so the remaining integral is just $\\int e^x dx$.', 1],
  [2, 1, 2, 'numeric', 'Compute $\\int_0^1 x^2\\,dx$.', null,
    { value: 1 / 3, tolerance: 0.001, tolerance_type: 'abs', unit: null }, '$\\left[x^3/3\\right]_0^1 = 1/3$.', 1],
  [3, 1, 3, 'latex', 'Compute $\\int x\\cos x\\,dx$. Show the integration by parts.', null,
    { reference: '$x\\sin x + \\cos x + C$', rubric: 'Correct choice of parts (1), correct antiderivative (1), constant of integration (1).' },
    'Take $u=x$, $dv=\\cos x\\,dx$, then $\\int x\\cos x\\,dx = x\\sin x + \\cos x + C$.', 3],
  [4, 1, 4, 'mcq', 'Which $p$-series converges?',
    [{ id: 'a', text: '$p=1$' }, { id: 'b', text: '$p=2$' }, { id: 'c', text: '$p=\\tfrac12$' }],
    { correct: 'b' }, '$\\sum 1/n^p$ converges only for $p>1$.', 1],
  [5, 2, 1, 'numeric', 'For $A=\\begin{pmatrix}2&1\\\\1&2\\end{pmatrix}$, enter the larger eigenvalue.', null,
    { value: 3, tolerance: 0.01, tolerance_type: 'abs', unit: null }, 'The characteristic polynomial is $(2-\\lambda)^2-1$, so $\\lambda=1,3$.', 1],
  [6, 2, 2, 'mcq', 'A real $2\\times2$ matrix has two distinct real eigenvalues. What follows?',
    [{ id: 'a', text: 'It is diagonalizable.' }, { id: 'b', text: 'It is orthogonal.' }, { id: 'c', text: 'It is singular.' }],
    { correct: 'a' }, 'Two independent eigenvectors give a basis of $\\mathbb{R}^2$, so $A=PDP^{-1}$.', 1],
  [7, 2, 3, 'latex', 'Show that eigenvectors of a symmetric matrix with distinct eigenvalues are orthogonal.', null,
    { reference: 'If $Av=\\lambda v$ and $Aw=\\mu w$ with $\\lambda\\ne\\mu$, then $\\lambda v\\cdot w=(Av)\\cdot w=v\\cdot(Aw)=\\mu v\\cdot w$, so $(\\lambda-\\mu)v\\cdot w=0$ and $v\\cdot w=0$.',
      rubric: 'Uses symmetry $A^T=A$ (2), compares both expansions of $v^T A w$ (1), concludes orthogonality (1).' },
    'Symmetry lets you move $A$ from one side of the inner product to the other.', 4],
];

// [id, quiz_id, started_at, submitted_at, status, score, max_score]
const attempts: Array<[number, number, string, string | null, string, number | null, number]> = [
  [1, 1, iso(3, 40), iso(3, 20), 'graded', 5, 6],
  [2, 2, iso(2, 30), iso(2, 18), 'submitted', 2, 6],
  [3, 1, iso(1, 55), iso(1, 40), 'submitted', 2, 6],
  [4, 1, iso(0, 12), null, 'in_progress', null, 6],
];

// [attempt_id, question_id, response, grading_status, is_correct, points, feedback, graded_by, graded_at]
const answers: Array<[number, number, string, string, number | null, number | null, string, string | null, string | null]> = [
  [1, 1, 'a', 'graded', 1, 1, 'Correct.', 'auto', iso(3)],
  [1, 2, String(1 / 3), 'graded', 1, 1, 'Correct.', 'auto', iso(3)],
  [1, 3, '$x\\sin x + \\cos x$', 'graded', null, 2, 'Parts are right. The constant of integration is missing.', 'ai', iso(3)],
  [1, 4, 'b', 'graded', 1, 1, 'Correct.', 'auto', iso(3)],
  [2, 5, '3', 'graded', 1, 1, 'Correct.', 'auto', iso(2)],
  [2, 6, 'a', 'graded', 1, 1, 'Correct.', 'auto', iso(2)],
  [2, 7, '$Av=\\lambda v$, $Aw=\\mu w$, and $A=A^T$, so $v^T A w = \\lambda v^T w = \\mu v^T w$.', 'pending', null, null, '', null, null],
  [3, 1, 'b', 'graded', 0, 0, 'Incorrect.', 'auto', iso(1)],
  [3, 2, '0.33', 'graded', 1, 1, 'Correct.', 'auto', iso(1)],
  [3, 3, '$x\\sin x + C$', 'pending', null, null, '', null, null],
  [3, 4, 'b', 'graded', 1, 1, 'Correct.', 'auto', iso(1)],
  [4, 1, 'a', 'graded', 1, 1, 'Correct.', 'auto', iso(0, 12)],
  [4, 2, '0.333', 'graded', 1, 1, 'Correct.', 'auto', iso(0, 12)],
];

const reviewSeries = [6, 9, 0, 12, 7, 0, 0, 5, 8, 11, 4, 0, 13, 6, 0, 7, 10, 9, 0, 3, 8, 0, 14, 11, 5, 0, 6, 9, 7, 12];

scoped(() => store.tx(() => {
  const run = (sql: string, params: SQLQueryBindings[] = []) => store.run(sql, params);
  const S = (t: string, col: string, v: string) => vault.seal(t, col, v)!;

  for (const d of decks) {
    run('INSERT INTO decks (id, name, name_key, description, created_at) VALUES (?,?,?,?,?)',
      [d.id, S('decks', 'name', d.name), vault.indexValue(d.name.toLowerCase()), S('decks', 'description', d.description), d.created_at]);
  }

  for (const [id, deckId, front, back, tags, source, reps, due] of cards) {
    run('INSERT INTO cards (id, deck_id, front, back, tags_json, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, deckId, S('cards', 'front', front), S('cards', 'back', back), S('cards', 'tags_json', JSON.stringify(tags)), source, iso(10), iso(2)]);
    // The insert trigger created a default card_state; give it a realistic history.
    const interval = reps === 0 ? 0 : reps === 1 ? 1 : reps === 2 ? 6 : reps === 3 ? 15 : 30;
    run('UPDATE card_state SET ease=?, interval_days=?, reps=?, lapses=?, due_at=?, last_reviewed_at=? WHERE card_id=?',
      [2.5, interval, reps, 0, due ? iso(0, 120) : iso(-7 - reps), reps > 0 ? iso(1) : null, id]);
  }

  // A month of review history so the stats page has a trend to show.
  let cardNo = 0;
  reviewSeries.forEach((count, i) => {
    const daysAgo = reviewSeries.length - 1 - i;
    for (let n = 0; n < count; n++) {
      const cardId = (cardNo++ % cards.length) + 1;
      const prev = { ease: 2.5, interval_days: 0, reps: 0, lapses: 0, due_at: iso(daysAgo + 1), last_reviewed_at: null };
      run('INSERT INTO reviews (card_id, rating, reviewed_at, prev_interval, new_interval, prev_ease, new_ease, prev_state_json) VALUES (?,?,?,?,?,?,?,?)',
        [cardId, 3, iso(daysAgo, 60 - n), 0, 6, 2.5, 2.6, JSON.stringify(prev)]);
    }
  });

  for (const q of quizzes) {
    run('INSERT INTO quizzes (id, deck_id, title, description, source, created_at) VALUES (?,?,?,?,?,?)',
      [q.id, q.deck_id, S('quizzes', 'title', q.title), S('quizzes', 'description', q.description), q.source, q.created_at]);
  }

  for (const [id, quizId, position, type, prompt, choices, answer, explanation, points] of questions) {
    run('INSERT INTO questions (id, quiz_id, position, type, prompt, choices_json, answer_json, explanation, points) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, quizId, position, type, S('questions', 'prompt', prompt),
        choices ? S('questions', 'choices_json', JSON.stringify(choices)) : null,
        S('questions', 'answer_json', JSON.stringify(answer)), S('questions', 'explanation', explanation), points]);
  }

  for (const [id, quizId, startedAt, submittedAt, status, score, maxScore] of attempts) {
    run('INSERT INTO attempts (id, quiz_id, started_at, submitted_at, status, score, max_score) VALUES (?,?,?,?,?,?,?)',
      [id, quizId, startedAt, submittedAt, status, score, maxScore]);
  }

  let answerId = 0;
  for (const [attemptId, questionId, response, status, correct, points, feedback, gradedBy, gradedAt] of answers) {
    run('INSERT INTO answers (id, attempt_id, question_id, response, grading_status, is_correct, points_awarded, feedback, graded_by, graded_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [++answerId, attemptId, questionId, S('answers', 'response', response), status, correct, points,
        S('answers', 'feedback', feedback), gradedBy, gradedAt]);
  }

  // Change records are a live feed for the UI; seed data is not a live change.
  run('DELETE FROM changes');
}));

userdb.release(demo.id);
auth.close();
console.log(`seed: ${userDbPath(demo.id)} — ${decks.length} decks, ${cards.length} cards, ${quizzes.length} quizzes, ${attempts.length} attempts.`);
