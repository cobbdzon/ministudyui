// Per-user plaintext export in the existing importBundle shape, extended with
// SRS state and quiz attempts. The UI must warn that the file is plaintext.
import * as store from '../store/index.js';
import * as vault from '../vault/index.js';
import type { Bundle, QuestionAnswer } from '../../../shared/types.js';

interface DeckRow {
  id: number; name: string; description: string; created_at: string;
}
interface CardRow {
  id: number; deck_id: number; front: string; back: string; tags_json: string;
  source: string; created_at: string; updated_at: string;
}
interface QuizRow {
  id: number; deck_id: number | null; title: string; description: string;
  shuffle: number; created_at: string;
}
interface QuestionRow {
  id: number; quiz_id: number; position: number; type: string; prompt: string;
  choices_json: string | null; answer_json: string; explanation: string; points: number;
}
interface CardStateRow {
  card_id: number; ease: number; interval_days: number; reps: number; lapses: number;
  due_at: string; last_reviewed_at: string | null; ignored: number;
}
interface AttemptRow {
  id: number; quiz_id: number; started_at: string; submitted_at: string | null;
  status: string; score: number | null; max_score: number | null; question_order_json: string | null;
}
interface AnswerRow {
  id: number; attempt_id: number; question_id: number; response: string;
  grading_status: string; is_correct: number | null; points_awarded: number | null;
  feedback: string; graded_by: string | null; graded_at: string | null;
}

const open = (t: string, c: string, v: string) => vault.open(t, c, v)!;
const json = <T>(v: string | null, fallback: T): T => (v ? JSON.parse(v) as T : fallback);

export interface ExportBundle extends Bundle {
  exported_at: string;
  srs: Array<{
    card_id: number; ease: number; interval_days: number; reps: number; lapses: number;
    due_at: string; last_reviewed_at: string | null; ignored: boolean;
  }>;
  attempts: Array<{
    id: number; quiz_id: number; started_at: string; submitted_at: string | null;
    status: string; score: number | null; max_score: number | null;
    question_order: number[] | null;
    answers: Array<{
      question_id: number; response: string; grading_status: string;
      is_correct: number | null; points_awarded: number | null; feedback: string;
      graded_by: string | null; graded_at: string | null;
    }>;
  }>;
}

export function bundle(): ExportBundle {
  const decks = store.all<DeckRow>('SELECT * FROM decks ORDER BY id');
  const cards = store.all<CardRow>('SELECT * FROM cards ORDER BY id');
  const quizzes = store.all<QuizRow>('SELECT * FROM quizzes ORDER BY id');
  const questions = store.all<QuestionRow>('SELECT * FROM questions ORDER BY quiz_id, position');
  const states = store.all<CardStateRow>('SELECT * FROM card_state ORDER BY card_id');
  const attempts = store.all<AttemptRow>('SELECT * FROM attempts ORDER BY id');
  const answers = store.all<AnswerRow>('SELECT * FROM answers ORDER BY id');
  const deckName = new Map(decks.map((d) => [d.id, open('decks', 'name', d.name)]));
  const questionIds = new Map(questions.map((q) => [q.id, q]));

  return {
    exported_at: new Date().toISOString(),
    decks: decks.map((d) => ({
      name: open('decks', 'name', d.name),
      description: open('decks', 'description', d.description),
      created_at: d.created_at,
      cards: cards.filter((c) => c.deck_id === d.id).map((c) => ({
        front: open('cards', 'front', c.front), back: open('cards', 'back', c.back),
        tags: json<string[]>(open('cards', 'tags_json', c.tags_json), []),
        source: c.source as 'user' | 'ai' | 'import',
        created_at: c.created_at, updated_at: c.updated_at,
      })),
    })),
    quizzes: quizzes.map((q) => ({
      title: open('quizzes', 'title', q.title),
      description: open('quizzes', 'description', q.description),
      deck: q.deck_id ? deckName.get(q.deck_id) : undefined,
      shuffle: !!q.shuffle,
      questions: questions.filter((x) => x.quiz_id === q.id).map((x) => {
        const answer = json<QuestionAnswer>(open('questions', 'answer_json', x.answer_json), {});
        return {
          type: x.type as never,
          prompt: open('questions', 'prompt', x.prompt),
          explanation: open('questions', 'explanation', x.explanation),
          points: x.points,
          choices: x.choices_json ? json(open('questions', 'choices_json', x.choices_json), undefined) : undefined,
          ...answer,
        };
      }) as never,
    })),
    srs: states.map((s) => ({
      card_id: s.card_id, ease: s.ease, interval_days: s.interval_days,
      reps: s.reps, lapses: s.lapses, due_at: s.due_at,
      last_reviewed_at: s.last_reviewed_at, ignored: s.ignored === 1,
    })),
    attempts: attempts.map((a) => ({
      id: a.id, quiz_id: a.quiz_id, started_at: a.started_at, submitted_at: a.submitted_at,
      status: a.status, score: a.score, max_score: a.max_score,
      question_order: json<number[] | null>(a.question_order_json, null),
      answers: answers.filter((x) => x.attempt_id === a.id).map((x) => ({
        question_id: x.question_id,
        response: open('answers', 'response', x.response),
        grading_status: x.grading_status, is_correct: x.is_correct,
        points_awarded: x.points_awarded,
        feedback: open('answers', 'feedback', x.feedback),
        graded_by: x.graded_by, graded_at: x.graded_at,
      })),
    })),
  };
}
