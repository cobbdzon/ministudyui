import * as store from '../store/index.js';
import * as srs from '../srs/index.js';
import { AppError } from '../errors.js';
import type {
  CardRow, CardScheduleBoxInput, CardStateRow, DeckRow, DeckSummary, OkResponse,
  ReviewCardDto, ReviewQueueInput, ReviewBoxInput, SrsSnapshot, StatsDto, StatsInput,
} from '../../../shared/types.js';

export function queue({ deck, limit }: ReviewQueueInput): ReviewCardDto[] {
  let deckId: number;
  if (typeof deck === 'number') deckId = deck;
  else {
    const d = store.get<DeckRow>('SELECT * FROM decks WHERE name=? COLLATE NOCASE', [deck ?? '']);
    if (!d) throw new AppError('NOT_FOUND', 'deck not found');
    deckId = d.id;
  }
  const lim = Math.min(Math.max(limit || 10, 1), 50);
  interface QueueRow {
    id: number; front: string; back: string; tags_json: string;
    source: CardRow['source']; ease: number; interval_days: number; reps: number;
    lapses: number; due_at: string;
  }
  const rows = store.all<QueueRow>(
    `SELECT c.id, c.front, c.back, c.tags_json, c.source, cs.ease, cs.interval_days, cs.reps, cs.lapses, cs.due_at
     FROM cards c JOIN card_state cs ON cs.card_id=c.id
     WHERE c.deck_id=? AND cs.ignored = 0 AND cs.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
     ORDER BY cs.due_at LIMIT ?`, [deckId, lim]);
  const now = new Date().toISOString();
  return rows.map((r) => ({
    id: r.id, front: r.front, back: r.back, tags: JSON.parse(r.tags_json) as string[], source: r.source,
    preview: srs.preview({
      ease: r.ease, interval_days: r.interval_days, reps: r.reps, lapses: r.lapses,
    }, now),
  }));
}

// Manual override of a card's scheduling. Shifts are relative to the current
// due time (or to now when due_now is set), so `due_now` and `adjust_minutes`
// can be combined. `ignored` cards are excluded from review queues.
export function cardSchedule({ cardId, adjustMinutes, dueNow, ignored }: CardScheduleBoxInput): OkResponse {
  if (adjustMinutes === undefined && dueNow === undefined && ignored === undefined)
    throw new AppError('VALIDATION', 'provide at least one scheduling change');
  if (adjustMinutes !== undefined && !Number.isFinite(adjustMinutes))
    throw new AppError('VALIDATION', 'adjust_minutes must be a finite integer', 'adjust_minutes');
  if (adjustMinutes !== undefined && (adjustMinutes < -10000 || adjustMinutes > 10000))
    throw new AppError('VALIDATION', 'adjust_minutes must be between -10000 and 10000', 'adjust_minutes');

  const state = store.get<CardStateRow>('SELECT * FROM card_state WHERE card_id=?', [cardId]);
  if (!state) throw new AppError('NOT_FOUND', 'card not found');

  let base = Date.now();
  if (!dueNow && state.due_at) {
    const t = new Date(state.due_at).getTime();
    if (!Number.isNaN(t)) base = t;
  }
  const dueAt = new Date(base + (adjustMinutes ?? 0) * 60000).toISOString();
  const nextIgnored = ignored === undefined ? state.ignored : ignored ? 1 : 0;

  return store.tx(() => {
    store.run('UPDATE card_state SET due_at=?, ignored=? WHERE card_id=?', [dueAt, nextIgnored, cardId]);
    // card_state has no change trigger; touching the card fires trg_cards_u so
    // the SSE feed tells open deck views to refresh their pills and countdowns.
    store.run("UPDATE cards SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", [cardId]);
    return { ok: true as const };
  });
}

export function review({ cardId, rating }: ReviewBoxInput): { ok: true; review_id: number } {
  if (rating < 0 || rating > 3) throw new AppError('VALIDATION', 'rating 0..3', 'rating');
  const state = store.get<CardStateRow>('SELECT * FROM card_state WHERE card_id=?', [cardId]);
  if (!state) throw new AppError('NOT_FOUND', 'card not found');
  const now = new Date().toISOString();
  const snapshot = {
    ease: state.ease, interval_days: state.interval_days, reps: state.reps, lapses: state.lapses,
    due_at: state.due_at, last_reviewed_at: state.last_reviewed_at,
  };
  const newState = srs.schedule(snapshot, rating, now);
  return store.tx(() => {
    store.run('UPDATE card_state SET ease=?, interval_days=?, reps=?, lapses=?, due_at=?, last_reviewed_at=? WHERE card_id=?',
      [newState.ease, newState.interval_days, newState.reps, newState.lapses,
        newState.due_at, newState.last_reviewed_at, cardId]);
    const r = store.run('INSERT INTO reviews (card_id, rating, prev_interval, new_interval, prev_ease, new_ease, prev_state_json) VALUES (?,?,?,?,?,?,?)',
      [cardId, rating, state.interval_days, newState.interval_days, state.ease, newState.ease, JSON.stringify(snapshot)]);
    return { ok: true as const, review_id: r.lastInsertRowid };
  });
}

export function undo(): { ok: true; card_id: number } {
  const last = store.get<{
    id: number; card_id: number; prev_state_json: string;
  }>('SELECT * FROM reviews ORDER BY id DESC LIMIT 1');
  if (!last) throw new AppError('NOT_FOUND', 'no review to undo');
  const snap = JSON.parse(last.prev_state_json) as SrsSnapshot;
  store.tx(() => {
    store.run('UPDATE card_state SET ease=?, interval_days=?, reps=?, lapses=?, due_at=?, last_reviewed_at=? WHERE card_id=?',
      [snap.ease, snap.interval_days, snap.reps, snap.lapses, snap.due_at, snap.last_reviewed_at, last.card_id]);
    store.run('DELETE FROM reviews WHERE id=?', [last.id]);
  });
  return { ok: true, card_id: last.card_id };
}

export function stats({ deck, days }: StatsInput): StatsDto {
  const d = days || 30;
  let deckId: number | null = null;
  if (deck !== undefined) {
    const row = typeof deck === 'number'
      ? store.get<{ id: number }>('SELECT id FROM decks WHERE id=?', [deck])
      : store.get<{ id: number }>('SELECT id FROM decks WHERE name=? COLLATE NOCASE', [deck]);
    if (!row) throw new AppError('NOT_FOUND', 'deck not found');
    deckId = row.id;
  }
  const where = deckId ? 'WHERE c.deck_id=' + deckId : '';
  const total = store.count(`SELECT COUNT(*) AS n FROM cards c ${where}`);
  const dueWhere = deckId ? 'WHERE c.deck_id=? AND cs.ignored = 0' : 'WHERE cs.ignored = 0';
  const dueParams = deckId ? [deckId] : [];
  const due = store.count(
    `SELECT COUNT(*) AS n FROM cards c JOIN card_state cs ON cs.card_id=c.id ${dueWhere}
     AND cs.due_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')`, dueParams);
  const rpd = store.all<{ day: string; n: number }>(
    `SELECT substr(reviewed_at,1,10) AS day, COUNT(*) AS n FROM reviews r JOIN cards c ON c.id=r.card_id ${deckId ? 'WHERE c.deck_id=' + deckId : ''} GROUP BY day ORDER BY day DESC LIMIT ?`, [d]);

  // ---- retention: share of reviews in the window rated >= 1, as a 0-100 number ----
  const deckParam = deckId;
  const retentionRow = store.get<{ retention: number | null }>(
    `SELECT ROUND(100.0 * SUM(CASE WHEN r.rating >= 1 THEN 1 ELSE 0 END) / COUNT(*), 1) AS retention
     FROM reviews r JOIN cards c ON c.id = r.card_id
     WHERE r.reviewed_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now', ?)
       AND (? IS NULL OR c.deck_id = ?)`,
    [`-${d} days`, deckParam, deckParam],
  );
  const retention = retentionRow?.retention ?? null;

  // ---- interval distribution: card counts by maturity bucket ----
  const mixRow = store.get<{ n: number; l: number; m: number }>(
    `SELECT
       SUM(CASE WHEN cs.reps = 0 THEN 1 ELSE 0 END) AS n,
       SUM(CASE WHEN cs.reps > 0 AND cs.reps < 3 THEN 1 ELSE 0 END) AS l,
       SUM(CASE WHEN cs.reps >= 3 THEN 1 ELSE 0 END) AS m
     FROM cards c JOIN card_state cs ON cs.card_id = c.id
     WHERE (? IS NULL OR c.deck_id = ?)`,
    [deckParam, deckParam],
  );
  const interval_distribution = [
    { bucket: 'new' as const, cards: Number(mixRow?.n ?? 0) },
    { bucket: 'learning' as const, cards: Number(mixRow?.l ?? 0) },
    { bucket: 'mature' as const, cards: Number(mixRow?.m ?? 0) },
  ];

  // ---- weakest tags: summed lapses across tags, top 6 with at least one lapse ----
  const weakest_tags = store.all<{ tag: string; cards: number; lapses: number }>(
    `SELECT je.value AS tag, COUNT(*) AS cards, SUM(cs.lapses) AS lapses
     FROM cards c
     JOIN card_state cs ON cs.card_id = c.id
     JOIN json_each(c.tags_json) je
     WHERE (? IS NULL OR c.deck_id = ?)
     GROUP BY je.value
     HAVING SUM(cs.lapses) > 0
     ORDER BY SUM(cs.lapses) DESC, COUNT(*) DESC
     LIMIT 6`,
    [deckParam, deckParam],
  ).map((r) => ({ tag: String(r.tag), cards: Number(r.cards), lapses: Number(r.lapses) }));

  return { total, due, reviews_per_day: rpd, retention, interval_distribution, weakest_tags };
}

export function deckSummaries(): DeckSummary[] {
  const decks = store.all<DeckRow>('SELECT * FROM decks ORDER BY name');
  return decks.map((d) => ({
    id: d.id, name: d.name, description: d.description,
    due: store.count('SELECT COUNT(*) AS n FROM cards c JOIN card_state cs ON cs.card_id=c.id WHERE c.deck_id=? AND cs.ignored = 0 AND cs.due_at <= strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')', [d.id]),
    new: store.count('SELECT COUNT(*) AS n FROM cards c JOIN card_state cs ON cs.card_id=c.id WHERE c.deck_id=? AND cs.reps = 0', [d.id]),
    total: store.count('SELECT COUNT(*) AS n FROM cards WHERE deck_id=?', [d.id]),
    mature: store.count('SELECT COUNT(*) AS n FROM cards c JOIN card_state cs ON cs.card_id=c.id WHERE c.deck_id=? AND cs.reps >= 3', [d.id]),
    ignored: store.count('SELECT COUNT(*) AS n FROM cards c JOIN card_state cs ON cs.card_id=c.id WHERE c.deck_id=? AND cs.ignored = 1', [d.id]),
    quizzes: store.count('SELECT COUNT(*) AS n FROM quizzes WHERE deck_id=?', [d.id]),
  }));
}
