import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as store from '../boxes/store/index.js';
import * as library from '../boxes/library/index.js';
import * as study from '../boxes/study/index.js';
import * as attempts from '../boxes/attempts/index.js';
import * as latex from '../boxes/latex/index.js';

store.open(process.env.DB_PATH || new URL('../../data/ministudy.db', import.meta.url).pathname);
store.migrate();

const server = new McpServer({ name: 'ministudyui', version: '0.1.0' });

function ok(data: any): any { return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, ...data }) }] }; }
function fail(e: any): any { return { content: [{ type: 'text' as const, text: JSON.stringify({ code: e.code || 'ERROR', message: e.message, field: e.field, hint: e.hint }) }], isError: true }; }
function wrap(fn: any): any { return async (args: any) => { try { return ok(await fn(args)); } catch (e) { return fail(e); } }; }

const Id = z.number().int().min(1);
const DeckRef = z.union([z.number().int().min(1), z.string().min(1).max(120)]);
const Tags = z.array(z.string().min(1).max(40)).max(10).optional();
const Latex = z.string().min(1).max(4000);

server.registerTool('deck_create', { description: 'Create a deck', inputSchema: { name: z.string().min(1).max(120), description: z.string().max(2000).optional() } }, wrap((a: any) => library.deckCreate(a)));
server.registerTool('deck_list', { description: 'List decks', inputSchema: {} }, wrap(() => ({ decks: library.deckList() })));
server.registerTool('deck_delete', { description: 'Delete a deck', inputSchema: { deck: DeckRef, confirm_name: z.string() } }, wrap((a: any) => library.deckDelete({ deck: a.deck, confirmName: a.confirm_name })));

server.registerTool('card_add', { description: 'Add cards', inputSchema: { deck: DeckRef, cards: z.array(z.object({ front: Latex, back: Latex, tags: Tags })).min(1).max(100) } }, wrap((a: any) => library.cardAdd(a)));
server.registerTool('card_update', { description: 'Update a card', inputSchema: { card_id: Id, front: Latex.optional(), back: Latex.optional(), tags: Tags, deck: DeckRef.optional() } }, wrap((a: any) => library.cardUpdate({ cardId: a.card_id, front: a.front, back: a.back, tags: a.tags, deck: a.deck })));
server.registerTool('card_delete', { description: 'Delete cards', inputSchema: { card_ids: z.array(Id).min(1).max(100) } }, wrap((a: any) => library.cardDelete({ cardIds: a.card_ids })));
server.registerTool('card_search', { description: 'Search cards', inputSchema: { query: z.string().max(200).optional(), deck: DeckRef.optional(), tag: z.string().optional(), source: z.enum(['user','ai','import']).optional(), limit: z.number().int().min(1).max(100).default(20), offset: z.number().int().min(0).default(0) } }, wrap((a: any) => library.cardSearch(a)));

const Choice = z.object({ id: z.string().regex(/^[a-z0-9_]{1,16}$/), text: z.string().min(1).max(1000) });
const Question = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mcq'), prompt: Latex, explanation: z.string().max(4000).optional(), points: z.number().positive().max(100).optional(), choices: z.array(Choice).min(2).max(8), correct: z.string() }),
  z.object({ type: z.literal('multi'), prompt: Latex, explanation: z.string().max(4000).optional(), points: z.number().positive().max(100).optional(), choices: z.array(Choice).min(2).max(8), correct: z.array(z.string()).min(1) }),
  z.object({ type: z.literal('numeric'), prompt: Latex, explanation: z.string().max(4000).optional(), points: z.number().positive().max(100).optional(), value: z.number(), tolerance: z.number().min(0).default(0), tolerance_type: z.enum(['abs','rel']).default('abs'), unit: z.string().max(20).optional() }),
  z.object({ type: z.enum(['short','latex']), prompt: Latex, explanation: z.string().max(4000).optional(), points: z.number().positive().max(100).optional(), reference: z.string().min(1).max(4000), rubric: z.string().max(2000).optional() }),
]);

server.registerTool('quiz_create', { description: 'Create quiz', inputSchema: { title: z.string().min(1).max(200), description: z.string().max(2000).optional(), deck: DeckRef.optional(), questions: z.array(Question).min(1).max(100) } }, wrap((a: any) => library.quizCreate(a)));
server.registerTool('quiz_add_questions', { description: 'Add questions', inputSchema: { quiz_id: Id, questions: z.array(Question).min(1).max(100) } }, wrap((a: any) => library.quizAddQuestions({ quizId: a.quiz_id, questions: a.questions })));
server.registerTool('quiz_get', { description: 'Get quiz', inputSchema: { quiz_id: Id, include_answers: z.boolean().default(true) } }, wrap((a: any) => library.quizGet({ quizId: a.quiz_id, includeAnswers: a.include_answers })));
server.registerTool('quiz_list', { description: 'List quizzes', inputSchema: { deck: DeckRef.optional(), limit: z.number().int().min(1).max(100).default(50) } }, wrap((a: any) => ({ quizzes: library.quizList(a) })));

server.registerTool('study_next_due', { description: 'Next due cards', inputSchema: { deck: DeckRef, limit: z.number().int().min(1).max(50).default(10) } }, wrap((a: any) => ({ cards: study.queue(a) })));
server.registerTool('study_stats', { description: 'Study stats', inputSchema: { deck: DeckRef.optional(), days: z.number().int().min(1).max(365).default(30) } }, wrap((a: any) => study.stats(a)));
server.registerTool('attempt_list', { description: 'List attempts', inputSchema: { status: z.enum(['in_progress','submitted','graded']).optional(), quiz_id: Id.optional(), limit: z.number().int().min(1).max(100).default(20) } }, wrap((a: any) => ({ attempts: attempts.list({ status: a.status, quizId: a.quiz_id, limit: a.limit }) })));

server.registerTool('attempts_pending_grading', { description: 'Pending grading', inputSchema: { limit: z.number().int().min(1).max(50).default(20) } }, wrap((a: any) => ({ answers: attempts.pending(a) })));
server.registerTool('answer_grade', { description: 'Grade an answer', inputSchema: { answer_id: Id, points: z.number().min(0), feedback: z.string().min(1).max(4000) } }, wrap((a: any) => attempts.gradeAnswer({ answerId: a.answer_id, points: a.points, feedback: a.feedback })));
server.registerTool('latex_validate', { description: 'Validate LaTeX', inputSchema: { sources: z.array(z.string().max(4000)).min(1).max(50) } }, wrap((a: any) => ({ results: latex.validate(a.sources) })));

const transport = new StdioServerTransport();
await server.connect(transport);