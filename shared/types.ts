// Types only. Web code imports this module with `import type`, so Bun erases it
// and the browser never requests it.
import type { QuestionInput } from './schemas.js';

export type {
  Bundle, BundleDeck, BundleQuiz, CardAddInput, CardDeleteInput, CardInput,
  CardPatchInput, CardQuery, CardScheduleInput, DeckCreateInput, DeckDeleteInput, DeckUpdateInput,
  LatexInput, PendingQuery, QuizCreateInput, QuizDeleteInput, QuizGetQuery,
  QuizIdInput, QuizListQuery, ReviewInput, ReviewQueueQuery, StatsQuery,
  GradeInput, AnswerInput, QuestionsBodyInput, QuestionInput, AttemptListQuery,
  UiContextInput,
} from './schemas.js';

// ---- primitives ----
export type DeckRef = number | string;
export type Rating = 0 | 1 | 2 | 3;
export type Source = 'user' | 'ai' | 'import';
export type QuestionType = 'mcq' | 'multi' | 'numeric' | 'short' | 'latex';
export type AttemptStatus = 'in_progress' | 'submitted' | 'graded';
export type GradingStatus = 'pending' | 'graded';
export type ErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'INTERNAL' | 'ERROR';

// ---- database rows (match schema.sql exactly) ----
export interface DeckRow { id: number; name: string; description: string; created_at: string }
export interface CardRow {
  id: number; deck_id: number; front: string; back: string;
  tags_json: string; source: Source; created_at: string; updated_at: string;
}
export interface CardStateRow {
  card_id: number; ease: number; interval_days: number; reps: number; lapses: number;
  due_at: string; last_reviewed_at: string | null; ignored: number;
}
export interface ReviewRow {
  id: number; card_id: number; rating: number; reviewed_at: string;
  prev_interval: number; new_interval: number; prev_ease: number;
  new_ease: number; prev_state_json: string;
}
export interface QuizRow {
  id: number; title: string; description: string;
  deck_id: number | null; source: Source; created_at: string;
}
export interface QuestionRow {
  id: number; quiz_id: number; position: number; type: QuestionType;
  prompt: string; choices_json: string | null; answer_json: string;
  explanation: string; points: number;
}
export interface AttemptRow {
  id: number; quiz_id: number; started_at: string; submitted_at: string | null;
  status: AttemptStatus; score: number | null; max_score: number | null;
}
export interface AnswerRow {
  id: number; attempt_id: number; question_id: number; response: string;
  grading_status: GradingStatus; is_correct: number | null;
  points_awarded: number | null; feedback: string;
  graded_by: 'auto' | 'ai' | 'manual' | null; graded_at: string | null;
}
export interface ChangeRow { id: number; entity: string; entity_id: number; op: string; ts: string }

// ---- value objects ----
export interface Choice { id: string; text: string }
export interface QuestionAnswer {
  correct?: string | string[];
  value?: number;
  tolerance?: number;
  tolerance_type?: 'abs' | 'rel';
  unit?: string | null;
  reference?: string;
  rubric?: string | null;
}
export type SrsPreview = Record<'again' | 'hard' | 'good' | 'easy', string>;
export type SrsState = Pick<CardStateRow, 'ease' | 'interval_days' | 'reps' | 'lapses'>;
export type SrsSnapshot = SrsState & Pick<CardStateRow, 'due_at' | 'last_reviewed_at'>;
export interface SrsResult extends SrsSnapshot {}

// ---- DTOs the UI consumes ----
export interface CardDto {
  id: number; deck_id: number; front: string; back: string;
  tags: string[]; source: Source; created_at: string; updated_at: string;
  due_at: string; ignored: boolean;
}
export type DeckCreated = Pick<DeckRow, 'id' | 'name' | 'description'>;
export interface DeckSummary extends DeckCreated {
  total: number; due: number; new: number; mature: number; ignored: number; quizzes: number;
}
export interface QuizSummary extends QuizRow { question_count: number; total_points: number }
export interface QuizQuestionDto {
  id: number; position: number; type: QuestionType; prompt: string;
  explanation: string; points: number; choices?: Choice[];
  answer?: QuestionAnswer; unit?: string | null;
}
export interface ReviewCardDto {
  id: number; front: string; back: string; tags: string[]; source: Source; preview: SrsPreview;
}
export interface PendingAnswerDto {
  answer_id: number; attempt_id: number; question_type: QuestionType; prompt: string;
  reference: string | null; rubric: string | null; max_points: number; response: string;
}
export interface StatsDto {
  total: number; due: number;
  reviews_per_day: Array<{ day: string; n: number }>;
  retention: number | null;
  interval_distribution: Array<{ bucket: 'new' | 'learning' | 'mature'; cards: number }>;
  weakest_tags: Array<{ tag: string; cards: number; lapses: number }>;
}
export interface AttemptSummary {
  id: number; status: AttemptStatus; score: number | null; max_score: number | null;
}
export type AttemptStart = Omit<AttemptSummary, 'score'> & { quiz_id: number };
export interface ImportResult {
  ok: true; decks_created: number; decks_reused: number; cards_added: number;
  quizzes_created: number; questions_added: number;
}
export interface ChangeEvent { entity: string; id: number; op: string }

// ---- current UI context (shared with the MCP server through SQLite) ----
export interface UiContext {
  view: 'review' | 'quiz' | null;
  deck_id: number | null;
  card_id: number | null;
  flipped: boolean;
  quiz_id: number | null;
  attempt_id: number | null;
  question_id: number | null;
  question_position: number | null;
  updated_at: string | null;
}
export interface CurrentContextQuestion {
  id: number; quiz_id: number; position: number; type: QuestionType;
  prompt: string; choices: Choice[] | null; answer: QuestionAnswer | null;
  explanation: string; points: number;
}
export interface CurrentContextResult {
  context: UiContext | null;
  card: {
    id: number; deck_id: number; front: string; back: string;
    tags: string[]; source: Source;
  } | null;
  question: CurrentContextQuestion | null;
  deck: { id: number; name: string } | null;
  quiz: { id: number; title: string } | null;
  your_answer: {
    response: string; grading_status: GradingStatus; is_correct: number | null;
    points_awarded: number | null; feedback: string;
  } | null;
}

// ---- error envelopes ----
export interface ApiErrorBody { code: string; message: string; field?: string; hint?: string }

// ---- response envelopes ----
export type OkResponse = { ok: true };
export interface DeckListResponse { decks: DeckSummary[] }
export interface DeckCreateResponse { ok: true; deck: DeckCreated }
export interface DeckUpdateResponse { ok: true; deck: DeckCreated }
export interface CardListResponse { cards: CardDto[]; total: number }
export interface CardAddResponse { card_ids: number[] }
export interface ReviewQueueResponse { cards: ReviewCardDto[] }
export interface ReviewResponse { ok: true; review_id: number }
export interface UndoResponse { ok: true; card_id: number }
export interface QuizListResponse { quizzes: QuizSummary[] }
export interface QuizGetResponse { quiz: QuizRow; questions: QuizQuestionDto[] }
export interface QuizCreateResponse { id: number; title: string }
export interface QuestionsAddResponse { question_ids: number[] }
export interface AttemptListResponse { attempts: AttemptRow[] }
export interface AttemptGetResponse { attempt: AttemptRow; answers: AnswerRow[] }
export interface AnswerResponse { ok: true; answer_id: number }
export interface SubmitResponse { ok: true; attempt: AttemptSummary }
export interface PendingResponse { answers: PendingAnswerDto[] }
export interface GradeResponse { ok: true; answer: { id: number }; attempt: AttemptSummary }
export interface LatexValidationResult { index: number; ok: boolean; errors: Array<{ span: string; message: string }> }
export interface LatexResponse { results: LatexValidationResult[] }

// ---- box inputs/results ----
export interface DeckDeleteBoxInput { deck: DeckRef; confirmName: string; deleteQuizzes?: boolean }
export interface DeckUpdateBoxInput { deck: DeckRef; name?: string; description?: string }
export interface CardUpdateBoxInput {
  cardId: number; front?: string; back?: string; tags?: string[]; deck?: DeckRef;
}
export interface CardScheduleBoxInput {
  cardId: number; adjustMinutes?: number; dueNow?: boolean; ignored?: boolean;
}
export interface CardDeleteBoxInput { cardIds: number[] }
export interface CardSearchInput {
  query?: string; deck?: DeckRef; tag?: string; source?: string; limit?: number; offset?: number;
}
export interface ValidatedQuestion {
  type: QuestionType; prompt: string; choices: Choice[] | null;
  answer: QuestionAnswer; explanation: string; points: number;
}
export type QuestionPatch = Partial<QuestionInput & { question_id: number; position?: number }>;
export type MergedQuestion = {
  type: QuestionType; prompt: string; explanation: string; points: number;
  choices?: Choice[] | null;
  correct?: string | string[]; value?: number; tolerance?: number;
  tolerance_type?: 'abs' | 'rel'; unit?: string | null;
  reference?: string; rubric?: string | null;
};
export interface QuestionQuestionPatch {
  questionId: number; type?: QuestionType; position?: number; prompt?: string;
  explanation?: string; points?: number; choices?: Choice[];
  correct?: string | string[]; value?: number; tolerance?: number;
  tolerance_type?: 'abs' | 'rel'; unit?: string; reference?: string; rubric?: string;
}
export interface QuestionUpdateInput { questions: QuestionQuestionPatch[] }
export interface QuestionDeleteInput { questionIds: number[]; renumber?: boolean }
export interface QuizAddQuestionsInput { quizId: number; questions: QuestionInput[] }
export interface QuizGetInput { quizId: number; includeAnswers?: boolean }
export interface QuizListInput { deck?: DeckRef; limit?: number }
export interface QuizUpdateInput {
  quizId: number; title?: string; description?: string; deck?: DeckRef; source?: Source;
}
export interface QuizDeleteBoxInput { quizId: number; confirmTitle: string; deleteDeck?: boolean }
export interface QuizOutlineInput { quizId: number }
export interface ReviewQueueInput { deck?: DeckRef; limit?: number }
export interface ReviewBoxInput { cardId: number; rating: Rating }
export interface StatsInput { deck?: DeckRef; days?: number }
export interface AttemptStartInput { quizId: number }
export interface AttemptAnswerInput { attemptId: number; questionId: number; response: unknown }
export interface AttemptSubmitInput { attemptId: number }
export interface GradeAnswerInput { answerId: number; points: number; feedback: string }
export interface AttemptListInput { status?: string; quizId?: number; limit?: number }
export interface PendingInput { limit?: number }

export interface GradeResult {
  status: 'graded' | 'pending'; is_correct: 0 | 1 | null;
  points: number | null; feedback: string;
}
export interface LatexSpan { expr: string; start: number }
export interface LatexError { span: string; message: string }
