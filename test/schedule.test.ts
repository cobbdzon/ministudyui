import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import * as store from '../src/boxes/store/index.js';
import * as library from '../src/boxes/library/index.js';
import * as study from '../src/boxes/study/index.js';
import type { CardStateRow } from '../shared/types.js';

let deckId: number;
let cardIds: number[];

function state(id: number): CardStateRow {
  const row = store.get<CardStateRow>('SELECT * FROM card_state WHERE card_id=?', [id]);
  if (!row) throw new Error('missing card state');
  return row;
}

beforeEach(() => {
  store.close();
  store.open(':memory:');
  store.migrate();
  const deck = library.deckCreate({ name: 'Scheduling' });
  deckId = deck.id;
  cardIds = library.cardAdd({
    deck: deckId,
    cards: [
      { front: 'one', back: 'ONE', tags: [], source: 'user' },
      { front: 'two', back: 'TWO', tags: [], source: 'user' },
    ],
  }).card_ids;
});

afterAll(() => store.close());

describe('card scheduling overrides', () => {
  it('creates the ignored column with a default of 0', () => {
    expect(state(cardIds[0]).ignored).toBe(0);
  });

  it('shifts the due time by minutes relative to the current due time', () => {
    const base = new Date(Date.now() + 60 * 60000).toISOString();
    store.run('UPDATE card_state SET due_at=? WHERE card_id=?', [base, cardIds[0]]);

    study.cardSchedule({ cardId: cardIds[0], adjustMinutes: 15 });
    const shifted = new Date(state(cardIds[0]).due_at).getTime();
    expect(Math.round((shifted - new Date(base).getTime()) / 60000)).toBe(15);

    study.cardSchedule({ cardId: cardIds[0], adjustMinutes: -30 });
    const shiftedAgain = new Date(state(cardIds[0]).due_at).getTime();
    expect(Math.round((shiftedAgain - shifted) / 60000)).toBe(-30);
  });

  it('makes a card immediately due', () => {
    store.run('UPDATE card_state SET due_at=? WHERE card_id=?', [
      new Date(Date.now() + 10 * 86400000).toISOString(), cardIds[0],
    ]);
    expect(study.queue({ deck: deckId }).some((c) => c.id === cardIds[0])).toBe(false);

    study.cardSchedule({ cardId: cardIds[0], dueNow: true });
    expect(study.queue({ deck: deckId }).some((c) => c.id === cardIds[0])).toBe(true);
  });

  it('excludes ignored cards from the review queue and counts them in deck summaries', () => {
    study.cardSchedule({ cardId: cardIds[0], ignored: true });

    expect(state(cardIds[0]).ignored).toBe(1);
    const queued = study.queue({ deck: deckId }).map((c) => c.id);
    expect(queued).not.toContain(cardIds[0]);
    expect(queued).toContain(cardIds[1]);

    const summary = study.deckSummaries().find((d) => d.id === deckId)!;
    expect(summary.ignored).toBe(1);
    expect(summary.total).toBe(2);
    expect(summary.due).toBe(1);
  });

  it('restores ignored cards to the review queue when un-ignored', () => {
    study.cardSchedule({ cardId: cardIds[0], ignored: true });
    study.cardSchedule({ cardId: cardIds[0], ignored: false });

    expect(state(cardIds[0]).ignored).toBe(0);
    expect(study.queue({ deck: deckId }).map((c) => c.id)).toContain(cardIds[0]);
    expect(study.deckSummaries().find((d) => d.id === deckId)!.ignored).toBe(0);
  });

  it('exposes scheduling fields through card search', () => {
    study.cardSchedule({ cardId: cardIds[0], ignored: true });
    const found = library.cardSearch({ deck: deckId }).cards.find((c) => c.id === cardIds[0])!;
    expect(found.ignored).toBe(1);
    expect(typeof found.due_at).toBe('string');
  });

  it('keeps stats due counts consistent with the queue', () => {
    const before = study.stats({ deck: deckId }).due;
    study.cardSchedule({ cardId: cardIds[0], ignored: true });
    expect(study.stats({ deck: deckId }).due).toBe(before - 1);
  });

  it('rejects empty and out-of-range overrides', () => {
    expect(() => study.cardSchedule({ cardId: cardIds[0] })).toThrow();
    expect(() => study.cardSchedule({ cardId: cardIds[0], adjustMinutes: 10001 })).toThrow();
  });
});
