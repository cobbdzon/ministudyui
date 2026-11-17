-- migration 1; store sets PRAGMA user_version = 1 after applying.
-- Per-connection pragmas live in store/index.js.
CREATE TABLE decks (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(name) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE cards (
  id         INTEGER PRIMARY KEY,
  deck_id    INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front      TEXT NOT NULL CHECK (length(front) BETWEEN 1 AND 4000),
  back       TEXT NOT NULL CHECK (length(back)  BETWEEN 1 AND 4000),
  tags_json  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json) AND json_type(tags_json) = 'array'),
  source     TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user','ai','import')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_cards_deck ON cards(deck_id);
CREATE TABLE card_state (
  card_id          INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  ease             REAL    NOT NULL DEFAULT 2.5 CHECK (ease >= 1.3),
  interval_days    REAL    NOT NULL DEFAULT 0   CHECK (interval_days >= 0),
  reps             INTEGER NOT NULL DEFAULT 0,
  lapses           INTEGER NOT NULL DEFAULT 0,
  due_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_reviewed_at TEXT
);
CREATE INDEX idx_card_state_due ON card_state(due_at);
CREATE TABLE reviews (
  id             INTEGER PRIMARY KEY,
  card_id        INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating         INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 3),
  reviewed_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  prev_interval  REAL NOT NULL,
  new_interval   REAL NOT NULL,
  prev_ease      REAL NOT NULL,
  new_ease       REAL NOT NULL,
  prev_state_json TEXT NOT NULL CHECK (json_valid(prev_state_json))
);
CREATE INDEX idx_reviews_card ON reviews(card_id, reviewed_at);
CREATE TABLE quizzes (
  id          INTEGER PRIMARY KEY,
  deck_id     INTEGER REFERENCES decks(id) ON DELETE SET NULL,
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  source      TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user','ai','import')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE questions (
  id           INTEGER PRIMARY KEY,
  quiz_id      INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL CHECK (position >= 1),
  type         TEXT NOT NULL CHECK (type IN ('mcq','multi','numeric','short','latex')),
  prompt       TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 4000),
  choices_json TEXT CHECK (choices_json IS NULL OR json_valid(choices_json)),
  answer_json  TEXT NOT NULL CHECK (json_valid(answer_json)),
  explanation  TEXT NOT NULL DEFAULT '' CHECK (length(explanation) <= 4000),
  points       REAL NOT NULL DEFAULT 1 CHECK (points > 0 AND points <= 100),
  UNIQUE (quiz_id, position)
);
CREATE TABLE attempts (
  id           INTEGER PRIMARY KEY,
  quiz_id      INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  started_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  submitted_at TEXT,
  status       TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','graded')),
  score        REAL,
  max_score    REAL
);
CREATE INDEX idx_attempts_quiz ON attempts(quiz_id);
CREATE INDEX idx_attempts_status ON attempts(status);
CREATE TABLE answers (
  id             INTEGER PRIMARY KEY,
  attempt_id     INTEGER NOT NULL REFERENCES attempts(id)  ON DELETE CASCADE,
  question_id    INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  response       TEXT NOT NULL CHECK (length(response) <= 8000),
  grading_status TEXT NOT NULL DEFAULT 'pending' CHECK (grading_status IN ('pending','graded')),
  is_correct     INTEGER CHECK (is_correct IN (0,1)),
  points_awarded REAL,
  feedback       TEXT NOT NULL DEFAULT '' CHECK (length(feedback) <= 4000),
  graded_by      TEXT CHECK (graded_by IN ('auto','ai','manual')),
  graded_at      TEXT,
  UNIQUE (attempt_id, question_id)
);
CREATE INDEX idx_answers_pending ON answers(grading_status) WHERE grading_status = 'pending';
CREATE TABLE changes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  entity    TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  op        TEXT NOT NULL CHECK (op IN ('insert','update','delete'))
);
CREATE TRIGGER trg_cards_state AFTER INSERT ON cards
BEGIN INSERT INTO card_state(card_id) VALUES (NEW.id); END;
CREATE TRIGGER trg_decks_i AFTER INSERT ON decks BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('deck',NEW.id,'insert'); END;
CREATE TRIGGER trg_decks_u AFTER UPDATE ON decks BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('deck',NEW.id,'update'); END;
CREATE TRIGGER trg_decks_d AFTER DELETE ON decks BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('deck',OLD.id,'delete'); END;
CREATE TRIGGER trg_cards_i AFTER INSERT ON cards BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('card',NEW.id,'insert'); END;
CREATE TRIGGER trg_cards_u AFTER UPDATE ON cards BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('card',NEW.id,'update'); END;
CREATE TRIGGER trg_cards_d AFTER DELETE ON cards BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('card',OLD.id,'delete'); END;
CREATE TRIGGER trg_quizzes_i AFTER INSERT ON quizzes BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('quiz',NEW.id,'insert'); END;
CREATE TRIGGER trg_quizzes_u AFTER UPDATE ON quizzes BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('quiz',NEW.id,'update'); END;
CREATE TRIGGER trg_quizzes_d AFTER DELETE ON quizzes BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('quiz',OLD.id,'delete'); END;
CREATE TRIGGER trg_attempts_i AFTER INSERT ON attempts BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('attempt',NEW.id,'insert'); END;
CREATE TRIGGER trg_attempts_u AFTER UPDATE ON attempts BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('attempt',NEW.id,'update'); END;
CREATE TRIGGER trg_answers_i AFTER INSERT ON answers BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('answer',NEW.id,'insert'); END;
CREATE TRIGGER trg_answers_u AFTER UPDATE ON answers BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('answer',NEW.id,'update'); END;
CREATE TRIGGER trg_reviews_i AFTER INSERT ON reviews BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('review',NEW.id,'insert'); END;
CREATE TRIGGER trg_reviews_d AFTER DELETE ON reviews BEGIN INSERT INTO changes(entity,entity_id,op) VALUES('review',OLD.id,'delete'); END;