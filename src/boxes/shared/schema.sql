-- Shared quiz library. Unlike per-user databases, this file is plaintext by
-- design: only content an owner explicitly chose to publish lands here.
-- user_version = 1 is set by store.migrate() below.
CREATE TABLE shared_quizzes (
  id             INTEGER PRIMARY KEY,
  owner_user_id  INTEGER NOT NULL,
  owner_username TEXT NOT NULL,
  source_quiz_id INTEGER NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  shuffle        INTEGER NOT NULL DEFAULT 0 CHECK (shuffle IN (0,1)),
  question_count INTEGER NOT NULL,
  total_points   REAL NOT NULL,
  -- sha256 of a canonical snapshot; used for the "shared copy is stale" badge.
  content_hash   TEXT NOT NULL,
  published_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (owner_user_id, source_quiz_id)
);
CREATE INDEX idx_shared_quizzes_updated ON shared_quizzes(updated_at DESC, id DESC);
CREATE INDEX idx_shared_quizzes_owner ON shared_quizzes(owner_user_id);

CREATE TABLE shared_questions (
  id             INTEGER PRIMARY KEY,
  shared_quiz_id INTEGER NOT NULL REFERENCES shared_quizzes(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL CHECK (position >= 1),
  type           TEXT NOT NULL CHECK (type IN ('mcq','multi','numeric','short','latex')),
  prompt         TEXT NOT NULL,
  choices_json   TEXT,
  answer_json    TEXT NOT NULL,
  explanation    TEXT NOT NULL DEFAULT '',
  points         REAL NOT NULL CHECK (points > 0 AND points <= 100),
  UNIQUE (shared_quiz_id, position)
);
CREATE INDEX idx_shared_questions_quiz ON shared_questions(shared_quiz_id, position);
