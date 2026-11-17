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

export function deckDelete({ deck, confirmName }: any): any {
  const d = resolveDeck(deck);
  if (confirmName !== d.name) throw err('VALIDATION', 'confirm_name mismatch', 'confirm_name');
  store.run('DELETE FROM decks WHERE id=?', [d.id]);
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

function validateQuestion(q: any, i: number): any {
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
  if (deck !== undefined) {
    const d = resolveDeck(deck);
    return store.all('SELECT * FROM quizzes WHERE deck_id=? ORDER BY id LIMIT ?', [d.id, lim]);
  }
  return store.all('SELECT * FROM quizzes ORDER BY id LIMIT ?', [lim]);
}