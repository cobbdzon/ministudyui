// The only data interface the UI knows. api.mock.js implements the same surface
// against in-memory fixtures so the app can be reviewed without a server.

const useMock = new URLSearchParams(location.search).has('mock');

async function req(path, opts = {}) {
  const headers = opts.body ? { 'Content-Type': 'application/json' } : {};
  const res = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.message || `Request failed (${res.status})`);
    Object.assign(err, data || {});
    throw err;
  }
  return data;
}

function normalizeCard(c) {
  if (!c) return c;
  let tags = c.tags;
  if (!Array.isArray(tags)) {
    try {
      tags = JSON.parse(c.tags_json || '[]');
    } catch {
      tags = [];
    }
  }
  return { ...c, tags };
}

const real = {
  req,

  decks() {
    return req('/api/decks');
  },
  createDeck({ name, description }) {
    return req('/api/decks', {
      method: 'POST',
      body: JSON.stringify({ name, description: description || '' }),
    });
  },
  deleteDeck(id, confirmName) {
    return req(`/api/decks/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirm_name: confirmName }),
    });
  },
  updateDeck(id, patch) {
    return req(`/api/decks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  async cards({ deck, q, tag, source, limit = 100, offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (deck !== undefined && deck !== null) params.set('deck', deck);
    if (q) params.set('q', q);
    if (tag) params.set('tag', tag);
    if (source) params.set('source', source);
    params.set('limit', limit);
    params.set('offset', offset);
    const data = await req(`/api/cards?${params}`);
    return { ...data, cards: (data.cards || []).map(normalizeCard) };
  },
  async addCards(deck, cards) {
    const data = await req('/api/cards', {
      method: 'POST',
      body: JSON.stringify({ deck, cards }),
    });
    return data;
  },
  importBundle(bundle) {
    return req('/api/import', {
      method: 'POST',
      body: JSON.stringify(bundle),
    });
  },
  updateCard(id, patch) {
    return req(`/api/cards/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  deleteCards(ids) {
    return req('/api/cards', { method: 'DELETE', body: JSON.stringify({ card_ids: ids }) });
  },

  reviewQueue(deck, limit = 10) {
    const params = new URLSearchParams({ deck: String(deck ?? ''), limit: String(limit) });
    return req(`/api/review/queue?${params}`);
  },
  review(cardId, rating) {
    return req('/api/review', {
      method: 'POST',
      body: JSON.stringify({ card_id: cardId, rating }),
    });
  },
  undo() {
    return req('/api/review/undo', { method: 'POST' });
  },

  quizzes(deck) {
    const suffix = deck !== undefined && deck !== null ? `?deck=${encodeURIComponent(deck)}` : '';
    return req(`/api/quizzes${suffix}`);
  },
  quiz(id, { includeAnswers = true } = {}) {
    return req(`/api/quizzes/${id}?include_answers=${includeAnswers}`);
  },

  attempts({ status, quizId, limit = 20 } = {}) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (quizId) params.set('quiz_id', String(quizId));
    params.set('limit', String(limit));
    return req(`/api/attempts?${params}`);
  },
  attempt(id) {
    return req(`/api/attempts/${id}`);
  },
  async startAttempt(quizId) {
    const data = await req('/api/attempts', {
      method: 'POST',
      body: JSON.stringify({ quiz_id: quizId }),
    });
    return data.attempt ? data : { attempt: data };
  },
  async restartAttempt(quizId) {
    const data = await req('/api/attempts/restart', {
      method: 'POST',
      body: JSON.stringify({ quiz_id: quizId }),
    });
    return data.attempt ? data : { attempt: data };
  },
  answerAttempt(attemptId, questionId, response) {
    return req(`/api/attempts/${attemptId}/answers/${questionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ response }),
    });
  },
  submitAttempt(id) {
    return req(`/api/attempts/${id}/submit`, { method: 'POST' });
  },

  pending(limit = 20) {
    return req(`/api/grading/pending?limit=${limit}`);
  },
  grade(answerId, points, feedback) {
    return req(`/api/grading/${answerId}`, {
      method: 'POST',
      body: JSON.stringify({ points, feedback }),
    });
  },

  stats(deck) {
    const suffix = deck !== undefined && deck !== null ? `?deck=${encodeURIComponent(deck)}` : '';
    return req(`/api/stats${suffix}`);
  },

  subscribe(cb) {
    if (typeof EventSource === 'undefined') return () => {};
    const es = new EventSource('/api/events');
    const handler = (e) => {
      try {
        cb(JSON.parse(e.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    es.addEventListener('change', handler);
    return () => es.close();
  },
};

export const api = useMock ? (await import('./api.mock.js')).default : real;
