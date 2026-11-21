-- auth.db schema (own user_version, starting at 1). Stores identities, wrapped
-- DEKs, invites and agent-token wraps. No study content and no unwrapped keys.
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(username) BETWEEN 3 AND 32),
  is_admin      INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0,1)),
  recovery_id   TEXT NOT NULL UNIQUE,
  disabled_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE key_wraps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('passphrase','recovery')),
  wrap       TEXT NOT NULL,
  salt       TEXT NOT NULL,
  N          INTEGER NOT NULL,
  r          INTEGER NOT NULL,
  p          INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, kind)
);
CREATE TABLE invites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash  TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  used_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE agent_tokens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id      TEXT NOT NULL UNIQUE,
  wrap          TEXT NOT NULL,
  salt          TEXT NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('read','write')),
  label         TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_used_at  TEXT,
  revoked_at    TEXT
);
CREATE INDEX idx_agent_tokens_user ON agent_tokens(user_id);
