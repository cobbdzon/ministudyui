import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from '../boxes/store/index.js';
import * as library from '../boxes/library/index.js';
import * as study from '../boxes/study/index.js';
import * as attempts from '../boxes/attempts/index.js';
import * as changefeed from '../boxes/changefeed/index.js';
import * as latex from '../boxes/latex/index.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..', '..');
const WEB = path.join(ROOT, 'web');
const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';

function send(res: any, status: number, obj: any) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
function errRes(res: any, e: any) {
  const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'VALIDATION' ? 400 : e.code === 'CONFLICT' ? 409 : 500;
  send(res, status, { code: e.code || 'ERROR', message: e.message, field: e.field, hint: e.hint });
}
function parseBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c: any) => { data += c; if (data.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('bad json')); }
    });
  });
}
function securityOk(req: any): boolean {
  const host = req.headers.host || '';
  if (host !== `${HOST}:${PORT}` && host !== `localhost:${PORT}`) return false;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${HOST}:${PORT}` && origin !== `http://localhost:${PORT}`) return false;
  return true;
}

function route(req: any, res: any) {
  if (!securityOk(req)) { send(res, 403, { code: 'FORBIDDEN', message: 'bad host/origin' }); return; }
  let url;
  try { url = new URL(req.url, `http://${HOST}:${PORT}`); } catch { url = new URL('/', `http://${HOST}:${PORT}`); }
  const p = url.pathname;
  const method = req.method;

  // SSE
  if (method === 'GET' && p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const unsub = changefeed.subscribe((c) => {
      res.write(`event: change\ndata: ${JSON.stringify({ entity: c.entity, id: c.entity_id, op: c.op })}\n\n`);
    });
    req.on('close', () => unsub());
    return;
  }

  // static
  if (method === 'GET' && !p.startsWith('/api/')) {
    let fp = path.join(WEB, p === '/' ? 'index.html' : p);
    if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      // try TypeScript source for a requested .js module
      if (p.endsWith('.js')) {
        const tsPath = path.join(WEB, p.replace(/\.js$/, '.ts'));
        if (fs.existsSync(tsPath)) fp = tsPath;
        else fp = path.join(WEB, 'index.html');
      } else {
        fp = path.join(WEB, 'index.html');
      }
    }
    const ext = path.extname(fp);
    if (ext === '.ts') {
      const source = fs.readFileSync(fp, 'utf8');
      const transpiler = new Bun.Transpiler({ loader: 'ts' });
      const code = transpiler.transformSync(source);
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(code);
      return;
    }
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
    return;
  }

  (async () => {
    try {
      // Decks
      if (method === 'GET' && p === '/api/decks') return send(res, 200, { decks: study.deckSummaries() });
      if (method === 'POST' && p === '/api/decks') {
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type must be application/json' };
        return send(res, 200, { ok: true, deck: library.deckCreate(b) });
      }
      if (method === 'DELETE' && /^\/api\/decks\/\d+$/.test(p)) {
        const id = Number(p.split('/')[3]);
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type' };
        return send(res, 200, library.deckDelete({ deck: id, confirmName: b.confirm_name }));
      }
      if (method === 'PATCH' && /^\/api\/decks\/\d+$/.test(p)) {
        const id = Number(p.split('/')[3]);
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type' };
        return send(res, 200, library.deckUpdate({ deck: id, name: b.name, description: b.description }));
      }
      // Cards
      if (method === 'GET' && p === '/api/cards') {
        const q = url.searchParams;
        return send(res, 200, library.cardSearch({ query: q.get('q') || undefined, deck: q.get('deck') ? (isNaN(Number(q.get('deck'))) ? q.get('deck') : Number(q.get('deck') || 0)) : undefined, tag: q.get('tag') || undefined, source: q.get('source') || undefined, limit: Number(q.get('limit') || 0) || 20, offset: Number(q.get('offset') || 0) || 0 }));
      }
      if (method === 'POST' && p === '/api/cards') {
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type' };
        return send(res, 200, library.cardAdd(b));
      }
      if (method === 'PATCH' && /^\/api\/cards\/\d+$/.test(p)) {
        const id = Number(p.split('/')[3]);
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type' };
        return send(res, 200, library.cardUpdate({ cardId: id, ...b }));
      }
      if (method === 'DELETE' && p === '/api/cards') {
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type' };
        return send(res, 200, library.cardDelete({ cardIds: b.card_ids ?? b.cardIds }));
      }
      // Review
      if (method === 'GET' && p === '/api/review/queue') {
        const q = url.searchParams;
        const deck = isNaN(Number(q.get('deck'))) ? q.get('deck') : Number(q.get('deck') || 0);
        return send(res, 200, { cards: study.queue({ deck, limit: Number(q.get('limit') || 0) || 10 }) });
      }
      if (method === 'POST' && p === '/api/review') {
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type' };
        return send(res, 200, study.review({ cardId: b.card_id ?? b.cardId, rating: b.rating }));
      }
      if (method === 'POST' && p === '/api/review/undo') {
        return send(res, 200, study.undo());
      }
      // Quizzes
      if (method === 'GET' && p === '/api/quizzes') {
        const q = url.searchParams;
        const deck = q.get('deck') ? (isNaN(Number(q.get('deck'))) ? q.get('deck') : Number(q.get('deck') || 0)) : undefined;
        return send(res, 200, { quizzes: library.quizList({ deck, limit: Number(q.get('limit') || 0) || 50 }) });
      }
      if (method === 'GET' && /^\/api\/quizzes\/\d+$/.test(p)) {
        const id = Number(p.split('/')[3]);
        const inc = url.searchParams.get('include_answers') !== 'false';
        return send(res, 200, library.quizGet({ quizId: id, includeAnswers: inc }));
      }
      if (method === 'POST' && p === '/api/quizzes') {
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type' };
        return send(res, 200, library.quizCreate(b));
      }
      if (method === 'POST' && /^\/api\/quizzes\/\d+\/questions$/.test(p)) {
        const id = Number(p.split('/')[3]);
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type' };
        return send(res, 200, library.quizAddQuestions({ quizId: id, questions: b.questions }));
      }
      // Import (bundle pasted from an external AI assistant / agent)
      if (method === 'POST' && p === '/api/import') {
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type must be application/json' };
        return send(res, 200, library.importBundle(b));
      }
      // Attempts
      if (method === 'POST' && p === '/api/attempts/restart') {
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type' };
        return send(res, 200, attempts.restart({ quizId: b.quiz_id ?? b.quizId }));
      }
      if (method === 'POST' && p === '/api/attempts') {
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type' };
        return send(res, 200, attempts.start({ quizId: b.quiz_id ?? b.quizId }));
      }
      if (method === 'GET' && p === '/api/attempts') {
        const q = url.searchParams;
        return send(res, 200, { attempts: attempts.list({ status: q.get('status') || undefined, quizId: q.get('quiz_id') ? Number(q.get('quiz_id') || 0) : undefined, limit: Number(q.get('limit') || 0) || 20 }) });
      }
      if (method === 'GET' && /^\/api\/attempts\/\d+$/.test(p)) {
        const id = Number(p.split('/')[3]);
        const att = store.get('SELECT * FROM attempts WHERE id=?', [id]);
        if (!att) throw { code: 'NOT_FOUND', message: 'attempt not found' };
        const answers = store.all('SELECT * FROM answers WHERE attempt_id=?', [id]);
        return send(res, 200, { attempt: att, answers });
      }
      if (method === 'PATCH' && /^\/api\/attempts\/\d+\/answers\/\d+$/.test(p)) {
        const parts = p.split('/');
        const attemptId = Number(parts[3]); const qid = Number(parts[5]);
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type' };
        return send(res, 200, attempts.answer({ attemptId, questionId: qid, response: b.response }));
      }
      if (method === 'POST' && /^\/api\/attempts\/\d+\/submit$/.test(p)) {
        const id = Number(p.split('/')[3]);
        return send(res, 200, attempts.submit({ attemptId: id }));
      }
      // Grading
      if (method === 'GET' && p === '/api/grading/pending') {
        const q = url.searchParams;
        return send(res, 200, { answers: attempts.pending({ limit: Number(q.get('limit') || 0) || 20 }) });
      }
      if (method === 'POST' && /^\/api\/grading\/\d+$/.test(p)) {
        const id = Number(p.split('/')[3]);
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type' };
        return send(res, 200, attempts.gradeAnswer({ answerId: id, points: b.points, feedback: b.feedback }));
      }
      // Stats
      if (method === 'GET' && p === '/api/stats') {
        const q = url.searchParams;
        const deck = q.get('deck') ? (isNaN(Number(q.get('deck'))) ? q.get('deck') : Number(q.get('deck') || 0)) : undefined;
        return send(res, 200, study.stats({ deck, days: Number(q.get('days') || 0) || 30 }));
      }
      // latex validate (for UI)
      if (method === 'POST' && p === '/api/latex/validate') {
        const b = await parseBody(req);
        if (req.headers['content-type'] !== 'application/json') throw { code: 'VALIDATION', message: 'content-type' };
        return send(res, 200, { results: latex.validate(b.sources || []) });
      }
      send(res, 404, { code: 'NOT_FOUND', message: 'route not found' });
    } catch (e) {
      errRes(res, e);
    }
  })();
}

// init
store.open(path.join(ROOT, 'data', 'ministudy.db'));
store.migrate();

const server = http.createServer(route);
server.listen(PORT, HOST, () => {
  console.log(`ministudyui http://127.0.0.1:${PORT}`);
});