import * as store from '../store/index.js';
import { AppError, asAppError } from '../errors.js';
import type {
  Bundle, CardAddInput, CardDeleteBoxInput, CardDeleteInput, CardRow, CardStateRow, CardUpdateBoxInput,
  Choice, DeckCreated, DeckRef, DeckRow, DeckDeleteBoxInput, DeckUpdateBoxInput,
  MergedQuestion, OkResponse, QuestionAnswer, QuestionDeleteInput, QuestionInput,
  QuestionQuestionPatch, QuestionType, QuestionUpdateInput, QuizAddQuestionsInput,
  QuizCreateInput, QuizDeleteBoxInput, QuizGetInput, QuizListInput, QuizOutlineInput,
  QuizRow, QuizSummary, QuizUpdateInput, Source, ValidatedQuestion,
} from '../../../shared/types.js';

function resolveDeck(deck: DeckRef): DeckRow {
  const r = typeof deck === 'number'
    ? store.get<DeckRow>('SELECT * FROM decks WHERE id=?', [deck])
    : store.get<DeckRow>('SELECT * FROM decks WHERE name=? COLLATE NOCASE', [deck]);
  if (!r) throw new AppError('NOT_FOUND', 'deck not found');
  return r;
}

function getQuiz(quizId: number): QuizRow {
  const quiz = store.get<QuizRow>('SELECT * FROM quizzes WHERE id=?', [quizId]);
  if (!quiz) throw new AppError('NOT_FOUND', 'quiz not found');
  return quiz;
}

function getQuestion(questionId: number): ReturnType<typeof getRawQuestion> {
  return getRawQuestion(questionId);
}

interface RawQuestion {
  id: number; quiz_id: number; position: number; type: QuestionType;
  prompt: string; choices_json: string | null; answer_json: string;
  explanation: string; points: number;
}
function getRawQuestion(questionId: number): RawQuestion {
  const q = store.get<RawQuestion>('SELECT * FROM questions WHERE id=?', [questionId]);
  if (!q) throw new AppError('NOT_FOUND', 'question not found');
  return q;
}

export function deckCreate({ name, description }: { name: string; description?: string }): DeckCreated {
  if (!name || name.length < 1 || name.length > 120) throw new AppError('VALIDATION', 'name length', 'name');
  const d = description || '';
  if (d.length > 2000) throw new AppError('VALIDATION', 'description too long', 'description');
  try {
    const r = store.run('INSERT INTO decks (name, description) VALUES (?,?)', [name, d]);
    return { id: r.lastInsertRowid, name, description: d };
  } catch (e: unknown) {
    if (asAppError(e).message.includes('UNIQUE')) throw new AppError('CONFLICT', 'deck name exists', 'name');
    throw e;
  }
}

export function deckList(): DeckRow[] {
  return store.all<DeckRow>('SELECT * FROM decks ORDER BY name');
}

export function deckDelete({ deck, confirmName, deleteQuizzes = false }: DeckDeleteBoxInput): OkResponse {
  const d = resolveDeck(deck);
  if (confirmName !== d.name) throw new AppError('VALIDATION', 'confirm_name mismatch', 'confirm_name');
  store.tx(() => {
    if (deleteQuizzes) store.run('DELETE FROM quizzes WHERE deck_id=?', [d.id]);
    store.run('DELETE FROM decks WHERE id=?', [d.id]);
  });
  return { ok: true };
}

export function deckUpdate({ deck, name, description }: DeckUpdateBoxInput): { ok: true; deck: DeckCreated } {
  if (deck === undefined || deck === null) throw new AppError('VALIDATION', 'deck required', 'deck');
  if (name === undefined && description === undefined) throw new AppError('VALIDATION', 'name or description required');
  if (name !== undefined && (typeof name !== 'string' || name.length < 1 || name.length > 120))
    throw new AppError('VALIDATION', 'name length', 'name');
  if (description !== undefined && (typeof description !== 'string' || description.length > 2000))
    throw new AppError('VALIDATION', 'description too long', 'description');
  const d = resolveDeck(deck);
  const newName = name !== undefined ? name : d.name;
  const newDescription = description !== undefined ? description : d.description;
  try {
    store.run('UPDATE decks SET name=?, description=? WHERE id=?', [newName, newDescription, d.id]);
  } catch (e: unknown) {
    if (asAppError(e).message.includes('UNIQUE')) throw new AppError('CONFLICT', 'deck name exists', 'name');
    throw e;
  }
  return { ok: true, deck: { id: d.id, name: newName, description: newDescription } };
}

export function cardAdd({ deck, cards }: CardAddInput): { card_ids: number[] } {
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > 100)
    throw new AppError('VALIDATION', 'cards array 1..100', 'cards');
  const d = resolveDeck(deck);
  const out = store.tx(() => {
    const ids: number[] = [];
    cards.forEach((c, i) => {
      if (!c.front || c.front.length < 1 || c.front.length > 4000)
        throw new AppError('VALIDATION', 'front length', `cards[${i}].front`);
      if (!c.back || c.back.length < 1 || c.back.length > 4000)
        throw new AppError('VALIDATION', 'back length', `cards[${i}].back`);
      const tags = c.tags || [];
      if (tags.length > 10) throw new AppError('VALIDATION', 'too many tags', `cards[${i}].tags`);
      const r = store.run('INSERT INTO cards (deck_id, front, back, tags_json, source) VALUES (?,?,?,?,?)',
        [d.id, c.front, c.back, JSON.stringify(tags), c.source || 'ai']);
      ids.push(r.lastInsertRowid);
    });
    return ids;
  });
  return { card_ids: out };
}

export function cardUpdate({ cardId, front, back, tags, deck }: CardUpdateBoxInput): OkResponse {
  const c = store.get<CardRow>('SELECT * FROM cards WHERE id=?', [cardId]);
  if (!c) throw new AppError('NOT_FOUND', 'card not found');
  let newDeck = c.deck_id;
  if (deck !== undefined) newDeck = resolveDeck(deck).id;
  const newFront = front !== undefined ? front : c.front;
  const newBack = back !== undefined ? back : c.back;
  const newTags = tags !== undefined ? tags : JSON.parse(c.tags_json) as string[];
  store.run('UPDATE cards SET deck_id=?, front=?, back=?, tags_json=?, updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id=?',
    [newDeck, newFront, newBack, JSON.stringify(newTags), cardId]);
  return { ok: true };
}

export function cardDelete({ cardIds }: CardDeleteBoxInput): OkResponse {
  if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > 100)
    throw new AppError('VALIDATION', 'card_ids 1..100', 'card_ids');
  store.tx(() => { for (const id of cardIds) store.run('DELETE FROM cards WHERE id=?', [id]); });
  return { ok: true };
}

type CardWithState = CardRow & Pick<CardStateRow, 'due_at' | 'ignored'>;
interface CardSearchResult { cards: CardWithState[]; total: number }
export function cardSearch({ query, deck, tag, source, limit, offset }: {
  query?: string; deck?: DeckRef; tag?: string; source?: string; limit?: number; offset?: number;
}): CardSearchResult {
  const lim = Math.min(Math.max(limit || 20, 1), 100);
  const off = offset || 0;
  let sql = 'SELECT c.*, cs.due_at, cs.ignored FROM cards c JOIN card_state cs ON cs.card_id=c.id WHERE 1=1';
  const params: (string | number)[] = [];
  if (deck !== undefined) { const d = resolveDeck(deck); sql += ' AND c.deck_id=?'; params.push(d.id); }
  if (query) { sql += ' AND (c.front LIKE ? OR c.back LIKE ?)'; params.push('%' + query + '%', '%' + query + '%'); }
  if (source) { sql += ' AND c.source=?'; params.push(source); }
  if (tag) { sql += ' AND EXISTS (SELECT 1 FROM json_each(c.tags_json) WHERE value=?)'; params.push(tag); }
  sql += ' ORDER BY c.id LIMIT ? OFFSET ?';
  params.push(lim, off);
  const rows = store.all<CardWithState>(sql, params);
  return { cards: rows, total: rows.length };
}

// A permissive shape accepted by validateQuestion. Callers pass either a
// freshly-created question (discriminated union) or a merged patch over a
// stored row (all fields resolved, answer/choices already parsed).
type QuestionLike = {
  type?: string; prompt?: string; explanation?: string; points?: number;
  choices?: Choice[] | null; correct?: string | string[]; value?: number;
  tolerance?: number; tolerance_type?: 'abs' | 'rel'; unit?: string | null;
  reference?: string; rubric?: string | null;
};

export function validateQuestion(q: QuestionLike, i: number): ValidatedQuestion {
  if (!q || !q.type) throw new AppError('VALIDATION', 'missing type', `questions[${i}].type`);
  if (!['mcq', 'multi', 'numeric', 'short', 'latex'].includes(q.type))
    throw new AppError('VALIDATION', 'bad type', `questions[${i}].type`);
  if (!q.prompt || q.prompt.length < 1 || q.prompt.length > 4000)
    throw new AppError('VALIDATION', 'prompt', `questions[${i}].prompt`);
  if (q.points !== undefined && (q.points <= 0 || q.points > 100))
    throw new AppError('VALIDATION', 'points', `questions[${i}].points`);
  let answer: QuestionAnswer;
  const type = q.type as QuestionType;
  if (type === 'mcq') {
    if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 8)
      throw new AppError('VALIDATION', 'choices', `questions[${i}].choices`);
    if (!q.choices.some((c) => c.id === q.correct))
      throw new AppError('VALIDATION', 'correct', `questions[${i}].correct`);
    answer = { correct: q.correct };
  } else if (type === 'multi') {
    if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 8)
      throw new AppError('VALIDATION', 'choices', `questions[${i}].choices`);
    if (!Array.isArray(q.correct) || q.correct.length < 1)
      throw new AppError('VALIDATION', 'correct', `questions[${i}].correct`);
    answer = { correct: q.correct };
  } else if (type === 'numeric') {
    if (typeof q.value !== 'number') throw new AppError('VALIDATION', 'value', `questions[${i}].value`);
    answer = { value: q.value, tolerance: q.tolerance ?? 0, tolerance_type: q.tolerance_type || 'abs', unit: q.unit ?? null };
  } else {
    if (!q.reference || q.reference.length < 1)
      throw new AppError('VALIDATION', 'reference', `questions[${i}].reference`);
    answer = { reference: q.reference, rubric: q.rubric ?? null };
  }
  const choices = type === 'mcq' || type === 'multi' ? (q.choices ?? null) : null;
  return {
    type, prompt: q.prompt!, choices, answer, explanation: q.explanation || '', points: q.points ?? 1,
  };
}

export function quizCreate({ title, description, deck, shuffle = false, questions }: QuizCreateInput): { id: number; title: string } {
  if (!title || title.length < 1 || title.length > 200) throw new AppError('VALIDATION', 'title', 'title');
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 100)
    throw new AppError('VALIDATION', 'questions', 'questions');
  const deckId = deck !== undefined ? resolveDeck(deck).id : null;
  if (deckId !== null && store.get('SELECT id FROM quizzes WHERE deck_id=?', [deckId]))
    throw new AppError('CONFLICT', 'deck already has a quiz', 'deck');
  const qs = questions.map((q, i) => validateQuestion(q, i));
  return store.tx(() => {
    const r = store.run('INSERT INTO quizzes (title, description, deck_id, shuffle) VALUES (?,?,?,?)',
      [title, description || '', deckId, shuffle ? 1 : 0]);
    const quizId = r.lastInsertRowid;
    qs.forEach((q, i) => {
      store.run('INSERT INTO questions (quiz_id, position, type, prompt, choices_json, answer_json, explanation, points) VALUES (?,?,?,?,?,?,?,?)',
        [quizId, i + 1, q.type, q.prompt, q.choices ? JSON.stringify(q.choices) : null,
          JSON.stringify(q.answer), q.explanation, q.points]);
    });
    return { id: quizId, title };
  });
}

export function quizAddQuestions({ quizId, questions }: QuizAddQuestionsInput): { question_ids: number[] } {
  getQuiz(quizId);
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 100)
    throw new AppError('VALIDATION', 'questions', 'questions');
  const qs = questions.map((q, i) => validateQuestion(q, i));
  return store.tx(() => {
    const maxPos = store.get<{ m: number }>('SELECT COALESCE(MAX(position),0) AS m FROM questions WHERE quiz_id=?', [quizId])?.m ?? 0;
    const ids: number[] = [];
    qs.forEach((q, i) => {
      const r = store.run('INSERT INTO questions (quiz_id, position, type, prompt, choices_json, answer_json, explanation, points) VALUES (?,?,?,?,?,?,?,?)',
        [quizId, maxPos + i + 1, q.type, q.prompt, q.choices ? JSON.stringify(q.choices) : null,
          JSON.stringify(q.answer), q.explanation, q.points]);
      ids.push(r.lastInsertRowid);
    });
    return { question_ids: ids };
  });
}

export function quizGet({ quizId, includeAnswers }: QuizGetInput): {
  quiz: QuizRow; questions: Array<{
    id: number; position: number; type: QuestionType; prompt: string; explanation: string;
    points: number; choices?: Choice[]; answer?: QuestionAnswer;
  }>;
} {
  const quiz = getQuiz(quizId);
  const rows = store.all<RawQuestion>('SELECT * FROM questions WHERE quiz_id=? ORDER BY position', [quizId]);
  const questions = rows.map((r) => {
    const q: {
      id: number; position: number; type: QuestionType; prompt: string; explanation: string;
      points: number; choices?: Choice[]; answer?: QuestionAnswer;
    } = { id: r.id, position: r.position, type: r.type, prompt: r.prompt, explanation: r.explanation, points: r.points };
    if (r.choices_json) q.choices = JSON.parse(r.choices_json) as Choice[];
    if (includeAnswers !== false) q.answer = JSON.parse(r.answer_json) as QuestionAnswer;
    return q;
  });
  return { quiz, questions };
}

export function quizList({ deck, limit }: QuizListInput): QuizSummary[] {
  const lim = Math.min(Math.max(limit || 50, 1), 100);
  const base = `SELECT qz.*,
    (SELECT COUNT(*) FROM questions qs WHERE qs.quiz_id = qz.id) AS question_count,
    (SELECT COALESCE(SUM(qs.points), 0) FROM questions qs WHERE qs.quiz_id = qz.id) AS total_points
    FROM quizzes qz`;
  if (deck !== undefined) {
    const d = resolveDeck(deck);
    return store.all<QuizSummary>(base + ' WHERE qz.deck_id=? ORDER BY qz.id LIMIT ?', [d.id, lim]);
  }
  return store.all<QuizSummary>(base + ' ORDER BY qz.id LIMIT ?', [lim]);
}

export function quizUpdate({ quizId, title, description, deck, source, shuffle }: QuizUpdateInput): {
  ok: true; quiz: { id: number; title: string; description: string; deck_id: number | null; source: Source; shuffle: number };
} {
  const quiz = getQuiz(quizId);
  if (title !== undefined && (typeof title !== 'string' || title.length < 1 || title.length > 200))
    throw new AppError('VALIDATION', 'title length', 'title');
  if (description !== undefined && (typeof description !== 'string' || description.length > 2000))
    throw new AppError('VALIDATION', 'description too long', 'description');
  if (source !== undefined && !['user', 'ai', 'import'].includes(source))
    throw new AppError('VALIDATION', 'source', 'source');
  const deckId = deck !== undefined ? resolveDeck(deck).id : quiz.deck_id;
  if (deckId !== null && store.get('SELECT id FROM quizzes WHERE deck_id=? AND id<>?', [deckId, quizId]))
    throw new AppError('CONFLICT', 'deck already has a quiz', 'deck');
  const newTitle = title !== undefined ? title : quiz.title;
  const newDescription = description !== undefined ? description : quiz.description;
  const newSource = source !== undefined ? source : quiz.source;
  const newShuffle = shuffle === undefined ? quiz.shuffle : (shuffle ? 1 : 0);
  store.run('UPDATE quizzes SET title=?, description=?, deck_id=?, source=?, shuffle=? WHERE id=?',
    [newTitle, newDescription, deckId, newSource, newShuffle, quizId]);
  return { ok: true, quiz: { id: quiz.id, title: newTitle, description: newDescription, deck_id: deckId, source: newSource, shuffle: newShuffle } };
}

export function quizDelete({ quizId, confirmTitle, deleteDeck = false }: QuizDeleteBoxInput): OkResponse {
  const quiz = getQuiz(quizId);
  if (confirmTitle !== quiz.title) throw new AppError('VALIDATION', 'confirm_title mismatch', 'confirm_title');
  store.tx(() => {
    store.run('DELETE FROM quizzes WHERE id=?', [quizId]);
    if (deleteDeck && quiz.deck_id !== null) store.run('DELETE FROM decks WHERE id=?', [quiz.deck_id]);
  });
  return { ok: true };
}

export function quizOutline({ quizId }: QuizOutlineInput): {
  quiz: { id: number; title: string; question_count: number };
  questions: Array<{ id: number; position: number; type: QuestionType }>;
} {
  const quiz = getQuiz(quizId);
  const questions = store.all<{ id: number; position: number; type: QuestionType }>(
    'SELECT id, position, type FROM questions WHERE quiz_id=? ORDER BY position', [quizId]);
  return { quiz: { id: quiz.id, title: quiz.title, question_count: questions.length }, questions };
}

export function questionUpdate({ questions }: QuestionUpdateInput): { ok: true; question_ids: number[] } {
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 100)
    throw new AppError('VALIDATION', 'questions array 1..100', 'questions');

  const updates = questions.map((p: QuestionQuestionPatch, i: number) => {
    if (!p || p.questionId === undefined)
      throw new AppError('VALIDATION', 'question_id required', `questions[${i}].question_id`);
    const row = getQuestion(p.questionId);
    const oldAnswer = JSON.parse(row.answer_json) as QuestionAnswer;
    const oldChoices = row.choices_json ? JSON.parse(row.choices_json) as Choice[] : null;

    // Merge the patch over the stored values so callers only send fields they change.
    const merged: MergedQuestion = {
      type: p.type ?? row.type,
      prompt: p.prompt ?? row.prompt,
      explanation: p.explanation ?? row.explanation,
      points: p.points ?? row.points,
      choices: p.choices ?? oldChoices ?? undefined,
      correct: p.correct !== undefined ? p.correct : oldAnswer.correct,
      value: p.value !== undefined ? p.value : oldAnswer.value,
      tolerance: p.tolerance !== undefined ? p.tolerance : oldAnswer.tolerance,
      tolerance_type: p.tolerance_type ?? oldAnswer.tolerance_type,
      unit: p.unit !== undefined ? p.unit : oldAnswer.unit,
      reference: p.reference !== undefined ? p.reference : oldAnswer.reference,
      rubric: p.rubric !== undefined ? p.rubric : oldAnswer.rubric,
    };
    if (merged.unit == null) delete merged.unit;
    if (merged.rubric == null) delete merged.rubric;
    if (merged.tolerance === undefined) delete merged.tolerance;
    if (merged.tolerance_type == null) delete merged.tolerance_type;

    const valid = validateQuestion(merged, i);
    return {
      id: row.id,
      position: p.position ?? row.position,
      type: valid.type,
      prompt: valid.prompt,
      choices: valid.choices,
      answer: valid.answer,
      explanation: valid.explanation,
      points: valid.points,
    };
  });

  store.tx(() => {
    for (const q of updates) {
      store.run('UPDATE questions SET position=?, type=?, prompt=?, choices_json=?, answer_json=?, explanation=?, points=? WHERE id=?',
        [q.position, q.type, q.prompt, q.choices ? JSON.stringify(q.choices) : null,
          JSON.stringify(q.answer), q.explanation, q.points, q.id]);
    }
  });
  return { ok: true, question_ids: updates.map((q) => q.id) };
}

export function questionDelete({ questionIds, renumber = true }: QuestionDeleteInput): OkResponse {
  if (!Array.isArray(questionIds) || questionIds.length < 1 || questionIds.length > 100)
    throw new AppError('VALIDATION', 'question_ids array 1..100', 'question_ids');
  const quizIds = new Set<number>();
  for (const id of questionIds) quizIds.add(getQuestion(id).quiz_id);

  store.tx(() => {
    for (const id of questionIds) store.run('DELETE FROM questions WHERE id=?', [id]);
    if (renumber) {
      for (const quizId of quizIds) {
        const rows = store.all<{ id: number }>('SELECT id FROM questions WHERE quiz_id=? ORDER BY position, id', [quizId]);
        rows.forEach((r, i) => store.run('UPDATE questions SET position=? WHERE id=?', [i + 1, r.id]));
      }
    }
  });
  return { ok: true };
}

// Import a bundle generated outside MCP (e.g. pasted from another AI assistant).
// Everything is validated up front and written in a single transaction, so a
// bad item cannot leave a half-imported deck or quiz behind.
export function importBundle(data: Bundle): {
  ok: true; decks_created: number; decks_reused: number; cards_added: number;
  quizzes_created: number; questions_added: number;
} {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new AppError('VALIDATION', 'bundle must be a JSON object');
  const decksIn = data.decks ?? [];
  const quizzesIn = data.quizzes ?? [];
  if (!Array.isArray(decksIn)) throw new AppError('VALIDATION', 'decks must be an array', 'decks');
  if (!Array.isArray(quizzesIn)) throw new AppError('VALIDATION', 'quizzes must be an array', 'quizzes');
  if (decksIn.length > 50) throw new AppError('VALIDATION', 'too many decks (max 50)', 'decks');
  if (quizzesIn.length > 50) throw new AppError('VALIDATION', 'too many quizzes (max 50)', 'quizzes');
  if (!decksIn.length && !quizzesIn.length)
    throw new AppError('VALIDATION', 'nothing to import: provide decks and/or quizzes');

  const preparedDecks = decksIn.map((d, i) => {
    if (!d || typeof d !== 'object' || Array.isArray(d))
      throw new AppError('VALIDATION', 'deck must be an object', `decks[${i}]`);
    if (typeof d.name !== 'string' || d.name.length < 1 || d.name.length > 120)
      throw new AppError('VALIDATION', 'deck name length', `decks[${i}].name`);
    if (d.description !== undefined && (typeof d.description !== 'string' || d.description.length > 2000))
      throw new AppError('VALIDATION', 'deck description too long', `decks[${i}].description`);
    const cards = d.cards ?? [];
    if (!Array.isArray(cards)) throw new AppError('VALIDATION', 'cards must be an array', `decks[${i}].cards`);
    if (cards.length > 100) throw new AppError('VALIDATION', 'too many cards (max 100)', `decks[${i}].cards`);
    const preparedCards = cards.map((c, j) => {
      const at = `decks[${i}].cards[${j}]`;
      if (!c || typeof c !== 'object' || Array.isArray(c))
        throw new AppError('VALIDATION', 'card must be an object', at);
      if (typeof c.front !== 'string' || c.front.length < 1 || c.front.length > 4000)
        throw new AppError('VALIDATION', 'front length', `${at}.front`);
      if (typeof c.back !== 'string' || c.back.length < 1 || c.back.length > 4000)
        throw new AppError('VALIDATION', 'back length', `${at}.back`);
      const tags = c.tags ?? [];
      if (!Array.isArray(tags) || tags.length > 10)
        throw new AppError('VALIDATION', 'too many tags (max 10)', `${at}.tags`);
      if (tags.some((t) => typeof t !== 'string' || t.length < 1 || t.length > 40))
        throw new AppError('VALIDATION', 'invalid tag', `${at}.tags`);
      return { front: c.front, back: c.back, tags };
    });
    return { name: d.name, description: d.description ?? '', cards: preparedCards };
  });

  const seenDecks = new Set<string>();
  for (const d of preparedDecks) {
    const key = d.name.toLowerCase();
    if (seenDecks.has(key)) throw new AppError('VALIDATION', 'duplicate deck name in bundle', 'decks');
    seenDecks.add(key);
  }

  const preparedQuizzes = quizzesIn.map((q, i) => {
    if (!q || typeof q !== 'object' || Array.isArray(q))
      throw new AppError('VALIDATION', 'quiz must be an object', `quizzes[${i}]`);
    if (typeof q.title !== 'string' || q.title.length < 1 || q.title.length > 200)
      throw new AppError('VALIDATION', 'quiz title length', `quizzes[${i}].title`);
    if (q.description !== undefined && (typeof q.description !== 'string' || q.description.length > 2000))
      throw new AppError('VALIDATION', 'quiz description too long', `quizzes[${i}].description`);
    const questions = q.questions;
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 100)
      throw new AppError('VALIDATION', 'questions array 1..100', `quizzes[${i}].questions`);
    const preparedQuestions = questions.map((question: QuestionInput, j: number) => {
      try {
        return validateQuestion(question, j);
      } catch (e: unknown) {
        const last = String(asAppError(e).field || '').split('.').pop();
        const hints: Record<string, string> = {
          type: 'unknown question type',
          prompt: 'prompt must be 1-4000 characters',
          points: 'points must be greater than 0 and at most 100',
          choices: 'choices must be 2-8 options',
          correct: 'correct must reference one of the choices',
          value: 'numeric value must be a number',
          reference: 'reference answer is required',
        };
        throw new AppError('VALIDATION', hints[last || ''] || asAppError(e).message,
          `quizzes[${i}].questions[${j}]${last ? '.' + last : ''}`);
      }
    });
    return { title: q.title, description: q.description ?? '', deck: q.deck, shuffle: q.shuffle === true, questions: preparedQuestions };
  });

  const bundleNames = new Set(preparedDecks.map((d) => d.name.toLowerCase()));
  const usedDecks = new Set<string>();
  for (let i = 0; i < preparedQuizzes.length; i++) {
    const deck = preparedQuizzes[i].deck;
    if (deck === undefined || deck === null || deck === '') continue;
    if (typeof deck !== 'string' && typeof deck !== 'number')
      throw new AppError('VALIDATION', 'deck must be a name or id', `quizzes[${i}].deck`);
    const key = typeof deck === 'number' ? `id:${deck}` : `name:${deck.toLowerCase()}`;
    if (usedDecks.has(key)) throw new AppError('CONFLICT', 'a deck can only have one quiz', `quizzes[${i}].deck`);
    usedDecks.add(key);
    if (typeof deck === 'string' && bundleNames.has(deck.toLowerCase())) continue;
    const existing = typeof deck === 'number'
      ? store.get<{ id: number }>('SELECT id FROM decks WHERE id=?', [deck])
      : store.get<{ id: number }>('SELECT id FROM decks WHERE name=? COLLATE NOCASE', [deck]);
    if (!existing) throw new AppError('NOT_FOUND', 'deck not found', `quizzes[${i}].deck`);
    if (store.get('SELECT id FROM quizzes WHERE deck_id=?', [existing]))
      throw new AppError('CONFLICT', 'deck already has a quiz', `quizzes[${i}].deck`);
  }

  const counts = {
    decks_created: 0, decks_reused: 0, cards_added: 0,
    quizzes_created: 0, questions_added: 0,
  };

  return store.tx(() => {
    const deckIds = new Map<string, number>();
    for (const d of preparedDecks) {
      const key = d.name.toLowerCase();
      const existing = store.get<DeckRow>('SELECT id FROM decks WHERE name=? COLLATE NOCASE', [d.name]);
      let deckId: number;
      if (existing) {
        deckId = existing.id;
        counts.decks_reused++;
      } else {
        const r = store.run('INSERT INTO decks (name, description) VALUES (?,?)', [d.name, d.description]);
        deckId = r.lastInsertRowid;
        counts.decks_created++;
      }
      deckIds.set(key, deckId);
      for (const c of d.cards) {
        store.run('INSERT INTO cards (deck_id, front, back, tags_json, source) VALUES (?,?,?,?,?)',
          [deckId, c.front, c.back, JSON.stringify(c.tags), 'import']);
        counts.cards_added++;
      }
    }

    for (const q of preparedQuizzes) {
      let deckId: number | null = null;
      if (q.deck !== undefined && q.deck !== null && q.deck !== '') {
        if (typeof q.deck === 'string') {
          const key = q.deck.toLowerCase();
          const found = deckIds.get(key)
            ?? store.get<DeckRow>('SELECT id FROM decks WHERE name=? COLLATE NOCASE', [q.deck]);
          deckId = typeof found === 'number' ? found : (found ? found.id : null);
        } else {
          deckId = Number(q.deck);
        }
      }
      const r = store.run('INSERT INTO quizzes (title, description, deck_id, source, shuffle) VALUES (?,?,?,?,?)',
        [q.title, q.description, deckId, 'import', q.shuffle ? 1 : 0]);
      const quizId = r.lastInsertRowid;
      counts.quizzes_created++;
      q.questions.forEach((question, i) => {
        store.run('INSERT INTO questions (quiz_id, position, type, prompt, choices_json, answer_json, explanation, points) VALUES (?,?,?,?,?,?,?,?)',
          [quizId, i + 1, question.type, question.prompt,
            question.choices ? JSON.stringify(question.choices) : null,
            JSON.stringify(question.answer), question.explanation, question.points]);
        counts.questions_added++;
      });
    }

    return { ok: true as const, ...counts };
  });
}
