import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import * as library from '../boxes/library/index.js';
import * as study from '../boxes/study/index.js';
import * as attempts from '../boxes/attempts/index.js';
import * as latex from '../boxes/latex/index.js';
import * as context from '../boxes/context/index.js';
import * as shared from '../boxes/shared/index.js';
import { asAppError } from '../boxes/errors.js';

// Tool names, descriptions and input schemas are copied verbatim from the
// Phase 0 stdio server; the parity test compares them to the snapshot.
const MUTATING = new Set([
  'deck_create', 'deck_delete', 'deck_update', 'card_add', 'card_update',
  'card_schedule', 'card_delete', 'quiz_create', 'quiz_add_questions',
  'quiz_update', 'quiz_delete', 'question_update', 'question_delete', 'answer_grade',
  'shared_quiz_publish', 'shared_quiz_unpublish', 'shared_quiz_import',
]);
const DESTRUCTIVE = new Set([
  'deck_delete', 'card_delete', 'quiz_delete', 'question_delete', 'answer_grade',
  'shared_quiz_unpublish',
]);

export interface ToolOptions { readOnly: boolean; username: string }

function ok(data: object): CallToolResult {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, ...data }) }] };
}
function fail(e: unknown): CallToolResult {
  const a = asAppError(e);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ code: a.code, message: a.message, field: a.field, hint: a.hint }) }],
    isError: true,
  };
}
function wrap<A, R>(fn: (a: A) => R | Promise<R>) {
  return async (args: A): Promise<CallToolResult> => {
    try { return ok(await fn(args) as object); } catch (e) { return fail(e); }
  };
}

export function registerTools(server: McpServer, opts: ToolOptions): void {
  const register = (name: string, config: Record<string, unknown>, cb: (...args: never[]) => unknown) => {
    if (opts.readOnly && MUTATING.has(name)) return;
    server.registerTool(name, {
      ...config,
      annotations: {
        readOnlyHint: !MUTATING.has(name),
        destructiveHint: DESTRUCTIVE.has(name),
        idempotentHint: !MUTATING.has(name),
        openWorldHint: false,
      },
    } as never, cb as never);
  };
const Id = z.number().int().min(1);
const DeckRef = z.union([z.number().int().min(1), z.string().min(1).max(120)]);
const Tags = z.array(z.string().min(1).max(40)).max(10).optional();
const Latex = z.string().min(1).max(4000);

const Choice = z.object({ id: z.string().regex(/^[a-z0-9_]{1,16}$/), text: z.string().min(1).max(1000) });
const Question = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mcq'), prompt: Latex, explanation: z.string().max(4000).optional(), points: z.number().positive().max(100).optional(), choices: z.array(Choice).min(2).max(8), correct: z.string() }),
  z.object({ type: z.literal('multi'), prompt: Latex, explanation: z.string().max(4000).optional(), points: z.number().positive().max(100).optional(), choices: z.array(Choice).min(2).max(8), correct: z.array(z.string()).min(1) }),
  z.object({ type: z.literal('numeric'), prompt: Latex, explanation: z.string().max(4000).optional(), points: z.number().positive().max(100).optional(), value: z.number(), tolerance: z.number().min(0).default(0), tolerance_type: z.enum(['abs', 'rel']).default('abs'), unit: z.string().max(20).optional() }),
  z.object({ type: z.enum(['short', 'latex']), prompt: Latex, explanation: z.string().max(4000).optional(), points: z.number().positive().max(100).optional(), reference: z.string().min(1).max(4000), rubric: z.string().max(2000).optional() }),
]);

// Partial patch: only fields provided are changed; everything else is kept from storage.
const QuestionPatch = z.object({
  question_id: Id,
  type: z.enum(['mcq', 'multi', 'numeric', 'short', 'latex']).optional(),
  position: z.number().int().min(1).optional(),
  prompt: Latex.optional(),
  explanation: z.string().max(4000).optional(),
  points: z.number().positive().max(100).optional(),
  choices: z.array(Choice).min(2).max(8).optional(),
  correct: z.union([z.string(), z.array(z.string()).min(1)]).optional(),
  value: z.number().optional(),
  tolerance: z.number().min(0).optional(),
  tolerance_type: z.enum(['abs', 'rel']).optional(),
  unit: z.string().max(20).optional(),
  reference: z.string().min(1).max(4000).optional(),
  rubric: z.string().max(2000).optional(),
});

const DeckCreateInput = z.object({ name: z.string().min(1).max(120), description: z.string().max(2000).optional() });
const DeckDeleteInput = z.object({ deck: DeckRef, confirm_name: z.string() });
const DeckUpdateInput = z.object({ deck: DeckRef, name: z.string().min(1).max(120).optional(), description: z.string().max(2000).optional() });
const CardAddInput = z.object({ deck: DeckRef, cards: z.array(z.object({ front: Latex, back: Latex, tags: Tags })).min(1).max(100) });
const CardUpdateInput = z.object({ card_id: Id, front: Latex.optional(), back: Latex.optional(), tags: Tags, deck: DeckRef.optional() });
const CardScheduleInput = z.object({
  card_id: Id,
  adjust_minutes: z.number().int().min(-10000).max(10000).optional(),
  due_now: z.boolean().optional(),
  ignored: z.boolean().optional(),
});
const CardDeleteInput = z.object({ card_ids: z.array(Id).min(1).max(100) });
const CardSearchInput = z.object({ query: z.string().max(200).optional(), deck: DeckRef.optional(), tag: z.string().optional(), source: z.enum(['user', 'ai', 'import']).optional(), limit: z.number().int().min(1).max(100).default(20), offset: z.number().int().min(0).default(0) });
const QuizCreateInput = z.object({ title: z.string().min(1).max(200), description: z.string().max(2000).optional(), deck: DeckRef.optional(), shuffle: z.boolean().optional(), questions: z.array(Question).min(1).max(100) });
const QuizAddInput = z.object({ quiz_id: Id, questions: z.array(Question).min(1).max(100) });
const QuizGetInput = z.object({ quiz_id: Id, include_answers: z.boolean().default(true) });
const QuizListInput = z.object({ deck: DeckRef.optional(), limit: z.number().int().min(1).max(100).default(50) });
const QuizUpdateInput = z.object({ quiz_id: Id, title: z.string().min(1).max(200).optional(), description: z.string().max(2000).optional(), deck: DeckRef.optional(), source: z.enum(['user', 'ai', 'import']).optional(), shuffle: z.boolean().optional() });
const QuizDeleteInput = z.object({ quiz_id: Id, confirm_title: z.string() });
const QuizOutlineInput = z.object({ quiz_id: Id });
const SharedListInput = z.object({
  query: z.string().max(200).optional(),
  mine: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(50),
});
const SharedGetInput = z.object({ shared_id: Id });
const SharedPublishInput = z.object({ quiz_id: Id });
const SharedImportInput = z.object({ shared_id: Id });
const QuestionUpdateInput = z.object({ questions: z.array(QuestionPatch).min(1).max(100) });
const QuestionDeleteInput = z.object({ question_ids: z.array(Id).min(1).max(100), renumber: z.boolean().default(true) });
const QueueInput = z.object({ deck: DeckRef, limit: z.number().int().min(1).max(50).default(10) });
const StatsInput = z.object({ deck: DeckRef.optional(), days: z.number().int().min(1).max(365).default(30) });
const AttemptListInput = z.object({ status: z.enum(['in_progress', 'submitted', 'graded']).optional(), quiz_id: Id.optional(), limit: z.number().int().min(1).max(100).default(20) });
const PendingInput = z.object({ limit: z.number().int().min(1).max(50).default(20) });
const GradeInput = z.object({ answer_id: Id, points: z.number().min(0), feedback: z.string().min(1).max(4000) });
const LatexInput = z.object({ sources: z.array(z.string().max(4000)).min(1).max(50) });

type DeckCreateArgs = z.infer<typeof DeckCreateInput>;
type DeckDeleteArgs = z.infer<typeof DeckDeleteInput>;
type DeckUpdateArgs = z.infer<typeof DeckUpdateInput>;
type CardAddArgs = z.infer<typeof CardAddInput>;
type CardUpdateArgs = z.infer<typeof CardUpdateInput>;
type CardScheduleArgs = z.infer<typeof CardScheduleInput>;
type CardDeleteArgs = z.infer<typeof CardDeleteInput>;
type CardSearchArgs = z.infer<typeof CardSearchInput>;
type QuizCreateArgs = z.infer<typeof QuizCreateInput>;
type QuizAddArgs = z.infer<typeof QuizAddInput>;
type QuizGetArgs = z.infer<typeof QuizGetInput>;
type QuizListArgs = z.infer<typeof QuizListInput>;
type QuizUpdateArgs = z.infer<typeof QuizUpdateInput>;
type QuizDeleteArgs = z.infer<typeof QuizDeleteInput>;
type QuizOutlineArgs = z.infer<typeof QuizOutlineInput>;
type SharedListArgs = z.infer<typeof SharedListInput>;
type SharedGetArgs = z.infer<typeof SharedGetInput>;
type SharedPublishArgs = z.infer<typeof SharedPublishInput>;
type SharedImportArgs = z.infer<typeof SharedImportInput>;
type QuestionUpdateArgs = z.infer<typeof QuestionUpdateInput>;
type QuestionDeleteArgs = z.infer<typeof QuestionDeleteInput>;
type QueueArgs = z.infer<typeof QueueInput>;
type StatsArgs = z.infer<typeof StatsInput>;
type AttemptListArgs = z.infer<typeof AttemptListInput>;
type PendingArgs = z.infer<typeof PendingInput>;
type GradeArgs = z.infer<typeof GradeInput>;
type LatexArgs = z.infer<typeof LatexInput>;

register('deck_create', { description: 'Create a deck', inputSchema: DeckCreateInput }, wrap((a: DeckCreateArgs) => library.deckCreate(a)));
register('deck_list', { description: 'List decks', inputSchema: {} }, wrap(() => ({ decks: library.deckList() })));
register('deck_delete', { description: 'Delete a deck', inputSchema: DeckDeleteInput }, wrap((a: DeckDeleteArgs) => library.deckDelete({ deck: a.deck, confirmName: a.confirm_name })));
register('deck_update', { description: 'Rename a deck and/or edit its description (provide at least one)', inputSchema: DeckUpdateInput }, wrap((a: DeckUpdateArgs) => library.deckUpdate({ deck: a.deck, name: a.name, description: a.description })));

register('card_add', { description: 'Add cards', inputSchema: CardAddInput }, wrap((a: CardAddArgs) => library.cardAdd(a)));
register('card_update', { description: 'Update a card', inputSchema: CardUpdateInput }, wrap((a: CardUpdateArgs) => library.cardUpdate({ cardId: a.card_id, front: a.front, back: a.back, tags: a.tags, deck: a.deck })));
register('card_schedule', { description: 'Override a card due time (shift by minutes and/or make due now) and toggle whether it is ignored in reviews', inputSchema: CardScheduleInput }, wrap((a: CardScheduleArgs) => study.cardSchedule({
  cardId: a.card_id, adjustMinutes: a.adjust_minutes, dueNow: a.due_now, ignored: a.ignored,
})));
register('card_delete', { description: 'Delete cards', inputSchema: CardDeleteInput }, wrap((a: CardDeleteArgs) => library.cardDelete({ cardIds: a.card_ids })));
register('card_search', { description: 'Search cards', inputSchema: CardSearchInput }, wrap((a: CardSearchArgs) => library.cardSearch(a)));

register('quiz_create', { description: 'Create quiz', inputSchema: QuizCreateInput }, wrap((a: QuizCreateArgs) => library.quizCreate(a)));
register('quiz_add_questions', { description: 'Add questions', inputSchema: QuizAddInput }, wrap((a: QuizAddArgs) => library.quizAddQuestions({ quizId: a.quiz_id, questions: a.questions })));
register('quiz_get', { description: 'Get quiz', inputSchema: QuizGetInput }, wrap((a: QuizGetArgs) => library.quizGet({ quizId: a.quiz_id, includeAnswers: a.include_answers })));
register('quiz_list', { description: 'List quizzes', inputSchema: QuizListInput }, wrap((a: QuizListArgs) => ({ quizzes: library.quizList(a) })));
register('quiz_update', { description: 'Edit a quiz title, description, deck, source or shuffle setting (only provided fields change)', inputSchema: QuizUpdateInput }, wrap((a: QuizUpdateArgs) => library.quizUpdate({ quizId: a.quiz_id, title: a.title, description: a.description, deck: a.deck, source: a.source, shuffle: a.shuffle })));
register('quiz_delete', { description: 'Delete a quiz and its questions', inputSchema: QuizDeleteInput }, wrap((a: QuizDeleteArgs) => library.quizDelete({ quizId: a.quiz_id, confirmTitle: a.confirm_title })));
register('quiz_outline', { description: 'List question ids, positions and types of a quiz without loading prompts or answers', inputSchema: QuizOutlineInput }, wrap((a: QuizOutlineArgs) => library.quizOutline({ quizId: a.quiz_id })));
register('question_update', { description: 'Edit existing questions in bulk by id; only provided fields change', inputSchema: QuestionUpdateInput }, wrap((a: QuestionUpdateArgs) => library.questionUpdate({
  questions: a.questions.map((q) => {
    const { question_id, ...patch } = q;
    return { questionId: question_id, ...patch };
  }),
})));
register('question_delete', { description: 'Delete questions by id and renumber the remaining ones', inputSchema: QuestionDeleteInput }, wrap((a: QuestionDeleteArgs) => library.questionDelete({ questionIds: a.question_ids, renumber: a.renumber })));

// Shared library is plaintext by design. Publishing copies the quiz and its
// answers out of the user's encrypted database; say so in the tool contract.
register('shared_quiz_list', {
  description: 'List quizzes shared by users of this instance. The shared library is unencrypted and includes answers.',
  inputSchema: SharedListInput,
}, wrap((a: SharedListArgs) => ({ quizzes: shared.list({ q: a.query, mine: a.mine, limit: a.limit }) })));
register('shared_quiz_get', {
  description: 'Get a shared quiz with its questions and answers from the unencrypted shared library',
  inputSchema: SharedGetInput,
}, wrap((a: SharedGetArgs) => shared.get({ id: a.shared_id })));
register('shared_quiz_publish', {
  description: 'Publish a snapshot of one of your quizzes to the shared, unencrypted library. Includes questions, answers and explanations; any signed-in user can read and import it. Republishing replaces the previous snapshot.',
  inputSchema: SharedPublishInput,
}, wrap((a: SharedPublishArgs) => shared.publish({ quizId: a.quiz_id, ownerUsername: opts.username })));
register('shared_quiz_unpublish', {
  description: 'Remove one of your shared quizzes from the shared library (admins may remove any)',
  inputSchema: SharedGetInput,
}, wrap((a: SharedGetArgs) => shared.unpublish({ id: a.shared_id })));
register('shared_quiz_import', {
  description: 'Import a shared quiz into your own library; the copy is encrypted with your key and has no linked deck',
  inputSchema: SharedImportInput,
}, wrap((a: SharedImportArgs) => shared.importInto({ id: a.shared_id })));

register('study_next_due', { description: 'Next due cards', inputSchema: QueueInput }, wrap((a: QueueArgs) => ({ cards: study.queue(a) })));
register('study_stats', { description: 'Study stats', inputSchema: StatsInput }, wrap((a: StatsArgs) => study.stats(a)));
register('attempt_list', { description: 'List attempts', inputSchema: AttemptListInput }, wrap((a: AttemptListArgs) => ({ attempts: attempts.list({ status: a.status, quizId: a.quiz_id, limit: a.limit }) })));
register('attempts_pending_grading', { description: 'Pending grading', inputSchema: PendingInput }, wrap((a: PendingArgs) => ({ answers: attempts.pending(a) })));
register('answer_grade', { description: 'Grade an answer', inputSchema: GradeInput }, wrap((a: GradeArgs) => attempts.gradeAnswer({ answerId: a.answer_id, points: a.points, feedback: a.feedback })));
register('latex_validate', { description: 'Validate LaTeX', inputSchema: LatexInput }, wrap((a: LatexArgs) => ({ results: latex.validate(a.sources) })));
register('current_context', {
  description: 'What the user is currently viewing in the web UI: the flashcard in review or the quiz question on screen, with its full content, answer and their own saved answer. Use this to answer questions about the current card/question. context is null when nothing is in focus.',
  inputSchema: z.object({}),
}, wrap(() => context.current()));

}
