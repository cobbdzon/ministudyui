import * as store from '../store/index.js';

function resolveDeck(deck: any): any {
  if (typeof deck === 'number') {
    const r = store.get('SELECT * FROM decks WHERE id=?', [deck]);
    if (!r) throw err('NOT_FOUND', 'deck not found');
    return r;
  }
  const r = store.get('SELECT * FROM decks WHERE name=? COLLATE NOCASE', [deck]);
  if (!r) throw err('NOT_FOUND', 'deck not found');
  // ambiguity: if multiple? name unique, so fine
  return r;
}

function err(code: string, message: string, field?: any, hint?: any): any {
  const e: any = new Error(message); e.code = code; e.field = field; e.hint = hint; return e;
}

export function deckCreate({ name, description }: any): any {
  if (!name || name.length < 1 || name.length > 120) throw err('VALIDATION', 'name length', 'name');
  const d = description || '';
  if (d.length > 2000) throw err('VALIDATION', 'description too long', 'description');
  try {
    const r = store.run('INSERT INTO decks (name, description) VALUES (?,?)', [name, d]);
    return { id: r.lastInsertRowid, name, description: d };
  } catch (e: any) {
    if (String(e.message).includes('UNIQUE')) throw err('CONFLICT', 'deck name exists', 'name');
    throw e;
  }
}

export function deckList(): any {
  return store.all('SELECT * FROM decks ORDER BY name');
}

export function deckDelete({ deck, confirmName, deleteQuizzes = false }: any): any {
  const d = resolveDeck(deck);
  if (confirmName !== d.name) throw err('VALIDATION', 'confirm_name mismatch', 'confirm_name');
  store.tx(() => {
    if (deleteQuizzes) store.run('DELETE FROM quizzes WHERE deck_id=?', [d.id]);
    store.run('DELETE FROM decks WHERE id=?', [d.id]);
  });
  return { ok: true };
}

export function deckUpdate({ deck, name, description }: any): any {
  if (deck === undefined || deck === null) throw err('VALIDATION', 'deck required', 'deck');
  if (name === undefined && description === undefined) throw err('VALIDATION', 'name or description required');
  if (name !== undefined && (typeof name !== 'string' || name.length < 1 || name.length > 120))
    throw err('VALIDATION', 'name length', 'name');
  if (description !== undefined && (typeof description !== 'string' || description.length > 2000))
    throw err('VALIDATION', 'description too long', 'description');
  const d = resolveDeck(deck);
  const newName = name !== undefined ? name : d.name;
  const newDescription = description !== undefined ? description : d.description;
  try {
    store.run('UPDATE decks SET name=?, description=? WHERE id=?', [newName, newDescription, d.id]);
  } catch (e: any) {
    if (String(e.message).includes('UNIQUE')) throw err('CONFLICT', 'deck name exists', 'name');
    throw e;
  }
  return { ok: true, deck: { id: d.id, name: newName, description: newDescription } };
}

export function cardAdd({ deck, cards }: any): any {
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > 100) throw err('VALIDATION', 'cards array 1..100', 'cards');
  const d = resolveDeck(deck);
  const out = store.tx(() => {
    const ids: any[] = [];
    cards.forEach((c: any, i: number) => {
      if (!c.front || c.front.length < 1 || c.front.length > 4000) throw err('VALIDATION', 'front length', `cards[${i}].front`);
      if (!c.back || c.back.length < 1 || c.back.length > 4000) throw err('VALIDATION', 'back length', `cards[${i}].back`);
      const tags = c.tags || [];
      if (tags.length > 10) throw err('VALIDATION', 'too many tags', `cards[${i}].tags`);
      const r = store.run('INSERT INTO cards (deck_id, front, back, tags_json, source) VALUES (?,?,?,?,?)',
        [d.id, c.front, c.back, JSON.stringify(tags), c.source || 'ai']);
      ids.push(r.lastInsertRowid);
    });
    return ids;
  });
  return { card_ids: out };
}

export function cardUpdate({ cardId, front, back, tags, deck }: any): any {
  const c = store.get('SELECT * FROM cards WHERE id=?', [cardId]);
  if (!c) throw err('NOT_FOUND', 'card not found');
  let newDeck = c.deck_id;
  if (deck !== undefined) newDeck = resolveDeck(deck).id;
  const newFront = front !== undefined ? front : c.front;
  const newBack = back !== undefined ? back : c.back;
  const newTags = tags !== undefined ? tags : JSON.parse(c.tags_json);
  store.run('UPDATE cards SET deck_id=?, front=?, back=?, tags_json=?, updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id=?',
    [newDeck, newFront, newBack, JSON.stringify(newTags), cardId]);
  return { ok: true };
}

export function cardDelete({ cardIds }: any): any {
  if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > 100) throw err('VALIDATION', 'card_ids 1..100', 'card_ids');
  store.tx(() => { for (const id of cardIds) store.run('DELETE FROM cards WHERE id=?', [id]); });
  return { ok: true };
}

export function cardSearch({ query, deck, tag, source, limit, offset }: any): any {
  const lim = Math.min(Math.max(limit || 20, 1), 100);
  const off = offset || 0;
  let sql = 'SELECT * FROM cards WHERE 1=1';
  const params: any[] = [];
  if (deck !== undefined) { const d = resolveDeck(deck); sql += ' AND deck_id=?'; params.push(d.id); }
  if (query) { sql += ' AND (front LIKE ? OR back LIKE ?)'; params.push('%'+query+'%', '%'+query+'%'); }
  if (source) { sql += ' AND source=?'; params.push(source); }
  if (tag) { sql += ' AND EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value=?)'; params.push(tag); }
  sql += ' ORDER BY id LIMIT ? OFFSET ?';
  params.push(lim, off);
  const rows = store.all(sql, params);
  return { cards: rows, total: rows.length };
}

export function validateQuestion(q: any, i: number): any {
  if (!q || !q.type) throw err('VALIDATION', 'missing type', `questions[${i}].type`);
  if (!['mcq','multi','numeric','short','latex'].includes(q.type)) throw err('VALIDATION', 'bad type', `questions[${i}].type`);
  if (!q.prompt || q.prompt.length < 1 || q.prompt.length > 4000) throw err('VALIDATION', 'prompt', `questions[${i}].prompt`);
  if (q.points !== undefined && (q.points <= 0 || q.points > 100)) throw err('VALIDATION', 'points', `questions[${i}].points`);
  // build answer_json
  let answer;
  if (q.type === 'mcq') {
    if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 8) throw err('VALIDATION', 'choices', `questions[${i}].choices`);
    if (!q.choices.some((c: any) => c.id === q.correct)) throw err('VALIDATION', 'correct', `questions[${i}].correct`);
    answer = { correct: q.correct };
  } else if (q.type === 'multi') {
    if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 8) throw err('VALIDATION', 'choices', `questions[${i}].choices`);
    if (!Array.isArray(q.correct) || q.correct.length < 1) throw err('VALIDATION', 'correct', `questions[${i}].correct`);
    answer = { correct: q.correct };
  } else if (q.type === 'numeric') {
    if (typeof q.value !== 'number') throw err('VALIDATION', 'value', `questions[${i}].value`);
    answer = { value: q.value, tolerance: q.tolerance ?? 0, tolerance_type: q.tolerance_type || 'abs', unit: q.unit ?? null };
  } else {
    if (!q.reference || q.reference.length < 1) throw err('VALIDATION', 'reference', `questions[${i}].reference`);
    answer = { reference: q.reference, rubric: q.rubric ?? null };
  }
  const choices = (q.type === 'mcq' || q.type === 'multi') ? q.choices : null;
  return { type: q.type, prompt: q.prompt, choices, answer, explanation: q.explanation || '', points: q.points ?? 1 };
}

export function quizCreate({ title, description, deck, questions }: any): any {
  if (!title || title.length < 1 || title.length > 200) throw err('VALIDATION', 'title', 'title');
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 100) throw err('VALIDATION', 'questions', 'questions');
  const deckId = deck !== undefined ? resolveDeck(deck).id : null;
  if (deckId !== null && store.get('SELECT id FROM quizzes WHERE deck_id=?', [deckId]))
    throw err('CONFLICT', 'deck already has a quiz', 'deck');
  const qs = questions.map(validateQuestion);
  return store.tx(() => {
    const r = store.run('INSERT INTO quizzes (title, description, deck_id) VALUES (?,?,?)', [title, description || '', deckId]);
    const quizId = r.lastInsertRowid;
    qs.forEach((q, i) => {
      store.run('INSERT INTO questions (quiz_id, position, type, prompt, choices_json, answer_json, explanation, points) VALUES (?,?,?,?,?,?,?,?)',
        [quizId, i + 1, q.type, q.prompt, q.choices ? JSON.stringify(q.choices) : null, JSON.stringify(q.answer), q.explanation, q.points]);
    });
    return { id: quizId, title };
  });
}

export function quizAddQuestions({ quizId, questions }: any): any {
  const quiz = store.get('SELECT * FROM quizzes WHERE id=?', [quizId]);
  if (!quiz) throw err('NOT_FOUND', 'quiz not found');
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 100) throw err('VALIDATION', 'questions', 'questions');
  const qs = questions.map(validateQuestion);
  return store.tx(() => {
    const maxPos = store.get('SELECT COALESCE(MAX(position),0) AS m FROM questions WHERE quiz_id=?', [quizId]).m;
    const ids: any[] = [];
    qs.forEach((q, i) => {
      const r = store.run('INSERT INTO questions (quiz_id, position, type, prompt, choices_json, answer_json, explanation, points) VALUES (?,?,?,?,?,?,?,?)',
        [quizId, maxPos + i + 1, q.type, q.prompt, q.choices ? JSON.stringify(q.choices) : null, JSON.stringify(q.answer), q.explanation, q.points]);
      ids.push(r.lastInsertRowid);
    });
    return { question_ids: ids };
  });
}

export function quizGet({ quizId, includeAnswers }: any): any {
  const quiz = store.get('SELECT * FROM quizzes WHERE id=?', [quizId]);
  if (!quiz) throw err('NOT_FOUND', 'quiz not found');
  const rows = store.all('SELECT * FROM questions WHERE quiz_id=? ORDER BY position', [quizId]);
  const questions = rows.map((r) => {
    const q: any = { id: r.id, position: r.position, type: r.type, prompt: r.prompt, explanation: r.explanation, points: r.points };
    if (r.choices_json) q.choices = JSON.parse(r.choices_json);
    if (includeAnswers !== false) q.answer = JSON.parse(r.answer_json);
    return q;
  });
  return { quiz, questions };
}

export function quizList({ deck, limit }: any): any {
  const lim = Math.min(Math.max(limit || 50, 1), 100);
  const base = `SELECT qz.*,
    (SELECT COUNT(*) FROM questions qs WHERE qs.quiz_id = qz.id) AS question_count,
    (SELECT COALESCE(SUM(qs.points), 0) FROM questions qs WHERE qs.quiz_id = qz.id) AS total_points
    FROM quizzes qz`;
  if (deck !== undefined) {
    const d = resolveDeck(deck);
    return store.all(base + ' WHERE qz.deck_id=? ORDER BY qz.id LIMIT ?', [d.id, lim]);
  }
  return store.all(base + ' ORDER BY qz.id LIMIT ?', [lim]);
}

function getQuiz(quizId: any): any {
  const quiz = store.get('SELECT * FROM quizzes WHERE id=?', [quizId]);
  if (!quiz) throw err('NOT_FOUND', 'quiz not found');
  return quiz;
}

function getQuestion(questionId: any): any {
  const q = store.get('SELECT * FROM questions WHERE id=?', [questionId]);
  if (!q) throw err('NOT_FOUND', 'question not found');
  return q;
}

export function quizUpdate({ quizId, title, description, deck, source }: any): any {
  const quiz = getQuiz(quizId);
  if (title !== undefined && (typeof title !== 'string' || title.length < 1 || title.length > 200))
    throw err('VALIDATION', 'title length', 'title');
  if (description !== undefined && (typeof description !== 'string' || description.length > 2000))
    throw err('VALIDATION', 'description too long', 'description');
  if (source !== undefined && !['user', 'ai', 'import'].includes(source))
    throw err('VALIDATION', 'source', 'source');
  const deckId = deck !== undefined ? resolveDeck(deck).id : quiz.deck_id;
  if (deckId !== null && store.get('SELECT id FROM quizzes WHERE deck_id=? AND id<>?', [deckId, quizId]))
    throw err('CONFLICT', 'deck already has a quiz', 'deck');
  const newTitle = title !== undefined ? title : quiz.title;
  const newDescription = description !== undefined ? description : quiz.description;
  const newSource = source !== undefined ? source : quiz.source;
  store.run('UPDATE quizzes SET title=?, description=?, deck_id=?, source=? WHERE id=?',
    [newTitle, newDescription, deckId, newSource, quizId]);
  return { ok: true, quiz: { id: quiz.id, title: newTitle, description: newDescription, deck_id: deckId, source: newSource } };
}

export function quizDelete({ quizId, confirmTitle, deleteDeck = false }: any): any {
  const quiz = getQuiz(quizId);
  if (confirmTitle !== quiz.title) throw err('VALIDATION', 'confirm_title mismatch', 'confirm_title');
  store.tx(() => {
    store.run('DELETE FROM quizzes WHERE id=?', [quizId]);
    if (deleteDeck && quiz.deck_id !== null) store.run('DELETE FROM decks WHERE id=?', [quiz.deck_id]);
  });
  return { ok: true };
}

export function quizOutline({ quizId }: any): any {
  const quiz = getQuiz(quizId);
  const questions = store.all('SELECT id, position, type FROM questions WHERE quiz_id=? ORDER BY position', [quizId]);
  return { quiz: { id: quiz.id, title: quiz.title, question_count: questions.length }, questions };
}

export function questionUpdate({ questions }: any): any {
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 100)
    throw err('VALIDATION', 'questions array 1..100', 'questions');

  const updates = questions.map((p: any, i: number) => {
    if (!p || p.questionId === undefined) throw err('VALIDATION', 'question_id required', `questions[${i}].question_id`);
    const row = getQuestion(p.questionId);
    const oldAnswer = JSON.parse(row.answer_json);
    const oldChoices = row.choices_json ? JSON.parse(row.choices_json) : null;

    // Merge the patch over the stored values so callers only send fields they change.
    const merged: any = {
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
        [q.position, q.type, q.prompt, q.choices ? JSON.stringify(q.choices) : null, JSON.stringify(q.answer), q.explanation, q.points, q.id]);
    }
  });
  return { ok: true, question_ids: updates.map((q) => q.id) };
}

export function questionDelete({ questionIds, renumber = true }: any): any {
  if (!Array.isArray(questionIds) || questionIds.length < 1 || questionIds.length > 100)
    throw err('VALIDATION', 'question_ids array 1..100', 'question_ids');
  const quizIds = new Set<any>();
  for (const id of questionIds) quizIds.add(getQuestion(id).quiz_id);

  store.tx(() => {
    for (const id of questionIds) store.run('DELETE FROM questions WHERE id=?', [id]);
    if (renumber) {
      for (const quizId of quizIds) {
        const rows = store.all('SELECT id FROM questions WHERE quiz_id=? ORDER BY position, id', [quizId]);
        rows.forEach((r: any, i: number) => store.run('UPDATE questions SET position=? WHERE id=?', [i + 1, r.id]));
      }
    }
  });
  return { ok: true };
}

// Import a bundle generated outside MCP (e.g. pasted from another AI assistant).
// Everything is validated up front and written in a single transaction, so a
// bad item cannot leave a half-imported deck or quiz behind.
export function importBundle(data: any): any {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw err('VALIDATION', 'bundle must be a JSON object');
  const decksIn = data.decks ?? [];
  const quizzesIn = data.quizzes ?? [];
  if (!Array.isArray(decksIn)) throw err('VALIDATION', 'decks must be an array', 'decks');
  if (!Array.isArray(quizzesIn)) throw err('VALIDATION', 'quizzes must be an array', 'quizzes');
  if (decksIn.length > 50) throw err('VALIDATION', 'too many decks (max 50)', 'decks');
  if (quizzesIn.length > 50) throw err('VALIDATION', 'too many quizzes (max 50)', 'quizzes');
  if (!decksIn.length && !quizzesIn.length)
    throw err('VALIDATION', 'nothing to import: provide decks and/or quizzes');

  const preparedDecks = decksIn.map((d: any, i: number) => {
    if (!d || typeof d !== 'object' || Array.isArray(d))
      throw err('VALIDATION', 'deck must be an object', `decks[${i}]`);
    if (typeof d.name !== 'string' || d.name.length < 1 || d.name.length > 120)
      throw err('VALIDATION', 'deck name length', `decks[${i}].name`);
    if (d.description !== undefined && (typeof d.description !== 'string' || d.description.length > 2000))
      throw err('VALIDATION', 'deck description too long', `decks[${i}].description`);
    const cards = d.cards ?? [];
    if (!Array.isArray(cards)) throw err('VALIDATION', 'cards must be an array', `decks[${i}].cards`);
    if (cards.length > 100) throw err('VALIDATION', 'too many cards (max 100)', `decks[${i}].cards`);
    const preparedCards = cards.map((c: any, j: number) => {
      const at = `decks[${i}].cards[${j}]`;
      if (!c || typeof c !== 'object' || Array.isArray(c))
        throw err('VALIDATION', 'card must be an object', at);
      if (typeof c.front !== 'string' || c.front.length < 1 || c.front.length > 4000)
        throw err('VALIDATION', 'front length', `${at}.front`);
      if (typeof c.back !== 'string' || c.back.length < 1 || c.back.length > 4000)
        throw err('VALIDATION', 'back length', `${at}.back`);
      const tags = c.tags ?? [];
      if (!Array.isArray(tags) || tags.length > 10)
        throw err('VALIDATION', 'too many tags (max 10)', `${at}.tags`);
      if (tags.some((t: any) => typeof t !== 'string' || t.length < 1 || t.length > 40))
        throw err('VALIDATION', 'invalid tag', `${at}.tags`);
      return { front: c.front, back: c.back, tags };
    });
    return { name: d.name, description: d.description ?? '', cards: preparedCards };
  });

  const seenDecks = new Set<string>();
  for (const d of preparedDecks) {
    const key = d.name.toLowerCase();
    if (seenDecks.has(key)) throw err('VALIDATION', 'duplicate deck name in bundle', 'decks');
    seenDecks.add(key);
  }

  const preparedQuizzes = quizzesIn.map((q: any, i: number) => {
    if (!q || typeof q !== 'object' || Array.isArray(q))
      throw err('VALIDATION', 'quiz must be an object', `quizzes[${i}]`);
    if (typeof q.title !== 'string' || q.title.length < 1 || q.title.length > 200)
      throw err('VALIDATION', 'quiz title length', `quizzes[${i}].title`);
    if (q.description !== undefined && (typeof q.description !== 'string' || q.description.length > 2000))
      throw err('VALIDATION', 'quiz description too long', `quizzes[${i}].description`);
    const questions = q.questions;
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 100)
      throw err('VALIDATION', 'questions array 1..100', `quizzes[${i}].questions`);
    const preparedQuestions = questions.map((question: any, j: number) => {
      try {
        return validateQuestion(question, j);
      } catch (e: any) {
        const last = String(e.field || '').split('.').pop();
        const hints: Record<string, string> = {
          type: 'unknown question type',
          prompt: 'prompt must be 1-4000 characters',
          points: 'points must be greater than 0 and at most 100',
          choices: 'choices must be 2-8 options',
          correct: 'correct must reference one of the choices',
          value: 'numeric value must be a number',
          reference: 'reference answer is required',
        };
        throw err('VALIDATION', hints[last || ''] || e.message,
          `quizzes[${i}].questions[${j}]${last ? '.' + last : ''}`);
      }
    });
    return { title: q.title, description: q.description ?? '', deck: q.deck, questions: preparedQuestions };
  });

  const bundleNames = new Set(preparedDecks.map((d) => d.name.toLowerCase()));
  const usedDecks = new Set<string>();
  for (let i = 0; i < preparedQuizzes.length; i++) {
    const deck = preparedQuizzes[i].deck;
    if (deck === undefined || deck === null || deck === '') continue;
    if (typeof deck !== 'string' && typeof deck !== 'number')
      throw err('VALIDATION', 'deck must be a name or id', `quizzes[${i}].deck`);
    const key = typeof deck === 'number' ? `id:${deck}` : `name:${deck.toLowerCase()}`;
    if (usedDecks.has(key)) throw err('CONFLICT', 'a deck can only have one quiz', `quizzes[${i}].deck`);
    usedDecks.add(key);
    if (typeof deck === 'string' && bundleNames.has(deck.toLowerCase())) continue;
    const existing = typeof deck === 'number'
      ? store.get('SELECT id FROM decks WHERE id=?', [deck])
      : store.get('SELECT id FROM decks WHERE name=? COLLATE NOCASE', [deck]);
    if (!existing) throw err('NOT_FOUND', 'deck not found', `quizzes[${i}].deck`);
    if (store.get('SELECT id FROM quizzes WHERE deck_id=?', [existing.id]))
      throw err('CONFLICT', 'deck already has a quiz', `quizzes[${i}].deck`);
  }

  const counts = {
    decks_created: 0, decks_reused: 0, cards_added: 0,
    quizzes_created: 0, questions_added: 0,
  };

  return store.tx(() => {
    const deckIds = new Map<string, number>();
    for (const d of preparedDecks) {
      const key = d.name.toLowerCase();
      const existing = store.get('SELECT id FROM decks WHERE name=? COLLATE NOCASE', [d.name]);
      let deckId: number;
      if (existing) {
        deckId = existing.id;
        counts.decks_reused++;
      } else {
        const r = store.run('INSERT INTO decks (name, description) VALUES (?,?)', [d.name, d.description]);
        deckId = Number(r.lastInsertRowid);
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
          const found = deckIds.get(key) ?? store.get('SELECT id FROM decks WHERE name=? COLLATE NOCASE', [q.deck]);
          deckId = found ? found.id : null;
        } else {
          deckId = Number(q.deck);
        }
      }
      const r = store.run('INSERT INTO quizzes (title, description, deck_id, source) VALUES (?,?,?,?)',
        [q.title, q.description, deckId, 'import']);
      const quizId = Number(r.lastInsertRowid);
      counts.quizzes_created++;
      q.questions.forEach((question: any, i: number) => {
        store.run('INSERT INTO questions (quiz_id, position, type, prompt, choices_json, answer_json, explanation, points) VALUES (?,?,?,?,?,?,?,?)',
          [quizId, i + 1, question.type, question.prompt,
            question.choices ? JSON.stringify(question.choices) : null,
            JSON.stringify(question.answer), question.explanation, question.points]);
        counts.questions_added++;
      });
    }

    return { ok: true, ...counts };
  });
}