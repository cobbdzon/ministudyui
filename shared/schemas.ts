import { z } from 'zod';

// Query strings arrive as strings (and repeated keys as arrays). Keep query
// values as strings so `hc` inputs stay simple; handlers do the numeric
// conversion, matching the old `Number(q.get(k) || 0) || N` behaviour.
const qstr = z.preprocess(
  (v) => (Array.isArray(v) ? v[0] : v),
  z.string().optional(),
);

export const SourceSchema = z.enum(['user', 'ai', 'import']);
export const RatingSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
export const QuestionTypeSchema = z.enum(['mcq', 'multi', 'numeric', 'short', 'latex']);
export const DeckRefSchema = z.union([z.number().int(), z.string().min(1)]);

export const ChoiceSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,16}$/),
  text: z.string().min(1).max(1000),
});

const QBase = {
  prompt: z.string().min(1).max(4000),
  explanation: z.string().max(4000).optional(),
  points: z.number().positive().max(100).optional(),
};

export const QuestionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mcq'), ...QBase, choices: z.array(ChoiceSchema).min(2).max(8), correct: z.string() }),
  z.object({ type: z.literal('multi'), ...QBase, choices: z.array(ChoiceSchema).min(2).max(8), correct: z.array(z.string()).min(1) }),
  z.object({
    type: z.literal('numeric'), ...QBase,
    value: z.number(),
    tolerance: z.number().min(0).default(0),
    tolerance_type: z.enum(['abs', 'rel']).default('abs'),
    unit: z.string().max(20).optional(),
  }),
  z.object({
    type: z.enum(['short', 'latex']), ...QBase,
    reference: z.string().min(1).max(4000),
    rubric: z.string().max(2000).optional(),
  }),
]);

export const DeckCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});
export const DeckUpdateSchema = z.looseObject({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
});
export const DeckDeleteSchema = z.looseObject({
  confirm_name: z.string(),
  delete_quizzes: z.boolean().optional(),
});

export const CardInputSchema = z.looseObject({
  front: z.string().min(1).max(4000),
  back: z.string().min(1).max(4000),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
  source: SourceSchema.optional(),
});
export const CardAddSchema = z.looseObject({
  deck: DeckRefSchema,
  cards: z.array(CardInputSchema).min(1).max(100),
});
export const CardPatchSchema = z.looseObject({
  front: z.string().min(1).max(4000).optional(),
  back: z.string().min(1).max(4000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
  deck: DeckRefSchema.optional(),
});
export const CardScheduleSchema = z.looseObject({
  adjust_minutes: z.number().int().min(-10000).max(10000).optional(),
  due_now: z.boolean().optional(),
  ignored: z.boolean().optional(),
});
export const CardDeleteSchema = z.looseObject({
  card_ids: z.array(z.number().int()).min(1).max(100),
});

export const ReviewSchema = z.looseObject({
  card_id: z.number().int(),
  rating: RatingSchema,
});

export const QuizCreateSchema = z.looseObject({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  deck: DeckRefSchema.optional(),
  shuffle: z.boolean().optional(),
  questions: z.array(QuestionSchema).min(1).max(100),
});
export const QuizUpdateSchema = z.looseObject({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  deck: DeckRefSchema.optional(),
  source: SourceSchema.optional(),
  shuffle: z.boolean().optional(),
});
export const QuestionsBodySchema = z.looseObject({
  questions: z.array(QuestionSchema).min(1).max(100),
});
export const QuizDeleteSchema = z.looseObject({
  confirm_title: z.string(),
  delete_deck: z.boolean().optional(),
});

const BundleDeckSchema = z.looseObject({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  cards: z.array(CardInputSchema).max(100).optional(),
});
const BundleQuizSchema = z.looseObject({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  deck: DeckRefSchema.optional(),
  shuffle: z.boolean().optional(),
  questions: z.array(QuestionSchema).min(1).max(100),
});
export const BundleSchema = z.object({
  decks: z.array(BundleDeckSchema).max(50).optional(),
  quizzes: z.array(BundleQuizSchema).max(50).optional(),
}).refine(
  (b) => (b.decks?.length ?? 0) > 0 || (b.quizzes?.length ?? 0) > 0,
  { message: 'nothing to import: provide decks and/or quizzes' },
);

export const QuizIdBodySchema = z.looseObject({ quiz_id: z.number().int() });
export const AnswerBodySchema = z.looseObject({ response: z.unknown() });
export const GradeBodySchema = z.looseObject({
  points: z.number().min(0),
  feedback: z.string().min(1).max(4000),
});
export const LatexSchema = z.looseObject({
  sources: z.array(z.string().max(4000)).max(50).optional().default([]),
});
// Missing fields mean "not applicable" and reset that slot. view:null clears it.
export const UiContextSchema = z.looseObject({
  view: z.enum(['review', 'quiz']).nullable(),
  deck_id: z.number().int().min(1).nullable().optional(),
  card_id: z.number().int().min(1).nullable().optional(),
  flipped: z.boolean().optional(),
  quiz_id: z.number().int().min(1).nullable().optional(),
  attempt_id: z.number().int().min(1).nullable().optional(),
  question_id: z.number().int().min(1).nullable().optional(),
  question_position: z.number().int().min(1).nullable().optional(),
});

// ---- query schemas ----
export const CardQuerySchema = z.object({
  q: qstr, deck: qstr, tag: qstr, source: qstr, limit: qstr, offset: qstr,
});
export const ReviewQueueQuerySchema = z.object({ deck: qstr, limit: qstr });
export const QuizListQuerySchema = z.object({ deck: qstr, limit: qstr });
export const QuizGetQuerySchema = z.object({ include_answers: qstr });
export const AttemptGetQuerySchema = z.object({ include_answers: qstr });
export const AttemptListQuerySchema = z.object({ status: qstr, quiz_id: qstr, limit: qstr });
export const PendingQuerySchema = z.object({ limit: qstr });
export const StatsQuerySchema = z.object({ deck: qstr, days: qstr });

export type DeckCreateInput = z.infer<typeof DeckCreateSchema>;
export type DeckUpdateInput = z.infer<typeof DeckUpdateSchema>;
export type DeckDeleteInput = z.infer<typeof DeckDeleteSchema>;
export type CardInput = z.infer<typeof CardInputSchema>;
export type CardAddInput = z.infer<typeof CardAddSchema>;
export type CardPatchInput = z.infer<typeof CardPatchSchema>;
export type CardScheduleInput = z.infer<typeof CardScheduleSchema>;
export type CardDeleteInput = z.infer<typeof CardDeleteSchema>;
export type ReviewInput = z.infer<typeof ReviewSchema>;
export type QuestionInput = z.infer<typeof QuestionSchema>;
export type QuestionsBodyInput = z.infer<typeof QuestionsBodySchema>;
export type QuizCreateInput = z.infer<typeof QuizCreateSchema>;
export type QuizUpdateInput = z.infer<typeof QuizUpdateSchema>;
export type QuizDeleteInput = z.infer<typeof QuizDeleteSchema>;
export type Bundle = z.infer<typeof BundleSchema>;
export type BundleDeck = z.infer<typeof BundleDeckSchema>;
export type BundleQuiz = z.infer<typeof BundleQuizSchema>;
export type QuizIdInput = z.infer<typeof QuizIdBodySchema>;
export type AnswerInput = z.infer<typeof AnswerBodySchema>;
export type GradeInput = z.infer<typeof GradeBodySchema>;
export type LatexInput = z.infer<typeof LatexSchema>;
export type UiContextInput = z.infer<typeof UiContextSchema>;
export type CardQuery = z.infer<typeof CardQuerySchema>;
export type ReviewQueueQuery = z.infer<typeof ReviewQueueQuerySchema>;
export type QuizListQuery = z.infer<typeof QuizListQuerySchema>;
export type QuizGetQuery = z.infer<typeof QuizGetQuerySchema>;
export type AttemptGetQuery = z.infer<typeof AttemptGetQuerySchema>;
export type AttemptListQuery = z.infer<typeof AttemptListQuerySchema>;
export type PendingQuery = z.infer<typeof PendingQuerySchema>;
export type StatsQuery = z.infer<typeof StatsQuerySchema>;
