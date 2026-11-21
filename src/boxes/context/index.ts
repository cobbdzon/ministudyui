import * as store from '../store/index.js';
import * as vault from '../vault/index.js';
import type {
  CardRow, Choice, CurrentContextResult, DeckRow, GradingStatus,
  QuestionAnswer, QuestionType, QuizRow, UiContext, UiContextInput,
} from '../../../shared/types.js';

interface ContextRow {
  id: number; view: 'review' | 'quiz' | null; deck_id: number | null;
  card_id: number | null; flipped: number; quiz_id: number | null;
  attempt_id: number | null; question_id: number | null;
  question_position: number | null; updated_at: string;
}
interface QuestionRow {
  id: number; quiz_id: number; position: number; type: QuestionType;
  prompt: string; choices_json: string | null; answer_json: string;
  explanation: string; points: number;
}
interface AnswerStateRow {
  response: string; grading_status: GradingStatus; is_correct: number | null;
  points_awarded: number | null; feedback: string;
}

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** The last view/card/question reported by the web UI, or null when cleared. */
export function read(): UiContext | null {
  const r = store.get<ContextRow>('SELECT * FROM ui_context WHERE id = 1');
  if (!r || !r.view) return null;
  return {
    view: r.view, deck_id: r.deck_id, card_id: r.card_id, flipped: r.flipped === 1,
    quiz_id: r.quiz_id, attempt_id: r.attempt_id, question_id: r.question_id,
    question_position: r.question_position, updated_at: r.updated_at,
  };
}

/** Replace the whole context. Omitted fields reset that slot; view:null clears. */
export function write(input: UiContextInput): UiContext {
  store.run(`INSERT INTO ui_context
    (id, view, deck_id, card_id, flipped, quiz_id, attempt_id, question_id, question_position, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(id) DO UPDATE SET
      view=excluded.view, deck_id=excluded.deck_id, card_id=excluded.card_id,
      flipped=excluded.flipped, quiz_id=excluded.quiz_id,
      attempt_id=excluded.attempt_id, question_id=excluded.question_id,
      question_position=excluded.question_position, updated_at=excluded.updated_at`,
    [
      input.view, input.deck_id ?? null, input.card_id ?? null, input.flipped ? 1 : 0,
      input.quiz_id ?? null, input.attempt_id ?? null, input.question_id ?? null,
      input.question_position ?? null,
    ]);
  return read()!;
}

/** Current context plus the actual content, so an LLM can answer about it. */
export function current(): CurrentContextResult {
  const context = read();
  if (!context) {
    return { context: null, card: null, question: null, deck: null, quiz: null, your_answer: null };
  }

  const cardRow = context.card_id
    ? store.get<CardRow>('SELECT * FROM cards WHERE id = ?', [context.card_id])
    : null;
  const card = cardRow
    ? {
        id: cardRow.id, deck_id: cardRow.deck_id,
        front: vault.open('cards', 'front', cardRow.front)!, back: vault.open('cards', 'back', cardRow.back)!,
        tags: parse<string[]>(vault.open('cards', 'tags_json', cardRow.tags_json), []), source: cardRow.source,
      }
    : null;

  const questionRow = context.question_id
    ? store.get<QuestionRow>('SELECT * FROM questions WHERE id = ?', [context.question_id])
    : null;
  const question = questionRow
    ? {
        id: questionRow.id, quiz_id: questionRow.quiz_id, position: questionRow.position,
        type: questionRow.type, prompt: vault.open('questions', 'prompt', questionRow.prompt)!,
        choices: parse<Choice[] | null>(vault.open('questions', 'choices_json', questionRow.choices_json), null),
        answer: parse<QuestionAnswer | null>(vault.open('questions', 'answer_json', questionRow.answer_json), null),
        explanation: vault.open('questions', 'explanation', questionRow.explanation)!, points: questionRow.points,
      }
    : null;

  const deck = context.deck_id
    ? store.get<DeckRow>('SELECT id, name FROM decks WHERE id = ?', [context.deck_id])
    : null;
  const quiz = context.quiz_id
    ? store.get<QuizRow>('SELECT id, title FROM quizzes WHERE id = ?', [context.quiz_id])
    : null;
  const yourAnswer = context.attempt_id && context.question_id
    ? store.get<AnswerStateRow>(
        'SELECT response, grading_status, is_correct, points_awarded, feedback FROM answers WHERE attempt_id = ? AND question_id = ?',
        [context.attempt_id, context.question_id],
      )
    : null;

  return {
    context,
    card,
    question,
    deck: deck ? { id: deck.id, name: vault.open('decks', 'name', deck.name)! } : null,
    quiz: quiz ? { id: quiz.id, title: vault.open('quizzes', 'title', quiz.title)! } : null,
    your_answer: yourAnswer ? {
      ...yourAnswer,
      response: vault.open('answers', 'response', yourAnswer.response)!,
      feedback: vault.open('answers', 'feedback', yourAnswer.feedback)!,
    } : null,
  };
}
