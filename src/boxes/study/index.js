import * as store from '../store/index.js';
import * as srs from '../srs/index.js';

function err(code, message, field) { const e = new Error(message); e.code = code; e.field = field; return e; }

export function queue({ deck, limit }) {
  // resolve deck
  let deckId;
  if (typeof deck === 'number') deckId = deck;
  else {
    const d = store.get('SELECT * FROM decks WHERE name=? COLLATE NOCASE', [deck]);
    if (!d) throw err('NOT_FOUND', 'deck not found');
    deckId = d.id;
  }
  const lim = Math.min(Math.max(limit || 10, 1), 50);
  const rows = store.all(
    `SELECT c.id, c.front, c.back, c.tags_json, c.source, cs.ease, cs.interval_days, cs.reps, cs.lapses, cs.due_at
     FROM cards c JOIN card_state cs ON cs.card_id=c.id
     WHERE c.deck_id=? AND cs.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
     ORDER BY cs.due_at LIMIT ?`, [deckId, lim]);
  const now = new Date().toISOString();
  return rows.map((r) => ({
    id: r.id, front: r.front, back: r.back, tags: JSON.parse(r.tags_json), source: r.source,
    preview: srs.preview({ ease: r.ease, interval_days: r.interval_days, reps: r.reps, lapses: r.lapses }, now),
  }));
}

export function review({ cardId, rating }) {
  if (rating < 0 || rating > 3) throw err('VALIDATION', 'rating 0..3', 'rating');
  const state = store.get('SELECT * FROM card_state WHERE card_id=?', [cardId]);
  if (!state) throw err('NOT_FOUND', 'card not found');
  const now = new Date().toISOString();
  const snapshot = { ease: state.ease, interval_days: state.interval_days, reps: state.reps, lapses: state.lapses, due_at: state.due_at, last_reviewed_at: state.last_reviewed_at };
  const newState = srs.schedule(snapshot, rating, now);
  return store.tx(() => {
    store.run('UPDATE card_state SET ease=?, interval_days=?, reps=?, lapses=?, due_at=?, last_reviewed_at=? WHERE card_id=?',
      [newState.ease, newState.interval_days, newState.reps, newState.lapses, newState.due_at, newState.last_reviewed_at, cardId]);
    const r = store.run('INSERT INTO reviews (card_id, rating, prev_interval, new_interval, prev_ease, new_ease, prev_state_json) VALUES (?,?,?,?,?,?,?)',
      [cardId, rating, state.interval_days, newState.interval_days, state.ease, newState.ease, JSON.stringify(snapshot)]);
    return { ok: true, review_id: r.lastInsertRowid };
  });
}

export function undo() {
  const last = store.get('SELECT * FROM reviews ORDER BY id DESC LIMIT 1');
  if (!last) throw err('NOT_FOUND', 'no review to undo');
  const snap = JSON.parse(last.prev_state_json);
  store.tx(() => {
    store.run('UPDATE card_state SET ease=?, interval_days=?, reps=?, lapses=?, due_at=?, last_reviewed_at=? WHERE card_id=?',
      [snap.ease, snap.interval_days, snap.reps, snap.lapses, snap.due_at, snap.last_reviewed_at, last.card_id]);
    store.run('DELETE FROM reviews WHERE id=?', [last.id]);
  });
  return { ok: true, card_id: last.card_id };
}

export function stats({ deck, days }) {
  const d = days || 30;
  let deckId = null;
  if (deck !== undefined) {
    const row = typeof deck === 'number' ? store.get('SELECT id FROM decks WHERE id=?', [deck]) : store.get('SELECT id FROM decks WHERE name=? COLLATE NOCASE', [deck]);
    if (!row) throw err('NOT_FOUND', 'deck not found');
    deckId = row.id;
  }
  const where = deckId ? 'WHERE c.deck_id=' + deckId : '';
  const total = store.get(`SELECT COUNT(*) AS n FROM cards c ${where}`).n;
  const due = store.get(`SELECT COUNT(*) AS n FROM cards c JOIN card_state cs ON cs.card_id=c.id ${where} ${deckId ? 'AND' : 'WHERE'} cs.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')`.replace('WHERE  AND','WHERE')).n;
  // reviews per day
  const rpd = store.all(`SELECT substr(reviewed_at,1,10) AS day, COUNT(*) AS n FROM reviews r JOIN cards c ON c.id=r.card_id ${deckId ? 'WHERE c.deck_id=' + deckId : ''} GROUP BY day ORDER BY day DESC LIMIT ?`, [d]);
  return { total, due, reviews_per_day: rpd };
}

export function deckSummaries() {
  const decks = store.all('SELECT * FROM decks ORDER BY name');
  return decks.map((d) => {
    const total = store.get('SELECT COUNT(*) AS n FROM cards WHERE deck_id=?', [d.id]).n;
    const due = store.get('SELECT COUNT(*) AS n FROM cards c JOIN card_state cs ON cs.card_id=c.id WHERE c.deck_id=? AND cs.due_at <= strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')', [d.id]).n;
    const mature = store.get('SELECT COUNT(*) AS n FROM cards c JOIN card_state cs ON cs.card_id=c.id WHERE c.deck_id=? AND cs.reps >= 3', [d.id]).n;
    const newc = store.get('SELECT COUNT(*) AS n FROM cards c JOIN card_state cs ON cs.card_id=c.id WHERE c.deck_id=? AND cs.reps = 0', [d.id]).n;
    return { id: d.id, name: d.name, description: d.description, due, new: newc, total, mature };
  });
}